"use client";

import React, { 
  memo, 
  useState, 
  useEffect, 
  useCallback, 
  Suspense,
  lazy,
  useMemo
} from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Button
} from '@/components/ui/button';
import {
  Badge
} from '@/components/ui/badge';
import {
  Skeleton
} from '@/components/ui/skeleton';
import {
  Loader2,
  Network,
  Info,
  Copy,
  Eye,
  EyeOff
} from 'lucide-react';
import { SplitSubnet } from '@/lib/types';

// Lazy loaded components for better performance
const LazySubnetChart = lazy(() => 
  import('./subnet-chart').then(module => ({ default: module.SubnetChart }))
);

const LazySubnetAnalysis = lazy(() => 
  import('./subnet-analysis').then(module => ({ default: module.SubnetAnalysis }))
);

interface LazySubnetDetailsProps {
  subnet: SplitSubnet;
  onClose?: () => void;
  showChart?: boolean;
  showAnalysis?: boolean;
  autoLoad?: boolean;
  className?: string;
}

interface SubnetDetailSection {
  id: string;
  title: string;
  component: React.ComponentType<{ subnet: SplitSubnet }>;
  loaded: boolean;
  loading: boolean;
  error: string | null;
}

// Loading skeleton for subnet details
const SubnetDetailsSkeleton = memo(() => (
  <div className="space-y-4">
    <div className="grid grid-cols-2 gap-4">
      <Skeleton className="h-20" />
      <Skeleton className="h-20" />
    </div>
    <Skeleton className="h-32" />
    <div className="grid grid-cols-3 gap-4">
      <Skeleton className="h-16" />
      <Skeleton className="h-16" />
      <Skeleton className="h-16" />
    </div>
  </div>
));

SubnetDetailsSkeleton.displayName = 'SubnetDetailsSkeleton';

