"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { 
  AlertCircle, 
  AlertTriangle, 
  Info, 
  X, 
  ChevronDown, 
  ChevronRight,
  Lightbulb,
  ExternalLink
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SubnetError, ValidationResult } from "@/lib/types";

// Error display variant types
export type ErrorDisplayVariant = 'error' | 'warning' | 'info' | 'success';

// Props interface for the ErrorDisplay component
export interface ErrorDisplayProps {
  // Validation result from subnet operations
  validation?: ValidationResult;
  // Individual error object
  error?: SubnetError;
  // Custom error message
  message?: string;
  // Error variant (overrides automatic detection)
  variant?: ErrorDisplayVariant;
  // Whether the error can be dismissed
  dismissible?: boolean;
  // Callback when error is dismissed
  onDismiss?: () => void;
  // Whether to show suggestions expanded by default
  expandSuggestions?: boolean;
  // Whether to auto-clear after a timeout
  autoClear?: boolean;
  // Auto-clear timeout in milliseconds
  autoClearTimeout?: number;
  // Custom CSS classes
  className?: string;
  // Whether to show detailed error information
  showDetails?: boolean;
  // Context information for better error messages
  context?: {
    operation?: string;
    subnet?: string;
    cloudMode?: string;
    ipVersion?: string;
  };
}

// Error severity levels for styling and behavior
const ERROR_SEVERITY = {
  error: {
    icon: AlertCircle,
    variant: 'destructive' as const,
    bgColor: 'bg-red-50 dark:bg-red-950/20',
    borderColor: 'border-red-200 dark:border-red-800',
    textColor: 'text-red-800 dark:text-red-200',
    iconColor: 'text-red-500'
  },
  warning: {
    icon: AlertTriangle,
    variant: 'default' as const,
    bgColor: 'bg-orange-50 dark:bg-orange-950/20',
    borderColor: 'border-orange-200 dark:border-orange-800',
    textColor: 'text-orange-800 dark:text-orange-200',
    iconColor: 'text-orange-500'
  },
  info: {
    icon: Info,
    variant: 'default' as const,
    bgColor: 'bg-blue-50 dark:bg-blue-950/20',
    borderColor: 'border-blue-200 dark:border-blue-800',
    textColor: 'text-blue-800 dark:text-blue-200',
    iconColor: 'text-blue-500'
  },
  success: {
    icon: Info,
    variant: 'default' as const,
    bgColor: 'bg-green-50 dark:bg-green-950/20',
    borderColor: 'border-green-200 dark:border-green-800',
    textColor: 'text-green-800 dark:text-green-200',
    iconColor: 'text-green-500'
  }
};

// Helper function to determine error variant from validation result
function getVariantFromValidation(validation: ValidationResult): ErrorDisplayVariant {
  if (validation.errors.length > 0) return 'error';
  if (validation.warnings.length > 0) return 'warning';
  return 'info';
}

// Helper function to determine error variant from SubnetError
function getVariantFromError(error: SubnetError): ErrorDisplayVariant {
  switch (error.type) {
    case 'validation':
    case 'calculation':
    case 'network':
      return 'error';
    case 'performance':
      return 'warning';
    case 'export':
    case 'import':
      return 'info';
    default:
      return 'error';
  }
}

// Helper function to enhance error messages with context
function enhanceErrorMessage(
  message: string, 
  context?: ErrorDisplayProps['context']
): string {
  if (!context) return message;

  let enhanced = message;

  // Add subnet context first (replace generic "subnet" with specific subnet)
  if (context.subnet) {
    enhanced = enhanced.replace(/subnet(?!\s+\d)/gi, `subnet ${context.subnet}`);
  }

  // Add operation context
  if (context.operation) {
    enhanced = `${context.operation}: ${enhanced}`;
  }

  // Add cloud mode context
  if (context.cloudMode && context.cloudMode !== 'normal') {
    enhanced = `${enhanced} (${context.cloudMode.toUpperCase()} mode)`;
  }

  return enhanced;
}

// Helper function to generate contextual suggestions
function generateContextualSuggestions(
  originalSuggestions: string[] = [],
  context?: ErrorDisplayProps['context']
): string[] {
  const suggestions = [...originalSuggestions];

  // Add cloud-specific suggestions
  if (context?.cloudMode && context.cloudMode !== 'normal') {
    const cloudDocs = {
      aws: 'https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Subnets.html',
      azure: 'https://docs.microsoft.com/en-us/azure/virtual-network/virtual-networks-faq',
      gcp: 'https://cloud.google.com/vpc/docs/subnets'
    };

    const docUrl = cloudDocs[context.cloudMode as keyof typeof cloudDocs];
    if (docUrl) {
      suggestions.push(`Consult ${context.cloudMode.toUpperCase()} documentation for subnet requirements`);
    }
  }

  // Add IPv6 specific suggestions
  if (context?.ipVersion === 'ipv6') {
    suggestions.push('IPv6 subnets have different addressing rules than IPv4');
    suggestions.push('Consider using /64 or larger prefixes for IPv6 subnets');
  }

  return suggestions;
}

