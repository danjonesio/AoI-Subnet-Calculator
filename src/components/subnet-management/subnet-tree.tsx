"use client";

import React, { useState, useMemo, useCallback, memo, useRef, useEffect } from 'react';
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
  Loader2,
  Keyboard
} from 'lucide-react';
import { SplitSubnet, SubnetHierarchy } from '@/lib/types';
import { useKeyboardNavigation, formatKeyboardShortcut } from '@/lib/keyboard-navigation';

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
        role="treeitem"
        aria-expanded={hasChildren ? isExpanded : undefined}
        aria-level={depth + 1}
        aria-selected={isSelected}
        aria-describedby={`tree-node-${subnet.id}-description`}
        data-subnet-node={subnet.id}
      >
        {/* Expand/Collapse button */}
        <div className="flex items-center mr-2">
          {hasChildren ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 hover:bg-muted"
                onClick={() => onExpandToggle(subnet.id)}
                aria-label={`${isExpanded ? 'Collapse' : 'Expand'} subnet ${subnet.network}/${subnet.cidr} with ${children.length} child subnet${children.length !== 1 ? 's' : ''}`}
                aria-describedby={`expand-${subnet.id}-description`}
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                )}
              </Button>
              <span id={`expand-${subnet.id}-description`} className="sr-only">
                {isExpanded ? 'Collapse to hide' : 'Expand to show'} {children.length} child subnet{children.length !== 1 ? 's' : ''} 
                created by splitting this network.
              </span>
            </>
          ) : (
            <div className="h-6 w-6 flex items-center justify-center" aria-hidden="true">
              {showRelationships && depth > 0 && (
                <div 
                  className="h-2 w-2 rounded-full bg-muted-foreground/30" 
                  aria-label="Child subnet indicator"
                />
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
              aria-label={`Select subnet ${subnet.network}/${subnet.cidr} with ${subnet.usableHosts.toLocaleString()} usable hosts${hasChildren ? ` and ${children.length} child subnet${children.length !== 1 ? 's' : ''}` : ''}`}
              aria-describedby={`tree-select-${subnet.id}-description`}
            />
            <span id={`tree-select-${subnet.id}-description`} className="sr-only">
              {isSelected ? 'Selected' : 'Not selected'} for operations. 
              {hasChildren ? `Parent subnet with ${children.length} child subnet${children.length !== 1 ? 's' : ''}.` : 'Leaf subnet with no children.'}
              Hierarchy level {depth + 1}.
            </span>
          </div>
        )}

        {/* Subnet icon */}
        <div className="mr-2 flex-shrink-0">
          <Network 
            className={`h-4 w-4 ${hasChildren ? 'text-primary' : 'text-muted-foreground'}`} 
            aria-hidden="true"
          />
        </div>

        {/* Subnet information */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-3">
            <div className="font-mono text-sm font-medium" aria-label={`Network address ${subnet.network} with CIDR prefix ${subnet.cidr}`}>
              {subnet.network}/{subnet.cidr}
            </div>
            <div className="text-xs text-muted-foreground" aria-label={`${subnet.usableHosts.toLocaleString()} usable host addresses`}>
              {subnet.usableHosts.toLocaleString()} hosts
            </div>
            {showRelationships && subnet.parentId && (
              <div 
                className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded"
                aria-label={`Hierarchy level ${subnet.level}`}
              >
                Level {subnet.level}
              </div>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-1" aria-label={`IP address range from ${subnet.firstHost} to ${subnet.lastHost}`}>
            {subnet.firstHost} - {subnet.lastHost}
          </div>
        </div>

        {/* Actions */}
        {showActions && (
          <div className="flex items-center space-x-1 ml-2" role="group" aria-label={`Actions for subnet ${subnet.network}/${subnet.cidr}`}>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => handleCopySubnet(subnet)}
              aria-label={`Copy information for subnet ${subnet.network}/${subnet.cidr} to clipboard`}
              aria-describedby={`tree-copy-${subnet.id}-description`}
            >
              <Copy className="h-3 w-3" aria-hidden="true" />
            </Button>
            <span id={`tree-copy-${subnet.id}-description`} className="sr-only">
              Copies network details, IP ranges, and host count information to clipboard in formatted text.
            </span>
            {onSubnetDetails && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => onSubnetDetails(subnet)}
                aria-label={`View detailed information for subnet ${subnet.network}/${subnet.cidr}`}
                aria-describedby={`tree-details-${subnet.id}-description`}
              >
                <Info className="h-3 w-3" aria-hidden="true" />
              </Button>
            )}
            <span id={`tree-details-${subnet.id}-description`} className="sr-only">
              Opens detailed view with comprehensive subnet information and configuration options.
            </span>
          </div>
        )}

        {/* Screen reader description for the entire tree node */}
        <span id={`tree-node-${subnet.id}-description`} className="sr-only">
          Subnet {subnet.network} slash {subnet.cidr} at hierarchy level {depth + 1}. 
          Contains {subnet.totalHosts.toLocaleString()} total addresses with {subnet.usableHosts.toLocaleString()} usable for devices. 
          IP range spans from {subnet.firstHost} to {subnet.lastHost}.
          {hasChildren ? ` Parent subnet with ${children.length} child subnet${children.length !== 1 ? 's' : ''}.` : ' Leaf subnet with no child subnets.'}
          {subnet.parentId ? ' Created by splitting a larger parent network.' : ' Root level subnet.'}
          {isFiltered ? ' Matches current search filter.' : ''}
        </span>
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

const SubnetTree = memo<SubnetTreeProps>(({
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
}) => {
  const [internalExpandedNodes, setInternalExpandedNodes] = useState<Set<string>>(expandedNodes);
  const [internalFilterText, setInternalFilterText] = useState<string>(filterText);

  // Keyboard navigation setup
  const containerRef = useRef<HTMLDivElement>(null);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [focusedNodeIndex, setFocusedNodeIndex] = useState<number>(-1);

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

  // Register keyboard shortcuts
  useEffect(() => {
    // Select all shortcut
    registerShortcut({
      key: 'a',
      ctrlKey: true,
      action: () => {
        if (showSelection) {
          handleSelectAll(!allSelected);
        }
      },
      description: 'Select/deselect all subnets',
      category: 'Selection'
    });

    // Focus search field
    registerShortcut({
      key: 'f',
      ctrlKey: true,
      action: () => {
        const searchInput = containerRef.current?.querySelector('input[type="text"]') as HTMLInputElement;
        searchInput?.focus();
      },
      description: 'Focus search field',
      category: 'Navigation'
    });

    // Clear search or selection
    registerShortcut({
      key: 'Escape',
      action: () => {
        if (showKeyboardHelp) {
          setShowKeyboardHelp(false);
        } else if (internalFilterText) {
          clearFilter();
        } else if (selectedSubnets.size > 0) {
          onSelectionChange(new Set());
        }
      },
      description: 'Clear search or selection',
      category: 'Navigation'
    });

    // Expand all nodes
    registerShortcut({
      key: 'e',
      ctrlKey: true,
      action: () => expandAll(),
      description: 'Expand all nodes',
      category: 'Tree Navigation'
    });

    // Collapse all nodes
    registerShortcut({
      key: 'c',
      ctrlKey: true,
      shiftKey: true,
      action: () => collapseAll(),
      description: 'Collapse all nodes',
      category: 'Tree Navigation'
    });

    // Navigate through tree nodes with Ctrl+Shift+Arrow keys
    registerShortcut({
      key: 'ArrowDown',
      ctrlKey: true,
      shiftKey: true,
      action: () => {
        // Focus next tree node
        const treeNodes = containerRef.current?.querySelectorAll('[role="treeitem"], button, input[type="checkbox"]');
        if (treeNodes) {
          const focused = document.activeElement;
          const currentIndex = Array.from(treeNodes).indexOf(focused as HTMLElement);
          const nextIndex = (currentIndex + 1) % treeNodes.length;
          (treeNodes[nextIndex] as HTMLElement).focus();
        }
      },
      description: 'Navigate to next tree node',
      category: 'Tree Navigation'
    });

    registerShortcut({
      key: 'ArrowUp',
      ctrlKey: true,
      shiftKey: true,
      action: () => {
        // Focus previous tree node
        const treeNodes = containerRef.current?.querySelectorAll('[role="treeitem"], button, input[type="checkbox"]');
        if (treeNodes) {
          const focused = document.activeElement;
          const currentIndex = Array.from(treeNodes).indexOf(focused as HTMLElement);
          const prevIndex = currentIndex <= 0 ? treeNodes.length - 1 : currentIndex - 1;
          (treeNodes[prevIndex] as HTMLElement).focus();
        }
      },
      description: 'Navigate to previous tree node',
      category: 'Tree Navigation'
    });

    // Expand/collapse focused node
    registerShortcut({
      key: 'ArrowRight',
      action: () => {
        const focused = document.activeElement;
        const expandButton = focused?.closest('[data-subnet-node]')?.querySelector('button[aria-label*="Expand"]') as HTMLButtonElement;
        if (expandButton) {
          expandButton.click();
        }
      },
      description: 'Expand focused node',
      category: 'Tree Navigation'
    });

    registerShortcut({
      key: 'ArrowLeft',
      action: () => {
        const focused = document.activeElement;
        const collapseButton = focused?.closest('[data-subnet-node]')?.querySelector('button[aria-label*="Collapse"]') as HTMLButtonElement;
        if (collapseButton) {
          collapseButton.click();
        }
      },
      description: 'Collapse focused node',
      category: 'Tree Navigation'
    });

    // Show keyboard help
    registerShortcut({
      key: '?',
      action: () => setShowKeyboardHelp(true),
      description: 'Show keyboard shortcuts',
      category: 'Help'
    });

    return () => {
      unregisterShortcut('a');
      unregisterShortcut('f');
      unregisterShortcut('Escape');
      unregisterShortcut('e');
      unregisterShortcut('c');
      unregisterShortcut('ArrowDown');
      unregisterShortcut('ArrowUp');
      unregisterShortcut('ArrowRight');
      unregisterShortcut('ArrowLeft');
      unregisterShortcut('?');
    };
  }, [
    registerShortcut,
    unregisterShortcut,
    showSelection,
    handleSelectAll,
    allSelected,
    clearFilter,
    internalFilterText,
    selectedSubnets.size,
    onSelectionChange,
    expandAll,
    collapseAll,
    showKeyboardHelp
  ]);

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
    <div ref={containerRef}>
      {/* Live region for dynamic content updates */}
      <div 
        aria-live="polite" 
        aria-atomic="false"
        className="sr-only"
        id="subnet-tree-live-region"
      >
        {internalFilterText && `Showing ${filteredHierarchy.reduce((count, node) => {
          const countNodes = (n: SubnetHierarchy): number => {
            return 1 + n.children.reduce((sum, child) => sum + countNodes(child), 0);
          };
          return count + countNodes(node);
        }, 0)} of ${subnets.length} subnets matching "${internalFilterText}"`}
        {selectedSubnets.size > 0 && `${selectedSubnets.size} of ${subnets.length} subnets selected in hierarchy`}
        {internalExpandedNodes.size > 0 && `${internalExpandedNodes.size} nodes expanded in tree view`}
      </div>

      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span id="subnet-tree-title">
              Subnet Hierarchy ({subnets.length} subnet{subnets.length !== 1 ? 's' : ''})
            </span>
            <div className="flex items-center gap-2">
              {showSelection && selectedSubnets.size > 0 && (
                <span 
                  className="text-sm font-normal text-muted-foreground"
                  aria-label={`${selectedSubnets.size} of ${subnets.length} subnets selected in hierarchy`}
                >
                  {selectedSubnets.size} selected
                </span>
              )}
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
            </div>
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
        <div 
          className="space-y-1 max-h-96 overflow-y-auto"
          role="tree"
          aria-label="Subnet hierarchy tree"
          aria-describedby="subnet-tree-description"
          aria-multiselectable={showSelection}
        >
          <div id="subnet-tree-description" className="sr-only">
            Hierarchical view of {subnets.length} subnet{subnets.length !== 1 ? 's' : ''} showing parent-child relationships. 
            {showSelection ? 'Use checkboxes to select subnets for operations. ' : ''}
            Use arrow keys to navigate, Enter or Space to expand/collapse nodes.
            {internalFilterText ? ` Currently filtered to show matching subnets for "${internalFilterText}".` : ''}
          </div>
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
            <div className="text-center py-8 text-muted-foreground" role="status" aria-live="polite">
              {internalFilterText ? (
                <>
                  <Search className="h-12 w-12 mx-auto mb-4 opacity-50" aria-hidden="true" />
                  <p>No subnets match your search criteria</p>
                  <p className="text-sm mt-2">Try adjusting your search terms</p>
                </>
              ) : (
                <>
                  <Network className="h-12 w-12 mx-auto mb-4 opacity-50" aria-hidden="true" />
                  <p>No subnet hierarchy to display</p>
                  <p className="text-sm mt-2">Split a subnet to see the hierarchy</p>
                </>
              )}
            </div>
          )}
        </div>

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
                <p>• Use Ctrl+Shift+↑/↓ to navigate through tree nodes</p>
                <p>• Press Left/Right arrows to expand/collapse nodes</p>
                <p>• Press Space to toggle subnet selection</p>
                <p>• Press Ctrl+E to expand all, Ctrl+Shift+C to collapse all</p>
                <p>• Press Escape to clear search or selection</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
    </div>
  );
});

SubnetTree.displayName = 'SubnetTree';

export { SubnetTree };