/**
 * URL Security Utilities
 * 
 * This module provides secure URL validation and sanitization to prevent
 * CWE-601 Open Redirect vulnerabilities and other URL-based attacks.
 */

export interface SafeNavigationOptions {
  allowedPaths?: string[];
  allowedPatterns?: RegExp[];
  fallbackPath?: string;
  maxPathLength?: number;
}

export interface URLValidationResult {
  isValid: boolean;
  sanitizedPath: string;
  reason?: string;
}

export interface SecurityEvent {
  type: 'blocked_redirect' | 'sanitized_path' | 'validation_failure' | 'navigation_attempt' | 'reload_attempt';
  originalPath: string;
  sanitizedPath?: string;
  reason: string;
  timestamp: string;
  userAgent?: string;
  sessionId?: string;
  referrer?: string;
  severity: 'low' | 'medium' | 'high';
}

export interface SecurityLogger {
  log(event: SecurityEvent): void;
  getEvents(): SecurityEvent[];
  clearEvents(): void;
}

export interface SecurityMonitoringConfig {
  enableConsoleLogging: boolean;
  enableLocalStorage: boolean;
  maxStoredEvents: number;
  logLevel: 'all' | 'medium' | 'high';
}

/**
 * Security configuration for the subnet calculator application
 */
export const SUBNET_CALCULATOR_SECURITY_CONFIG = {
  allowedPaths: [
    '/',
    '/subnet-calculator',
    '/subnet-calculator/',
  ],
  allowedPatterns: [
    /^\/$/,
    /^\/subnet-calculator\/?$/,
  ],
  fallbackPath: '/',
  maxPathLength: 200,
  blockedPatterns: [
    /^https?:\/\//i,  // Block absolute URLs
    /^\/\//,          // Block protocol-relative URLs
    /javascript:/i,   // Block javascript: URLs
    /data:/i,         // Block data: URLs
    /vbscript:/i,     // Block vbscript: URLs
    /file:/i,         // Block file: URLs
    /ftp:/i,          // Block ftp: URLs
  ]
} as const;

/**
 * Default security monitoring configuration
 */
const DEFAULT_MONITORING_CONFIG: SecurityMonitoringConfig = {
  enableConsoleLogging: true,
  enableLocalStorage: typeof window !== 'undefined' && window.localStorage !== undefined,
  maxStoredEvents: 100,
  logLevel: 'all'
};

/**
 * Security Logger implementation for monitoring and tracking security events
 */
class SecurityLoggerImpl implements SecurityLogger {
  private events: SecurityEvent[] = [];
  private config: SecurityMonitoringConfig;
  private sessionId: string;

