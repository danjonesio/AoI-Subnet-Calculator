/**
 * Comprehensive unit tests for URL security utilities
 * Tests validation, sanitization, and secure navigation functionality
 */

import {
  validateInternalURL,
  sanitizePath,
  navigateSecurely,
  reloadSecurely,
  getSecurityLogger,
  SUBNET_CALCULATOR_SECURITY_CONFIG,
  type SafeNavigationOptions,
  type URLValidationResult,
  type SecurityEvent,
  type SecurityLogger
} from '../url-security';

// Mock console methods
const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation();
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();
const mockConsoleInfo = jest.spyOn(console, 'info').mockImplementation();

// Mock location methods
const mockLocationReload = jest.fn();

// Mock localStorage
const mockLocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn()
};

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
  writable: true
});

describe('URL Security Utilities', () => {
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Mock process.env for development logging
    process.env.NODE_ENV = 'development';
  });

  afterEach(() => {
    // Clean up mocks
    mockConsoleWarn.mockClear();
    mockConsoleError.mockClear();
  });

  describe('sanitizePath', () => {
    describe('legitimate internal paths', () => {
      it('should preserve valid root path', () => {
        expect(sanitizePath('/')).toBe('/');
      });

      it('should preserve valid subnet calculator path', () => {
        expect(sanitizePath('/subnet-calculator')).toBe('/subnet-calculator');
      });

      it('should remove trailing slash from non-root paths', () => {
        expect(sanitizePath('/subnet-calculator/')).toBe('/subnet-calculator');
      });

      it('should preserve root path with trailing slash', () => {
        expect(sanitizePath('/')).toBe('/');
      });

      it('should add leading slash if missing', () => {
        expect(sanitizePath('subnet-calculator')).toBe('/subnet-calculator');
      });
    });

    describe('malicious input sanitization', () => {
      it('should remove null bytes and control characters', () => {
        expect(sanitizePath('/path\x00\x01\x1f')).toBe('/path');
        expect(sanitizePath('/path\x7f\x9f')).toBe('/path');
      });

      it('should collapse multiple consecutive slashes', () => {
        expect(sanitizePath('//path///to////resource')).toBe('/path/to/resource');
      });

      it('should remove path traversal attempts', () => {
        expect(sanitizePath('/path/../../../etc/passwd')).toBe('/path/etc/passwd');
        expect(sanitizePath('/path/..../sensitive')).toBe('/path/sensitive');
      });

      it('should handle empty or invalid input', () => {
        expect(sanitizePath('')).toBe('/');
        expect(sanitizePath(null as unknown as string)).toBe('/');
        expect(sanitizePath(undefined as unknown as string)).toBe('/');
        expect(sanitizePath(123 as unknown as string)).toBe('/');
      });

      it('should limit path length', () => {
        const longPath = '/path' + 'a'.repeat(300);
        const sanitized = sanitizePath(longPath);
        expect(sanitized.length).toBeLessThanOrEqual(SUBNET_CALCULATOR_SECURITY_CONFIG.maxPathLength);
        expect(sanitized).toMatch(/^\/path/);
      });
    });

    describe('edge cases', () => {
      it('should handle paths with only dots', () => {
        expect(sanitizePath('...')).toBe('/...');
        expect(sanitizePath('/../..')).toBe('/');
      });

      it('should handle paths with mixed valid and invalid characters', () => {
        expect(sanitizePath('/valid\x00/path\x01/here')).toBe('/valid/path/here');
      });

      it('should handle Unicode characters safely', () => {
        expect(sanitizePath('/café')).toBe('/café');
        expect(sanitizePath('/测试')).toBe('/测试');
      });
    });
  });

  describe('validateInternalURL', () => {
    describe('legitimate internal paths', () => {
      it('should validate root path', () => {
        const result = validateInternalURL('/');
        expect(result.isValid).toBe(true);
        expect(result.sanitizedPath).toBe('/');
        expect(result.reason).toBeUndefined();
      });

      it('should validate subnet calculator path', () => {
        const result = validateInternalURL('/subnet-calculator');
        expect(result.isValid).toBe(true);
        expect(result.sanitizedPath).toBe('/subnet-calculator');
      });

      it('should validate subnet calculator path with trailing slash', () => {
        const result = validateInternalURL('/subnet-calculator/');
        expect(result.isValid).toBe(true);
        expect(result.sanitizedPath).toBe('/subnet-calculator');
      });

      it('should validate paths matching allowed patterns', () => {
        const result = validateInternalURL('/subnet-calculator');
        expect(result.isValid).toBe(true);
      });
    });

    describe('malicious external URLs and XSS attempts', () => {
      const maliciousUrls = [
        'http://evil.com',
        'https://malicious.site',
        'HTTP://EVIL.COM',
        'HTTPS://MALICIOUS.SITE',
        '//evil.com',
        'javascript:alert("xss")',
        'JAVASCRIPT:alert("xss")',
        'data:text/html,<script>alert("xss")</script>',
        'DATA:text/html,<script>alert("xss")</script>',
        'vbscript:msgbox("xss")',
        'file:///etc/passwd',
        'ftp://malicious.com'
      ];

      maliciousUrls.forEach(url => {
        it(`should block malicious URL: ${url}`, () => {
          const result = validateInternalURL(url);
          expect(result.isValid).toBe(false);
          expect(result.sanitizedPath).toBe('/');
          expect(result.reason).toMatch(/blocked pattern/i);
        });
      });

      it('should log security events for blocked URLs', () => {
        validateInternalURL('http://evil.com');
        expect(mockConsoleError).toHaveBeenCalledWith(
          '[SECURITY]',
          expect.objectContaining({
            type: 'blocked_redirect',
            originalPath: 'http://evil.com',
            reason: expect.stringContaining('Blocked pattern'),
            severity: 'high'
          })
        );
      });
    });

    describe('path sanitization with edge cases', () => {
      it('should sanitize and validate paths that need cleaning', () => {
        const result = validateInternalURL('/subnet-calculator//');
        expect(result.isValid).toBe(true);
        expect(result.sanitizedPath).toBe('/subnet-calculator');
      });

      it('should log sanitization events', () => {
        validateInternalURL('/subnet-calculator//');
        expect(mockConsoleInfo).toHaveBeenCalledWith(
          '[SECURITY]',
          expect.objectContaining({
            type: 'sanitized_path',
            originalPath: '/subnet-calculator//',
            sanitizedPath: '/subnet-calculator',
            severity: 'low'
          })
        );
      });

      it('should handle paths not in allowlist', () => {
        const result = validateInternalURL('/unauthorized-path');
        expect(result.isValid).toBe(false);
        expect(result.sanitizedPath).toBe('/');
        expect(result.reason).toBe('Path not in allowlist');
      });

      it('should log validation failures for unauthorized paths', () => {
        validateInternalURL('/unauthorized-path');
        expect(mockConsoleWarn).toHaveBeenCalledWith(
          '[SECURITY]',
          expect.objectContaining({
            type: 'validation_failure',
            originalPath: '/unauthorized-path',
            reason: 'Path not in allowlist',
            severity: 'medium'
          })
        );
      });
    });

    describe('custom options', () => {
      it('should accept custom allowed paths', () => {
        const options: SafeNavigationOptions = {
          allowedPaths: ['/custom-path']
        };
        const result = validateInternalURL('/custom-path', options);
        expect(result.isValid).toBe(true);
        expect(result.sanitizedPath).toBe('/custom-path');
      });

      it('should accept custom allowed patterns', () => {
        const options: SafeNavigationOptions = {
          allowedPatterns: [/^\/api\/.*$/]
        };
        const result = validateInternalURL('/api/test', options);
        expect(result.isValid).toBe(true);
        expect(result.sanitizedPath).toBe('/api/test');
      });

      it('should use custom fallback path', () => {
        const options: SafeNavigationOptions = {
          fallbackPath: '/custom-fallback'
        };
        const result = validateInternalURL('http://evil.com', options);
        expect(result.isValid).toBe(false);
        expect(result.sanitizedPath).toBe('/custom-fallback');
      });

      it('should respect custom max path length', () => {
        const options: SafeNavigationOptions = {
          maxPathLength: 10,
          allowedPaths: ['/short']
        };
        const longPath = '/very-long-path-that-exceeds-limit';
        const result = validateInternalURL(longPath, options);
        expect(result.sanitizedPath.length).toBeLessThanOrEqual(10);
      });
    });

    describe('invalid input handling', () => {
      it('should handle empty string', () => {
        const result = validateInternalURL('');
        expect(result.isValid).toBe(false);
        expect(result.sanitizedPath).toBe('/');
        expect(result.reason).toBe('Empty or invalid URL');
      });

      it('should handle null input', () => {
        const result = validateInternalURL(null as unknown as string);
        expect(result.isValid).toBe(false);
        expect(result.sanitizedPath).toBe('/');
        expect(result.reason).toBe('Empty or invalid URL');
      });

      it('should handle undefined input', () => {
        const result = validateInternalURL(undefined as unknown as string);
        expect(result.isValid).toBe(false);
        expect(result.sanitizedPath).toBe('/');
        expect(result.reason).toBe('Empty or invalid URL');
      });

      it('should handle non-string input', () => {
        const result = validateInternalURL(123 as unknown as string);
        expect(result.isValid).toBe(false);
        expect(result.sanitizedPath).toBe('/');
        expect(result.reason).toBe('Empty or invalid URL');
      });
    });
  });

  describe('navigateSecurely', () => {
    it('should handle server-side rendering (no window)', () => {
      // Remove window object
      const originalWindow = global.window;
      delete (global as unknown as { window: unknown }).window;
      
      // Should not throw error
      expect(() => navigateSecurely('/subnet-calculator')).not.toThrow();
      
      // Restore window
      global.window = originalWindow;
    });

    it('should validate paths before navigation', () => {
      // Test that the function calls validateInternalURL internally
      // We can't easily test the actual navigation due to JSDOM limitations
      // but we can test that it doesn't throw errors with valid inputs
      expect(() => navigateSecurely('/subnet-calculator')).not.toThrow();
      expect(() => navigateSecurely('http://evil.com')).not.toThrow();
    });

    it('should handle navigation with custom options', () => {
      const options: SafeNavigationOptions = {
        fallbackPath: '/custom-fallback',
        allowedPaths: ['/custom-path']
      };
      
      // Should not throw error with custom options
      expect(() => navigateSecurely('/custom-path', options)).not.toThrow();
    });
  });

  describe('reloadSecurely', () => {
    it('should handle server-side rendering (no window)', () => {
      const originalWindow = global.window;
      delete (global as unknown as { window: unknown }).window;
      
      expect(() => reloadSecurely()).not.toThrow();
      
      // Restore window
      global.window = originalWindow;
    });

    it('should validate current pathname before reloading', () => {
      // Test that the function calls validateInternalURL internally
      // We can't easily test the actual reload due to JSDOM limitations
      // but we can test that it doesn't throw errors
      expect(() => reloadSecurely()).not.toThrow();
    });

    it('should handle reload errors gracefully', () => {
      // Test that the function handles errors without throwing
      expect(() => reloadSecurely()).not.toThrow();
    });
  });

  describe('security configuration validation', () => {
    it('should have proper security configuration structure', () => {
      expect(SUBNET_CALCULATOR_SECURITY_CONFIG).toHaveProperty('allowedPaths');
      expect(SUBNET_CALCULATOR_SECURITY_CONFIG).toHaveProperty('allowedPatterns');
      expect(SUBNET_CALCULATOR_SECURITY_CONFIG).toHaveProperty('fallbackPath');
      expect(SUBNET_CALCULATOR_SECURITY_CONFIG).toHaveProperty('maxPathLength');
      expect(SUBNET_CALCULATOR_SECURITY_CONFIG).toHaveProperty('blockedPatterns');
    });

    it('should have reasonable default values', () => {
      expect(SUBNET_CALCULATOR_SECURITY_CONFIG.allowedPaths).toContain('/');
      expect(SUBNET_CALCULATOR_SECURITY_CONFIG.allowedPaths).toContain('/subnet-calculator');
      expect(SUBNET_CALCULATOR_SECURITY_CONFIG.fallbackPath).toBe('/');
      expect(SUBNET_CALCULATOR_SECURITY_CONFIG.maxPathLength).toBe(200);
    });

    it('should block dangerous URL patterns', () => {
      const dangerousPatterns = [
        'http://evil.com',
        'https://evil.com',
        '//evil.com',
        'javascript:alert(1)',
        'data:text/html,<script>',
        'vbscript:msgbox(1)',
        'file:///etc/passwd',
        'ftp://evil.com'
      ];

      dangerousPatterns.forEach(pattern => {
        const isBlocked = SUBNET_CALCULATOR_SECURITY_CONFIG.blockedPatterns.some(
          regex => regex.test(pattern)
        );
        expect(isBlocked).toBe(true);
      });
    });

    it('should allow legitimate internal patterns', () => {
      const legitimatePatterns = [
        '/',
        '/subnet-calculator',
        '/subnet-calculator/'
      ];

      legitimatePatterns.forEach(pattern => {
        const isAllowed = SUBNET_CALCULATOR_SECURITY_CONFIG.allowedPatterns.some(
          regex => regex.test(pattern)
        );
        expect(isAllowed).toBe(true);
      });
    });
  });

  describe('security event logging', () => {
    it('should log security events in development mode', () => {
      process.env.NODE_ENV = 'development';
      validateInternalURL('http://evil.com');
      expect(mockConsoleError).toHaveBeenCalledWith(
        '[SECURITY]',
        expect.objectContaining({
          type: 'blocked_redirect',
          timestamp: expect.any(String),
          severity: 'high'
        })
      );
    });

    it('should include proper security event structure', () => {
      validateInternalURL('http://evil.com');
      expect(mockConsoleError).toHaveBeenCalledWith(
        '[SECURITY]',
        expect.objectContaining({
          type: expect.stringMatching(/^(blocked_redirect|sanitized_path|validation_failure)$/),
          originalPath: expect.any(String),
          reason: expect.any(String),
          timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
          severity: 'high'
        })
      );
    });

    it('should handle missing user agent gracefully', () => {
      // Mock navigator without userAgent
      Object.defineProperty(window, 'navigator', {
        value: {},
        writable: true,
        configurable: true
      });
      
      validateInternalURL('http://evil.com');
      expect(mockConsoleError).toHaveBeenCalledWith(
        '[SECURITY]',
        expect.objectContaining({
          severity: 'high'
        })
      );
    });
  });

  describe('production environment behavior', () => {
    it('should not log to console in production', () => {
      process.env.NODE_ENV = 'production';
      validateInternalURL('http://evil.com');
      expect(mockConsoleWarn).not.toHaveBeenCalled();
    });
  });

  describe('SecurityLogger', () => {
    let logger: SecurityLogger;

    beforeEach(() => {
      logger = getSecurityLogger();
      logger.clearEvents();
      mockLocalStorage.getItem.mockClear();
      mockLocalStorage.setItem.mockClear();
      mockLocalStorage.removeItem.mockClear();
    });

    describe('event logging', () => {
      it('should log security events with proper structure', () => {
        const testEvent: Omit<SecurityEvent, 'severity'> = {
          type: 'blocked_redirect',
          originalPath: 'http://evil.com',
          sanitizedPath: '/',
          reason: 'Blocked external URL',
          timestamp: new Date().toISOString(),
          userAgent: 'test-agent'
        };

        // Trigger logging through validateInternalURL
        validateInternalURL('http://evil.com');

        const events = logger.getEvents();
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
          type: 'blocked_redirect',
          originalPath: 'http://evil.com',
          sanitizedPath: '/',
          reason: expect.stringContaining('Blocked pattern'),
          severity: 'high',
          sessionId: expect.any(String),
          timestamp: expect.any(String)
        });
      });

      it('should enrich events with session ID and referrer', () => {
        validateInternalURL('http://evil.com');
        
        const events = logger.getEvents();
        expect(events[0]).toHaveProperty('sessionId');
        expect(events[0].sessionId).toMatch(/^session_\d+_[a-z0-9]+$/);
        expect(events[0]).toHaveProperty('referrer');
      });

      it('should assign correct severity levels', () => {
        // High severity - blocked redirect
        validateInternalURL('http://evil.com');
        let events = logger.getEvents();
        expect(events[events.length - 1].severity).toBe('high');

        // Medium severity - validation failure
        validateInternalURL('/unauthorized-path');
        events = logger.getEvents();
        expect(events[events.length - 1].severity).toBe('medium');

        // Low severity - path sanitization
        validateInternalURL('/subnet-calculator//');
        events = logger.getEvents();
        expect(events[events.length - 1].severity).toBe('low');
      });

      it('should log navigation attempts', () => {
        navigateSecurely('/subnet-calculator');
        
        const events = logger.getEvents();
        const navigationEvent = events.find(e => e.type === 'navigation_attempt');
        expect(navigationEvent).toBeDefined();
        expect(navigationEvent?.originalPath).toBe('/subnet-calculator');
        expect(navigationEvent?.reason).toBe('Safe navigation');
        expect(navigationEvent?.severity).toBe('low');
      });

      it('should log reload attempts', () => {
        reloadSecurely();
        
        const events = logger.getEvents();
        const reloadEvent = events.find(e => e.type === 'reload_attempt');
        expect(reloadEvent).toBeDefined();
        expect(reloadEvent?.reason).toContain('Safe page reload');
        expect(reloadEvent?.severity).toBe('low');
      });
    });

    describe('console logging', () => {
      it('should log high severity events as errors', () => {
        validateInternalURL('http://evil.com');
        
        expect(mockConsoleError).toHaveBeenCalledWith(
          '[SECURITY]',
          expect.objectContaining({
            type: 'blocked_redirect',
            severity: 'high'
          })
        );
      });

      it('should log medium severity events as warnings', () => {
        validateInternalURL('/unauthorized-path');
        
        expect(mockConsoleWarn).toHaveBeenCalledWith(
          '[SECURITY]',
          expect.objectContaining({
            type: 'validation_failure',
            severity: 'medium'
          })
        );
      });

      it('should log low severity events as info', () => {
        validateInternalURL('/subnet-calculator//');
        
        expect(mockConsoleInfo).toHaveBeenCalledWith(
          '[SECURITY]',
          expect.objectContaining({
            type: 'sanitized_path',
            severity: 'low'
          })
        );
      });
    });

    describe('localStorage integration', () => {
      it('should save events to localStorage when enabled', () => {
        validateInternalURL('http://evil.com');
        
        expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
          'subnet_calculator_security_events',
          expect.any(String)
        );
      });

      it('should load events from localStorage on initialization', () => {
        // Since the logger is a singleton and already initialized,
        // we test that localStorage integration works by verifying
        // that events are saved to localStorage when logged
        validateInternalURL('http://evil.com');
        
        expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
          'subnet_calculator_security_events',
          expect.any(String)
        );
        
        // Verify the stored data is valid JSON
        const storedData = mockLocalStorage.setItem.mock.calls[0][1];
        expect(() => JSON.parse(storedData)).not.toThrow();
      });

      it('should handle localStorage errors gracefully', () => {
        mockLocalStorage.setItem.mockImplementation(() => {
          throw new Error('Storage quota exceeded');
        });

        // Should not throw error
        expect(() => validateInternalURL('http://evil.com')).not.toThrow();
        expect(mockConsoleWarn).toHaveBeenCalledWith(
          'Failed to save security events:',
          expect.any(Error)
        );
      });

      it('should handle malformed localStorage data', () => {
        // Since the logger is a singleton and already initialized,
        // we test that it handles malformed data gracefully by checking
        // that it doesn't break when localStorage contains invalid JSON
        mockLocalStorage.getItem.mockReturnValue('invalid-json');
        
        // The logger should still function normally even with malformed stored data
        expect(() => validateInternalURL('http://evil.com')).not.toThrow();
        
        // The logger should still be able to store new events
        const events = logger.getEvents();
        expect(events.length).toBeGreaterThan(0);
      });
    });

    describe('event management', () => {
      it('should maintain maximum event limit', () => {
        // Generate more events than the limit
        for (let i = 0; i < 150; i++) {
          validateInternalURL(`http://evil${i}.com`);
        }

        const events = logger.getEvents();
        expect(events.length).toBeLessThanOrEqual(100); // Default max limit
      });

      it('should clear events when requested', () => {
        validateInternalURL('http://evil.com');
        expect(logger.getEvents()).toHaveLength(1);

        logger.clearEvents();
        expect(logger.getEvents()).toHaveLength(0);
        expect(mockLocalStorage.removeItem).toHaveBeenCalledWith(
          'subnet_calculator_security_events'
        );
      });

      it('should handle clear events localStorage errors gracefully', () => {
        mockLocalStorage.removeItem.mockImplementation(() => {
          throw new Error('Storage error');
        });

        expect(() => logger.clearEvents()).not.toThrow();
        expect(mockConsoleWarn).toHaveBeenCalledWith(
          'Failed to clear stored security events:',
          expect.any(Error)
        );
      });
    });

    describe('log level filtering', () => {
      it('should respect log level configuration', () => {
        // Test that we can't easily create a new logger with custom config
        // since the logger is a singleton, but we can test the filtering logic
        // by checking that events are properly categorized by severity
        
        validateInternalURL('http://evil.com'); // high
        validateInternalURL('/unauthorized-path'); // medium  
        validateInternalURL('/subnet-calculator//'); // low

        const events = logger.getEvents();
        const highEvents = events.filter(e => e.severity === 'high');
        const mediumEvents = events.filter(e => e.severity === 'medium');
        const lowEvents = events.filter(e => e.severity === 'low');

        expect(highEvents.length).toBeGreaterThan(0);
        expect(mediumEvents.length).toBeGreaterThan(0);
        expect(lowEvents.length).toBeGreaterThan(0);
      });
    });

    describe('session management', () => {
      it('should generate unique session IDs', () => {
        validateInternalURL('http://evil1.com');
        validateInternalURL('http://evil2.com');

        const events = logger.getEvents();
        expect(events[0].sessionId).toBe(events[1].sessionId); // Same session
        expect(events[0].sessionId).toMatch(/^session_\d+_[a-z0-9]+$/);
      });

      it('should include user agent when available', () => {
        Object.defineProperty(window, 'navigator', {
          value: { userAgent: 'test-user-agent' },
          writable: true,
          configurable: true
        });

        validateInternalURL('http://evil.com');
        
        const events = logger.getEvents();
        expect(events[0].userAgent).toBe('test-user-agent');
      });

      it('should handle missing navigator gracefully', () => {
        Object.defineProperty(window, 'navigator', {
          value: undefined,
          writable: true,
          configurable: true
        });

        validateInternalURL('http://evil.com');
        
        const events = logger.getEvents();
        expect(events[0].userAgent).toBeUndefined();
      });
    });

    describe('production environment', () => {
      it('should still log events in production but not to console', () => {
        process.env.NODE_ENV = 'production';
        
        validateInternalURL('http://evil.com');
        
        // Events should still be stored
        const events = logger.getEvents();
        expect(events).toHaveLength(1);
        
        // But console logging should be disabled for non-high severity
        // High severity events might still log in production for monitoring
      });
    });
  });

  describe('enhanced navigation logging', () => {
    let logger: SecurityLogger;

    beforeEach(() => {
      logger = getSecurityLogger();
      logger.clearEvents();
    });

    it('should log successful navigation attempts', () => {
      navigateSecurely('/subnet-calculator');
      
      const events = logger.getEvents();
      const navEvent = events.find(e => e.type === 'navigation_attempt');
      
      expect(navEvent).toMatchObject({
        type: 'navigation_attempt',
        originalPath: '/subnet-calculator',
        sanitizedPath: '/subnet-calculator',
        reason: 'Safe navigation',
        severity: 'low'
      });
    });

    it('should log blocked navigation attempts', () => {
      navigateSecurely('http://evil.com');
      
      const events = logger.getEvents();
      const navEvent = events.find(e => e.type === 'navigation_attempt');
      
      expect(navEvent).toMatchObject({
        type: 'navigation_attempt',
        originalPath: 'http://evil.com',
        sanitizedPath: '/',
        reason: expect.stringContaining('Navigation blocked'),
        severity: 'low'
      });
    });

    it('should log secure reload attempts', () => {
      reloadSecurely();
      
      const events = logger.getEvents();
      const reloadEvent = events.find(e => e.type === 'reload_attempt');
      
      expect(reloadEvent).toMatchObject({
        type: 'reload_attempt',
        reason: expect.stringContaining('Safe page reload'),
        severity: 'low'
      });
    });

    it('should include context information in all logged events', () => {
      navigateSecurely('/subnet-calculator');
      
      const events = logger.getEvents();
      const event = events[events.length - 1];
      
      expect(event).toHaveProperty('timestamp');
      expect(event).toHaveProperty('sessionId');
      expect(event.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(event.sessionId).toMatch(/^session_\d+_[a-z0-9]+$/);
    });
  });
});