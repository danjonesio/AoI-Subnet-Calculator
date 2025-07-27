"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, RefreshCw, Bug, Network, Calculator, Database } from "lucide-react";
import { SubnetError, SubnetErrorType } from "@/lib/types";
import { navigateSecurely, reloadSecurely, validateInternalURL, SUBNET_CALCULATOR_SECURITY_CONFIG } from "@/lib/url-security";

interface Props {
  children: ReactNode;
  onReset?: () => void;
  fallback?: ReactNode;
  context?: string; // Context for better error categorization
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
  errorType?: SubnetErrorType;
  isRecoverable: boolean;
  retryCount: number;
}

// Error categorization based on error messages and stack traces
function categorizeError(error: Error): { type: SubnetErrorType; isRecoverable: boolean } {
  const message = error.message.toLowerCase();
  const stack = error.stack?.toLowerCase() || '';

  // Network/IP related errors
  if (message.includes('ip') || message.includes('cidr') || message.includes('subnet') || 
      message.includes('network') || message.includes('address')) {
    return { type: 'network', isRecoverable: true };
  }

  // Calculation errors
  if (message.includes('calculation') || message.includes('split') || message.includes('join') ||
      message.includes('math') || message.includes('overflow') || message.includes('invalid')) {
    return { type: 'calculation', isRecoverable: true };
  }

  // Validation errors
  if (message.includes('validation') || message.includes('invalid') || message.includes('required')) {
    return { type: 'validation', isRecoverable: true };
  }

  // Performance errors
  if (message.includes('performance') || message.includes('memory') || message.includes('timeout') ||
      message.includes('too large') || message.includes('limit')) {
    return { type: 'performance', isRecoverable: true };
  }

  // Export/Import errors
  if (message.includes('export') || message.includes('import') || message.includes('file') ||
      message.includes('format') || message.includes('clipboard')) {
    return { type: 'export', isRecoverable: true };
  }

  // Generic errors - less recoverable
  return { type: 'calculation', isRecoverable: false };
}

// Get user-friendly error messages based on error type
function getErrorMessage(errorType: SubnetErrorType, originalMessage: string): {
  title: string;
  description: string;
  suggestions: string[];
} {
  switch (errorType) {
    case 'network':
      return {
        title: "Network Configuration Error",
        description: "There was an issue with the IP address or network configuration.",
        suggestions: [
          "Verify that the IP address is in the correct format",
          "Check that the CIDR prefix is within valid range",
          "Ensure the subnet size is appropriate for the selected cloud provider"
        ]
      };

    case 'calculation':
      return {
        title: "Subnet Calculation Error",
        description: "An error occurred while calculating subnet information.",
        suggestions: [
          "Try with a smaller subnet range",
          "Verify that the split or join operation is valid",
          "Check if the subnet size exceeds system limits"
        ]
      };

    case 'validation':
      return {
        title: "Input Validation Error",
        description: "The provided input values are not valid for this operation.",
        suggestions: [
          "Check that all required fields are filled",
          "Verify that IP addresses and CIDR values are correct",
          "Ensure selected subnets are compatible for joining"
        ]
      };

    case 'performance':
      return {
        title: "Performance Limit Exceeded",
        description: "The operation would create too many subnets or use too much memory.",
        suggestions: [
          "Try splitting into fewer subnets",
          "Use a more specific CIDR range",
          "Consider processing subnets in smaller batches"
        ]
      };

    case 'export':
      return {
        title: "Export/Copy Error",
        description: "There was an issue exporting or copying subnet data.",
        suggestions: [
          "Try copying individual subnets instead of all at once",
          "Check if your browser supports clipboard operations",
          "Try a different export format"
        ]
      };

    default:
      return {
        title: "Unexpected Error",
        description: "An unexpected error occurred in the subnet management system.",
        suggestions: [
          "Try refreshing the page",
          "Clear your browser cache",
          "Contact support if the problem persists"
        ]
      };
  }
}

// Get appropriate icon for error type
function getErrorIcon(errorType: SubnetErrorType) {
  switch (errorType) {
    case 'network':
      return Network;
    case 'calculation':
      return Calculator;
    case 'validation':
      return AlertTriangle;
    case 'performance':
      return Database;
    case 'export':
      return Bug;
    default:
      return AlertTriangle;
  }
}

// Enhanced error logging with context
function logSubnetError(error: Error, errorInfo: ErrorInfo, context?: string, errorType?: SubnetErrorType) {
  const errorDetails = {
    message: error.message,
    stack: error.stack,
    componentStack: errorInfo.componentStack,
    timestamp: new Date().toISOString(),
    context: context || 'subnet-management',
    errorType: errorType || 'unknown',
    userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : 'Unknown',
    url: typeof window !== 'undefined' ? window.location.href : 'Unknown',
    viewport: typeof window !== 'undefined' ? {
      width: window.innerWidth,
      height: window.innerHeight
    } : null
  };

  // Console logging with structured data
  console.group(`🚨 Subnet Management Error [${errorType}]`);
  console.error("Error Details:", errorDetails);
  console.error("Original Error:", error);
  console.error("Component Stack:", errorInfo.componentStack);
  console.groupEnd();

  // In production, you would send this to your error tracking service
  // Example: sendToErrorService(errorDetails);
}

