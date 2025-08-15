"use client";

import React, { useState, useMemo, useCallback, memo, useRef, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Checkbox
} from '@/components/ui/checkbox';
import {
  Button
} from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Input
} from '@/components/ui/input';
import {
  Copy,
  ChevronUp,
  ChevronDown,
  Info,
  Loader2,
  Search,
  X,
  Keyboard
} from 'lucide-react';
import { SplitSubnet } from '@/lib/types';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { VirtualSubnetList } from './virtual-subnet-list';
import { debounce } from '@/lib/performance';
import { useKeyboardNavigation, formatKeyboardShortcut } from '@/lib/keyboard-navigation';

interface SubnetListProps {
  subnets: SplitSubnet[];
  selectedSubnets: Set<string>;
  onSelectionChange: (selected: Set<string>) => void;
  onSort?: (field: string, order: 'asc' | 'desc') => void;
  onFilter?: (filterText: string) => void;
  onCopySubnet?: (subnet: SplitSubnet) => void;
  onSubnetDetails?: (subnet: SplitSubnet) => void;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  filterText?: string;
  loading?: boolean;
  showSelection?: boolean;
  showActions?: boolean;
  className?: string;
}

type SortField = 'network' | 'cidr' | 'totalHosts' | 'usableHosts' | 'firstHost' | 'lastHost';

