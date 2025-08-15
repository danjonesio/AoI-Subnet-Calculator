"use client";

import React, { 
  memo, 
  useMemo, 
  useCallback, 
  useState, 
  useEffect, 
  useRef,
  CSSProperties
} from 'react';
import {
  Table,
  TableBody,
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
  ChevronUp,
  ChevronDown,
  Search,
  X,
  Loader2
} from 'lucide-react';
import { SplitSubnet } from '@/lib/types';
import { OptimizedSubnetRow } from './optimized-subnet-row';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface VirtualSubnetListProps {
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
  // Virtual scrolling configuration
  itemHeight?: number;
  containerHeight?: number;
  overscan?: number;
  enableVirtualization?: boolean;
  virtualizationThreshold?: number;
}

type SortField = 'network' | 'cidr' | 'totalHosts' | 'usableHosts' | 'firstHost' | 'lastHost';

// Virtual scrolling hook for performance optimization
function useVirtualScrolling(
  items: SplitSubnet[],
  containerHeight: number,
  itemHeight: number,
  overscan: number = 5
) {
  const [scrollTop, setScrollTop] = useState(0);
  
  const visibleRange = useMemo(() => {
    const containerItemCount = Math.ceil(containerHeight / itemHeight);
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(
      items.length - 1,
      startIndex + containerItemCount + overscan * 2
    );
    
    return { startIndex, endIndex };
  }, [scrollTop, containerHeight, itemHeight, overscan, items.length]);

  const visibleItems = useMemo(() => {
    return items.slice(visibleRange.startIndex, visibleRange.endIndex + 1);
  }, [items, visibleRange.startIndex, visibleRange.endIndex]);

  const totalHeight = items.length * itemHeight;
  const offsetY = visibleRange.startIndex * itemHeight;

  return {
    visibleItems,
    totalHeight,
    offsetY,
    setScrollTop,
    visibleRange
  };
}

