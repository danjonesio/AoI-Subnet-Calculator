"use client";

import React, { memo, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { SplitSubnet } from '@/lib/types';

interface SubnetAnalysisProps {
  subnet: SplitSubnet;
}

// Analysis component for subnet characteristics
const SubnetAnalysis = memo<SubnetAnalysisProps>(({ subnet }) => {
  // Calculate analysis data
  const analysis = useMemo(() => {
    const cidr = subnet.cidr;
    const totalHosts = subnet.totalHosts;
    const usableHosts = subnet.usableHosts;
    
    // Determine subnet size category
    let sizeCategory: 'very-small' | 'small' | 'medium' | 'large' | 'very-large';
    if (usableHosts <= 2) {
      sizeCategory = 'very-small';
    } else if (usableHosts <= 30) {
      sizeCategory = 'small';
    } else if (usableHosts <= 254) {
      sizeCategory = 'medium';
    } else if (usableHosts <= 65534) {
      sizeCategory = 'large';
    } else {
      sizeCategory = 'very-large';
    }

    // Determine common use cases
    const useCases: string[] = [];
    if (cidr >= 30) {
      useCases.push('Point-to-point links');
    }
    if (cidr === 29) {
      useCases.push('Small office networks');
    }
    if (cidr >= 24 && cidr <= 28) {
      useCases.push('Department networks', 'VLAN segments');
    }
    if (cidr >= 20 && cidr <= 23) {
      useCases.push('Branch office networks', 'Large departments');
    }
    if (cidr <= 19) {
      useCases.push('Campus networks', 'Large organizations');
    }

    // Calculate efficiency
    const efficiency = (usableHosts / totalHosts) * 100;

    // Determine splitting potential
    const canSplitInHalf = cidr < 31;
    const canSplitInQuarters = cidr < 30;
    const canSplitInEighths = cidr < 29;

    return {
      sizeCategory,
      useCases,
      efficiency,
      canSplitInHalf,
      canSplitInQuarters,
      canSplitInEighths,
      hostBits: 32 - cidr,
      networkBits: cidr
    };
  }, [subnet]);

  const getSizeCategoryColor = (category: typeof analysis.sizeCategory) => {
    switch (category) {
      case 'very-small': return 'destructive';
      case 'small': return 'secondary';
      case 'medium': return 'default';
      case 'large': return 'default';
      case 'very-large': return 'default';
      default: return 'default';
    }
  };

  const getSizeCategoryLabel = (category: typeof analysis.sizeCategory) => {
    switch (category) {
      case 'very-small': return 'Very Small';
      case 'small': return 'Small';
      case 'medium': return 'Medium';
      case 'large': return 'Large';
      case 'very-large': return 'Very Large';
      default: return 'Unknown';
    }
  };

  return (
    <div className="space-y-4">
      {/* Size Classification */}
      <div className="space-y-2">
        <div className="text-sm font-medium">Size Classification</div>
        <div className="flex items-center space-x-2">
          <Badge variant={getSizeCategoryColor(analysis.sizeCategory)}>
            {getSizeCategoryLabel(analysis.sizeCategory)}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {subnet.usableHosts.toLocaleString()} usable hosts
          </span>
        </div>
      </div>

      {/* Network Characteristics */}
      <div className="space-y-2">
        <div className="text-sm font-medium">Network Characteristics</div>
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <span className="text-muted-foreground">Network Bits:</span>
            <div>{analysis.networkBits}</div>
          </div>
          <div>
            <span className="text-muted-foreground">Host Bits:</span>
            <div>{analysis.hostBits}</div>
          </div>
          <div>
            <span className="text-muted-foreground">Address Efficiency:</span>
            <div>{analysis.efficiency.toFixed(1)}%</div>
          </div>
          <div>
            <span className="text-muted-foreground">IP Version:</span>
            <div className="uppercase">{subnet.ipVersion}</div>
          </div>
        </div>
      </div>

      {/* Common Use Cases */}
      {analysis.useCases.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-medium">Common Use Cases</div>
          <div className="flex flex-wrap gap-1">
            {analysis.useCases.map((useCase, index) => (
              <Badge key={index} variant="outline" className="text-xs">
                {useCase}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Splitting Potential */}
      <div className="space-y-2">
        <div className="text-sm font-medium">Splitting Potential</div>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span>Can split in half:</span>
            <Badge variant={analysis.canSplitInHalf ? 'default' : 'secondary'}>
              {analysis.canSplitInHalf ? 'Yes' : 'No'}
            </Badge>
          </div>
          <div className="flex justify-between">
            <span>Can split in quarters:</span>
            <Badge variant={analysis.canSplitInQuarters ? 'default' : 'secondary'}>
              {analysis.canSplitInQuarters ? 'Yes' : 'No'}
            </Badge>
          </div>
          <div className="flex justify-between">
            <span>Can split in eighths:</span>
            <Badge variant={analysis.canSplitInEighths ? 'default' : 'secondary'}>
              {analysis.canSplitInEighths ? 'Yes' : 'No'}
            </Badge>
          </div>
        </div>
      </div>

      {/* IPv6 Specific Analysis */}
      {subnet.ipVersion === 'ipv6' && subnet.ipv6Info && (
        <div className="space-y-2">
          <div className="text-sm font-medium">IPv6 Analysis</div>
          <div className="grid grid-cols-1 gap-2 text-xs">
            <div className="flex justify-between">
              <span>Address Type:</span>
              <Badge variant="outline">{subnet.ipv6Info.addressType}</Badge>
            </div>
            <div className="flex justify-between">
              <span>Total Addresses:</span>
              <span className="font-mono">{subnet.ipv6Info.totalAddressesFormatted}</span>
            </div>
            <div className="flex justify-between">
              <span>Usable Addresses:</span>
              <span className="font-mono">{subnet.ipv6Info.usableAddressesFormatted}</span>
            </div>
          </div>
        </div>
      )}

      {/* Cloud Provider Analysis */}
      {subnet.cloudReserved && subnet.cloudReserved.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-medium">Cloud Provider Impact</div>
          <div className="text-xs text-muted-foreground">
            <div>Reserved addresses: {subnet.cloudReserved.length}</div>
            <div>Available for hosts: {subnet.usableHosts.toLocaleString()}</div>
            <div className="mt-1">
              <span className="font-medium">Note:</span> Cloud providers reserve specific 
              IP addresses for network infrastructure and services.
            </div>
          </div>
        </div>
      )}

      {/* Recommendations */}
      <div className="space-y-2">
        <div className="text-sm font-medium">Recommendations</div>
        <div className="text-xs text-muted-foreground space-y-1">
          {analysis.sizeCategory === 'very-small' && (
            <div>• Consider if this subnet size meets your requirements</div>
          )}
          {analysis.efficiency < 50 && (
            <div>• Low address efficiency - consider using a larger CIDR prefix</div>
          )}
          {subnet.cidr <= 16 && (
            <div>• Large subnet - consider splitting for better network management</div>
          )}
          {subnet.cidr >= 30 && (
            <div>• Very small subnet - suitable for point-to-point connections</div>
          )}
          {subnet.level > 0 && (
            <div>• This is a split subnet at level {subnet.level}</div>
          )}
        </div>
      </div>
    </div>
  );
});

SubnetAnalysis.displayName = 'SubnetAnalysis';

export { SubnetAnalysis };