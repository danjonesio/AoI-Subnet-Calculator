/**
 * Performance Optimization Utilities
 * 
 * This module provides performance optimization features including:
 * - Memoization for subnet calculations
 * - Debounced input handling
 * - Progressive calculation for large operations
 * - Performance monitoring and warnings
 */

import { SubnetInfo, SplitOptions, CloudMode, IPVersion, PerformanceMetrics } from './types';

// Memoization cache for subnet calculations
interface MemoizedCalculation {
  key: string;
  result: unknown;
  timestamp: number;
  accessCount: number;
}

class CalculationCache {
  private cache = new Map<string, MemoizedCalculation>();
  private maxCacheSize = 100;
  private maxCacheAge = 5 * 60 * 1000; // 5 minutes

  /**
   * Generates a cache key for subnet calculations
   */
  private generateKey(
    parentSubnet: SubnetInfo,
    splitOptions: SplitOptions | null,
    cloudMode: CloudMode,
    ipVersion: IPVersion
  ): string {
    const keyData = {
      network: parentSubnet.network,
      cidr: parentSubnet.cidr,
      splitType: splitOptions?.splitType || null,
      splitCount: splitOptions?.splitCount || null,
      customCidr: splitOptions?.customCidr || null,
      maxResults: splitOptions?.maxResults || null,
      cloudMode,
      ipVersion
    };
    return JSON.stringify(keyData);
  }

  /**
   * Gets cached calculation result if available and valid
   */
  get<T>(
    parentSubnet: SubnetInfo,
    splitOptions: SplitOptions,
    cloudMode: CloudMode,
    ipVersion: IPVersion
  ): T | null {
    const key = this.generateKey(parentSubnet, splitOptions, cloudMode, ipVersion);
    const cached = this.cache.get(key);

    if (!cached) {
      return null;
    }

    // Check if cache entry is expired
    if (Date.now() - cached.timestamp > this.maxCacheAge) {
      this.cache.delete(key);
      return null;
    }

    // Update access count and timestamp
    cached.accessCount++;
    cached.timestamp = Date.now();

    return cached.result as T;
  }

  /**
   * Stores calculation result in cache
   */
  set<T>(
    parentSubnet: SubnetInfo,
    splitOptions: SplitOptions,
    cloudMode: CloudMode,
    ipVersion: IPVersion,
    result: T
  ): void {
    const key = this.generateKey(parentSubnet, splitOptions, cloudMode, ipVersion);

    // Clean up old entries if cache is full
    if (this.cache.size >= this.maxCacheSize) {
      this.cleanupCache();
    }

    this.cache.set(key, {
      key,
      result,
      timestamp: Date.now(),
      accessCount: 1
    });
  }

  /**
   * Cleans up old and least-used cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    const entries = Array.from(this.cache.entries());

    // Remove expired entries first
    entries.forEach(([key, entry]) => {
      if (now - entry.timestamp > this.maxCacheAge) {
        this.cache.delete(key);
      }
    });

    // If still over limit, remove least recently used entries
    if (this.cache.size >= this.maxCacheSize) {
      const sortedEntries = entries
        .filter(([key]) => this.cache.has(key)) // Only include non-expired entries
        .sort((a, b) => {
          // Sort by access count (ascending) then by timestamp (ascending)
          if (a[1].accessCount !== b[1].accessCount) {
            return a[1].accessCount - b[1].accessCount;
          }
          return a[1].timestamp - b[1].timestamp;
        });

      // Remove oldest/least-used entries
      const entriesToRemove = sortedEntries.slice(0, Math.floor(this.maxCacheSize * 0.3));
      entriesToRemove.forEach(([key]) => this.cache.delete(key));
    }
  }

  /**
   * Clears all cached calculations
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Gets cache statistics for monitoring
   */
  getStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    oldestEntry: number;
  } {
    const entries = Array.from(this.cache.values());
    const now = Date.now();
    
    const totalAccesses = entries.reduce((sum, entry) => sum + entry.accessCount, 0);
    const cacheHits = entries.reduce((sum, entry) => sum + (entry.accessCount - 1), 0);
    const hitRate = totalAccesses > 0 ? (cacheHits / totalAccesses) * 100 : 0;
    
    const oldestEntry = entries.length > 0 
      ? Math.min(...entries.map(entry => now - entry.timestamp))
      : 0;

    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      hitRate: Math.round(hitRate * 100) / 100,
      oldestEntry
    };
  }
}

