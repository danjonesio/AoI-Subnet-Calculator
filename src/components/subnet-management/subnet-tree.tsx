"use client";

import React, { useState, useMemo, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Checkbox
} from '@/components/ui/checkbox';
import {
  Button
} from '@/components/ui/button';
import {
  Input
} from '@/components/ui/input';
import {
  ChevronRight,
  ChevronDown,
  Copy,
  Info,
  Search,
  X,
  Network,
  Loader2
} from 'lucide-react';
import { SplitSubnet, SubnetHierarchy } from '@/lib/types';

interface SubnetTreeProps {
  subnets: SplitSubnet[];
  selectedSubnets: Set<string>;
  onSelectionChange: (selected: Set<string>) => void;
  onCopySubnet?: (subnet: SplitSubnet) => void;
  onSubnetDetails?: (subnet: SplitSubnet) => void;
  expandedNodes?: Set<string>;
  onExpandChange?: (expandedNodes: Set<string>) => void;
  showRelationships?: boolean;
  filterText?: string;
  onFilter?: (filterText: string) => void;
  loading?: boolean;
  showSelection?: boolean;
  showActions?: boolean;
  className?: string;
}

interface TreeNodeProps {
  node: SubnetHierarchy;
  selectedSubnets: Set<string>;
  expandedNodes: Set<string>;
  onSelectionChange: (subnetId: string, checked: boolean) => void;
  onExpandToggle: (subnetId: string) => void;
  onCopySubnet?: (subnet: SplitSubnet) => void;
  onSubnetDetails?: (subnet: SplitSubnet) => void;
  showRelationships: boolean;
  showSelection: boolean;
  showActions: boolean;
  isFiltered: boolean;
}

