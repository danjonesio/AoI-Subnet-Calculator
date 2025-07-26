"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, Info, Scissors, Keyboard } from "lucide-react";
import { ErrorDisplay } from "./error-display";
import { 
  SubnetSplitterProps, 
  SplitOptions, 
  SubnetOperation,
  ValidationResult 
} from "@/lib/types";
import { 
  validateIPv4Split, 
  calculateSplitPreview,
  createSubnetError 
} from "@/lib/subnet-splitting";
import { generateOperationId } from "@/lib/utils";
import { debounce, performanceMonitor, shouldShowPerformanceWarning } from "@/lib/performance";
import { useKeyboardNavigation, useSubnetKeyboardShortcuts, formatKeyboardShortcut } from "@/lib/keyboard-navigation";

export function SubnetSplitter({
  parentSubnet,
  ipVersion,
  cloudMode,
  onSplit,
  onError,
  disabled = false,
  maxSubnets = 1000
}: SubnetSplitterProps) {
  const [splitType, setSplitType] = useState<'equal' | 'custom'>('equal');
  const [splitCount, setSplitCount] = useState<string>('2');
  const [customCidr, setCustomCidr] = useState<string>('');
  const [isValidating, setIsValidating] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);

  // Keyboard navigation setup
  const containerRef = useRef<HTMLDivElement>(null);
  const confirmationModalRef = useRef<HTMLDivElement>(null);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);

  // Set up keyboard navigation for the main component
  const {
    registerShortcut,
    unregisterShortcut,
    getShortcuts,
    focusFirst,
    restoreFocus
  } = useKeyboardNavigation(containerRef, {
    enableArrowKeys: true,
    enableTabNavigation: true,
    enableShortcuts: true,
    enableEscapeHandling: true,
    enableEnterHandling: true,
    enableSpaceHandling: true,
    trapFocus: false,
    autoFocus: false
  });

  // Set up keyboard navigation for confirmation modal
  const modalNavigation = useKeyboardNavigation(confirmationModalRef, {
    enableArrowKeys: true,
    enableTabNavigation: true,
    enableShortcuts: true,
    enableEscapeHandling: true,
    enableEnterHandling: true,
    enableSpaceHandling: true,
    trapFocus: true,
    autoFocus: true
  });

  const [debouncedSplitCount, setDebouncedSplitCount] = useState<string>('2');
  const [debouncedCustomCidr, setDebouncedCustomCidr] = useState<string>('');

  // Extract parent CIDR number for calculations
  const parentCidr = useMemo(() => {
    const match = parentSubnet.cidr.match(/\/(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
  }, [parentSubnet.cidr]);

  // Debounced input handlers for performance optimization
  const debouncedSplitCountUpdate = useMemo(
    () => debounce((value: string) => {
      setDebouncedSplitCount(value);
    }, 300),
    []
  );

  const debouncedCustomCidrUpdate = useMemo(
    () => debounce((value: string) => {
      setDebouncedCustomCidr(value);
    }, 300),
    []
  );

  // Update debounced values when inputs change
  useEffect(() => {
    debouncedSplitCountUpdate(splitCount);
  }, [splitCount, debouncedSplitCountUpdate]);

  useEffect(() => {
    debouncedCustomCidrUpdate(customCidr);
  }, [customCidr, debouncedCustomCidrUpdate]);

  // Calculate split preview using debounced values for better performance
  const splitPreview = useMemo(() => {
    const options: SplitOptions = {
      splitType,
      splitCount: splitType === 'equal' ? parseInt(debouncedSplitCount) : undefined,
      customCidr: splitType === 'custom' ? parseInt(debouncedCustomCidr) : undefined,
      maxResults: maxSubnets
    };

    return calculateSplitPreview(parentCidr, options);
  }, [parentCidr, splitType, debouncedSplitCount, debouncedCustomCidr, maxSubnets]);

  // Real-time validation with enhanced error handling
  const validation = useMemo((): ValidationResult => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const suggestions: string[] = [];

    // Basic input validation
    if (splitType === 'equal') {
      const count = parseInt(splitCount);
      if (isNaN(count) || count < 2) {
        errors.push('Split count must be at least 2');
      } else if (count > 1024) {
        errors.push('Split count cannot exceed 1024 subnets');
        suggestions.push('Consider using a smaller split count for better performance');
      } else if (count > 100) {
        warnings.push(`Creating ${count} subnets may impact performance`);
        suggestions.push('Consider using virtual scrolling for large subnet lists');
      }

      // Check if count is a power of 2
      if (count > 0 && (count & (count - 1)) !== 0) {
        const nextPowerOf2 = Math.pow(2, Math.ceil(Math.log2(count)));
        warnings.push(`Split count ${count} will be rounded up to ${nextPowerOf2} (next power of 2)`);
      }
    } else if (splitType === 'custom') {
      const targetCidr = parseInt(customCidr);
      if (isNaN(targetCidr)) {
        errors.push('Target CIDR must be a valid number');
      } else if (targetCidr <= parentCidr) {
        errors.push(`Target CIDR must be more specific than parent CIDR /${parentCidr}`);
        suggestions.push(`Enter a value between ${parentCidr + 1} and ${ipVersion === 'ipv4' ? 32 : 128}`);
      } else if (targetCidr > (ipVersion === 'ipv4' ? 32 : 128)) {
        errors.push(`Target CIDR cannot exceed /${ipVersion === 'ipv4' ? 32 : 128}`);
      }

      // IPv4 specific validations
      if (ipVersion === 'ipv4' && targetCidr > 30) {
        warnings.push('Very small subnets (>/30) may have limited practical use');
        if (targetCidr === 32) {
          suggestions.push('/32 subnets are host routes with only 1 usable address');
        } else if (targetCidr === 31) {
          suggestions.push('/31 subnets are point-to-point links with 2 usable addresses (RFC 3021)');
        }
      }
    }

    // If basic validation fails, return early
    if (errors.length > 0) {
      return { isValid: false, errors, warnings, suggestions };
    }

    // Advanced validation using split preview
    if (!splitPreview.isValid) {
      errors.push(splitPreview.error || 'Invalid split configuration');
      return { isValid: false, errors, warnings, suggestions };
    }

    // Cloud provider specific validation with enhanced error messages
    if (cloudMode !== 'normal') {
      const cloudProviders = {
        aws: { 
          name: 'AWS', 
          minCidr: 16, 
          maxCidr: 28, 
          reservedIPs: 5,
          minRecommendedHosts: 16,
          service: 'VPC',
          documentation: 'https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Subnets.html'
        },
        azure: { 
          name: 'Azure', 
          minCidr: 8, 
          maxCidr: 29, 
          reservedIPs: 5,
          minRecommendedHosts: 8,
          service: 'Virtual Network',
          documentation: 'https://docs.microsoft.com/en-us/azure/virtual-network/virtual-networks-faq'
        },
        gcp: { 
          name: 'Google Cloud', 
          minCidr: 8, 
          maxCidr: 29, 
          reservedIPs: 4,
          minRecommendedHosts: 8,
          service: 'VPC Network',
          documentation: 'https://cloud.google.com/vpc/docs/subnets'
        }
      };

      const provider = cloudProviders[cloudMode as keyof typeof cloudProviders];
      if (provider) {
        // CIDR size validation with specific error messages
        if (splitPreview.targetCidr > provider.maxCidr) {
          errors.push(`${provider.name} ${provider.service} does not support subnets smaller than /${provider.maxCidr}`);
          errors.push(`Target CIDR /${splitPreview.targetCidr} exceeds ${provider.name} maximum subnet size`);
          suggestions.push(`Use a target CIDR between /${provider.minCidr} and /${provider.maxCidr} for ${provider.name} compatibility`);
          suggestions.push(`For smaller subnets, consider using multiple ${provider.name} availability zones`);
        }

        if (splitPreview.targetCidr < provider.minCidr) {
          errors.push(`${provider.name} ${provider.service} requires subnets to be at least /${provider.minCidr}`);
          errors.push(`Target CIDR /${splitPreview.targetCidr} is too large for ${provider.name} subnets`);
          suggestions.push(`${provider.name} limits subnet sizes to prevent IP address exhaustion`);
        }

        // IP address availability validation
        if (splitPreview.subnetSize < provider.reservedIPs) {
          errors.push(`${provider.name} ${provider.service} requires at least ${provider.reservedIPs} IP addresses per subnet`);
          errors.push(`Resulting /${splitPreview.targetCidr} subnets will only have ${splitPreview.subnetSize} IP addresses`);
          errors.push(`${provider.name} reserves ${provider.reservedIPs} IPs for system use (network, gateway, DNS, broadcast)`);
          suggestions.push(`Use a larger target CIDR (smaller number) to ensure sufficient IP addresses`);
          suggestions.push(`Minimum viable ${provider.name} subnet is /${provider.maxCidr} with ${Math.pow(2, 32 - provider.maxCidr)} total IPs`);
        } else if (splitPreview.subnetSize - provider.reservedIPs < provider.minRecommendedHosts) {
          warnings.push(`${provider.name} subnets will have very few usable IP addresses (${splitPreview.subnetSize - provider.reservedIPs})`);
          warnings.push(`${provider.name} recommends at least ${provider.minRecommendedHosts} usable IPs per subnet for practical use`);
          suggestions.push('Consider using a larger subnet size for more usable addresses');
          suggestions.push(`Each ${provider.name} subnet should accommodate expected resource growth`);
        }

        // Cloud-specific best practice warnings
        if (cloudMode === 'aws') {
          if (splitPreview.subnetCount > 200) {
            warnings.push('AWS VPCs have a default limit of 200 subnets per VPC');
            suggestions.push('Consider using multiple VPCs or request a service limit increase');
          }
          if (splitPreview.targetCidr === 28) {
            warnings.push('AWS /28 subnets have only 11 usable IPs after reserved addresses');
            suggestions.push('Consider /27 or larger for better resource allocation flexibility');
          }
        } else if (cloudMode === 'azure') {
          if (splitPreview.subnetCount > 3000) {
            warnings.push('Azure Virtual Networks have a default limit of 3000 subnets');
            suggestions.push('Consider using multiple Virtual Networks if needed');
          }
          if (splitPreview.targetCidr === 29) {
            warnings.push('Azure /29 subnets have only 3 usable IPs after reserved addresses');
            suggestions.push('Very small subnets may limit Azure service deployment options');
          }
        } else if (cloudMode === 'gcp') {
          if (splitPreview.subnetCount > 100) {
            warnings.push('Google Cloud VPC networks have a default limit of 100 subnets per network');
            suggestions.push('Consider using multiple VPC networks or regional subnets');
          }
          if (splitPreview.targetCidr === 29) {
            warnings.push('GCP /29 subnets have only 4 usable IPs after reserved addresses');
            suggestions.push('Consider larger subnets for better resource allocation');
          }
        }

        // Multi-AZ/Region considerations
        if (splitPreview.subnetCount >= 3 && splitPreview.subnetCount % 3 === 0) {
          suggestions.push(`${splitPreview.subnetCount} subnets can be evenly distributed across 3 availability zones`);
        } else if (splitPreview.subnetCount >= 2 && splitPreview.subnetCount % 2 === 0) {
          suggestions.push(`${splitPreview.subnetCount} subnets can be evenly distributed across 2 availability zones`);
        }
      }
    }

    // Performance warnings
    if (splitPreview.subnetCount > 500) {
      warnings.push(`Creating ${splitPreview.subnetCount.toLocaleString()} subnets may significantly impact performance`);
      suggestions.push('Consider splitting into smaller batches or using server-side pagination');
    } else if (splitPreview.subnetCount > 100) {
      warnings.push(`Creating ${splitPreview.subnetCount} subnets may impact performance`);
      suggestions.push('Consider using virtual scrolling for better UI responsiveness');
    }

    // Memory usage warnings
    const estimatedMemoryMB = (splitPreview.subnetCount * 0.5) / 1024; // Rough estimate
    if (estimatedMemoryMB > 50) {
      warnings.push(`Large split operation may use approximately ${estimatedMemoryMB.toFixed(1)}MB of memory`);
      suggestions.push('Monitor browser memory usage during large operations');
    }

    // Use the existing validation function for additional checks
    const options: SplitOptions = {
      splitType,
      splitCount: splitType === 'equal' ? parseInt(splitCount) : undefined,
      customCidr: splitType === 'custom' ? parseInt(customCidr) : undefined,
      maxResults: maxSubnets
    };

    const advancedValidation = validateIPv4Split(parentSubnet, options, cloudMode);
    errors.push(...advancedValidation.errors);
    warnings.push(...advancedValidation.warnings);
    if (advancedValidation.suggestions) {
      suggestions.push(...advancedValidation.suggestions);
    }

    return {
      isValid: errors.length === 0,
      errors: [...new Set(errors)], // Remove duplicates
      warnings: [...new Set(warnings)], // Remove duplicates
      suggestions: [...new Set(suggestions)] // Remove duplicates
    };
  }, [parentSubnet, splitType, splitCount, customCidr, cloudMode, maxSubnets, splitPreview, parentCidr, ipVersion]);

  // Handle split type change
  const handleSplitTypeChange = useCallback((value: 'equal' | 'custom') => {
    setSplitType(value);
    // Reset values when switching types
    if (value === 'equal') {
      setSplitCount('2');
      setCustomCidr('');
    } else {
      setSplitCount('');
      setCustomCidr((parentCidr + 1).toString());
    }
  }, [parentCidr]);

  // Handle split count change for equal splits
  const handleSplitCountChange = useCallback((value: string) => {
    setSplitCount(value);
  }, []);

  // Handle custom CIDR change
  const handleCustomCidrChange = useCallback((value: string) => {
    setCustomCidr(value);
  }, []);

  // Check if confirmation is needed for large operations
  const needsConfirmation = useCallback(() => {
    if (!splitPreview.isValid) return false;
    
    // Show confirmation for operations that create many subnets or may impact performance
    return splitPreview.subnetCount > 50 || 
           (validation.warnings.some(w => w.includes('performance')) && splitPreview.subnetCount > 20);
  }, [splitPreview, validation.warnings]);

  // Handle split button click - may show confirmation first
  const handleSplitClick = useCallback(() => {
    if (!validation.isValid || disabled) {
      return;
    }

    if (needsConfirmation()) {
      setShowConfirmation(true);
    } else {
      // Execute split directly without calling handleSplit to avoid circular dependency
      setIsValidating(true);
      
      const executeDirectSplit = async () => {
        // Start performance monitoring
        const monitor = performanceMonitor.startOperation('subnet_split_ui');
        monitor.addMetadata({ 
          splitType, 
          expectedSubnets: splitPreview.subnetCount,
          cloudMode,
          ipVersion 
        });

        try {
          const options: SplitOptions = {
            splitType,
            splitCount: splitType === 'equal' ? parseInt(splitCount) : undefined,
            customCidr: splitType === 'custom' ? parseInt(customCidr) : undefined,
            maxResults: maxSubnets
          };

          // Import the splitting function dynamically to avoid circular dependencies
          const { splitIPv4Subnet } = await import('@/lib/subnet-splitting');
          
          const result = splitIPv4Subnet(parentSubnet, options, cloudMode);
          
          // End performance monitoring
          const metrics = monitor.end();
          
          // Check for performance warnings
          const performanceWarning = shouldShowPerformanceWarning(
            'split',
            result.subnets.length,
            metrics.duration
          );

          if (performanceWarning.shouldWarn) {
            console.warn(`Performance Warning: ${performanceWarning.message}`, {
              suggestions: performanceWarning.suggestions,
              metrics
            });
          }
          
          if (result.subnets.length === 0) {
            onError(createSubnetError(
              'calculation',
              'Split operation produced no results. Please check your configuration.',
              { options, parentSubnet: parentSubnet.network }
            ));
            return;
          }

          // Create operation record
          const operation: SubnetOperation = {
            id: generateOperationId('split'),
            type: 'split',
            timestamp: Date.now(),
            sourceSubnets: [parentSubnet.id || parentSubnet.network],
            resultSubnets: result.subnets,
            description: `Split ${parentSubnet.network}${parentSubnet.cidr} into ${result.subnets.length} /${splitPreview.targetCidr} subnets`,
            ipVersion,
            cloudMode
          };

          onSplit(result.subnets, operation);

        } catch (error) {
          console.error('Split operation failed:', error);
          onError(createSubnetError(
            'calculation',
            error instanceof Error ? error.message : 'Unknown error during split operation',
            { splitType, splitCount, customCidr, parentSubnet: parentSubnet.network }
          ));
        } finally {
          setIsValidating(false);
        }
      };
      
      executeDirectSplit();
    }
  }, [validation.isValid, disabled, needsConfirmation, splitType, splitCount, customCidr, maxSubnets, parentSubnet, cloudMode, ipVersion, splitPreview.targetCidr, onSplit, onError]);

  // Execute the split operation
  const handleSplit = useCallback(async () => {
    if (!validation.isValid || disabled) {
      return;
    }

    setShowConfirmation(false);
    setIsValidating(true);

    try {
      const options: SplitOptions = {
        splitType,
        splitCount: splitType === 'equal' ? parseInt(splitCount) : undefined,
        customCidr: splitType === 'custom' ? parseInt(customCidr) : undefined,
        maxResults: maxSubnets
      };

      // Import the splitting function dynamically to avoid circular dependencies
      const { splitIPv4Subnet } = await import('@/lib/subnet-splitting');
      
      const result = splitIPv4Subnet(parentSubnet, options, cloudMode);
      
      if (result.subnets.length === 0) {
        onError(createSubnetError(
          'calculation',
          'Split operation produced no results. Please check your configuration.',
          { options, parentSubnet: parentSubnet.network }
        ));
        return;
      }

      // Create operation record
      const operation: SubnetOperation = {
        id: generateOperationId('split'),
        type: 'split',
        timestamp: Date.now(),
        sourceSubnets: [parentSubnet.id || parentSubnet.network],
        resultSubnets: result.subnets,
        description: `Split ${parentSubnet.network}${parentSubnet.cidr} into ${result.subnets.length} /${splitPreview.targetCidr} subnets`,
        ipVersion,
        cloudMode
      };

      onSplit(result.subnets, operation);

    } catch (error) {
      console.error('Split operation failed:', error);
      onError(createSubnetError(
        'calculation',
        error instanceof Error ? error.message : 'Unknown error during split operation',
        { splitType, splitCount, customCidr, parentSubnet: parentSubnet.network }
      ));
    } finally {
      setIsValidating(false);
    }
  }, [
    validation.isValid,
    disabled,
    splitType,
    splitCount,
    customCidr,
    maxSubnets,
    parentSubnet,
    cloudMode,
    ipVersion,
    splitPreview.targetCidr,
    onSplit,
    onError
  ]);

  // Common split options for dropdown
  const commonSplitOptions = [
    { value: '2', label: 'Split in Half (2 subnets)', description: 'Divide into 2 equal subnets' },
    { value: '4', label: 'Split in Quarters (4 subnets)', description: 'Divide into 4 equal subnets' },
    { value: '8', label: 'Split in Eighths (8 subnets)', description: 'Divide into 8 equal subnets' },
    { value: '16', label: 'Split into 16 subnets', description: 'Divide into 16 equal subnets' },
    { value: '32', label: 'Split into 32 subnets', description: 'Divide into 32 equal subnets' }
  ];

  // Register keyboard shortcuts
  useEffect(() => {
    // Split subnet shortcut
    registerShortcut({
      key: 'Enter',
      action: () => {
        if (validation.isValid && !disabled && !isValidating) {
          handleSplitClick();
        }
      },
      description: 'Execute split operation',
      category: 'Split Operations'
    });

    // Quick split shortcuts (using Ctrl+Shift to avoid browser conflicts)
    registerShortcut({
      key: '2',
      ctrlKey: true,
      shiftKey: true,
      action: () => {
        if (!disabled) {
          setSplitType('equal');
          setSplitCount('2');
        }
      },
      description: 'Quick split in half',
      category: 'Split Operations'
    });

    registerShortcut({
      key: '4',
      ctrlKey: true,
      shiftKey: true,
      action: () => {
        if (!disabled) {
          setSplitType('equal');
          setSplitCount('4');
        }
      },
      description: 'Quick split in quarters',
      category: 'Split Operations'
    });

    registerShortcut({
      key: '8',
      ctrlKey: true,
      shiftKey: true,
      action: () => {
        if (!disabled) {
          setSplitType('equal');
          setSplitCount('8');
        }
      },
      description: 'Quick split in eighths',
      category: 'Split Operations'
    });

    // Toggle split type
    registerShortcut({
      key: 't',
      ctrlKey: true,
      shiftKey: true,
      action: () => {
        if (!disabled) {
          setSplitType(prev => prev === 'equal' ? 'custom' : 'equal');
        }
      },
      description: 'Toggle split type',
      category: 'Split Operations'
    });

    // Focus custom CIDR input
    registerShortcut({
      key: 'i',
      ctrlKey: true,
      shiftKey: true,
      action: () => {
        if (!disabled && splitType === 'custom') {
          const input = containerRef.current?.querySelector('#custom-cidr') as HTMLInputElement;
          input?.focus();
        }
      },
      description: 'Focus custom CIDR input',
      category: 'Navigation'
    });

    // Show keyboard help
    registerShortcut({
      key: 'h',
      ctrlKey: true,
      shiftKey: true,
      action: () => setShowKeyboardHelp(true),
      description: 'Show keyboard shortcuts',
      category: 'Help'
    });

    // Close confirmation dialog
    registerShortcut({
      key: 'Escape',
      action: () => {
        if (showConfirmation) {
          setShowConfirmation(false);
        }
        if (showKeyboardHelp) {
          setShowKeyboardHelp(false);
        }
      },
      description: 'Close dialogs',
      category: 'Navigation'
    });

    return () => {
      unregisterShortcut('Enter');
      unregisterShortcut('2');
      unregisterShortcut('4');
      unregisterShortcut('8');
      unregisterShortcut('t');
      unregisterShortcut('i');
      unregisterShortcut('h');
      unregisterShortcut('Escape');
    };
  }, [
    registerShortcut,
    unregisterShortcut,
    validation.isValid,
    disabled,
    isValidating,
    handleSplitClick,
    splitType,
    showConfirmation,
    showKeyboardHelp
  ]);

  return (
    <div ref={containerRef}>
      {/* Live region for dynamic content updates */}
      <div 
        aria-live="polite" 
        aria-atomic="false"
        className="sr-only"
        id="subnet-splitter-live-region"
      >
        {validation.errors.length > 0 && `Split validation failed: ${validation.errors[0]}`}
        {validation.isValid && splitPreview.isValid && `Split will create ${splitPreview.subnetCount} subnets of size /${splitPreview.targetCidr}`}
        {splitPreview.isValid && splitPreview.subnetCount > 100 && 'Large split operation may impact performance'}
      </div>

      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Scissors className="h-5 w-5" aria-hidden="true" />
              <span id="subnet-splitter-title">Split Subnet</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowKeyboardHelp(true)}
              aria-label="Show keyboard shortcuts help dialog"
              title="Show keyboard shortcuts (Press ? for help)"
              data-action="show-help"
            >
              <Keyboard className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">Keyboard shortcuts</span>
            </Button>
          </CardTitle>
          <CardDescription id="subnet-splitter-description">
            Divide {parentSubnet.network}{parentSubnet.cidr} into smaller subnets.
            {cloudMode !== 'normal' && ` Operating in ${cloudMode.toUpperCase()} mode with cloud provider constraints.`}
            {ipVersion === 'ipv6' ? ' IPv6 subnetting with 128-bit address space.' : ' IPv4 subnetting with 32-bit address space.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
        {/* Split Type Selector */}
        <div className="space-y-2">
          <Label htmlFor="split-type" id="split-type-label">
            Split Type
          </Label>
          <Select 
            value={splitType} 
            onValueChange={handleSplitTypeChange}
            disabled={disabled}
            aria-labelledby="split-type-label"
            aria-describedby="split-type-description"
          >
            <SelectTrigger id="split-type">
              <SelectValue placeholder="Select split type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="equal" aria-describedby="equal-split-description">
                Equal Split
              </SelectItem>
              <SelectItem value="custom" aria-describedby="custom-split-description">
                Custom CIDR
              </SelectItem>
            </SelectContent>
          </Select>
          <div id="split-type-description" className="sr-only">
            Choose between equal splits (divide into equal-sized subnets) or custom CIDR (specify exact subnet size).
          </div>
          <div id="equal-split-description" className="sr-only">
            Equal split divides the parent subnet into a specified number of equal-sized subnets.
          </div>
          <div id="custom-split-description" className="sr-only">
            Custom CIDR allows you to specify the exact CIDR prefix length for the resulting subnets.
          </div>
        </div>

        {/* Equal Split Options */}
        {splitType === 'equal' && (
          <div className="space-y-2">
            <Label htmlFor="split-count" id="split-count-label">
              Number of Subnets
            </Label>
            <Select 
              value={splitCount} 
              onValueChange={handleSplitCountChange}
              disabled={disabled}
              aria-labelledby="split-count-label"
              aria-describedby="split-count-description"
            >
              <SelectTrigger id="split-count">
                <SelectValue placeholder="Select number of subnets" />
              </SelectTrigger>
              <SelectContent>
                {commonSplitOptions.map((option) => (
                  <SelectItem 
                    key={option.value} 
                    value={option.value}
                    aria-describedby={`split-option-${option.value}-description`}
                  >
                    <div className="flex flex-col">
                      <span>{option.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {option.description}
                      </span>
                    </div>
                    <span id={`split-option-${option.value}-description`} className="sr-only">
                      {option.description}. Creates {option.value} equal-sized subnets from the parent network.
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div id="split-count-description" className="sr-only">
              Select the number of equal-sized subnets to create. Each option shows the resulting subnet count and description.
            </div>
          </div>
        )}

        {/* Custom CIDR Input */}
        {splitType === 'custom' && (
          <div className="space-y-2">
            <Label htmlFor="custom-cidr" id="custom-cidr-label">
              Target CIDR Prefix
            </Label>
            <Input
              id="custom-cidr"
              type="number"
              min={parentCidr + 1}
              max={ipVersion === 'ipv4' ? 32 : 128}
              value={customCidr}
              onChange={(e) => handleCustomCidrChange(e.target.value)}
              placeholder={`Enter CIDR (${parentCidr + 1}-${ipVersion === 'ipv4' ? 32 : 128})`}
              disabled={disabled}
              aria-labelledby="custom-cidr-label"
              aria-describedby="custom-cidr-description custom-cidr-help"
              aria-invalid={validation.errors.length > 0}
            />
            <div id="custom-cidr-help" className="text-xs text-muted-foreground">
              Current parent subnet: /{parentCidr}. Target must be more specific (higher number).
            </div>
            <div id="custom-cidr-description" className="sr-only">
              Enter a CIDR prefix length between {parentCidr + 1} and {ipVersion === 'ipv4' ? 32 : 128}. 
              Higher numbers create smaller subnets with fewer IP addresses. 
              For {ipVersion === 'ipv4' ? 'IPv4' : 'IPv6'}, the maximum prefix length is {ipVersion === 'ipv4' ? 32 : 128}.
            </div>
          </div>
        )}

        {/* Split Preview */}
        {splitPreview.isValid && (
          <div className="rounded-lg border bg-muted/50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Info className="h-4 w-4 text-blue-500" />
              <span className="font-medium">Split Preview</span>
              {cloudMode !== 'normal' && (
                <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded">
                  {cloudMode.toUpperCase()}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Target CIDR:</span>
                <span className="ml-2 font-mono">/{splitPreview.targetCidr}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Subnet Count:</span>
                <span className="ml-2 font-medium">{splitPreview.subnetCount.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Total IPs per Subnet:</span>
                <span className="ml-2 font-medium">{splitPreview.subnetSize.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-muted-foreground">
                  {cloudMode === 'normal' ? 'Usable IPs per Subnet:' : `Usable IPs (${cloudMode.toUpperCase()}):`}
                </span>
                <span className="ml-2 font-medium">
                  {Math.max(0, splitPreview.subnetSize - (cloudMode === 'normal' ? 2 : 
                    cloudMode === 'aws' || cloudMode === 'azure' ? 5 : 4)).toLocaleString()}
                </span>
              </div>
            </div>
            
            {/* Cloud Provider Specific Information */}
            {cloudMode !== 'normal' && (
              <div className="mt-4 pt-4 border-t">
                <div className="text-xs text-muted-foreground mb-2">
                  <strong>{cloudMode.toUpperCase()} Reserved IPs per Subnet:</strong>
                </div>
                <div className="grid grid-cols-1 gap-1 text-xs">
                  {cloudMode === 'aws' && (
                    <>
                      <div>• Network Address (1st IP)</div>
                      <div>• VPC Router (2nd IP)</div>
                      <div>• DNS Server (3rd IP)</div>
                      <div>• Future Use (4th IP)</div>
                      <div>• Broadcast Address (last IP)</div>
                    </>
                  )}
                  {cloudMode === 'azure' && (
                    <>
                      <div>• Network Address (1st IP)</div>
                      <div>• Default Gateway (2nd IP)</div>
                      <div>• Azure DNS (3rd & 4th IPs)</div>
                      <div>• Broadcast Address (last IP)</div>
                    </>
                  )}
                  {cloudMode === 'gcp' && (
                    <>
                      <div>• Network Address (1st IP)</div>
                      <div>• Default Gateway (2nd IP)</div>
                      <div>• Second-to-last IP (reserved)</div>
                      <div>• Broadcast Address (last IP)</div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Validation Messages */}
        {(validation.errors.length > 0 || validation.warnings.length > 0) && (
          <ErrorDisplay
            key={`validation-${validation.errors.length}-${validation.warnings.length}-${splitType}-${splitCount}-${customCidr}`}
            validation={validation}
            context={{
              operation: 'Split Subnet',
              subnet: `${parentSubnet.network}${parentSubnet.cidr}`,
              cloudMode,
              ipVersion
            }}
            expandSuggestions={validation.suggestions && validation.suggestions.length > 0}
            showDetails={process.env.NODE_ENV === 'development'}
          />
        )}

        {/* Split Button */}
        <Button
          onClick={handleSplitClick}
          disabled={disabled || !validation.isValid || isValidating}
          className="w-full"
          size="lg"
        >
          {isValidating ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
              Splitting...
            </>
          ) : (
            <>
              <Scissors className="h-4 w-4 mr-2" />
              Split Subnet
              {splitPreview.isValid && ` (${splitPreview.subnetCount} subnets)`}
            </>
          )}
        </Button>

        {/* Keyboard Shortcuts Help Modal */}
        {showKeyboardHelp && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-background border rounded-lg p-6 max-w-2xl mx-4 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Keyboard className="h-5 w-5" />
                  Keyboard Shortcuts
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowKeyboardHelp(false)}
                  data-close-on-escape="true"
                >
                  ×
                </Button>
              </div>
              
              <div className="space-y-4">
                {Object.entries(
                  getShortcuts().reduce((acc, shortcut) => {
                    const category = shortcut.category || 'General';
                    if (!acc[category]) acc[category] = [];
                    acc[category].push(shortcut);
                    return acc;
                  }, {} as Record<string, ReturnType<typeof getShortcuts>>)
                ).map(([category, shortcuts]) => (
                  <div key={category}>
                    <h4 className="font-medium text-sm text-muted-foreground mb-2">{category}</h4>
                    <div className="space-y-2">
                      {shortcuts.map((shortcut, index) => (
                        <div key={index} className="flex items-center justify-between text-sm">
                          <span>{shortcut.description}</span>
                          <kbd className="px-2 py-1 bg-muted rounded text-xs font-mono">
                            {formatKeyboardShortcut(shortcut)}
                          </kbd>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="mt-6 pt-4 border-t text-xs text-muted-foreground">
                <p>• Use Tab/Shift+Tab to navigate between elements</p>
                <p>• Use Ctrl+Shift+↑/↓ to navigate within components</p>
                <p>• Press Escape to close dialogs and clear focus</p>
                <p>• Press Enter to activate focused buttons</p>
                <p>• Press Space to toggle checkboxes</p>
                <p>• Use Ctrl+Shift+2/4/8 for quick splits</p>
                <p>• Use Ctrl+Shift+T to toggle split type</p>
                <p>• Use Ctrl+Shift+H to show keyboard shortcuts</p>
              </div>
            </div>
          </div>
        )}

        {/* Confirmation Dialog for Large Operations */}
        {showConfirmation && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div ref={confirmationModalRef} className="bg-background border rounded-lg p-6 max-w-md mx-4">
              <div className="flex items-center gap-2 mb-4">
                <AlertCircle className="h-5 w-5 text-orange-500" />
                <h3 className="text-lg font-semibold">Confirm Large Split Operation</h3>
              </div>
              
              <div className="space-y-3 mb-6">
                <p className="text-sm text-muted-foreground">
                  You are about to create <strong>{splitPreview.subnetCount.toLocaleString()} subnets</strong> 
                  from {parentSubnet.network}{parentSubnet.cidr}.
                </p>
                
                {validation.warnings.length > 0 && (
                  <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded p-3">
                    <div className="text-sm space-y-1">
                      {validation.warnings.slice(0, 3).map((warning, index) => (
                        <div key={index} className="flex items-start gap-2">
                          <AlertCircle className="h-3 w-3 text-orange-500 mt-0.5 flex-shrink-0" />
                          <span>{warning}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <p className="text-sm">
                  This operation may take some time and use significant browser resources. 
                  Are you sure you want to continue?
                </p>
              </div>
              
              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={() => setShowConfirmation(false)}
                  disabled={isValidating}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSplit}
                  disabled={isValidating}
                  className="bg-orange-600 hover:bg-orange-700"
                >
                  {isValidating ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                      Splitting...
                    </>
                  ) : (
                    <>
                      <Scissors className="h-4 w-4 mr-2" />
                      Continue Split
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Additional Information */}
        {validation.suggestions && validation.suggestions.length > 0 && (
          <div className="text-sm text-muted-foreground space-y-1">
            <div className="font-medium">Suggestions:</div>
            <ul className="list-disc list-inside space-y-1">
              {validation.suggestions.map((suggestion, index) => (
                <li key={index}>{suggestion}</li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
    </div>
  );
}