// Global cache instance
const calculationCache = new CalculationCache();

/**
 * Memoized subnet calculation wrapper
 */
export function memoizedCalculation<T>(
  parentSubnet: SubnetInfo,
  splitOptions: SplitOptions | null,
  cloudMode: CloudMode,
  ipVersion: IPVersion,
  calculationFn: () => T
): T {
  // Skip caching for null split options to avoid errors
  if (!splitOptions) {
    return calculationFn();
  }

  // Try to get from cache first
  const cached = calculationCache.get<T>(parentSubnet, splitOptions, cloudMode, ipVersion);
  if (cached !== null) {
    return cached;
  }

  // Perform calculation and cache result
  const result = calculationFn();
  calculationCache.set(parentSubnet, splitOptions, cloudMode, ipVersion, result);

  return result;
}

/**
 * Debounced function utility
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      func(...args);
      timeoutId = null;
    }, delay);
  };
}

/**
 * Throttled function utility for high-frequency events
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  let timeoutId: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    const now = Date.now();

    if (now - lastCall >= delay) {
      lastCall = now;
      func(...args);
    } else if (timeoutId === null) {
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        func(...args);
        timeoutId = null;
      }, delay - (now - lastCall));
    }
  };
}

/**
 * Progressive calculation for large subnet operations
 */
export class ProgressiveCalculator {
  private batchSize: number;
  private delay: number;
  private onProgress?: (progress: number, batch: unknown[]) => void;
  private onComplete?: (results: unknown[]) => void;
  private onError?: (error: Error) => void;
  private cancelled = false;

  constructor(options: {
    batchSize?: number;
    delay?: number;
    onProgress?: (progress: number, batch: unknown[]) => void;
    onComplete?: (results: unknown[]) => void;
    onError?: (error: Error) => void;
  } = {}) {
    this.batchSize = options.batchSize || 50;
    this.delay = options.delay || 10; // 10ms delay between batches
    this.onProgress = options.onProgress;
    this.onComplete = options.onComplete;
    this.onError = options.onError;
  }

  /**
   * Processes items in batches with progress callbacks
   */
  async process<T, R>(
    items: T[],
    processFn: (item: T, index: number) => R
  ): Promise<R[]> {
    const results: R[] = [];
    const totalItems = items.length;
    let processedItems = 0;

    try {
      for (let i = 0; i < totalItems; i += this.batchSize) {
        if (this.cancelled) {
          throw new Error('Calculation cancelled');
        }

        const batch = items.slice(i, i + this.batchSize);
        const batchResults: R[] = [];

        // Process batch
        for (let j = 0; j < batch.length; j++) {
          const item = batch[j];
          const globalIndex = i + j;
          const result = processFn(item, globalIndex);
          batchResults.push(result);
          processedItems++;
        }

        results.push(...batchResults);

        // Report progress
        const progress = (processedItems / totalItems) * 100;
        if (this.onProgress) {
          this.onProgress(progress, batchResults);
        }

        // Add delay between batches to prevent UI blocking
        if (i + this.batchSize < totalItems && this.delay > 0) {
          await new Promise(resolve => setTimeout(resolve, this.delay));
        }
      }

      if (this.onComplete) {
        this.onComplete(results);
      }

      return results;
    } catch (error) {
      if (this.onError) {
        this.onError(error instanceof Error ? error : new Error('Unknown error'));
      }
      throw error;
    }
  }

  /**
   * Cancels the progressive calculation
   */
  cancel(): void {
    this.cancelled = true;
  }

  /**
   * Resets the calculator for reuse
   */
  reset(): void {
    this.cancelled = false;
  }
}

/**
 * Performance monitor for tracking operation performance
 */