export function ErrorDisplay({
  validation,
  error,
  message,
  variant,
  dismissible = false,
  onDismiss,
  expandSuggestions = false,
  autoClear = false,
  autoClearTimeout = 5000,
  className,
  showDetails = false,
  context
}: ErrorDisplayProps) {
  const [isDismissed, setIsDismissed] = useState(false);
  const [suggestionsExpanded, setSuggestionsExpanded] = useState(expandSuggestions);
  const [detailsExpanded, setDetailsExpanded] = useState(false);

  // Reset dismissed state when validation changes from invalid to valid
  useEffect(() => {
    if (validation && validation.isValid && validation.errors.length === 0 && validation.warnings.length === 0) {
      setIsDismissed(false);
    }
  }, [validation]);

  // Reset all internal state when the error content changes
  useEffect(() => {
    setIsDismissed(false);
    setSuggestionsExpanded(expandSuggestions);
    setDetailsExpanded(false);
  }, [validation?.errors, validation?.warnings, error?.message, message, expandSuggestions]);

  // Handle dismiss action
  const handleDismiss = useCallback(() => {
    setIsDismissed(true);
    onDismiss?.();
  }, [onDismiss]);

  // Auto-clear functionality
  useEffect(() => {
    if (autoClear && !isDismissed) {
      const timer = setTimeout(() => {
        handleDismiss();
      }, autoClearTimeout);

      return () => clearTimeout(timer);
    }
  }, [autoClear, autoClearTimeout, isDismissed, handleDismiss]);

  // Don't render if dismissed
  if (isDismissed) {
    return null;
  }

  // Determine what to display
  let displayVariant: ErrorDisplayVariant;
  let displayMessages: string[] = [];
  let displayWarnings: string[] = [];
  let displaySuggestions: string[] = [];
  let displayError: SubnetError | undefined;

  if (validation) {
    displayVariant = variant || getVariantFromValidation(validation);
    displayMessages = validation.errors;
    displayWarnings = validation.warnings;
    displaySuggestions = generateContextualSuggestions(validation.suggestions, context);
  } else if (error) {
    displayVariant = variant || getVariantFromError(error);
    displayMessages = [enhanceErrorMessage(error.message, context)];
    displayError = error;
  } else if (message) {
    displayVariant = variant || 'error';
    displayMessages = [enhanceErrorMessage(message, context)];
  } else {
    // Nothing to display
    return null;
  }

  // Get styling configuration
  const config = ERROR_SEVERITY[displayVariant];
  const IconComponent = config.icon;

  // Don't render if no messages to show
  if (displayMessages.length === 0 && displayWarnings.length === 0) {
    return null;
  }

  return (
    <Alert 
      variant={config.variant}
      className={cn(
        "relative",
        config.bgColor,
        config.borderColor,
        className
      )}
    >
      <IconComponent className={cn("h-4 w-4", config.iconColor)} />
      
      {/* Dismiss button */}
      {dismissible && (
        <Button
          variant="ghost"
          size="sm"
          className="absolute right-2 top-2 h-6 w-6 p-0 hover:bg-transparent"
          onClick={handleDismiss}
        >
          <X className="h-3 w-3" />
          <span className="sr-only">Dismiss</span>
        </Button>
      )}

      <AlertDescription className={cn("space-y-3", config.textColor)}>
        {/* Error messages */}
        {displayMessages.length > 0 && (
          <div className="space-y-1">
            {displayMessages.length === 1 ? (
              <div className="flex items-start gap-2">
                <span className="font-medium">
                  {displayVariant === 'error' ? 'Error:' : 
                   displayVariant === 'warning' ? 'Warning:' : 
                   displayVariant === 'info' ? 'Info:' : 'Notice:'}
                </span>
                <span>{displayMessages[0]}</span>
              </div>
            ) : (
              displayMessages.map((msg, index) => (
                <div key={`error-${index}`} className="flex items-start gap-2">
                  <span className="font-medium">
                    {displayVariant === 'error' ? 'Error:' : 
                     displayVariant === 'warning' ? 'Warning:' : 
                     displayVariant === 'info' ? 'Info:' : 'Notice:'}
                  </span>
                  <span>{msg}</span>
                </div>
              ))
            )}
          </div>
        )}

        {/* Warning messages (only show if we have warnings and no errors) */}
        {displayWarnings.length > 0 && displayMessages.length === 0 && (
          <div className="space-y-1">
            {displayWarnings.map((warning, index) => (
              <div key={`warning-${index}`} className="flex items-start gap-2">
                <span className="font-medium">Warning:</span>
                <span className="text-sm">{warning}</span>
              </div>
            ))}
          </div>
        )}

        {/* Suggestions section */}
        {displaySuggestions.length > 0 && (
          <div className="space-y-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 font-medium text-left justify-start hover:bg-transparent"
              onClick={() => setSuggestionsExpanded(!suggestionsExpanded)}
            >
              {suggestionsExpanded ? (
                <ChevronDown className="h-3 w-3 mr-1" />
              ) : (
                <ChevronRight className="h-3 w-3 mr-1" />
              )}
              <Lightbulb className="h-3 w-3 mr-1" />
              Suggestions ({displaySuggestions.length})
            </Button>
            
            {suggestionsExpanded && (
              <div className="ml-4 space-y-1">
                {displaySuggestions.map((suggestion, index) => (
                  <div key={`suggestion-${index}`} className="flex items-start gap-2 text-sm">
                    <span className="text-muted-foreground">•</span>
                    <span>{suggestion}</span>
                    {suggestion.includes('documentation') && (
                      <ExternalLink className="h-3 w-3 ml-1 flex-shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Error details section (development/debugging) */}
        {showDetails && displayError && (
          <div className="space-y-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 font-medium text-left justify-start hover:bg-transparent"
              onClick={() => setDetailsExpanded(!detailsExpanded)}
            >
              {detailsExpanded ? (
                <ChevronDown className="h-3 w-3 mr-1" />
              ) : (
                <ChevronRight className="h-3 w-3 mr-1" />
              )}
              Technical Details
            </Button>
            
            {detailsExpanded && (
              <div className="ml-4 space-y-2 text-xs">
                <div>
                  <span className="font-medium">Error Type:</span> {displayError.type}
                </div>
                {displayError.code && (
                  <div>
                    <span className="font-medium">Error Code:</span> {displayError.code}
                  </div>
                )}
                <div>
                  <span className="font-medium">Timestamp:</span> {new Date(displayError.timestamp).toLocaleString()}
                </div>
                <div>
                  <span className="font-medium">Recoverable:</span> {displayError.recoverable ? 'Yes' : 'No'}
                </div>
                {displayError.details && Object.keys(displayError.details).length > 0 && (
                  <div>
                    <span className="font-medium">Details:</span>
                    <pre className="mt-1 p-2 bg-muted rounded text-xs overflow-auto">
                      {JSON.stringify(displayError.details, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Context information */}
        {context && (showDetails || process.env.NODE_ENV === 'development') && (
          <div className="text-xs text-muted-foreground border-t pt-2 mt-2">
            <div className="font-medium mb-1">Context:</div>
            <div className="space-y-1">
              {context.operation && <div>Operation: {context.operation}</div>}
              {context.subnet && <div>Subnet: {context.subnet}</div>}
              {context.cloudMode && <div>Cloud Mode: {context.cloudMode}</div>}
              {context.ipVersion && <div>IP Version: {context.ipVersion}</div>}
            </div>
          </div>
        )}
      </AlertDescription>
    </Alert>
  );
}

// Convenience components for specific error types
export function ValidationErrorDisplay(props: Omit<ErrorDisplayProps, 'variant'>) {
  return <ErrorDisplay {...props} variant="error" />;
}

export function ValidationWarningDisplay(props: Omit<ErrorDisplayProps, 'variant'>) {
  return <ErrorDisplay {...props} variant="warning" />;
}

export function ValidationInfoDisplay(props: Omit<ErrorDisplayProps, 'variant'>) {
  return <ErrorDisplay {...props} variant="info" />;
}

// Hook for managing error display state
export function useErrorDisplay() {
  const [errors, setErrors] = useState<Map<string, SubnetError>>(new Map());
  const [validations, setValidations] = useState<Map<string, ValidationResult>>(new Map());

  const addError = useCallback((id: string, error: SubnetError) => {
    setErrors(prev => new Map(prev).set(id, error));
  }, []);

  const removeError = useCallback((id: string) => {
    setErrors(prev => {
      const newMap = new Map(prev);
      newMap.delete(id);
      return newMap;
    });
  }, []);

  const addValidation = useCallback((id: string, validation: ValidationResult) => {
    setValidations(prev => new Map(prev).set(id, validation));
  }, []);

  const removeValidation = useCallback((id: string) => {
    setValidations(prev => {
      const newMap = new Map(prev);
      newMap.delete(id);
      return newMap;
    });
  }, []);

  const clearAll = useCallback(() => {
    setErrors(new Map());
    setValidations(new Map());
  }, []);

  const hasErrors = errors.size > 0;
  const hasValidations = validations.size > 0;
  const hasAny = hasErrors || hasValidations;

  return {
    errors,
    validations,
    addError,
    removeError,
    addValidation,
    removeValidation,
    clearAll,
    hasErrors,
    hasValidations,
    hasAny
  };
}