// Security event logging for navigation attempts
function logSecurityNavigationEvent(action: string, originalPath?: string, sanitizedPath?: string) {
  const securityEvent = {
    type: 'navigation_security_event',
    action,
    originalPath,
    sanitizedPath,
    timestamp: new Date().toISOString(),
    userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : 'Unknown',
    currentUrl: typeof window !== 'undefined' ? window.location.href : 'Unknown'
  };

  // Log security events for monitoring
  if (process.env.NODE_ENV === 'development') {
    console.log('[SECURITY] Navigation Event:', securityEvent);
  }

  // In production, this would be sent to security monitoring service
  // Example: sendToSecurityService(securityEvent);
}

export class SubnetErrorBoundary extends Component<Props, State> {
  private maxRetries = 3;

  constructor(props: Props) {
    super(props);
    this.state = { 
      hasError: false, 
      isRecoverable: true,
      retryCount: 0
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    const { type, isRecoverable } = categorizeError(error);
    return { 
      hasError: true, 
      error,
      errorType: type,
      isRecoverable
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { type } = categorizeError(error);
    
    // Enhanced error logging
    logSubnetError(error, errorInfo, this.props.context, type);
    
    // Update state with error details
    this.setState({
      error,
      errorInfo,
      errorType: type
    });
  }

  handleReset = () => {
    // Increment retry count
    const newRetryCount = this.state.retryCount + 1;
    
    // Reset error state
    this.setState({ 
      hasError: false, 
      error: undefined, 
      errorInfo: undefined,
      retryCount: newRetryCount
    });

    // Call parent reset handler if provided
    if (this.props.onReset) {
      try {
        this.props.onReset();
      } catch (resetError) {
        console.error("Error during reset:", resetError);
      }
    }
  };

  handleRefreshPage = () => {
    // Log security event for refresh action
    const currentPath = typeof window !== 'undefined' ? window.location.pathname : '/';
    const validation = validateInternalURL(currentPath);
    
    logSecurityNavigationEvent(
      'refresh_page',
      currentPath,
      validation.sanitizedPath
    );

    // Use secure reload function that validates current path
    reloadSecurely();
  };

  handleSecureStartOver = () => {
    // Log security event for start over action
    const currentPath = typeof window !== 'undefined' ? window.location.pathname : '/';
    const fallbackPath = SUBNET_CALCULATOR_SECURITY_CONFIG.fallbackPath;
    
    logSecurityNavigationEvent(
      'start_over',
      currentPath,
      fallbackPath
    );

    // Navigate to the application root using secure navigation
    navigateSecurely(fallbackPath);
  };

  render() {
    if (this.state.hasError && this.state.error && this.state.errorType) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const errorMessage = getErrorMessage(this.state.errorType, this.state.error.message);
      const ErrorIcon = getErrorIcon(this.state.errorType);
      const showRetry = this.state.isRecoverable && this.state.retryCount < this.maxRetries;

      return (
        <div className="w-full p-4">
          <Card className="border-destructive bg-destructive/5">
            <CardHeader>
              <div className="flex items-center gap-2">
                <ErrorIcon className="h-5 w-5 text-destructive" />
                <CardTitle className="text-destructive">{errorMessage.title}</CardTitle>
              </div>
              <CardDescription>
                {errorMessage.description}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Error suggestions */}
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-2">
                    <p className="font-medium">Suggested solutions:</p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      {errorMessage.suggestions.map((suggestion, index) => (
                        <li key={index}>{suggestion}</li>
                      ))}
                    </ul>
                  </div>
                </AlertDescription>
              </Alert>

              {/* Retry information */}
              {this.state.retryCount > 0 && (
                <Alert variant="default">
                  <AlertDescription>
                    Retry attempt {this.state.retryCount} of {this.maxRetries}
                  </AlertDescription>
                </Alert>
              )}

              {/* Development error details */}
              {process.env.NODE_ENV === "development" && this.state.error && (
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                    Technical Details (Development Mode)
                  </summary>
                  <div className="mt-2 p-3 bg-muted rounded-md">
                    <pre className="text-xs overflow-auto whitespace-pre-wrap">
                      <strong>Error Type:</strong> {this.state.errorType}
                      {"\n"}
                      <strong>Recoverable:</strong> {this.state.isRecoverable ? 'Yes' : 'No'}
                      {"\n"}
                      <strong>Context:</strong> {this.props.context || 'subnet-management'}
                      {"\n\n"}
                      <strong>Message:</strong> {this.state.error.message}
                      {"\n\n"}
                      <strong>Stack:</strong> {this.state.error.stack}
                      {this.state.errorInfo && (
                        <>
                          {"\n\n"}
                          <strong>Component Stack:</strong> {this.state.errorInfo.componentStack}
                        </>
                      )}
                    </pre>
                  </div>
                </details>
              )}

              {/* Action buttons */}
              <div className="flex gap-2 flex-wrap">
                {showRetry && (
                  <Button onClick={this.handleReset} variant="default">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Try Again
                  </Button>
                )}
                
                <Button 
                  onClick={this.handleRefreshPage} 
                  variant={showRetry ? "outline" : "default"}
                >
                  Refresh Page
                </Button>

                {!this.state.isRecoverable && (
                  <Button 
                    onClick={this.handleSecureStartOver}
                    variant="outline"
                  >
                    Start Over
                  </Button>
                )}
              </div>

              {/* Additional help text */}
              <div className="text-sm text-muted-foreground">
                <p>
                  If this error persists, try refreshing the page or starting with a new subnet calculation.
                  Your subnet management data is not permanently stored, so no data will be lost.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

export default SubnetErrorBoundary;