export class PerformanceMonitor {
  private metrics: PerformanceMetrics[] = [];
  private maxMetrics = 100;

  /**
   * Starts performance monitoring for an operation
   */
  startOperation(operationType: string): {
    end: () => PerformanceMetrics;
    addMetadata: (metadata: Record<string, unknown>) => void;
  } {
    const startTime = performance.now();
    const startMemory = this.getMemoryUsage();
    let metadata: Record<string, unknown> = {};

    return {
      end: (): PerformanceMetrics => {
        const endTime = performance.now();
        const endMemory = this.getMemoryUsage();
        
        const metrics: PerformanceMetrics = {
          operationType,
          startTime,
          endTime,
          duration: endTime - startTime,
          memoryBefore: startMemory,
          memoryAfter: endMemory,
          itemsProcessed: (metadata.itemsProcessed as number) || 0,
          ...metadata
        };

        this.addMetrics(metrics);
        return metrics;
      },
      addMetadata: (newMetadata: Record<string, unknown>) => {
        metadata = { ...metadata, ...newMetadata };
      }
    };
  }

  /**
   * Gets current memory usage (if available)
   */
  private getMemoryUsage(): number | undefined {
    if (typeof performance !== 'undefined' && 'memory' in performance) {
      return (performance as { memory?: { usedJSHeapSize?: number } }).memory?.usedJSHeapSize;
    }
    return undefined;
  }

  /**
   * Adds metrics to the collection
   */
  private addMetrics(metrics: PerformanceMetrics): void {
    this.metrics.push(metrics);

    // Keep only the most recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics = this.metrics.slice(-this.maxMetrics);
    }
  }

  /**
   * Gets performance statistics
   */
  getStats(operationType?: string): {
    averageDuration: number;
    minDuration: number;
    maxDuration: number;
    totalOperations: number;
    slowOperations: number;
    memoryTrend?: 'increasing' | 'decreasing' | 'stable';
    recommendations: string[];
  } {
    const filteredMetrics = operationType 
      ? this.metrics.filter(m => m.operationType === operationType)
      : this.metrics;

    if (filteredMetrics.length === 0) {
      return {
        averageDuration: 0,
        minDuration: 0,
        maxDuration: 0,
        totalOperations: 0,
        slowOperations: 0,
        recommendations: []
      };
    }

    const durations = filteredMetrics.map(m => m.duration);
    const averageDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const minDuration = Math.min(...durations);
    const maxDuration = Math.max(...durations);
    const slowOperations = durations.filter(d => d > 1000).length; // Operations > 1 second

    // Memory trend analysis
    let memoryTrend: 'increasing' | 'decreasing' | 'stable' | undefined;
    const memoryMetrics = filteredMetrics
      .filter(m => m.memoryBefore !== undefined && m.memoryAfter !== undefined)
      .slice(-10); // Last 10 operations

    if (memoryMetrics.length >= 3) {
      const memoryChanges = memoryMetrics.map(m => (m.memoryAfter! - m.memoryBefore!));
      const avgMemoryChange = memoryChanges.reduce((sum, c) => sum + c, 0) / memoryChanges.length;
      
      if (avgMemoryChange > 1024 * 1024) { // > 1MB average increase
        memoryTrend = 'increasing';
      } else if (avgMemoryChange < -1024 * 1024) { // > 1MB average decrease
        memoryTrend = 'decreasing';
      } else {
        memoryTrend = 'stable';
      }
    }

    // Generate recommendations
    const recommendations: string[] = [];
    
    if (averageDuration > 500) {
      recommendations.push('Consider using progressive calculation for better responsiveness');
    }
    
    if (slowOperations > filteredMetrics.length * 0.2) {
      recommendations.push('High number of slow operations detected - consider optimizing calculations');
    }
    
    if (memoryTrend === 'increasing') {
      recommendations.push('Memory usage is increasing - check for memory leaks');
    }
    
    if (maxDuration > 5000) {
      recommendations.push('Very slow operations detected - consider breaking into smaller batches');
    }

    return {
      averageDuration: Math.round(averageDuration),
      minDuration: Math.round(minDuration),
      maxDuration: Math.round(maxDuration),
      totalOperations: filteredMetrics.length,
      slowOperations,
      memoryTrend,
      recommendations
    };
  }

  /**
   * Clears all performance metrics
   */
  clear(): void {
    this.metrics = [];
  }

  /**
   * Gets recent metrics for debugging
   */
  getRecentMetrics(count: number = 10): PerformanceMetrics[] {
    return this.metrics.slice(-count);
  }
}

