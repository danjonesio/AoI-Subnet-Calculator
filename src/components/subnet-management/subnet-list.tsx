"use client";

import React, { useState, useMemo, useCallback } from 'react';
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
  X
} from 'lucide-react';
import { SplitSubnet } from '@/lib/types';

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

export function SubnetList({
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
}: SubnetListProps) {
  const [internalSortBy, setInternalSortBy] = useState<SortField | null>(null);
  const [internalSortOrder, setInternalSortOrder] = useState<'asc' | 'desc'>('asc');
  const [internalFilterText, setInternalFilterText] = useState<string>(filterText);

  // Handle sorting
  const handleSort = useCallback((field: SortField) => {
    let newOrder: 'asc' | 'desc';
    if (internalSortBy === field) {
      // If clicking the same field, toggle the order
      newOrder = internalSortOrder === 'asc' ? 'desc' : 'asc';
    } else {
      // If clicking a different field, start with ascending
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

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          <span>Loading subnets...</span>
        </CardContent>
      </Card>
    );
  }

  if (subnets.length === 0) {
    return (
      <Card className={className}>
        <CardContent className="text-center py-8 text-muted-foreground">
          No subnets to display
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Subnet List ({subnets.length} subnets)</span>
          {showSelection && selectedSubnets.size > 0 && (
            <span className="text-sm font-normal text-muted-foreground">
              {selectedSubnets.size} selected
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
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

        {/* Desktop Table View */}
        <div className="hidden md:block rounded-md border overflow-x-auto">
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
                    className="h-auto p-0 font-semibold hover:bg-transparent"
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
                    className="h-auto p-0 font-semibold hover:bg-transparent"
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
                    className="h-auto p-0 font-semibold hover:bg-transparent"
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
                    className="h-auto p-0 font-semibold hover:bg-transparent"
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
                    className="h-auto p-0 font-semibold hover:bg-transparent"
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
            <TableBody>
              {sortedAndFilteredSubnets.map((subnet) => (
                <TableRow 
                  key={subnet.id}
                  className={selectedSubnets.has(subnet.id) ? 'bg-muted/50' : ''}
                >
                  {showSelection && (
                    <TableCell>
                      <Checkbox
                        checked={selectedSubnets.has(subnet.id)}
                        onCheckedChange={(checked) => 
                          handleSubnetSelection(subnet.id, checked as boolean)
                        }
                        aria-label={`Select subnet ${subnet.network}/${subnet.cidr}`}
                      />
                    </TableCell>
                  )}
                  <TableCell className="font-mono text-sm">
                    {subnet.network}
                  </TableCell>
                  <TableCell className="font-mono text-sm">
                    /{subnet.cidr}
                  </TableCell>
                  <TableCell className="text-sm">
                    {subnet.usableHosts.toLocaleString()}
                  </TableCell>
                  <TableCell className="font-mono text-sm hidden lg:table-cell">
                    {subnet.firstHost}
                  </TableCell>
                  <TableCell className="font-mono text-sm hidden lg:table-cell">
                    {subnet.lastHost}
                  </TableCell>
                  {showActions && (
                    <TableCell>
                      <div className="flex space-x-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopySubnet(subnet)}
                          title="Copy subnet information"
                        >
                          <Copy className="h-4 w-4" />
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
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
              <CardContent className="p-4">
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
                      >
                        <Copy className="h-4 w-4" />
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
      </CardContent>
    </Card>
  );
}