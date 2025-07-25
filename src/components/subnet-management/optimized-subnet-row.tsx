"use client";

import React, { memo, useCallback, useState } from 'react';
import {
  TableCell,
  TableRow,
} from '@/components/ui/table';
import {
  Checkbox
} from '@/components/ui/checkbox';
import {
  Button
} from '@/components/ui/button';
import {
  Copy,
  Info,
  Loader2
} from 'lucide-react';
import { SplitSubnet } from '@/lib/types';

interface OptimizedSubnetRowProps {
  subnet: SplitSubnet;
  isSelected: boolean;
  onSelectionChange: (subnetId: string, checked: boolean) => void;
  onCopySubnet?: (subnet: SplitSubnet) => void;
  onSubnetDetails?: (subnet: SplitSubnet) => void;
  showSelection?: boolean;
  showActions?: boolean;
  showExtendedColumns?: boolean;
}

// Memoized subnet row component for optimal rendering performance
const OptimizedSubnetRow = memo<OptimizedSubnetRowProps>(({
  subnet,
  isSelected,
  onSelectionChange,
  onCopySubnet,
  onSubnetDetails,
  showSelection = true,
  showActions = true,
  showExtendedColumns = true
}) => {
  const [copyingSubnet, setCopyingSubnet] = useState<boolean>(false);

  // Memoized selection handler
  const handleSelectionChange = useCallback((checked: boolean) => {
    onSelectionChange(subnet.id, checked);
  }, [subnet.id, onSelectionChange]);

  // Memoized copy handler with loading state
  const handleCopySubnet = useCallback(async () => {
    if (!onCopySubnet) return;
    
    setCopyingSubnet(true);
    try {
      await onCopySubnet(subnet);
    } finally {
      setCopyingSubnet(false);
    }
  }, [subnet, onCopySubnet]);

  // Memoized details handler
  const handleSubnetDetails = useCallback(() => {
    if (onSubnetDetails) {
      onSubnetDetails(subnet);
    }
  }, [subnet, onSubnetDetails]);

  return (
    <TableRow 
      className={isSelected ? 'bg-muted/50' : ''}
      data-subnet-id={subnet.id}
    >
      {showSelection && (
        <TableCell>
          <Checkbox
            checked={isSelected}
            onCheckedChange={handleSelectionChange}
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
      {showExtendedColumns && (
        <>
          <TableCell className="font-mono text-sm hidden lg:table-cell">
            {subnet.firstHost}
          </TableCell>
          <TableCell className="font-mono text-sm hidden lg:table-cell">
            {subnet.lastHost}
          </TableCell>
        </>
      )}
      {showActions && (
        <TableCell>
          <div className="flex space-x-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopySubnet}
              title="Copy subnet information"
              disabled={copyingSubnet}
            >
              {copyingSubnet ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
            {onSubnetDetails && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSubnetDetails}
                title="View subnet details"
              >
                <Info className="h-4 w-4" />
              </Button>
            )}
          </div>
        </TableCell>
      )}
    </TableRow>
  );
});

OptimizedSubnetRow.displayName = 'OptimizedSubnetRow';

export { OptimizedSubnetRow };