// Tree node component for rendering individual subnet nodes
function TreeNode({
  node,
  selectedSubnets,
  expandedNodes,
  onSelectionChange,
  onExpandToggle,
  onCopySubnet,
  onSubnetDetails,
  showRelationships,
  showSelection,
  showActions,
  isFiltered
}: TreeNodeProps) {
  const { subnet, children, depth } = node;
  const hasChildren = children.length > 0;
  const isExpanded = expandedNodes.has(subnet.id);
  const isSelected = selectedSubnets.has(subnet.id);

  // Calculate indentation based on depth
  const indentationLevel = Math.max(0, depth);
  const indentationStyle = {
    paddingLeft: `${indentationLevel * 24}px`
  };

  // Handle copy subnet
  const handleCopySubnet = useCallback(async (subnet: SplitSubnet) => {
    try {
      const subnetInfo = `Network: ${subnet.network}/${subnet.cidr}
Broadcast: ${subnet.broadcast}
First Host: ${subnet.firstHost}
Last Host: ${subnet.lastHost}
Total Hosts: ${subnet.totalHosts.toLocaleString()}
Usable Hosts: ${subnet.usableHosts.toLocaleString()}`;

      await navigator.clipboard.writeText(subnetInfo);
      onCopySubnet?.(subnet);
    } catch (error) {
      console.error('Failed to copy subnet information:', error);
    }
  }, [onCopySubnet]);

  return (
    <div className="select-none">
      {/* Main node */}
      <div 
        className={`
          flex items-center py-2 px-2 rounded-md hover:bg-muted/50 transition-colors
          ${isSelected ? 'bg-primary/10 border border-primary/20' : ''}
          ${isFiltered ? 'bg-yellow-50 dark:bg-yellow-900/20' : ''}
        `}
        style={indentationStyle}
      >
        {/* Expand/Collapse button */}
        <div className="flex items-center mr-2">
          {hasChildren ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 hover:bg-muted"
              onClick={() => onExpandToggle(subnet.id)}
              aria-label={isExpanded ? 'Collapse subnet' : 'Expand subnet'}
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </Button>
          ) : (
            <div className="h-6 w-6 flex items-center justify-center">
              {showRelationships && depth > 0 && (
                <div className="h-2 w-2 rounded-full bg-muted-foreground/30" />
              )}
            </div>
          )}
        </div>

        {/* Selection checkbox */}
        {showSelection && (
          <div className="mr-3">
            <Checkbox
              checked={isSelected}
              onCheckedChange={(checked) => 
                onSelectionChange(subnet.id, checked as boolean)
              }
              aria-label={`Select subnet ${subnet.network}/${subnet.cidr}`}
            />
          </div>
        )}

        {/* Subnet icon */}
        <div className="mr-2 flex-shrink-0">
          <Network className={`h-4 w-4 ${hasChildren ? 'text-primary' : 'text-muted-foreground'}`} />
        </div>

        {/* Subnet information */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-3">
            <div className="font-mono text-sm font-medium">
              {subnet.network}/{subnet.cidr}
            </div>
            <div className="text-xs text-muted-foreground">
              {subnet.usableHosts.toLocaleString()} hosts
            </div>
            {showRelationships && subnet.parentId && (
              <div className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                Level {subnet.level}
              </div>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {subnet.firstHost} - {subnet.lastHost}
          </div>
        </div>

        {/* Actions */}
        {showActions && (
          <div className="flex items-center space-x-1 ml-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => handleCopySubnet(subnet)}
              title="Copy subnet information"
            >
              <Copy className="h-3 w-3" />
            </Button>
            {onSubnetDetails && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => onSubnetDetails(subnet)}
                title="View subnet details"
              >
                <Info className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Child nodes */}
      {hasChildren && isExpanded && (
        <div className="ml-2">
          {children.map((childNode) => (
            <TreeNode
              key={childNode.subnet.id}
              node={childNode}
              selectedSubnets={selectedSubnets}
              expandedNodes={expandedNodes}
              onSelectionChange={onSelectionChange}
              onExpandToggle={onExpandToggle}
              onCopySubnet={onCopySubnet}
              onSubnetDetails={onSubnetDetails}
              showRelationships={showRelationships}
              showSelection={showSelection}
              showActions={showActions}
              isFiltered={isFiltered}
            />
          ))}
        </div>
      )}

      {/* Connection lines for visual hierarchy */}
      {showRelationships && hasChildren && isExpanded && (
        <div 
          className="border-l border-muted-foreground/20 ml-3"
          style={{ 
            marginLeft: `${(indentationLevel * 24) + 12}px`,
            height: `${children.length * 60}px`,
            position: 'absolute',
            marginTop: '-10px'
          }}
        />
      )}
    </div>
  );
}

export function SubnetTree({
  subnets,
  selectedSubnets,
  onSelectionChange,
  onCopySubnet,
  onSubnetDetails,
  expandedNodes = new Set(),
  onExpandChange,
  showRelationships = true,
  filterText = '',
  onFilter,
  loading = false,
  showSelection = true,
  showActions = true,
  className = ''
}: SubnetTreeProps) {
  const [internalExpandedNodes, setInternalExpandedNodes] = useState<Set<string>>(expandedNodes);
  const [internalFilterText, setInternalFilterText] = useState<string>(filterText);

  // Build subnet hierarchy from flat list
  const subnetHierarchy = useMemo(() => {
    // Create a map for quick lookup
    const subnetMap = new Map<string, SplitSubnet>();
    subnets.forEach(subnet => {
      subnetMap.set(subnet.id, subnet);
    });

    // Build hierarchy
    const rootNodes: SubnetHierarchy[] = [];
    const nodeMap = new Map<string, SubnetHierarchy>();

    // First pass: create all nodes
    subnets.forEach(subnet => {
      const node: SubnetHierarchy = {
        subnet,
        children: [],
        depth: subnet.level || 0,
        isExpanded: internalExpandedNodes.has(subnet.id)
      };
      nodeMap.set(subnet.id, node);
    });

    // Second pass: build parent-child relationships
    subnets.forEach(subnet => {
      const node = nodeMap.get(subnet.id);
      if (!node) return;

      if (subnet.parentId && nodeMap.has(subnet.parentId)) {
        // This is a child node
        const parentNode = nodeMap.get(subnet.parentId)!;
        parentNode.children.push(node);
      } else {
        // This is a root node
        rootNodes.push(node);
      }
    });

    // Sort children by network address
    const sortChildren = (nodes: SubnetHierarchy[]) => {
      nodes.sort((a, b) => {
        // Convert IP to comparable format
        const aNetwork = a.subnet.network.split('.').map(n => parseInt(n).toString().padStart(3, '0')).join('.');
        const bNetwork = b.subnet.network.split('.').map(n => parseInt(n).toString().padStart(3, '0')).join('.');
        return aNetwork.localeCompare(bNetwork);
      });
      
      nodes.forEach(node => {
        if (node.children.length > 0) {
          sortChildren(node.children);
        }
      });
    };

    sortChildren(rootNodes);
    return rootNodes;
  }, [subnets, internalExpandedNodes]);

  // Filter hierarchy based on search text
  const filteredHierarchy = useMemo(() => {
    if (!internalFilterText.trim()) {
      return subnetHierarchy;
    }

    const searchTerm = internalFilterText.toLowerCase().trim();
    
    const filterNode = (node: SubnetHierarchy): SubnetHierarchy | null => {
      const subnet = node.subnet;
      const matches = 
        subnet.network.toLowerCase().includes(searchTerm) ||
        subnet.cidr.toString().includes(searchTerm) ||
        subnet.firstHost.toLowerCase().includes(searchTerm) ||
        subnet.lastHost.toLowerCase().includes(searchTerm) ||
        subnet.broadcast.toLowerCase().includes(searchTerm) ||
        subnet.usableHosts.toString().includes(searchTerm) ||
        subnet.totalHosts.toString().includes(searchTerm);

      // Filter children
      const filteredChildren = node.children
        .map(child => filterNode(child))
        .filter((child): child is SubnetHierarchy => child !== null);

      // Include node if it matches or has matching children
      if (matches || filteredChildren.length > 0) {
        return {
          ...node,
          children: filteredChildren
        };
      }

      return null;
    };

    return subnetHierarchy
      .map(node => filterNode(node))
      .filter((node): node is SubnetHierarchy => node !== null);
  }, [subnetHierarchy, internalFilterText]);

  // Handle expand/collapse
  const handleExpandToggle = useCallback((subnetId: string) => {
    const newExpanded = new Set(internalExpandedNodes);
    if (newExpanded.has(subnetId)) {
      newExpanded.delete(subnetId);
    } else {
      newExpanded.add(subnetId);
    }
    setInternalExpandedNodes(newExpanded);
    onExpandChange?.(newExpanded);
  }, [internalExpandedNodes, onExpandChange]);

  // Handle individual subnet selection
  const handleSubnetSelection = useCallback((subnetId: string, checked: boolean) => {
    const newSelection = new Set(selectedSubnets);
    if (checked) {
      newSelection.add(subnetId);
    } else {
      newSelection.delete(subnetId);
    }
    onSelectionChange(newSelection);
  }, [selectedSubnets, onSelectionChange]);

  // Handle select all/none
  const handleSelectAll = useCallback((checked: boolean) => {
    if (checked) {
      const allIds = new Set(subnets.map(subnet => subnet.id));
      onSelectionChange(allIds);
    } else {
      onSelectionChange(new Set());
    }
  }, [subnets, onSelectionChange]);

  // Handle filter change
  const handleFilterChange = useCallback((value: string) => {
    setInternalFilterText(value);
    onFilter?.(value);
  }, [onFilter]);

  const clearFilter = useCallback(() => {
    setInternalFilterText('');
    onFilter?.('');
  }, [onFilter]);

  // Expand all nodes
  const expandAll = useCallback(() => {
    const allIds = new Set(subnets.map(subnet => subnet.id));
    setInternalExpandedNodes(allIds);
    onExpandChange?.(allIds);
  }, [subnets, onExpandChange]);

  // Collapse all nodes
  const collapseAll = useCallback(() => {
    setInternalExpandedNodes(new Set());
    onExpandChange?.(new Set());
  }, [onExpandChange]);

  // Check if all subnets are selected
  const allSelected = subnets.length > 0 && selectedSubnets.size === subnets.length;
  const someSelected = selectedSubnets.size > 0 && selectedSubnets.size < subnets.length;

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          <span>Loading subnet hierarchy...</span>
        </CardContent>
      </Card>
    );
  }

  if (subnets.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="text-center py-8 text-muted-foreground">
          <Network className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No subnets to display</p>
          <p className="text-sm mt-2">Split a subnet to see the hierarchy</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Subnet Hierarchy ({subnets.length} subnets)</span>
          {showSelection && selectedSubnets.size > 0 && (
            <span className="text-sm font-normal text-muted-foreground">
              {selectedSubnets.size} selected
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Controls */}
        <div className="mb-4 space-y-3">
          {/* Search/Filter Input */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search subnets in hierarchy..."
              value={internalFilterText}
              onChange={(e) => handleFilterChange(e.target.value)}
              className="pl-10 pr-10"
            />
            {internalFilterText && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilter}
                className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              {showSelection && (
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={handleSelectAll}
                  aria-label="Select all subnets"
                  className={someSelected ? 'data-[state=checked]:bg-primary/50' : ''}
                />
              )}
              {showSelection && (
                <span className="text-sm text-muted-foreground">
                  Select All
                </span>
              )}
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={expandAll}
                className="text-xs"
              >
                Expand All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={collapseAll}
                className="text-xs"
              >
                Collapse All
              </Button>
            </div>
          </div>
        </div>

        {/* Results count when filtering */}
        {internalFilterText && (
          <div className="mb-4 text-sm text-muted-foreground">
            Showing {filteredHierarchy.reduce((count, node) => {
              const countNodes = (n: SubnetHierarchy): number => {
                return 1 + n.children.reduce((sum, child) => sum + countNodes(child), 0);
              };
              return count + countNodes(node);
            }, 0)} of {subnets.length} subnets
          </div>
        )}

        {/* Tree View */}
        <div className="space-y-1 max-h-96 overflow-y-auto">
          {filteredHierarchy.length > 0 ? (
            filteredHierarchy.map((node) => (
              <TreeNode
                key={node.subnet.id}
                node={node}
                selectedSubnets={selectedSubnets}
                expandedNodes={internalExpandedNodes}
                onSelectionChange={handleSubnetSelection}
                onExpandToggle={handleExpandToggle}
                onCopySubnet={onCopySubnet}
                onSubnetDetails={onSubnetDetails}
                showRelationships={showRelationships}
                showSelection={showSelection}
                showActions={showActions}
                isFiltered={!!internalFilterText}
              />
            ))
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              {internalFilterText ? (
                <>
                  <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No subnets match your search criteria</p>
                  <p className="text-sm mt-2">Try adjusting your search terms</p>
                </>
              ) : (
                <>
                  <Network className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No subnet hierarchy to display</p>
                </>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}