// Error boundary for lazy loaded components
class LazyLoadErrorBoundary extends React.Component<
  { children: React.ReactNode; onError?: (error: Error) => void },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode; onError?: (error: Error) => void }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Lazy load error:', error, errorInfo);
    this.props.onError?.(error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="text-center py-8 text-muted-foreground">
          <Info className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Failed to load component</p>
          <p className="text-sm mt-2">
            {this.state.error?.message || 'Unknown error occurred'}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Retry
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

const LazySubnetDetails = memo<LazySubnetDetailsProps>(({
  subnet,
  onClose,
  showChart = true,
  showAnalysis = true,
  autoLoad = false,
  className = ''
}) => {
  const [loadedSections, setLoadedSections] = useState<Set<string>>(new Set());
  const [loadingSections, setLoadingSections] = useState<Set<string>>(new Set());
  const [errorSections, setErrorSections] = useState<Map<string, string>>(new Map());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    autoLoad ? new Set(['basic', 'chart', 'analysis']) : new Set(['basic'])
  );

  // Memoized basic subnet information
  const basicInfo = useMemo(() => ({
    network: `${subnet.network}/${subnet.cidr}`,
    broadcast: subnet.broadcast,
    firstHost: subnet.firstHost,
    lastHost: subnet.lastHost,
    totalHosts: subnet.totalHosts.toLocaleString(),
    usableHosts: subnet.usableHosts.toLocaleString(),
    ipVersion: subnet.ipVersion,
    level: subnet.level,
    parentId: subnet.parentId
  }), [subnet]);

  // Handle section loading
  const loadSection = useCallback(async (sectionId: string) => {
    if (loadedSections.has(sectionId) || loadingSections.has(sectionId)) {
      return;
    }

    setLoadingSections(prev => new Set(prev).add(sectionId));
    setErrorSections(prev => {
      const newMap = new Map(prev);
      newMap.delete(sectionId);
      return newMap;
    });

    try {
      // Simulate async loading with a small delay for better UX
      await new Promise(resolve => setTimeout(resolve, 100));
      
      setLoadedSections(prev => new Set(prev).add(sectionId));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load section';
      setErrorSections(prev => new Map(prev).set(sectionId, errorMessage));
    } finally {
      setLoadingSections(prev => {
        const newSet = new Set(prev);
        newSet.delete(sectionId);
        return newSet;
      });
    }
  }, [loadedSections, loadingSections]);

  // Handle section expansion
  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sectionId)) {
        newSet.delete(sectionId);
      } else {
        newSet.add(sectionId);
        // Load section when expanded
        loadSection(sectionId);
      }
      return newSet;
    });
  }, [loadSection]);

  // Auto-load sections on mount if enabled
  useEffect(() => {
    if (autoLoad) {
      ['basic', 'chart', 'analysis'].forEach(sectionId => {
        loadSection(sectionId);
      });
    } else {
      // Always load basic info
      loadSection('basic');
    }
  }, [autoLoad, loadSection]);

  // Copy subnet information
  const handleCopySubnet = useCallback(async () => {
    try {
      const subnetInfo = `Network: ${subnet.network}/${subnet.cidr}
Broadcast: ${subnet.broadcast}
First Host: ${subnet.firstHost}
Last Host: ${subnet.lastHost}
Total Hosts: ${subnet.totalHosts.toLocaleString()}
Usable Hosts: ${subnet.usableHosts.toLocaleString()}`;

      await navigator.clipboard.writeText(subnetInfo);
    } catch (error) {
      console.error('Failed to copy subnet information:', error);
    }
  }, [subnet]);

  return (
    <Card className={`${className} rounded-lg shadow-md`}>
      <CardHeader className="p-6 pb-4">
        <CardTitle className="text-lg font-medium flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Network className="h-5 w-5" />
            <span>Subnet Details</span>
            <Badge variant="outline" className="font-mono text-xs">
              {basicInfo.network}
            </Badge>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopySubnet}
              title="Copy subnet information"
            >
              <Copy className="h-4 w-4" />
            </Button>
            {onClose && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                title="Close details"
              >
                ×
              </Button>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        {/* Basic Information Section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">Basic Information</h4>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toggleSection('basic')}
              className="h-6 w-6 p-0"
            >
              {expandedSections.has('basic') ? (
                <EyeOff className="h-3 w-3" />
              ) : (
                <Eye className="h-3 w-3" />
              )}
            </Button>
          </div>
          
          {expandedSections.has('basic') && (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Network:</span>
                <div className="font-mono">{basicInfo.network}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Broadcast:</span>
                <div className="font-mono">{basicInfo.broadcast}</div>
              </div>
              <div>
                <span className="text-muted-foreground">First Host:</span>
                <div className="font-mono">{basicInfo.firstHost}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Last Host:</span>
                <div className="font-mono">{basicInfo.lastHost}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Total Hosts:</span>
                <div>{basicInfo.totalHosts}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Usable Hosts:</span>
                <div>{basicInfo.usableHosts}</div>
              </div>
              {subnet.ipVersion === 'ipv6' && subnet.ipv6Info && (
                <>
                  <div>
                    <span className="text-muted-foreground">Address Type:</span>
                    <div>{subnet.ipv6Info.addressType}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Host Bits:</span>
                    <div>{subnet.ipv6Info.hostBits}</div>
                  </div>
                </>
              )}
              {subnet.level > 0 && (
                <div>
                  <span className="text-muted-foreground">Hierarchy Level:</span>
                  <div>{subnet.level}</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Cloud Reserved IPs Section */}
        {subnet.cloudReserved && subnet.cloudReserved.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Cloud Reserved IPs</h4>
            <div className="space-y-1">
              {subnet.cloudReserved.map((reservation, index) => (
                <div key={index} className="flex justify-between text-xs">
                  <span className="font-mono">{reservation.ip}</span>
                  <span className="text-muted-foreground">
                    {reservation.purpose}: {reservation.description}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Chart Section */}
        {showChart && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">Visual Representation</h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => toggleSection('chart')}
                className="h-6 w-6 p-0"
              >
                {expandedSections.has('chart') ? (
                  <EyeOff className="h-3 w-3" />
                ) : (
                  <Eye className="h-3 w-3" />
                )}
              </Button>
            </div>
            
            {expandedSections.has('chart') && (
              <LazyLoadErrorBoundary>
                <Suspense fallback={<SubnetDetailsSkeleton />}>
                  {loadingSections.has('chart') ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin mr-2" />
                      <span className="text-sm">Loading chart...</span>
                    </div>
                  ) : errorSections.has('chart') ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <p className="text-sm">Failed to load chart</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => loadSection('chart')}
                      >
                        Retry
                      </Button>
                    </div>
                  ) : loadedSections.has('chart') ? (
                    <LazySubnetChart subnet={subnet} />
                  ) : null}
                </Suspense>
              </LazyLoadErrorBoundary>
            )}
          </div>
        )}

        {/* Analysis Section */}
        {showAnalysis && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">Analysis</h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => toggleSection('analysis')}
                className="h-6 w-6 p-0"
              >
                {expandedSections.has('analysis') ? (
                  <EyeOff className="h-3 w-3" />
                ) : (
                  <Eye className="h-3 w-3" />
                )}
              </Button>
            </div>
            
            {expandedSections.has('analysis') && (
              <LazyLoadErrorBoundary>
                <Suspense fallback={<SubnetDetailsSkeleton />}>
                  {loadingSections.has('analysis') ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin mr-2" />
                      <span className="text-sm">Loading analysis...</span>
                    </div>
                  ) : errorSections.has('analysis') ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <p className="text-sm">Failed to load analysis</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => loadSection('analysis')}
                      >
                        Retry
                      </Button>
                    </div>
                  ) : loadedSections.has('analysis') ? (
                    <LazySubnetAnalysis subnet={subnet} />
                  ) : null}
                </Suspense>
              </LazyLoadErrorBoundary>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
});

LazySubnetDetails.displayName = 'LazySubnetDetails';

export { LazySubnetDetails };