// Global performance monitor instance
export const performanceMonitor = new PerformanceMonitor();

/**
 * Performance warning thresholds
 */
export const PERFORMANCE_THRESHOLDS = {
  SLOW_OPERATION: 1000, // 1 second
  VERY_SLOW_OPERATION: 5000, // 5 seconds
  LARGE_SUBNET_COUNT: 500,
  VERY_LARGE_SUBNET_COUNT: 1000,
  HIGH_MEMORY_USAGE: 50 * 1024 * 1024, // 50MB
  MEMORY_LEAK_THRESHOLD: 10 * 1024 * 1024 // 10MB increase
};

/**
 * Checks if an operation should show performance warnings
 */
export function shouldShowPerformanceWarning(
  operationType: string,
  itemCount: number,
  duration?: number
): {
  shouldWarn: boolean;
  warningType: 'slow' | 'large' | 'memory' | null;
  message: string;
  suggestions: string[];
} {
  const suggestions: string[] = [];
  let warningType: 'slow' | 'large' | 'memory' | null = null;
  let message = '';

  // Check for slow operations
  if (duration && duration > PERFORMANCE_THRESHOLDS.SLOW_OPERATION) {
    warningType = 'slow';
    if (duration > PERFORMANCE_THRESHOLDS.VERY_SLOW_OPERATION) {
      message = `Very slow ${operationType} operation (${Math.round(duration)}ms)`;
      suggestions.push('Consider breaking this operation into smaller batches');
      suggestions.push('Enable progressive calculation for better user experience');
    } else {
      message = `Slow ${operationType} operation (${Math.round(duration)}ms)`;
      suggestions.push('Consider optimizing this operation for better performance');
    }
  }

  // Check for large subnet counts
  if (itemCount > PERFORMANCE_THRESHOLDS.LARGE_SUBNET_COUNT) {
    warningType = 'large';
    if (itemCount > PERFORMANCE_THRESHOLDS.VERY_LARGE_SUBNET_COUNT) {
      message = `Very large ${operationType} with ${itemCount} items`;
      suggestions.push('Consider using virtual scrolling for better UI performance');
      suggestions.push('Enable pagination to limit displayed results');
    } else {
      message = `Large ${operationType} with ${itemCount} items`;
      suggestions.push('Performance may be impacted with this many items');
    }
  }

  return {
    shouldWarn: warningType !== null,
    warningType,
    message,
    suggestions
  };
}

/**
 * Utility to clear all performance caches and reset monitoring
 */
export function resetPerformanceOptimizations(): void {
  calculationCache.clear();
  performanceMonitor.clear();
}

/**
 * Gets comprehensive performance statistics
 */
export function getPerformanceStats(): {
  cache: ReturnType<CalculationCache['getStats']>;
  monitor: ReturnType<PerformanceMonitor['getStats']>;
  recommendations: string[];
} {
  const cacheStats = calculationCache.getStats();
  const monitorStats = performanceMonitor.getStats();
  
  const recommendations: string[] = [];
  
  // Cache recommendations
  if (cacheStats.hitRate < 20) {
    recommendations.push('Low cache hit rate - consider adjusting calculation parameters');
  }
  
  if (cacheStats.size === cacheStats.maxSize) {
    recommendations.push('Cache is full - consider increasing cache size for better performance');
  }

  // Combine monitor recommendations
  recommendations.push(...monitorStats.recommendations);

  return {
    cache: cacheStats,
    monitor: monitorStats,
    recommendations: [...new Set(recommendations)] // Remove duplicates
  };
}