// Memoized SubnetList component for optimal performance
export const SubnetList = memo<SubnetListProps>(({
  subnets,
  selectedSubnets,
  onSelectionChange,
  onSort,
  onFilter,
  onCopySubnet,
  onSubnetDetails,
  sortBy = 'network',
  sortOrder = 'asc',
  filterText = '',
  loading = false,
  showSelection = true,
  showActions = true,
  className = ''
}) => {
  // Always initialize hooks at the top level
  const [internalSortBy, setInternalSortBy] = useState<SortField | null>(null);
  const [internalSortOrder, setInternalSortOrder] = useState<'asc' | 'desc'>('asc');
  const [internalFilterText, setInternalFilterText] = useState<string>(filterText);
  const [copyingSubnet, setCopyingSubnet] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<{
    type: 'success' | 'error' | null;
    message: string;
    subnetId: string;
  } | null>(null);

  // Keyboard navigation setup
  const containerRef = useRef<HTMLDivElement>(null);
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [focusedSubnetIndex, setFocusedSubnetIndex] = useState<number>(-1);

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

  // Determine if we should use virtual scrolling based on subnet count
  const shouldUseVirtualScrolling = subnets.length > 100;

  // Debounced filter handler for better performance
  const debouncedFilter = useMemo(
    () => debounce((value: string) => {
      onFilter?.(value);
    }, 300),
    [onFilter]
  );

  // Handle sorting with memoization
  const handleSort = useCallback((field: SortField) => {
    let newOrder: 'asc' | 'desc';
    if (internalSortBy === field) {
      newOrder = internalSortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      newOrder = 'asc';
    }
    setInternalSortBy(field);
    setInternalSortOrder(newOrder);
    onSort?.(field, newOrder);
  }, [internalSortBy, internalSortOrder, onSort]);

  // Handle filtering with debouncing
  const handleFilterChange = useCallback((value: string) => {
    setInternalFilterText(value);
    debouncedFilter(value);
  }, [debouncedFilter]);

  const clearFilter = useCallback(() => {
    setInternalFilterText('');
    onFilter?.('');
  }, [onFilter]);

  // Enhanced copy subnet functionality with formatted output and feedback
  const handleCopySubnet = useCallback(async (subnet: SplitSubnet) => {
    setCopyingSubnet(subnet.id);
    
    try {
      // Create formatted text output for subnet information
      const formatSubnetInfo = (subnet: SplitSubnet): string => {
        const lines = [
          `Subnet Information`,
          `==================`,
          `Network Address:    ${subnet.network}/${subnet.cidr}`,
          `Broadcast Address:  ${subnet.broadcast}`,
          `First Host IP:      ${subnet.firstHost}`,
          `Last Host IP:       ${subnet.lastHost}`,
          `Total Hosts:        ${subnet.totalHosts.toLocaleString()}`,
          `Usable Hosts:       ${subnet.usableHosts.toLocaleString()}`,
        ];

        // Add IPv6 specific information if available
        if (subnet.ipVersion === 'ipv6' && subnet.ipv6Info) {
          lines.push(
            `Address Type:       ${subnet.ipv6Info.addressType}`,
            `Host Bits:          ${subnet.ipv6Info.hostBits}`,
            `Total Addresses:    ${subnet.ipv6Info.totalAddressesFormatted}`,
            `Usable Addresses:   ${subnet.ipv6Info.usableAddressesFormatted}`
          );
        }

        // Add cloud provider reserved IPs if available
        if (subnet.cloudReserved && subnet.cloudReserved.length > 0) {
          lines.push(
            ``,
            `Cloud Reserved IPs:`,
            `------------------`
          );
          subnet.cloudReserved.forEach(reservation => {
            lines.push(`${reservation.ip.padEnd(15)} - ${reservation.purpose}: ${reservation.description}`);
          });
        }

        // Add metadata
        lines.push(
          ``,
          `Generated by Art of Infra Subnet Calculator`,
          `Timestamp: ${new Date().toISOString()}`
        );

        return lines.join('\n');
      };

      const formattedText = formatSubnetInfo(subnet);

      // Check if Clipboard API is available
      if (!navigator.clipboard) {
        throw new Error('Clipboard API not available');
      }

      // Copy to clipboard
      await navigator.clipboard.writeText(formattedText);

      // Show success feedback
      setCopyFeedback({
        type: 'success',
        message: `Subnet ${subnet.network}/${subnet.cidr} information copied to clipboard`,
        subnetId: subnet.id
      });

      // Clear feedback after 3 seconds
      setTimeout(() => setCopyFeedback(null), 3000);

      // Call the optional callback
      onCopySubnet?.(subnet);

    } catch (error) {
      console.error('Failed to copy subnet information:', error);
      
      // Fallback: try to use the older execCommand method
      try {
        const textArea = document.createElement('textarea');
        textArea.value = `${subnet.network}/${subnet.cidr} - ${subnet.firstHost} to ${subnet.lastHost} (${subnet.usableHosts.toLocaleString()} usable hosts)`;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        
        // Show success feedback for fallback method
        setCopyFeedback({
          type: 'success',
          message: `Basic subnet information copied using fallback method`,
          subnetId: subnet.id
        });
        
        // Clear feedback after 3 seconds
        setTimeout(() => setCopyFeedback(null), 3000);
        
        // Call the optional callback
        onCopySubnet?.(subnet);
      } catch (fallbackError) {
        console.error('Fallback copy method also failed:', fallbackError);
        
        // Show error feedback
        setCopyFeedback({
          type: 'error',
          message: error instanceof Error 
            ? `Failed to copy subnet: ${error.message}` 
            : "Failed to copy subnet information to clipboard",
          subnetId: subnet.id
        });
        
        // Clear feedback after 5 seconds for errors
        setTimeout(() => setCopyFeedback(null), 5000);
      }
    } finally {
      setCopyingSubnet(null);
    }
  }, [onCopySubnet]);

  // Sort and filter subnets
  const sortedAndFilteredSubnets = useMemo(() => {
    // First sort the subnets (only if a sort field has been selected)
    let sorted = [...subnets];
    
    if (internalSortBy) {
      sorted = sorted.sort((a, b) => {
        let aValue: string | number;
        let bValue: string | number;

        switch (internalSortBy) {
          case 'network':
            // Convert IP to number for proper sorting
            aValue = a.network.split('.').map(n => parseInt(n).toString().padStart(3, '0')).join('.');
            bValue = b.network.split('.').map(n => parseInt(n).toString().padStart(3, '0')).join('.');
            break;
          case 'cidr':
            aValue = a.cidr;
            bValue = b.cidr;
            break;
          case 'totalHosts':
            aValue = a.totalHosts;
            bValue = b.totalHosts;
            break;
          case 'usableHosts':
            aValue = a.usableHosts;
            bValue = b.usableHosts;
            break;
          case 'firstHost':
            aValue = a.firstHost.split('.').map(n => parseInt(n).toString().padStart(3, '0')).join('.');
            bValue = b.firstHost.split('.').map(n => parseInt(n).toString().padStart(3, '0')).join('.');
            break;
          case 'lastHost':
            aValue = a.lastHost.split('.').map(n => parseInt(n).toString().padStart(3, '0')).join('.');
            bValue = b.lastHost.split('.').map(n => parseInt(n).toString().padStart(3, '0')).join('.');
            break;
          default:
            aValue = a.network;
            bValue = b.network;
        }

        if (typeof aValue === 'string' && typeof bValue === 'string') {
          return internalSortOrder === 'asc' 
            ? aValue.localeCompare(bValue)
            : bValue.localeCompare(aValue);
        } else {
          return internalSortOrder === 'asc' 
            ? (aValue as number) - (bValue as number)
            : (bValue as number) - (aValue as number);
        }
      });
    }

    // Then filter the sorted subnets
    if (!internalFilterText.trim()) {
      return sorted;
    }

    const searchTerm = internalFilterText.toLowerCase().trim();
    return sorted.filter(subnet => 
      subnet.network.toLowerCase().includes(searchTerm) ||
      subnet.cidr.toString().includes(searchTerm) ||
      subnet.firstHost.toLowerCase().includes(searchTerm) ||
      subnet.lastHost.toLowerCase().includes(searchTerm) ||
      subnet.broadcast.toLowerCase().includes(searchTerm) ||
      subnet.usableHosts.toString().includes(searchTerm) ||
      subnet.totalHosts.toString().includes(searchTerm)
    );
  }, [subnets, internalSortBy, internalSortOrder, internalFilterText]);

  // Handle select all/none
  const handleSelectAll = useCallback((checked: boolean) => {
    if (checked) {
      const allIds = new Set(subnets.map(subnet => subnet.id));
      onSelectionChange(allIds);
    } else {
      onSelectionChange(new Set());
    }
  }, [subnets, onSelectionChange]);

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

  // Render sort icon
  const renderSortIcon = (field: SortField) => {
    if (internalSortBy !== field) {
      return null;
    }
    return internalSortOrder === 'asc' ? 
      <ChevronUp className="ml-1 h-4 w-4" /> : 
      <ChevronDown className="ml-1 h-4 w-4" />;
  };

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

    // Clear search
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

    // Copy focused subnet
    registerShortcut({
      key: 'c',
      ctrlKey: true,
      action: () => {
        if (focusedSubnetIndex >= 0 && focusedSubnetIndex < sortedAndFilteredSubnets.length) {
          const subnet = sortedAndFilteredSubnets[focusedSubnetIndex];
          handleCopySubnet(subnet);
        }
      },
      description: 'Copy focused subnet',
      category: 'Actions'
    });

    // Sort shortcuts (using Ctrl+Shift to avoid browser conflicts)
    registerShortcut({
      key: 'n',
      ctrlKey: true,
      shiftKey: true,
      action: () => handleSort('network'),
      description: 'Sort by network address',
      category: 'Sorting'
    });

    registerShortcut({
      key: 'c',
      ctrlKey: true,
      shiftKey: true,
      action: () => handleSort('cidr'),
      description: 'Sort by CIDR',
      category: 'Sorting'
    });

    registerShortcut({
      key: 'h',
      ctrlKey: true,
      shiftKey: true,
      action: () => handleSort('usableHosts'),
      description: 'Sort by usable hosts',
      category: 'Sorting'
    });

    // Navigate through subnets with Ctrl+Shift+Arrow keys
    registerShortcut({
      key: 'ArrowDown',
      ctrlKey: true,
      shiftKey: true,
      action: () => {
        const nextIndex = Math.min(focusedSubnetIndex + 1, sortedAndFilteredSubnets.length - 1);
        setFocusedSubnetIndex(nextIndex);
        // Focus the checkbox of the next subnet
        const checkboxes = containerRef.current?.querySelectorAll('input[type="checkbox"]');
        if (checkboxes && checkboxes[nextIndex + (showSelection ? 1 : 0)]) {
          (checkboxes[nextIndex + (showSelection ? 1 : 0)] as HTMLInputElement).focus();
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
        const prevIndex = Math.max(focusedSubnetIndex - 1, 0);
        setFocusedSubnetIndex(prevIndex);
        // Focus the checkbox of the previous subnet
        const checkboxes = containerRef.current?.querySelectorAll('input[type="checkbox"]');
        if (checkboxes && checkboxes[prevIndex + (showSelection ? 1 : 0)]) {
          (checkboxes[prevIndex + (showSelection ? 1 : 0)] as HTMLInputElement).focus();
        }
      },
      description: 'Navigate to previous subnet',
      category: 'Navigation'
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
      unregisterShortcut('c');
      unregisterShortcut('n');
      unregisterShortcut('h');
      unregisterShortcut('ArrowDown');
      unregisterShortcut('ArrowUp');
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
    focusedSubnetIndex,
    sortedAndFilteredSubnets,
    handleCopySubnet,
    handleSort,
    showKeyboardHelp
  ]);

  // Use virtual scrolling for large subnet lists
  if (shouldUseVirtualScrolling) {
    return (
      <VirtualSubnetList
        subnets={subnets}
        selectedSubnets={selectedSubnets}
        onSelectionChange={onSelectionChange}
        onSort={onSort}
        onFilter={onFilter}
        onCopySubnet={onCopySubnet}
        onSubnetDetails={onSubnetDetails}
        sortBy={sortBy}
        sortOrder={sortOrder}
        filterText={filterText}
        loading={loading}
        showSelection={showSelection}
        showActions={showActions}
        className={className}
        enableVirtualization={true}
        virtualizationThreshold={100}
      />
    );
  }

  if (loading) {
    return (
      <Card className={`${className} rounded-lg shadow-md`}>
        <CardContent className="p-6 flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          <span>Loading subnets...</span>
        </CardContent>
      </Card>
    );
  }

  if (subnets.length === 0) {
    return (
      <Card className={`${className} rounded-lg shadow-md`}>
        <CardContent className="p-6 text-center py-8 text-muted-foreground">
          No subnets to display
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
        id="subnet-list-live-region"
      >
        {copyFeedback && copyFeedback.type === 'success' && 'Subnet information copied successfully'}
        {copyFeedback && copyFeedback.type === 'error' && 'Failed to copy subnet information'}
        {internalFilterText && sortedAndFilteredSubnets.length !== subnets.length && `Filter applied: ${sortedAndFilteredSubnets.length} results found`}
        {selectedSubnets.size > 0 && `Selection updated: ${selectedSubnets.size} subnets selected`}
      </div>

      <Card className={`${className} rounded-lg shadow-md`}>
        <CardHeader className="p-6 pb-4">
          <CardTitle className="text-lg font-medium flex items-center justify-between">
            <span id="subnet-list-title">
              Subnet List ({subnets.length} subnet{subnets.length !== 1 ? 's' : ''})
            </span>
            <div className="flex items-center gap-2">
              {showSelection && selectedSubnets.size > 0 && (
                <span 
                  className="text-sm font-normal text-muted-foreground"
                  aria-label={`${selectedSubnets.size} of ${subnets.length} subnets selected`}
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
        <CardContent className="p-6">
        {/* Search/Filter Input */}
        <div className="mb-4 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search subnets by network, CIDR, or host range..."
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

        {/* Results count when filtering */}
        {internalFilterText && (
          <div className="mb-4 text-sm text-muted-foreground">
            Showing {sortedAndFilteredSubnets.length} of {subnets.length} subnets
          </div>
        )}

        {/* Copy feedback alert */}
        {copyFeedback && (
          <Alert className={`mb-4 ${copyFeedback.type === 'success' ? 'border-green-200 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-900/20 dark:text-green-100' : 'border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-900/20 dark:text-red-100'}`}>
            <AlertDescription>
              {copyFeedback.message}
            </AlertDescription>
          </Alert>
        )}

        {/* Desktop Table View */}
        <div className="hidden md:block rounded-md border overflow-x-auto">
          <Table role="table" aria-label="Subnet list table">
            <TableHeader>
              <TableRow role="row">
                {showSelection && (
                  <TableHead className="w-12" role="columnheader">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={handleSelectAll}
                      aria-label={`Select all ${subnets.length} subnets. Currently ${selectedSubnets.size} of ${subnets.length} subnets selected.`}
                      aria-describedby="select-all-description"
                      className={someSelected ? 'data-[state=checked]:bg-primary/50' : ''}
                    />
                    <span id="select-all-description" className="sr-only">
                      {allSelected ? 'All subnets are selected' : 
                       someSelected ? `${selectedSubnets.size} of ${subnets.length} subnets are selected` :
                       'No subnets are selected'}
                    </span>
                  </TableHead>
                )}
                <TableHead role="columnheader">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 hover:bg-transparent"
                    onClick={() => handleSort('network')}
                    aria-label={`Sort by network address. Currently sorted ${internalSortBy === 'network' ? `${internalSortOrder}ending` : 'unsorted'}`}
                    aria-describedby="network-sort-description"
                  >
                    Network
                    {renderSortIcon('network')}
                  </Button>
                  <span id="network-sort-description" className="sr-only">
                    Network addresses in CIDR notation. Click to sort by network address.
                  </span>
                </TableHead>
                <TableHead role="columnheader">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 hover:bg-transparent"
                    onClick={() => handleSort('cidr')}
                    aria-label={`Sort by CIDR prefix length. Currently sorted ${internalSortBy === 'cidr' ? `${internalSortOrder}ending` : 'unsorted'}`}
                    aria-describedby="cidr-sort-description"
                  >
                    CIDR
                    {renderSortIcon('cidr')}
                  </Button>
                  <span id="cidr-sort-description" className="sr-only">
                    CIDR prefix length indicating subnet size. Lower numbers mean larger subnets.
                  </span>
                </TableHead>
                <TableHead role="columnheader">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 hover:bg-transparent"
                    onClick={() => handleSort('usableHosts')}
                    aria-label={`Sort by usable hosts count. Currently sorted ${internalSortBy === 'usableHosts' ? `${internalSortOrder}ending` : 'unsorted'}`}
                    aria-describedby="hosts-sort-description"
                  >
                    Usable Hosts
                    {renderSortIcon('usableHosts')}
                  </Button>
                  <span id="hosts-sort-description" className="sr-only">
                    Number of IP addresses available for devices, excluding network and broadcast addresses.
                  </span>
                </TableHead>
                <TableHead className="hidden lg:table-cell" role="columnheader">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 hover:bg-transparent"
                    onClick={() => handleSort('firstHost')}
                    aria-label={`Sort by first host IP address. Currently sorted ${internalSortBy === 'firstHost' ? `${internalSortOrder}ending` : 'unsorted'}`}
                    aria-describedby="first-host-sort-description"
                  >
                    First Host
                    {renderSortIcon('firstHost')}
                  </Button>
                  <span id="first-host-sort-description" className="sr-only">
                    First usable IP address in the subnet range.
                  </span>
                </TableHead>
                <TableHead className="hidden lg:table-cell" role="columnheader">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 hover:bg-transparent"
                    onClick={() => handleSort('lastHost')}
                    aria-label={`Sort by last host IP address. Currently sorted ${internalSortBy === 'lastHost' ? `${internalSortOrder}ending` : 'unsorted'}`}
                    aria-describedby="last-host-sort-description"
                  >
                    Last Host
                    {renderSortIcon('lastHost')}
                  </Button>
                  <span id="last-host-sort-description" className="sr-only">
                    Last usable IP address in the subnet range.
                  </span>
                </TableHead>
                {showActions && (
                  <TableHead className="w-24" role="columnheader">
                    <span aria-describedby="actions-description">Actions</span>
                    <span id="actions-description" className="sr-only">
                      Available actions for each subnet including copy and view details.
                    </span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody role="rowgroup">
              {sortedAndFilteredSubnets.map((subnet, index) => (
                <TableRow 
                  key={subnet.id}
                  role="row"
                  className={selectedSubnets.has(subnet.id) ? 'bg-muted/50' : ''}
                  aria-selected={selectedSubnets.has(subnet.id)}
                  aria-describedby={`subnet-${subnet.id}-description`}
                >
                  {showSelection && (
                    <TableCell role="gridcell">
                      <Checkbox
                        checked={selectedSubnets.has(subnet.id)}
                        onCheckedChange={(checked) => 
                          handleSubnetSelection(subnet.id, checked as boolean)
                        }
                        aria-label={`Select subnet ${subnet.network}/${subnet.cidr} with ${subnet.usableHosts.toLocaleString()} usable hosts`}
                        aria-describedby={`subnet-${subnet.id}-selection-description`}
                      />
                      <span id={`subnet-${subnet.id}-selection-description`} className="sr-only">
                        {selectedSubnets.has(subnet.id) ? 'Selected' : 'Not selected'}. 
                        Subnet {index + 1} of {sortedAndFilteredSubnets.length}.
                        Network range from {subnet.firstHost} to {subnet.lastHost}.
                      </span>
                    </TableCell>
                  )}
                  <TableCell className="font-mono" role="gridcell">
                    <span aria-label={`Network address ${subnet.network}`}>
                      {subnet.network}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono" role="gridcell">
                    <span aria-label={`CIDR prefix length ${subnet.cidr}`}>
                      /{subnet.cidr}
                    </span>
                  </TableCell>
                  <TableCell role="gridcell">
                    <span aria-label={`${subnet.usableHosts.toLocaleString()} usable host addresses`}>
                      {subnet.usableHosts.toLocaleString()}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono hidden lg:table-cell" role="gridcell">
                    <span aria-label={`First host IP address ${subnet.firstHost}`}>
                      {subnet.firstHost}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono hidden lg:table-cell" role="gridcell">
                    <span aria-label={`Last host IP address ${subnet.lastHost}`}>
                      {subnet.lastHost}
                    </span>
                  </TableCell>
                  {showActions && (
                    <TableCell role="gridcell">
                      <div className="flex space-x-1" role="group" aria-label={`Actions for subnet ${subnet.network}/${subnet.cidr}`}>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopySubnet(subnet)}
                          aria-label={`Copy information for subnet ${subnet.network}/${subnet.cidr} to clipboard`}
                          aria-describedby={`copy-${subnet.id}-description`}
                          disabled={copyingSubnet === subnet.id}
                        >
                          {copyingSubnet === subnet.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          ) : (
                            <Copy className="h-4 w-4" aria-hidden="true" />
                          )}
                          <span className="sr-only">
                            {copyingSubnet === subnet.id ? 'Copying subnet information...' : 'Copy subnet information'}
                          </span>
                        </Button>
                        <span id={`copy-${subnet.id}-description`} className="sr-only">
                          Copies network details, IP ranges, and host count information to clipboard.
                        </span>
                        {onSubnetDetails && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onSubnetDetails(subnet)}
                            aria-label={`View detailed information for subnet ${subnet.network}/${subnet.cidr}`}
                            aria-describedby={`details-${subnet.id}-description`}
                          >
                            <Info className="h-4 w-4" aria-hidden="true" />
                            <span className="sr-only">View subnet details</span>
                          </Button>
                        )}
                        <span id={`details-${subnet.id}-description`} className="sr-only">
                          Opens detailed view with comprehensive subnet information and configuration options.
                        </span>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          
          {/* Screen reader descriptions for subnets - outside table structure */}
          <div className="sr-only">
            {sortedAndFilteredSubnets.map((subnet, index) => (
              <div key={`desc-${subnet.id}`} id={`subnet-${subnet.id}-description`}>
                Subnet {subnet.network} slash {subnet.cidr} contains {subnet.totalHosts.toLocaleString()} total addresses 
                with {subnet.usableHosts.toLocaleString()} usable for devices. 
                IP range spans from {subnet.firstHost} to {subnet.lastHost}.
                {subnet.parentId ? ` This is a child subnet created from splitting a larger network.` : ''}
                {subnet.level > 0 ? ` Hierarchy level ${subnet.level}.` : ''}
              </div>
            ))}
          </div>
        </div>

        {/* No results message */}
        {sortedAndFilteredSubnets.length === 0 && internalFilterText && (
          <div className="text-center py-8 text-muted-foreground">
            <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No subnets match your search criteria</p>
            <p className="text-sm mt-2">Try adjusting your search terms</p>
          </div>
        )}

        {/* Mobile Card View */}
        <div className="md:hidden space-y-4">
          {sortedAndFilteredSubnets.map((subnet) => (
            <Card 
              key={subnet.id} 
              className={`${selectedSubnets.has(subnet.id) ? 'ring-2 ring-primary' : ''}`}
            >
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    {showSelection && (
                      <Checkbox
                        checked={selectedSubnets.has(subnet.id)}
                        onCheckedChange={(checked) => 
                          handleSubnetSelection(subnet.id, checked as boolean)
                        }
                        aria-label={`Select subnet ${subnet.network}/${subnet.cidr}`}
                      />
                    )}
                    <div>
                      <div className="font-mono text-sm font-semibold">
                        {subnet.network}/{subnet.cidr}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {subnet.usableHosts.toLocaleString()} usable hosts
                      </div>
                    </div>
                  </div>
                  {showActions && (
                    <div className="flex space-x-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopySubnet(subnet)}
                        title="Copy subnet information"
                        disabled={copyingSubnet === subnet.id}
                      >
                        {copyingSubnet === subnet.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                      {onSubnetDetails && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onSubnetDetails(subnet)}
                          title="View subnet details"
                        >
                          <Info className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">First Host:</span>
                    <span className="font-mono">{subnet.firstHost}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Last Host:</span>
                    <span className="font-mono">{subnet.lastHost}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Broadcast:</span>
                    <span className="font-mono">{subnet.broadcast}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Hosts:</span>
                    <span>{subnet.totalHosts.toLocaleString()}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Keyboard Shortcuts Help Modal */}
        {showKeyboardHelp && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-background border rounded-lg p-6 max-w-2xl mx-4 max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold flex items-center gap-2">
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
                <p>• Use Ctrl+Shift+↑/↓ to navigate through subnet rows</p>
                <p>• Press Space to toggle subnet selection</p>
                <p>• Press Ctrl+Shift+N/C/H to sort by Network/CIDR/Hosts</p>
                <p>• Press Ctrl+F to focus search field</p>
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

SubnetList.displayName = 'SubnetList';