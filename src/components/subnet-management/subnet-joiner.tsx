"use client";

import { useState, useCallback, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, Link2, CheckSquare, Square } from "lucide-react";
import { ErrorDisplay } from "./error-display";
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

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          Join Subnets
        </CardTitle>
        <CardDescription>
          Select adjacent subnets to combine them into larger networks
          {ipVersion === 'ipv6' && ' (IPv6 joining not yet supported)'}
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectAllState === 'all'}
                        onCheckedChange={handleSelectAll}
                        disabled={disabled}
                        className={selectAllState === 'partial' ? 'opacity-50' : ''}
                      />
                    </TableHead>
                    <TableHead>Network</TableHead>
                    <TableHead>CIDR</TableHead>
                    <TableHead>Usable Hosts</TableHead>
                    <TableHead>IP Range</TableHead>
                    <TableHead>Group</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ipv4Subnets.map((subnet) => {
                    const isSelected = selectedSubnets.has(subnet.id);
                    const groupInfo = getSubnetGroupInfo(subnet.id);
                    
                    return (
                      <TableRow 
                        key={subnet.id}
                        className={`${isSelected ? 'bg-muted/50' : ''} ${
                          groupInfo?.isPartiallySelected ? 'bg-blue-50 dark:bg-blue-950/20' : ''
                        }`}
                      >
                        <TableCell>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => handleSubnetToggle(subnet.id)}
                            disabled={disabled}
                          />
                        </TableCell>
                        <TableCell className="font-mono">{subnet.network}</TableCell>
                        <TableCell>/{subnet.cidr}</TableCell>
                        <TableCell>{subnet.usableHosts.toLocaleString()}</TableCell>
                        <TableCell className="font-mono text-sm">
                          {subnet.firstHost} - {subnet.lastHost}
                        </TableCell>
                        <TableCell>
                          {groupInfo && (
                            <div className="flex items-center gap-1">
                              <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded">
                                Group {groupInfo.groupIndex + 1}
                              </span>
                              {groupInfo.canJoin && (
                                <Link2 className="h-3 w-3 text-blue-500" />
                              )}
                            </div>
                          )}
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
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Joining...
                </>
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

        {/* Confirmation Dialog */}
        {showConfirmation && joinPreview && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-background border rounded-lg p-6 max-w-md mx-4">
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
  );
}