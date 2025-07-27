"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, Link2, CheckSquare, Square, Keyboard } from "lucide-react";
import { ErrorDisplay } from "./error-display";
import { LoadingSpinner, AnimatedTransition } from "./loading-states";
import { 
  SubnetJoinerProps, 
  ValidationResult,
  SubnetOperation,
  SplitSubnet
} from "@/lib/types";
import { 
  validateSubnetAdjacency,
  groupAdjacentSubnets,
  calculateJoinedSubnet,
  createSubnetError
} from "@/lib/subnet-splitting";
import { generateOperationId } from "@/lib/utils";
import { useKeyboardNavigation, formatKeyboardShortcut } from "@/lib/keyboard-navigation";

export function SubnetJoiner({
  availableSubnets,
  selectedSubnets,
  ipVersion,
  onSelectionChange,
  onJoin,
  onError,
  disabled = false
}: SubnetJoinerProps) {
  const [isValidating, setIsValidating] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [joinPreview, setJoinPreview] = useState<SplitSubnet | null>(null);

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

  // Filter IPv4 subnets only for joining
  const ipv4Subnets = useMemo(() => {
    return availableSubnets.filter(subnet => subnet.ipVersion === 'ipv4');
  }, [availableSubnets]);

  // Get selected subnet objects
  const selectedSubnetObjects = useMemo(() => {
    return ipv4Subnets.filter(subnet => selectedSubnets.has(subnet.id));
  }, [ipv4Subnets, selectedSubnets]);

  // Group adjacent subnets for visual feedback
  const adjacentGroups = useMemo(() => {
    return groupAdjacentSubnets(ipv4Subnets);
  }, [ipv4Subnets]);

  // Real-time validation of selected subnets
  const validation = useMemo((): ValidationResult => {
    if (selectedSubnetObjects.length === 0) {
      return {
        isValid: false,
        errors: [],
        warnings: [],
        suggestions: ['Select at least 2 adjacent subnets to join them together']
      };
    }

    if (selectedSubnetObjects.length === 1) {
      return {
        isValid: false,
        errors: [],
        warnings: [],
        suggestions: ['Select at least one more adjacent subnet to enable joining']
      };
    }

    // Validate adjacency and joinability
    return validateSubnetAdjacency(selectedSubnetObjects);
  }, [selectedSubnetObjects]);

  // Calculate join preview
  const previewJoinedSubnet = useMemo(() => {
    if (!validation.isValid || selectedSubnetObjects.length < 2) {
      return null;
    }

    return calculateJoinedSubnet(selectedSubnetObjects);
  }, [validation.isValid, selectedSubnetObjects]);

  // Handle individual subnet selection
  const handleSubnetToggle = useCallback((subnetId: string) => {
    const newSelection = new Set(selectedSubnets);
    if (newSelection.has(subnetId)) {
      newSelection.delete(subnetId);
    } else {
      newSelection.add(subnetId);
    }
    onSelectionChange(newSelection);
  }, [selectedSubnets, onSelectionChange]);

  // Handle select all functionality
  const handleSelectAll = useCallback(() => {
    if (selectedSubnets.size === ipv4Subnets.length) {
      // Deselect all
      onSelectionChange(new Set());
    } else {
      // Select all
      const allIds = new Set(ipv4Subnets.map(subnet => subnet.id));
      onSelectionChange(allIds);
    }
  }, [selectedSubnets.size, ipv4Subnets, onSelectionChange]);

  // Handle selecting an entire adjacent group
  const handleSelectGroup = useCallback((group: typeof adjacentGroups[0]) => {
    const newSelection = new Set(selectedSubnets);
    
    // Check if all subnets in the group are already selected
    const allSelected = group.every(subnet => selectedSubnets.has(subnet.id));
    
    if (allSelected) {
      // Deselect the entire group
      group.forEach(subnet => newSelection.delete(subnet.id));
    } else {
      // Select the entire group
      group.forEach(subnet => newSelection.add(subnet.id));
    }
    
    onSelectionChange(newSelection);
  }, [selectedSubnets, onSelectionChange]);

  // Check if join needs confirmation
  const needsConfirmation = useCallback(() => {
    return selectedSubnetObjects.length > 8 || 
           validation.warnings.some(w => w.includes('performance'));
  }, [selectedSubnetObjects.length, validation.warnings]);

  // Handle join button click
  const handleJoinClick = useCallback(() => {
    if (!validation.isValid || disabled || !previewJoinedSubnet) {
      return;
    }

    if (needsConfirmation()) {
      setJoinPreview(previewJoinedSubnet);
      setShowConfirmation(true);
    } else {
      // Execute join directly without calling executeJoin to avoid circular dependency
      setIsValidating(true);
      
      const executeDirectJoin = async () => {
        try {
          // Create operation record
          const operation: SubnetOperation = {
            id: generateOperationId('join'),
            type: 'join',
            timestamp: Date.now(),
            sourceSubnets: selectedSubnetObjects.map(s => s.id),
            resultSubnets: [previewJoinedSubnet],
            description: `Join ${selectedSubnetObjects.length} subnets into ${previewJoinedSubnet.network}/${previewJoinedSubnet.cidr}`,
            ipVersion,
            cloudMode: 'normal' // Will be updated by parent component
          };

          onJoin(previewJoinedSubnet, operation);

          // Clear selection after successful join
          onSelectionChange(new Set());

        } catch (error) {
          console.error('Join operation failed:', error);
          onError(createSubnetError(
            'calculation',
            error instanceof Error ? error.message : 'Unknown error during join operation',
            { selectedSubnets: selectedSubnetObjects.map(s => s.network) }
          ));
        } finally {
          setIsValidating(false);
        }
      };
      
      executeDirectJoin();
    }
  }, [validation.isValid, disabled, previewJoinedSubnet, needsConfirmation, selectedSubnetObjects, ipVersion, onJoin, onSelectionChange, onError]);

  // Execute the join operation
  const executeJoin = useCallback(async () => {
    if (!validation.isValid || !previewJoinedSubnet) {
      return;
    }

    setShowConfirmation(false);
    setIsValidating(true);

    try {
      // Create operation record
      const operation: SubnetOperation = {
        id: generateOperationId('join'),
        type: 'join',
        timestamp: Date.now(),
        sourceSubnets: selectedSubnetObjects.map(s => s.id),
        resultSubnets: [previewJoinedSubnet],
        description: `Join ${selectedSubnetObjects.length} subnets into ${previewJoinedSubnet.network}/${previewJoinedSubnet.cidr}`,
        ipVersion,
        cloudMode: 'normal' // Will be updated by parent component
      };

      onJoin(previewJoinedSubnet, operation);

      // Clear selection after successful join
      onSelectionChange(new Set());

    } catch (error) {
      console.error('Join operation failed:', error);
      onError(createSubnetError(
        'calculation',
        error instanceof Error ? error.message : 'Unknown error during join operation',
        { selectedSubnets: selectedSubnetObjects.map(s => s.network) }
      ));
    } finally {
      setIsValidating(false);
    }
  }, [validation.isValid, previewJoinedSubnet, selectedSubnetObjects, ipVersion, onJoin, onSelectionChange, onError]);

  // Check if a subnet is part of an adjacent group
  const getSubnetGroupInfo = useCallback((subnetId: string) => {
    const group = adjacentGroups.find(g => g.some(s => s.id === subnetId));
    if (!group) return null;
    
    const groupIndex = adjacentGroups.indexOf(group);
    const isFullySelected = group.every(s => selectedSubnets.has(s.id));
    const isPartiallySelected = group.some(s => selectedSubnets.has(s.id)) && !isFullySelected;
    
    return {
      group,
      groupIndex,
      isFullySelected,
      isPartiallySelected,
      canJoin: group.length >= 2
    };
  }, [adjacentGroups, selectedSubnets]);

  // Determine select all button state
  const selectAllState = useMemo(() => {
    if (selectedSubnets.size === 0) return 'none';
    if (selectedSubnets.size === ipv4Subnets.length) return 'all';
    return 'partial';
  }, [selectedSubnets.size, ipv4Subnets.length]);

  // Register keyboard shortcuts
  useEffect(() => {
    // Join subnets shortcut
    registerShortcut({
      key: 'Enter',
      action: () => {
        if (validation.isValid && !disabled && !isValidating && selectedSubnetObjects.length >= 2) {
          handleJoinClick();
        }
      },
      description: 'Execute join operation',
      category: 'Join Operations'
    });

    // Select all shortcut
    registerShortcut({
      key: 'a',
      ctrlKey: true,
      action: () => {
        if (!disabled) {
          handleSelectAll();
        }
      },
      description: 'Select/deselect all subnets',
      category: 'Selection'
    });

    // Clear selection shortcut
    registerShortcut({
      key: 'Escape',
      action: () => {
        if (showConfirmation) {
          setShowConfirmation(false);
        } else if (showKeyboardHelp) {
          setShowKeyboardHelp(false);
        } else if (selectedSubnets.size > 0) {
          onSelectionChange(new Set());
        }
      },
      description: 'Clear selection or close dialogs',
      category: 'Selection'
    });

    // Quick group selection shortcuts (using Ctrl+Shift to avoid browser conflicts)
    for (let i = 1; i <= Math.min(adjacentGroups.length, 9); i++) {
      registerShortcut({
        key: i.toString(),
        ctrlKey: true,
        shiftKey: true,
        action: () => {
          if (!disabled && adjacentGroups[i - 1]) {
            handleSelectGroup(adjacentGroups[i - 1]);
          }
        },
        description: `Select/deselect group ${i}`,
        category: 'Selection'
      });
    }

    // Show keyboard help
    registerShortcut({
      key: 'h',
      ctrlKey: true,
      shiftKey: true,
      action: () => setShowKeyboardHelp(true),
      description: 'Show keyboard shortcuts',
      category: 'Help'
    });

    // Navigate through subnets with Ctrl+Shift+Arrow keys
    registerShortcut({
      key: 'ArrowDown',
      ctrlKey: true,
      shiftKey: true,
      action: () => {
        // Focus next subnet checkbox
        const checkboxes = containerRef.current?.querySelectorAll('input[type="checkbox"]');
        if (checkboxes && checkboxes.length > 0) {
          const focused = document.activeElement;
          const currentIndex = Array.from(checkboxes).indexOf(focused as HTMLInputElement);
          const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % checkboxes.length : 0;
          const nextCheckbox = checkboxes[nextIndex] as HTMLInputElement;
          if (nextCheckbox && typeof nextCheckbox.focus === 'function') {
            nextCheckbox.focus();
          }
        }
      },
      description: 'Navigate to next subnet',
      category: 'Navigation'
    });

    registerShortcut({
      key: 'ArrowUp',
      ctrlKey: true,
      shiftKey: true,
      action: () => {
        // Focus previous subnet checkbox
        const checkboxes = containerRef.current?.querySelectorAll('input[type="checkbox"]');
        if (checkboxes && checkboxes.length > 0) {
          const focused = document.activeElement;
          const currentIndex = Array.from(checkboxes).indexOf(focused as HTMLInputElement);
          const prevIndex = currentIndex > 0 ? currentIndex - 1 : checkboxes.length - 1;
          const prevCheckbox = checkboxes[prevIndex] as HTMLInputElement;
          if (prevCheckbox && typeof prevCheckbox.focus === 'function') {
            prevCheckbox.focus();
          }
        }
      },
      description: 'Navigate to previous subnet',
      category: 'Navigation'
    });

    return () => {
      unregisterShortcut('Enter');
      unregisterShortcut('a');
      unregisterShortcut('Escape');
      unregisterShortcut('h');
      unregisterShortcut('ArrowDown');
      unregisterShortcut('ArrowUp');
      // Unregister group shortcuts
      for (let i = 1; i <= 9; i++) {
        unregisterShortcut(i.toString());
      }
    };
  }, [
    registerShortcut,
    unregisterShortcut,
    validation.isValid,
    disabled,
    isValidating,
    selectedSubnetObjects.length,
    handleJoinClick,
    handleSelectAll,
    showConfirmation,
    showKeyboardHelp,
    selectedSubnets.size,
    onSelectionChange,
    adjacentGroups,
    handleSelectGroup
  ]);

  return (
    <div ref={containerRef}>
      {/* Live region for dynamic content updates */}
      <div 
        aria-live="polite" 
        aria-atomic="false"
        className="sr-only"
        id="subnet-joiner-live-region"
      >
        {validation.errors.length > 0 && `Join validation failed: ${validation.errors[0]}`}
        {validation.isValid && selectedSubnetObjects.length >= 2 && `${selectedSubnetObjects.length} adjacent subnets ready to join`}
        {selectedSubnets.size > 0 && `${selectedSubnets.size} of ${ipv4Subnets.length} subnets selected for joining`}
      </div>

      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link2 className="h-5 w-5" aria-hidden="true" />
              <span id="subnet-joiner-title">Join Subnets</span>
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
          <CardDescription id="subnet-joiner-description">
            Select adjacent subnets to combine them into larger networks.
            {ipVersion === 'ipv6' && ' IPv6 joining is not yet supported - switch to IPv4 mode.'}
            {ipv4Subnets.length > 0 && ` ${ipv4Subnets.length} subnet${ipv4Subnets.length !== 1 ? 's' : ''} available for joining.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
        {/* IPv6 Notice */}
        {ipVersion === 'ipv6' && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              IPv6 subnet joining is not yet implemented. Switch to IPv4 mode to use this feature.
            </AlertDescription>
          </Alert>
        )}

        {/* No subnets available */}
        {ipv4Subnets.length === 0 && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              No subnets available for joining. Split a subnet first to create subnets that can be joined.
            </AlertDescription>
          </Alert>
        )}

        {/* Subnet selection interface */}
        {ipv4Subnets.length > 0 && (
          <>
            {/* Selection controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSelectAll}
                  disabled={disabled}
                  className="flex items-center gap-2"
                >
                  {selectAllState === 'all' ? (
                    <CheckSquare className="h-4 w-4" />
                  ) : selectAllState === 'partial' ? (
                    <Square className="h-4 w-4 opacity-50" />
                  ) : (
                    <Square className="h-4 w-4" />
                  )}
                  {selectAllState === 'all' ? 'Deselect All' : 'Select All'}
                </Button>
                
                <span className="text-sm text-muted-foreground">
                  {selectedSubnets.size} of {ipv4Subnets.length} subnets selected
                </span>
              </div>

              {/* Adjacent groups info */}
              {adjacentGroups.length > 0 && (
                <div className="text-sm text-muted-foreground">
                  {adjacentGroups.length} adjacent group{adjacentGroups.length !== 1 ? 's' : ''} found
                </div>
              )}
            </div>

            {/* Adjacent groups quick selection */}
            {adjacentGroups.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium">Quick Select Adjacent Groups:</div>
                <div className="flex flex-wrap gap-2">
                  {adjacentGroups.map((group, index) => {
                    const isFullySelected = group.every(s => selectedSubnets.has(s.id));
                    const isPartiallySelected = group.some(s => selectedSubnets.has(s.id)) && !isFullySelected;
                    
                    return (
                      <Button
                        key={index}
                        variant={isFullySelected ? "default" : isPartiallySelected ? "secondary" : "outline"}
                        size="sm"
                        onClick={() => handleSelectGroup(group)}
                        disabled={disabled}
                        className="text-xs"
                      >
                        Group {index + 1} ({group.length} subnets)
                        {isPartiallySelected && " (partial)"}
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Subnet table */}
            <div className="border rounded-lg">
              <Table role="table" aria-label="Subnets available for joining" aria-describedby="subnet-joiner-description">
                <TableHeader>
                  <TableRow role="row">
                    <TableHead className="w-12" role="columnheader">
                      <Checkbox
                        checked={selectAllState === 'all'}
                        onCheckedChange={handleSelectAll}
                        disabled={disabled}
                        className={selectAllState === 'partial' ? 'opacity-50' : ''}
                        aria-label={`Select all ${ipv4Subnets.length} subnets for joining. Currently ${selectedSubnets.size} of ${ipv4Subnets.length} subnets selected.`}
                        aria-describedby="select-all-join-description"
                      />
                      <span id="select-all-join-description" className="sr-only">
                        {selectAllState === 'all' ? 'All subnets are selected for joining' : 
                         selectAllState === 'partial' ? `${selectedSubnets.size} of ${ipv4Subnets.length} subnets are selected for joining` :
                         'No subnets are selected for joining'}
                      </span>
                    </TableHead>
                    <TableHead role="columnheader">
                      <span aria-describedby="network-join-description">Network</span>
                      <span id="network-join-description" className="sr-only">
                        Network address of each subnet in CIDR notation
                      </span>
                    </TableHead>
                    <TableHead role="columnheader">
                      <span aria-describedby="cidr-join-description">CIDR</span>
                      <span id="cidr-join-description" className="sr-only">
                        CIDR prefix length indicating subnet size
                      </span>
                    </TableHead>
                    <TableHead role="columnheader">
                      <span aria-describedby="hosts-join-description">Usable Hosts</span>
                      <span id="hosts-join-description" className="sr-only">
                        Number of IP addresses available for devices in each subnet
                      </span>
                    </TableHead>
                    <TableHead role="columnheader">
                      <span aria-describedby="range-join-description">IP Range</span>
                      <span id="range-join-description" className="sr-only">
                        First and last usable IP addresses in each subnet
                      </span>
                    </TableHead>
                    <TableHead role="columnheader">
                      <span aria-describedby="group-join-description">Group</span>
                      <span id="group-join-description" className="sr-only">
                        Adjacent group membership for subnet joining
                      </span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody role="rowgroup">
                  {ipv4Subnets.map((subnet, index) => {
                    const isSelected = selectedSubnets.has(subnet.id);
                    const groupInfo = getSubnetGroupInfo(subnet.id);
                    
                    return (
                      <TableRow 
                        key={subnet.id}
                        role="row"
                        className={`${isSelected ? 'bg-muted/50' : ''} ${
                          groupInfo?.isPartiallySelected ? 'bg-blue-50 dark:bg-blue-950/20' : ''
                        }`}
                        aria-selected={isSelected}
                        aria-describedby={`join-subnet-${subnet.id}-description`}
                      >
                        <TableCell role="gridcell">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => handleSubnetToggle(subnet.id)}
                            disabled={disabled}
                            aria-label={`Select subnet ${subnet.network}/${subnet.cidr} for joining. ${groupInfo ? `Part of adjacent group ${groupInfo.groupIndex + 1}.` : 'Not part of an adjacent group.'} ${subnet.usableHosts.toLocaleString()} usable hosts.`}
                            aria-describedby={`join-subnet-${subnet.id}-selection-description`}
                          />
                          <span id={`join-subnet-${subnet.id}-selection-description`} className="sr-only">
                            {isSelected ? 'Selected for joining' : 'Not selected for joining'}. 
                            Subnet {index + 1} of {ipv4Subnets.length}.
                            {groupInfo && groupInfo.canJoin ? ` Can be joined with other subnets in group ${groupInfo.groupIndex + 1}.` : ' Cannot be joined - not adjacent to other subnets.'}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono" role="gridcell">
                          <span aria-label={`Network address ${subnet.network}`}>
                            {subnet.network}
                          </span>
                        </TableCell>
                        <TableCell role="gridcell">
                          <span aria-label={`CIDR prefix length ${subnet.cidr}`}>
                            /{subnet.cidr}
                          </span>
                        </TableCell>
                        <TableCell role="gridcell">
                          <span aria-label={`${subnet.usableHosts.toLocaleString()} usable host addresses`}>
                            {subnet.usableHosts.toLocaleString()}
                          </span>
                        </TableCell>
                        <TableCell className="font-mono text-sm" role="gridcell">
                          <span aria-label={`IP range from ${subnet.firstHost} to ${subnet.lastHost}`}>
                            {subnet.firstHost} - {subnet.lastHost}
                          </span>
                        </TableCell>
                        <TableCell role="gridcell">
                          {groupInfo ? (
                            <div className="flex items-center gap-1" aria-label={`Adjacent group ${groupInfo.groupIndex + 1}${groupInfo.canJoin ? ', can be joined' : ', cannot be joined'}`}>
                              <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded">
                                Group {groupInfo.groupIndex + 1}
                              </span>
                              {groupInfo.canJoin && (
                                <Link2 className="h-3 w-3 text-blue-500" aria-hidden="true" />
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm" aria-label="Not part of an adjacent group">
                              -
                            </span>
                          )}
                          <span id={`join-subnet-${subnet.id}-description`} className="sr-only">
                            Subnet {subnet.network} slash {subnet.cidr} with {subnet.usableHosts.toLocaleString()} usable hosts. 
                            IP range from {subnet.firstHost} to {subnet.lastHost}.
                            {groupInfo ? ` Part of adjacent group ${groupInfo.groupIndex + 1} with ${groupInfo.group.length} subnets.` : ' Not adjacent to other subnets.'}
                            {groupInfo?.canJoin ? ' Can be joined with other subnets in this group.' : ' Cannot be joined due to non-adjacency.'}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Join preview */}
            {previewJoinedSubnet && validation.isValid && (
              <div className="rounded-lg border bg-muted/50 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Link2 className="h-4 w-4 text-green-500" />
                  <span className="font-medium">Join Preview</span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Resulting Network:</span>
                    <span className="ml-2 font-mono">{previewJoinedSubnet.network}/{previewJoinedSubnet.cidr}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total Hosts:</span>
                    <span className="ml-2 font-medium">{previewJoinedSubnet.totalHosts.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Usable Hosts:</span>
                    <span className="ml-2 font-medium">{previewJoinedSubnet.usableHosts.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">IP Range:</span>
                    <span className="ml-2 font-mono text-xs">{previewJoinedSubnet.firstHost} - {previewJoinedSubnet.lastHost}</span>
                  </div>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  Joining {selectedSubnetObjects.length} subnets into 1 larger subnet
                </div>
              </div>
            )}

            {/* Validation messages */}
            {(validation.errors.length > 0 || validation.warnings.length > 0) && (
              <ErrorDisplay
                key={`validation-${validation.errors.length}-${validation.warnings.length}-${selectedSubnetObjects.length}`}
                validation={validation}
                context={{
                  operation: 'Join Subnets',
                  subnet: selectedSubnetObjects.length > 0 ? 
                    `${selectedSubnetObjects.length} selected subnets` : 
                    'No subnets selected',
                  cloudMode: 'normal',
                  ipVersion
                }}
                expandSuggestions={validation.suggestions && validation.suggestions.length > 0}
                showDetails={process.env.NODE_ENV === 'development'}
              />
            )}

            {/* Join button */}
            <Button
              onClick={handleJoinClick}
              disabled={disabled || !validation.isValid || selectedSubnetObjects.length < 2 || isValidating}
              className="w-full"
              size="lg"
            >
              {isValidating ? (
                <LoadingSpinner size="sm" message="Joining..." />
              ) : (
                <>
                  <Link2 className="h-4 w-4 mr-2" />
                  Join Selected Subnets
                  {selectedSubnetObjects.length > 0 && ` (${selectedSubnetObjects.length} subnets)`}
                </>
              )}
            </Button>
          </>
        )}

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
                <p>• Use Ctrl+Shift+↑/↓ to navigate through subnet checkboxes</p>
                <p>• Press Space to toggle subnet selection</p>
                <p>• Press Ctrl+Shift+1-9 to quickly select adjacent groups</p>
                <p>• Press Ctrl+Shift+H to show keyboard shortcuts</p>
                <p>• Press Escape to clear selection or close dialogs</p>
              </div>
            </div>
          </div>
        )}

        {/* Confirmation Dialog */}
        {showConfirmation && joinPreview && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div ref={confirmationModalRef} className="bg-background border rounded-lg p-6 max-w-md mx-4">
              <div className="flex items-center gap-2 mb-4">
                <AlertCircle className="h-5 w-5 text-orange-500" />
                <h3 className="text-lg font-semibold">Confirm Join Operation</h3>
              </div>
              
              <div className="space-y-3 mb-6">
                <p className="text-sm text-muted-foreground">
                  You are about to join <strong>{selectedSubnetObjects.length} subnets</strong> into a single larger subnet:
                </p>
                
                <div className="bg-muted rounded p-3">
                  <div className="font-mono text-sm">
                    {joinPreview.network}/{joinPreview.cidr}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {joinPreview.usableHosts.toLocaleString()} usable hosts
                  </div>
                </div>
                
                {validation.warnings.length > 0 && (
                  <div className="bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded p-3">
                    <div className="text-sm space-y-1">
                      {validation.warnings.slice(0, 2).map((warning, index) => (
                        <div key={index} className="flex items-start gap-2">
                          <AlertCircle className="h-3 w-3 text-orange-500 mt-0.5 flex-shrink-0" />
                          <span>{warning}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <p className="text-sm">
                  This operation cannot be undone. Are you sure you want to continue?
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
                  onClick={executeJoin}
                  disabled={isValidating}
                  className="bg-orange-600 hover:bg-orange-700"
                >
                  {isValidating ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                      Joining...
                    </>
                  ) : (
                    <>
                      <Link2 className="h-4 w-4 mr-2" />
                      Confirm Join
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
    </div>
  );
}