  constructor(config: Partial<SecurityMonitoringConfig> = {}) {
    this.config = { ...DEFAULT_MONITORING_CONFIG, ...config };
    this.sessionId = this.generateSessionId();
    this.loadStoredEvents();
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private loadStoredEvents(): void {
    if (!this.config.enableLocalStorage) return;

    try {
      const stored = localStorage.getItem('subnet_calculator_security_events');
      if (stored) {
        const parsedEvents = JSON.parse(stored);
        if (Array.isArray(parsedEvents)) {
          this.events = parsedEvents.slice(-this.config.maxStoredEvents);
        }
      }
    } catch (error) {
      console.warn('Failed to load stored security events:', error);
    }
  }

  private saveEvents(): void {
    if (!this.config.enableLocalStorage) return;

    try {
      const eventsToStore = this.events.slice(-this.config.maxStoredEvents);
      localStorage.setItem('subnet_calculator_security_events', JSON.stringify(eventsToStore));
    } catch (error) {
      console.warn('Failed to save security events:', error);
    }
  }

  private shouldLogEvent(event: SecurityEvent): boolean {
    switch (this.config.logLevel) {
      case 'high':
        return event.severity === 'high';
      case 'medium':
        return event.severity === 'medium' || event.severity === 'high';
      case 'all':
      default:
        return true;
    }
  }

  private enrichEvent(event: SecurityEvent): SecurityEvent {
    return {
      ...event,
      sessionId: this.sessionId,
      referrer: typeof window !== 'undefined' ? document.referrer : undefined,
      userAgent: event.userAgent || (typeof window !== 'undefined' ? window.navigator?.userAgent : undefined)
    };
  }

  log(event: SecurityEvent): void {
    const enrichedEvent = this.enrichEvent(event);

    if (!this.shouldLogEvent(enrichedEvent)) {
      return;
    }

    // Add to in-memory storage
    this.events.push(enrichedEvent);
    
    // Maintain max events limit
    if (this.events.length > this.config.maxStoredEvents) {
      this.events = this.events.slice(-this.config.maxStoredEvents);
    }

    // Save to localStorage if enabled
    this.saveEvents();

    // Console logging
    if (this.config.enableConsoleLogging) {
      const logLevel = enrichedEvent.severity === 'high' ? 'error' : 
                      enrichedEvent.severity === 'medium' ? 'warn' : 'info';
      
      console[logLevel]('[SECURITY]', {
        type: enrichedEvent.type,
        originalPath: enrichedEvent.originalPath,
        sanitizedPath: enrichedEvent.sanitizedPath,
        reason: enrichedEvent.reason,
        severity: enrichedEvent.severity,
        timestamp: enrichedEvent.timestamp,
        sessionId: enrichedEvent.sessionId
      });
    }

    // In production, this could be extended to send to external monitoring services
    if (process.env.NODE_ENV === 'production' && enrichedEvent.severity === 'high') {
      // Placeholder for external monitoring integration
      // Example: sendToMonitoringService(enrichedEvent);
    }
  }

  getEvents(): SecurityEvent[] {
    return [...this.events];
  }

  clearEvents(): void {
    this.events = [];
    if (this.config.enableLocalStorage) {
      try {
        localStorage.removeItem('subnet_calculator_security_events');
      } catch (error) {
        console.warn('Failed to clear stored security events:', error);
      }
    }
  }
}

/**
 * Global security logger instance
 */
const securityLogger = new SecurityLoggerImpl();

/**
 * Logs security events for monitoring purposes
 */
function logSecurityEvent(event: Omit<SecurityEvent, 'severity'>): void {
  // Determine severity based on event type
  let severity: SecurityEvent['severity'] = 'low';
  
  switch (event.type) {
    case 'blocked_redirect':
      severity = 'high';
      break;
    case 'validation_failure':
      severity = 'medium';
      break;
    case 'sanitized_path':
      severity = 'low';
      break;
    case 'navigation_attempt':
    case 'reload_attempt':
      severity = 'low';
      break;
  }

  securityLogger.log({ ...event, severity });
}

/**
 * Get the security logger instance for advanced usage
 */
export function getSecurityLogger(): SecurityLogger {
  return securityLogger;
}

/**
 * Sanitizes a path by removing potentially dangerous characters and patterns
 */
export function sanitizePath(path: string): string {
  if (!path || typeof path !== 'string') {
    return '/';
  }

  // Remove null bytes and control characters
  let sanitized = path.replace(/[\x00-\x1f\x7f-\x9f]/g, '');
  
  // Remove path traversal attempts first
  sanitized = sanitized.replace(/\/\.\.+/g, '');
  
  // Remove multiple consecutive slashes
  sanitized = sanitized.replace(/\/+/g, '/');
  
  // Ensure path starts with /
  if (!sanitized.startsWith('/')) {
    sanitized = '/' + sanitized;
  }
  
  // Remove trailing slash unless it's the root path
  if (sanitized.length > 1 && sanitized.endsWith('/')) {
    sanitized = sanitized.slice(0, -1);
  }
  
  // Limit path length
  if (sanitized.length > SUBNET_CALCULATOR_SECURITY_CONFIG.maxPathLength) {
    sanitized = sanitized.substring(0, SUBNET_CALCULATOR_SECURITY_CONFIG.maxPathLength);
  }
  
  return sanitized;
}

/**
 * Validates that a URL is safe for internal navigation using allowlist-based validation
 */
export function validateInternalURL(
  url: string, 
  options: SafeNavigationOptions = {}
): URLValidationResult {
  const config = {
    ...SUBNET_CALCULATOR_SECURITY_CONFIG,
    ...options
  };

  // Handle empty or invalid input
  if (!url || typeof url !== 'string') {
    return {
      isValid: false,
      sanitizedPath: config.fallbackPath,
      reason: 'Empty or invalid URL'
    };
  }

  // Check for blocked patterns first
  for (const pattern of config.blockedPatterns) {
    if (pattern.test(url)) {
      logSecurityEvent({
        type: 'blocked_redirect',
        originalPath: url,
        sanitizedPath: config.fallbackPath,
        reason: `Blocked pattern: ${pattern.source}`,
        timestamp: new Date().toISOString(),
        userAgent: typeof window !== 'undefined' ? window.navigator?.userAgent : undefined
      });
      
      return {
        isValid: false,
        sanitizedPath: config.fallbackPath,
        reason: `URL matches blocked pattern: ${pattern.source}`
      };
    }
  }

  // Sanitize the path
  const sanitizedPath = sanitizePath(url);
  
  // Check if sanitization changed the path significantly
  if (sanitizedPath !== url) {
    logSecurityEvent({
      type: 'sanitized_path',
      originalPath: url,
      sanitizedPath,
      reason: 'Path required sanitization',
      timestamp: new Date().toISOString(),
      userAgent: typeof window !== 'undefined' ? window.navigator?.userAgent : undefined
    });
  }

  // Check against allowed paths
  const allAllowedPaths = [...config.allowedPaths, ...(options.allowedPaths || [])];
  if (allAllowedPaths.includes(sanitizedPath)) {
    return {
      isValid: true,
      sanitizedPath
    };
  }

  // Check against allowed patterns
  const allAllowedPatterns = [...config.allowedPatterns, ...(options.allowedPatterns || [])];
  for (const pattern of allAllowedPatterns) {
    if (pattern.test(sanitizedPath)) {
      return {
        isValid: true,
        sanitizedPath
      };
    }
  }

  // Path not in allowlist
  logSecurityEvent({
    type: 'validation_failure',
    originalPath: url,
    sanitizedPath: config.fallbackPath,
    reason: 'Path not in allowlist',
    timestamp: new Date().toISOString(),
    userAgent: typeof window !== 'undefined' ? window.navigator?.userAgent : undefined
  });

  return {
    isValid: false,
    sanitizedPath: config.fallbackPath,
    reason: 'Path not in allowlist'
  };
}

/**
 * Safely navigates to a path after validation and sanitization
 */
export function navigateSecurely(
  path: string, 
  options: SafeNavigationOptions = {}
): void {
  const validation = validateInternalURL(path, options);
  
  // Log the navigation attempt
  logSecurityEvent({
    type: 'navigation_attempt',
    originalPath: path,
    sanitizedPath: validation.sanitizedPath,
    reason: validation.isValid ? 'Safe navigation' : `Navigation blocked: ${validation.reason}`,
    timestamp: new Date().toISOString(),
    userAgent: typeof window !== 'undefined' ? window.navigator?.userAgent : undefined
  });
  
  if (typeof window === 'undefined') {
    // Server-side rendering - cannot navigate
    return;
  }

  try {
    // Use the sanitized path regardless of validation result
    // This ensures we always navigate to a safe location
    window.location.href = validation.sanitizedPath;
  } catch (error) {
    // Log navigation failure
    logSecurityEvent({
      type: 'navigation_attempt',
      originalPath: path,
      sanitizedPath: options.fallbackPath || SUBNET_CALCULATOR_SECURITY_CONFIG.fallbackPath,
      reason: `Navigation failed with error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      timestamp: new Date().toISOString(),
      userAgent: typeof window !== 'undefined' ? window.navigator?.userAgent : undefined
    });
    
    // Fallback to root if navigation fails
    console.error('Navigation failed:', error);
    window.location.href = options.fallbackPath || SUBNET_CALCULATOR_SECURITY_CONFIG.fallbackPath;
  }
}

/**
 * Securely reloads the current page without using unsanitized pathname data
 */
export function reloadSecurely(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    // Validate current pathname before reloading
    const currentPath = window.location.pathname;
    const validation = validateInternalURL(currentPath);
    
    // Log the reload attempt
    logSecurityEvent({
      type: 'reload_attempt',
      originalPath: currentPath,
      sanitizedPath: validation.sanitizedPath,
      reason: validation.isValid ? 'Safe page reload' : `Reload blocked, redirecting: ${validation.reason}`,
      timestamp: new Date().toISOString(),
      userAgent: typeof window !== 'undefined' ? window.navigator?.userAgent : undefined
    });
    
    if (validation.isValid) {
      window.location.reload();
    } else {
      // If current path is not valid, navigate to safe fallback
      navigateSecurely(validation.sanitizedPath);
    }
  } catch (error) {
    // Log reload failure
    logSecurityEvent({
      type: 'reload_attempt',
      originalPath: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
      sanitizedPath: SUBNET_CALCULATOR_SECURITY_CONFIG.fallbackPath,
      reason: `Reload failed with error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      timestamp: new Date().toISOString(),
      userAgent: typeof window !== 'undefined' ? window.navigator?.userAgent : undefined
    });
    
    console.error('Secure reload failed:', error);
    navigateSecurely(SUBNET_CALCULATOR_SECURITY_CONFIG.fallbackPath);
  }
}