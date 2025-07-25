"use client";

import React, { memo, useMemo } from 'react';
import { SplitSubnet } from '@/lib/types';

interface SubnetChartProps {
  subnet: SplitSubnet;
}

// Simple visual representation of subnet address space
const SubnetChart = memo<SubnetChartProps>(({ subnet }) => {
  // Calculate visual representation data
  const chartData = useMemo(() => {
    const totalHosts = subnet.totalHosts;
    const usableHosts = subnet.usableHosts;
    const reservedHosts = totalHosts - usableHosts;
    
    // Calculate percentages for visual representation
    const usablePercentage = (usableHosts / totalHosts) * 100;
    const reservedPercentage = (reservedHosts / totalHosts) * 100;
    
    return {
      totalHosts,
      usableHosts,
      reservedHosts,
      usablePercentage,
      reservedPercentage
    };
  }, [subnet]);

  return (
    <div className="space-y-4">
      {/* Address Space Visualization */}
      <div className="space-y-2">
        <div className="text-sm font-medium">Address Space Distribution</div>
        <div className="w-full bg-muted rounded-lg overflow-hidden">
          <div className="flex h-8">
            <div 
              className="bg-primary flex items-center justify-center text-xs text-primary-foreground"
              style={{ width: `${chartData.usablePercentage}%` }}
              title={`Usable hosts: ${chartData.usableHosts.toLocaleString()}`}
            >
              {chartData.usablePercentage > 20 && 'Usable'}
            </div>
            <div 
              className="bg-muted-foreground/30 flex items-center justify-center text-xs"
              style={{ width: `${chartData.reservedPercentage}%` }}
              title={`Reserved addresses: ${chartData.reservedHosts.toLocaleString()}`}
            >
              {chartData.reservedPercentage > 20 && 'Reserved'}
            </div>
          </div>
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Network: {subnet.network}</span>
          <span>Broadcast: {subnet.broadcast}</span>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="text-center p-3 bg-muted/50 rounded-lg">
          <div className="text-lg font-semibold text-primary">
            {chartData.usableHosts.toLocaleString()}
          </div>
          <div className="text-muted-foreground">Usable Hosts</div>
        </div>
        <div className="text-center p-3 bg-muted/50 rounded-lg">
          <div className="text-lg font-semibold">
            {chartData.totalHosts.toLocaleString()}
          </div>
          <div className="text-muted-foreground">Total Addresses</div>
        </div>
      </div>

      {/* CIDR Information */}
      <div className="space-y-2">
        <div className="text-sm font-medium">CIDR Information</div>
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <span className="text-muted-foreground">Prefix Length:</span>
            <div className="font-mono">/{subnet.cidr}</div>
          </div>
          <div>
            <span className="text-muted-foreground">Host Bits:</span>
            <div className="font-mono">{32 - subnet.cidr}</div>
          </div>
        </div>
      </div>
    </div>
  );
});

SubnetChart.displayName = 'SubnetChart';

export { SubnetChart };