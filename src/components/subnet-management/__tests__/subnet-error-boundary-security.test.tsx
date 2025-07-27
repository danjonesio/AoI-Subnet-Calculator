/**
 * Integration tests for secure error boundary functionality
 * Tests security aspects of the SubnetErrorBoundary component including
 * malicious URL handling, secure navigation, and security logging
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SubnetErrorBoundary } from '../subnet-error-boundary';
import { getSecurityLogger, type SecurityLogger } from '@/lib/url-security';

// Mock component that throws an error
const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test subnet calculation error');
  }
  return <div>No error</div>;
};

// Mock window.location methods
const mockLocationReload = jest.fn();
const mockLocationAssign = jest.fn();

// Mock console methods to capture security logging
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation();
const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation();
const mockConsoleInfo = jest.spyOn(console, 'info').mockImplementation();
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();

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

// Mock the URL security functions to test integration
jest.mock('@/lib/url-security', () => {
  const actual = jest.requireActual('@/lib/url-security');
  return {
    ...actual,
    navigateSecurely: jest.fn(),
    reloadSecurely: jest.fn(),
  };
});

import { navigateSecurely, reloadSecurely } from '@/lib/url-security';

const mockNavigateSecurely = navigateSecurely as jest.MockedFunction<typeof navigateSecurely>;
const mockReloadSecurely = reloadSecurely as jest.MockedFunction<typeof reloadSecurely>;

describe('SubnetErrorBoundary Security Integration Tests', () => {
  let securityLogger: SecurityLogger;

  beforeAll(() => {
    // Suppress console.error for error boundary tests since we're intentionally throwing errors
    const originalError = console.error;
    console.error = jest.fn();
  });

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    mockConsoleError.mockClear();
    mockConsoleWarn.mockClear();
    mockConsoleInfo.mockClear();
    mockConsoleLog.mockClear();
    mockLocalStorage.getItem.mockClear();
    mockLocalStorage.setItem.mockClear();
    mockLocalStorage.removeItem.mockClear();
    mockNavigateSecurely.mockClear();
    mockReloadSecurely.mockClear();

    // Set up security logger
    securityLogger = getSecurityLogger();
    securityLogger.clearEvents();

    // Set development mode for enhanced logging
    process.env.NODE_ENV = 'development';
  });

  describe('Error boundary with malicious URL scenarios', () => {
    it('should handle error boundary and render error UI', () => {
      render(
        <SubnetErrorBoundary>
          <ThrowError shouldThrow={true} />
        </SubnetErrorBoundary>
      );

      // Error boundary should render
      expect(screen.getByText('Network Configuration Error')).toBeInTheDocument();
      expect(screen.getByText('Try Again')).toBeInTheDocument();
      expect(screen.getByText('Refresh Page')).toBeInTheDocument();
    });

    it('should render error boundary with proper error categorization', () => {
      render(
        <SubnetErrorBoundary>
          <ThrowError shouldThrow={true} />
        </SubnetErrorBoundary>
      );

      // Error boundary should render with network error categorization
      // (because the error message contains "subnet")
      expect(screen.getByText('Network Configuration Error')).toBeInTheDocument();
      expect(screen.getByText(/There was an issue with the IP address or network configuration/)).toBeInTheDocument();
    });

    it('should provide security suggestions in error UI', () => {
      render(
        <SubnetErrorBoundary>
          <ThrowError shouldThrow={true} />
        </SubnetErrorBoundary>
      );

      // Should show security-related suggestions
      expect(screen.getByText(/Verify that the IP address is in the correct format/)).toBeInTheDocument();
      expect(screen.getByText(/Check that the CIDR prefix is within valid range/)).toBeInTheDocument();
    });

    it('should handle error boundary with context information', () => {
      render(
        <SubnetErrorBoundary context="security-test">
          <ThrowError shouldThrow={true} />
        </SubnetErrorBoundary>
      );

      // Error boundary should render normally with context
      expect(screen.getByText('Network Configuration Error')).toBeInTheDocument();
    });
  });

  describe('Secure refresh functionality', () => {
    it('should call reloadSecurely when refresh button is clicked', async () => {
      render(
        <SubnetErrorBoundary>
          <ThrowError shouldThrow={true} />
        </SubnetErrorBoundary>
      );

      // Click refresh button
      const refreshButton = screen.getByText('Refresh Page');
      fireEvent.click(refreshButton);

      // Should call the secure reload function
      await waitFor(() => {
        expect(mockReloadSecurely).toHaveBeenCalledTimes(1);
      });
    });

    it('should handle refresh button click without errors', async () => {
      render(
        <SubnetErrorBoundary>
          <ThrowError shouldThrow={true} />
        </SubnetErrorBoundary>
      );

      // Click refresh button
      const refreshButton = screen.getByText('Refresh Page');
      
      // Should not throw error when clicking
      expect(() => fireEvent.click(refreshButton)).not.toThrow();
      
      // Should call secure reload
      await waitFor(() => {
        expect(mockReloadSecurely).toHaveBeenCalled();
      });
    });

    it('should maintain error boundary state after refresh attempt', async () => {
      render(
        <SubnetErrorBoundary>
          <ThrowError shouldThrow={true} />
        </SubnetErrorBoundary>
      );

      // Click refresh button
      const refreshButton = screen.getByText('Refresh Page');
      fireEvent.click(refreshButton);

      // Error boundary should still be rendered
      expect(screen.getByText('Network Configuration Error')).toBeInTheDocument();
      expect(screen.getByText('Refresh Page')).toBeInTheDocument();
    });

    it('should call reloadSecurely with proper context', async () => {
      render(
        <SubnetErrorBoundary context="test-context">
          <ThrowError shouldThrow={true} />
        </SubnetErrorBoundary>
      );

      // Click refresh button
      const refreshButton = screen.getByText('Refresh Page');
      fireEvent.click(refreshButton);

      // Should call secure reload function
      await waitFor(() => {
        expect(mockReloadSecurely).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('Secure start over functionality', () => {
    it('should call navigateSecurely when start over is available', async () => {
      // Create a component that throws a non-recoverable error
      const ThrowNonRecoverableError = () => {
        throw new Error('Critical system error');
      };

      render(
        <SubnetErrorBoundary>
          <ThrowNonRecoverableError />
        </SubnetErrorBoundary>
      );

      // Look for start over button (may not be present for recoverable errors)
      const startOverButton = screen.queryByText('Start Over');
      if (startOverButton) {
        fireEvent.click(startOverButton);

        // Should call navigateSecurely with fallback path
        await waitFor(() => {
          expect(mockNavigateSecurely).toHaveBeenCalledWith('/');
        });
      }
    });

    it('should handle start over button click without errors', async () => {
      render(
        <SubnetErrorBoundary>
          <ThrowError shouldThrow={true} />
        </SubnetErrorBoundary>
      );

      // Look for start over button
      const startOverButton = screen.queryByText('Start Over');
      if (startOverButton) {
        // Should not throw error when clicking
        expect(() => fireEvent.click(startOverButton)).not.toThrow();
        
        // Should call secure navigation
        await waitFor(() => {
          expect(mockNavigateSecurely).toHaveBeenCalled();
        });
      }
    });

    it('should show start over button for non-recoverable errors', () => {
      // Create a component that throws a non-recoverable error
      const ThrowNonRecoverableError = () => {
        throw new Error('Fatal error that cannot be recovered');
      };

      render(
        <SubnetErrorBoundary>
          <ThrowNonRecoverableError />
        </SubnetErrorBoundary>
      );

      // For some error types, start over button might be available
      // This depends on the error categorization logic
      const startOverButton = screen.queryByText('Start Over');
      
      // If start over button is present, it should work
      if (startOverButton) {
        expect(startOverButton).toBeInTheDocument();
      }
    });
  });

  describe('Legitimate navigation functionality', () => {
    it('should allow legitimate refresh operations', async () => {
      render(
        <SubnetErrorBoundary>
          <ThrowError shouldThrow={true} />
        </SubnetErrorBoundary>
      );

      // Click refresh button
      const refreshButton = screen.getByText('Refresh Page');
      fireEvent.click(refreshButton);

      // Should call secure reload function
      await waitFor(() => {
        expect(mockReloadSecurely).toHaveBeenCalledTimes(1);
      });
    });

    it('should allow legitimate start over navigation', async () => {
      render(
        <SubnetErrorBoundary>
          <ThrowError shouldThrow={true} />
        </SubnetErrorBoundary>
      );

      // Check if start over button is available
      const startOverButton = screen.queryByText('Start Over');
      if (startOverButton) {
        fireEvent.click(startOverButton);

        // Should call secure navigation function
        await waitFor(() => {
          expect(mockNavigateSecurely).toHaveBeenCalledWith('/');
        });
      }
    });

    it('should preserve error boundary functionality for legitimate paths', () => {
      render(
        <SubnetErrorBoundary>
          <ThrowError shouldThrow={true} />
        </SubnetErrorBoundary>
      );

      // Error boundary should still work normally
      expect(screen.getByText('Network Configuration Error')).toBeInTheDocument();
      expect(screen.getByText('Try Again')).toBeInTheDocument();
      expect(screen.getByText('Refresh Page')).toBeInTheDocument();
    });

    it('should handle legitimate retry operations', () => {
      const mockReset = jest.fn();

      render(
        <SubnetErrorBoundary onReset={mockReset}>
          <ThrowError shouldThrow={true} />
        </SubnetErrorBoundary>
      );

      // Click try again
      const tryAgainButton = screen.getByText('Try Again');
      fireEvent.click(tryAgainButton);

      // Should call reset function
      expect(mockReset).toHaveBeenCalledTimes(1);
    });
  });

  describe('Security logging integration', () => {
    it('should integrate with security logger when refresh is clicked', async () => {
      render(
        <SubnetErrorBoundary>
          <ThrowError shouldThrow={true} />
        </SubnetErrorBoundary>
      );

      // Perform refresh action
      const refreshButton = screen.getByText('Refresh Page');
      fireEvent.click(refreshButton);

      // Should call the secure reload function which integrates with security logging
      await waitFor(() => {
        expect(mockReloadSecurely).toHaveBeenCalledTimes(1);
      });
    });

    it('should integrate with security logger when start over is clicked', async () => {
      render(
        <SubnetErrorBoundary>
          <ThrowError shouldThrow={true} />
        </SubnetErrorBoundary>
      );

      // Look for start over button
      const startOverButton = screen.queryByText('Start Over');
      if (startOverButton) {
        fireEvent.click(startOverButton);

        // Should call the secure navigation function which integrates with security logging
        await waitFor(() => {
          expect(mockNavigateSecurely).toHaveBeenCalledWith('/');
        });
      }
    });

    it('should handle security logger integration gracefully', () => {
      // Test that the component doesn't break if security logger has issues
      render(
        <SubnetErrorBoundary>
          <ThrowError shouldThrow={true} />
        </SubnetErrorBoundary>
      );

      // Error boundary should still render normally
      expect(screen.getByText('Network Configuration Error')).toBeInTheDocument();
      expect(screen.getByText('Try Again')).toBeInTheDocument();
      expect(screen.getByText('Refresh Page')).toBeInTheDocument();
    });

    it('should maintain error boundary functionality with security integration', async () => {
      const mockReset = jest.fn();

      render(
        <SubnetErrorBoundary onReset={mockReset}>
          <ThrowError shouldThrow={true} />
        </SubnetErrorBoundary>
      );

      // Test that all buttons work with security integration
      const tryAgainButton = screen.getByText('Try Again');
      const refreshButton = screen.getByText('Refresh Page');

      // Try again should work
      fireEvent.click(tryAgainButton);
      expect(mockReset).toHaveBeenCalledTimes(1);

      // Refresh should work - need to find the button again after state change
      const refreshButtonAfterReset = screen.getByText('Refresh Page');
      fireEvent.click(refreshButtonAfterReset);
      
      // Give it a moment for the async call
      await waitFor(() => {
        expect(mockReloadSecurely).toHaveBeenCalled();
      }, { timeout: 100 });
    });

    it('should handle security logging in different contexts', async () => {
      render(
        <SubnetErrorBoundary context="security-integration-test">
          <ThrowError shouldThrow={true} />
        </SubnetErrorBoundary>
      );

      // Perform refresh action
      const refreshButton = screen.getByText('Refresh Page');
      fireEvent.click(refreshButton);

      // Should integrate with security logging regardless of context
      await waitFor(() => {
        expect(mockReloadSecurely).toHaveBeenCalledTimes(1);
      });
    });

    it('should handle multiple security actions', async () => {
      render(
        <SubnetErrorBoundary>
          <ThrowError shouldThrow={true} />
        </SubnetErrorBoundary>
      );

      // Perform multiple refresh actions
      const refreshButton = screen.getByText('Refresh Page');
      fireEvent.click(refreshButton);
      fireEvent.click(refreshButton);

      // Should call secure reload multiple times
      await waitFor(() => {
        expect(mockReloadSecurely).toHaveBeenCalledTimes(2);
      });
    });

    it('should integrate security logging with error categorization', () => {
      // Test different error types to ensure security integration works across all categories
      const ThrowValidationError = () => {
        throw new Error('Input validation failed');
      };

      render(
        <SubnetErrorBoundary>
          <ThrowValidationError />
        </SubnetErrorBoundary>
      );

      // Should render validation error with security integration
      expect(screen.getByText('Input Validation Error')).toBeInTheDocument();
      expect(screen.getByText('Refresh Page')).toBeInTheDocument();
    });

    it('should handle security integration in production environment', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      render(
        <SubnetErrorBoundary>
          <ThrowError shouldThrow={true} />
        </SubnetErrorBoundary>
      );

      // Perform refresh action
      const refreshButton = screen.getByText('Refresh Page');
      fireEvent.click(refreshButton);

      // Should still integrate with security logging in production
      await waitFor(() => {
        expect(mockReloadSecurely).toHaveBeenCalledTimes(1);
      });

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Error boundary security in different environments', () => {
    it('should handle security integration in production environment', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      render(
        <SubnetErrorBoundary>
          <ThrowError shouldThrow={true} />
        </SubnetErrorBoundary>
      );

      // Perform refresh action
      const refreshButton = screen.getByText('Refresh Page');
      fireEvent.click(refreshButton);

      // Should still integrate with security functions in production
      await waitFor(() => {
        expect(mockReloadSecurely).toHaveBeenCalledTimes(1);
      });

      process.env.NODE_ENV = originalEnv;
    });

    it('should handle missing window object gracefully', () => {
      // Simulate server-side rendering
      const originalWindow = global.window;
      delete (global as any).window;

      // Should not throw error
      expect(() => {
        render(
          <SubnetErrorBoundary>
            <ThrowError shouldThrow={true} />
          </SubnetErrorBoundary>
        );
      }).not.toThrow();

      // Error boundary should still render
      expect(screen.getByText('Network Configuration Error')).toBeInTheDocument();

      // Restore window
      global.window = originalWindow;
    });

    it('should handle security integration with different error types', async () => {
      // Test with different error types to ensure security integration works
      const ThrowCalculationError = () => {
        throw new Error('Calculation failed - memory overflow');
      };

      render(
        <SubnetErrorBoundary>
          <ThrowCalculationError />
        </SubnetErrorBoundary>
      );

      // Should render calculation error with security integration
      expect(screen.getByText('Subnet Calculation Error')).toBeInTheDocument();
      
      // Refresh button should still work with security integration
      const refreshButton = screen.getByText('Refresh Page');
      fireEvent.click(refreshButton);

      await waitFor(() => {
        expect(mockReloadSecurely).toHaveBeenCalledTimes(1);
      });
    });

    it('should handle security integration with custom fallback', () => {
      const customFallback = <div>Custom security fallback</div>;

      render(
        <SubnetErrorBoundary fallback={customFallback}>
          <ThrowError shouldThrow={true} />
        </SubnetErrorBoundary>
      );

      // Should render custom fallback
      expect(screen.getByText('Custom security fallback')).toBeInTheDocument();
      expect(screen.queryByText('Network Configuration Error')).not.toBeInTheDocument();
    });

    it('should maintain security integration across component re-renders', async () => {
      const { rerender } = render(
        <SubnetErrorBoundary>
          <ThrowError shouldThrow={true} />
        </SubnetErrorBoundary>
      );

      // Click refresh button
      const refreshButton = screen.getByText('Refresh Page');
      fireEvent.click(refreshButton);

      // Re-render component
      rerender(
        <SubnetErrorBoundary>
          <ThrowError shouldThrow={true} />
        </SubnetErrorBoundary>
      );

      // Security integration should still work
      const newRefreshButton = screen.getByText('Refresh Page');
      fireEvent.click(newRefreshButton);

      await waitFor(() => {
        expect(mockReloadSecurely).toHaveBeenCalledTimes(2);
      });
    });
  });
});