const VirtualSubnetList = memo<VirtualSubnetListProps>(({
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
  className = '',
  itemHeight = 60,
  containerHeight = 400,
  overscan = 5,
  enableVirtualization = true,
  virtualizationThreshold = 100
}) => {
  const [internalSortBy, setInternalSortBy] = useState<SortField | null>(null);
  const [internalSortOrder, setInternalSortOrder] = useState<'asc' | 'desc'>('asc');
  const [internalFilterText, setInternalFilterText] = useState<string>(filterText);
  const [copyFeedback, setCopyFeedback] = useState<{
    type: 'success' | 'error' | null;
    message: string;
    subnetId: string;
  } | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Determine if virtualization should be enabled
  const shouldVirtualize = enableVirtualization && subnets.length > virtualizationThreshold;

  // Handle sorting
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

  // Handle filtering
  const handleFilterChange = useCallback((value: string) => {
    setInternalFilterText(value);
    onFilter?.(value);
  }, [onFilter]);

  const clearFilter = useCallback(() => {
    setInternalFilterText('');
    onFilter?.('');
  }, [onFilter]);

  // Sort and filter subnets with memoization
  const sortedAndFilteredSubnets = useMemo(() => {
    let sorted = [...subnets];
    
    if (internalSortBy) {
      sorted = sorted.sort((a, b) => {
        let aValue: string | number;
        let bValue: string | number;

        switch (internalSortBy) {
          case 'network':
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

  // Virtual scrolling setup
  const virtualScrolling = useVirtualScrolling(
    sortedAndFilteredSubnets,
    containerHeight,
    itemHeight,
    overscan
  );

  // Handle scroll events for virtual scrolling
  const handleScroll = useCallback((event: React.UIEvent<HTMLDivElement>) => {
    if (shouldVirtualize) {
      virtualScrolling.setScrollTop(event.currentTarget.scrollTop);
    }
  }, [shouldVirtualize, virtualScrolling]);

  // Handle select all/none
  const handleSelectAll = useCallback((checked: boolean) => {
    if (checked) {
      const allIds = new Set(sortedAndFilteredSubnets.map(subnet => subnet.id));
      onSelectionChange(allIds);
    } else {
      onSelectionChange(new Set());
    }
  }, [sortedAndFilteredSubnets, onSelectionChange]);

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

  // Enhanced copy subnet functionality
  const handleCopySubnet = useCallback(async (subnet: SplitSubnet) => {
    try {
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

        if (subnet.ipVersion === 'ipv6' && subnet.ipv6Info) {
          lines.push(
            `Address Type:       ${subnet.ipv6Info.addressType}`,
            `Host Bits:          ${subnet.ipv6Info.hostBits}`,
            `Total Addresses:    ${subnet.ipv6Info.totalAddressesFormatted}`,
            `Usable Addresses:   ${subnet.ipv6Info.usableAddressesFormatted}`
          );
        }

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

        lines.push(
          ``,
          `Generated by Art of Infra Subnet Calculator`,
          `Timestamp: ${new Date().toISOString()}`
        );

        return lines.join('\n');
      };

      const formattedText = formatSubnetInfo(subnet);

      if (!navigator.clipboard) {
        throw new Error('Clipboard API not available');
      }

      await navigator.clipboard.writeText(formattedText);

      setCopyFeedback({
        type: 'success',
        message: `Subnet ${subnet.network}/${subnet.cidr} information copied to clipboard`,
        subnetId: subnet.id
      });

      setTimeout(() => setCopyFeedback(null), 3000);
      onCopySubnet?.(subnet);

    } catch (error) {
      console.error('Failed to copy subnet information:', error);
      
      try {
        const textArea = document.createElement('textarea');
        textArea.value = `${subnet.network}/${subnet.cidr} - ${subnet.firstHost} to ${subnet.lastHost} (${subnet.usableHosts.toLocaleString()} usable hosts)`;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
        
        setCopyFeedback({
          type: 'success',
          message: `Basic subnet information copied using fallback method`,
          subnetId: subnet.id
        });
        
        setTimeout(() => setCopyFeedback(null), 3000);
        onCopySubnet?.(subnet);
      } catch (fallbackError) {
        console.error('Fallback copy method also failed:', fallbackError);
        
        setCopyFeedback({
          type: 'error',
          message: error instanceof Error 
            ? `Failed to copy subnet: ${error.message}` 
            : "Failed to copy subnet information to clipboard",
          subnetId: subnet.id
        });
        
        setTimeout(() => setCopyFeedback(null), 5000);
      }
    }
  }, [onCopySubnet]);

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
  const allSelected = sortedAndFilteredSubnets.length > 0 && 
    sortedAndFilteredSubnets.every(subnet => selectedSubnets.has(subnet.id));
  const someSelected = selectedSubnets.size > 0 && !allSelected;

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
    <Card className={`${className} rounded-lg shadow-md`}>
      <CardHeader className="p-6 pb-4">
        <CardTitle className="text-lg font-medium flex items-center justify-between">
          <span>
            Subnet List ({subnets.length} subnets)
            {shouldVirtualize && (
              <span className="text-xs text-muted-foreground ml-2">
                (Virtual Scrolling Enabled)
              </span>
            )}
          </span>
          {showSelection && selectedSubnets.size > 0 && (
            <span className="text-sm font-normal text-muted-foreground">
              {selectedSubnets.size} selected
            </span>
          )}
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

        {/* Table with Virtual Scrolling */}
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                {showSelection && (
                  <TableHead className="w-12">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={handleSelectAll}
                      aria-label="Select all subnets"
                      className={someSelected ? 'data-[state=checked]:bg-primary/50' : ''}
                    />
                  </TableHead>
                )}
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 hover:bg-transparent"
                    onClick={() => handleSort('network')}
                  >
                    Network
                    {renderSortIcon('network')}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 hover:bg-transparent"
                    onClick={() => handleSort('cidr')}
                  >
                    CIDR
                    {renderSortIcon('cidr')}
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 hover:bg-transparent"
                    onClick={() => handleSort('usableHosts')}
                  >
                    Usable Hosts
                    {renderSortIcon('usableHosts')}
                  </Button>
                </TableHead>
                <TableHead className="hidden lg:table-cell">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 hover:bg-transparent"
                    onClick={() => handleSort('firstHost')}
                  >
                    First Host
                    {renderSortIcon('firstHost')}
                  </Button>
                </TableHead>
                <TableHead className="hidden lg:table-cell">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-auto p-0 hover:bg-transparent"
                    onClick={() => handleSort('lastHost')}
                  >
                    Last Host
                    {renderSortIcon('lastHost')}
                  </Button>
                </TableHead>
                {showActions && (
                  <TableHead className="w-24">Actions</TableHead>
                )}
              </TableRow>
            </TableHeader>
          </Table>

          {/* Virtual Scrolling Container */}
          <div
            ref={scrollContainerRef}
            className="overflow-auto"
            style={{ 
              height: shouldVirtualize ? `${containerHeight}px` : 'auto',
              maxHeight: shouldVirtualize ? undefined : `${containerHeight}px`
            }}
            onScroll={handleScroll}
          >
            <div
              style={{
                height: shouldVirtualize ? `${virtualScrolling.totalHeight}px` : 'auto',
                position: 'relative'
              }}
            >
              <div
                style={{
                  transform: shouldVirtualize ? `translateY(${virtualScrolling.offsetY}px)` : undefined,
                  position: shouldVirtualize ? 'absolute' : 'static',
                  top: 0,
                  left: 0,
                  right: 0
                }}
              >
                <Table>
                  <TableBody>
                    {(shouldVirtualize ? virtualScrolling.visibleItems : sortedAndFilteredSubnets).map((subnet) => (
                      <OptimizedSubnetRow
                        key={subnet.id}
                        subnet={subnet}
                        isSelected={selectedSubnets.has(subnet.id)}
                        onSelectionChange={handleSubnetSelection}
                        onCopySubnet={handleCopySubnet}
                        onSubnetDetails={onSubnetDetails}
                        showSelection={showSelection}
                        showActions={showActions}
                        showExtendedColumns={true}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
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
      </CardContent>
    </Card>
  );
});

VirtualSubnetList.displayName = 'VirtualSubnetList';

export { VirtualSubnetList };