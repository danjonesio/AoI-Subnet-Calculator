/**
 * Unit tests for performance optimization utilities
 */

import {
  memoizedCalculation,
  debounce,
  throttle,
  ProgressiveCalculator,
  performanceMonitor,
  shouldShowPerformanceWarning,
  resetPerformanceOptimizations,
  getPerformanceStats,
  PERFORMANCE_THRESHOLDS
} from '../performance';
import { SubnetInfo, SplitOptions } from '../types';

describe('Performance Optimizations', () => {
  beforeEach(() => {
    resetPerformanceOptimizations();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Memoization', () => {
    it('should cache identical calculations', () => {
      const mockCalculation = jest.fn(() => ({ result: 'test' }));
      const parentSubnet: SubnetInfo = {
        network: '192.168.1.0',
        broadcast: '192.168.1.255',
        firstHost: '192.168.1.1',
        lastHost: '192.168.1.254',
        subnetMask: '255.255.255.0',
        wildcardMask: '0.0.0.255',
        totalHosts: 256,
        usableHosts: 254,
        cidr: '/24'
      };
      const splitOptions: SplitOptions = {
        splitType: 'equal',
        splitCount: 2
      };

      // First call should execute the function
      const result1 = memoizedCalculation(
        parentSubnet,
        splitOptions,
        'normal',
        'ipv4',
        mockCalculation
      );

      // Second call with identical parameters should return cached result
      const result2 = memoizedCalculation(
        parentSubnet,
        splitOptions,
        'normal',
        'ipv4',
        mockCalculation
      );

      expect(mockCalculation).toHaveBeenCalledTimes(1);
      expect(result1).toBe(result2);
    });

    it('should not cache different calculations', () => {
      const mockCalculation = jest.fn(() => ({ result: 'test' }));
      const parentSubnet: SubnetInfo = {
        network: '192.168.1.0',
        broadcast: '192.168.1.255',
        firstHost: '192.168.1.1',
        lastHost: '192.168.1.254',
        subnetMask: '255.255.255.0',
        wildcardMask: '0.0.0.255',
        totalHosts: 256,
        usableHosts: 254,
        cidr: '/24'
      };

      const splitOptions1: SplitOptions = { splitType: 'equal', splitCount: 2 };
      const splitOptions2: SplitOptions = { splitType: 'equal', splitCount: 4 };

      memoizedCalculation(parentSubnet, splitOptions1, 'normal', 'ipv4', mockCalculation);
      memoizedCalculation(parentSubnet, splitOptions2, 'normal', 'ipv4', mockCalculation);

      expect(mockCalculation).toHaveBeenCalledTimes(2);
    });
  });

  describe('Debounce', () => {
    it('should delay function execution', () => {
      const mockFn = jest.fn();
      const debouncedFn = debounce(mockFn, 300);

      debouncedFn('test');
      expect(mockFn).not.toHaveBeenCalled();

      jest.advanceTimersByTime(300);
      expect(mockFn).toHaveBeenCalledWith('test');
    });

    it('should cancel previous calls when called multiple times', () => {
      const mockFn = jest.fn();
      const debouncedFn = debounce(mockFn, 300);

      debouncedFn('first');
      debouncedFn('second');
      debouncedFn('third');

      jest.advanceTimersByTime(300);
      
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockFn).toHaveBeenCalledWith('third');
    });
  });

  describe('Throttle', () => {
    it('should limit function execution frequency', () => {
      const mockFn = jest.fn();
      const throttledFn = throttle(mockFn, 300);

      // First call should execute immediately
      throttledFn('first');
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(mockFn).toHaveBeenCalledWith('first');

      // Subsequent calls within the delay should be throttled
      throttledFn('second');
      expect(mockFn).toHaveBeenCalledTimes(1); // Still only 1 call

      // Advance time to trigger the throttled call
      jest.advanceTimersByTime(300);
      
      // Should have called the function with the second argument
      expect(mockFn).toHaveBeenCalledTimes(2);
      expect(mockFn).toHaveBeenLastCalledWith('second');
    });
  });

  describe('ProgressiveCalculator', () => {
    it('should process items in batches', async () => {
      // Use real timers for async operations
      jest.useRealTimers();
      
      const items = Array.from({ length: 20 }, (_, i) => i);
      const processFn = jest.fn((item: number) => item * 2);
      const onProgress = jest.fn();
      const onComplete = jest.fn();

      const calculator = new ProgressiveCalculator({
        batchSize: 5,
        delay: 0, // No delay for testing
        onProgress,
        onComplete
      });

      const results = await calculator.process(items, processFn);

      expect(results).toHaveLength(20);
      expect(results[0]).toBe(0);
      expect(results[19]).toBe(38);
      expect(onProgress).toHaveBeenCalled();
      expect(onComplete).toHaveBeenCalledWith(results);
      
      // Switch back to fake timers
      jest.useFakeTimers();
    });

    it('should handle cancellation', async () => {
      // Use real timers for async operations
      jest.useRealTimers();
      
      const items = Array.from({ length: 100 }, (_, i) => i);
      const processFn = jest.fn((item: number) => item * 2);
      const onError = jest.fn();

      const calculator = new ProgressiveCalculator({
        batchSize: 10,
        delay: 0,
        onError
      });

      calculator.cancel(); // Cancel before processing
      
      await expect(calculator.process(items, processFn)).rejects.toThrow('Calculation cancelled');
      expect(onError).toHaveBeenCalled();
      
      // Switch back to fake timers
      jest.useFakeTimers();
    });
  });

  describe('Performance Monitor', () => {
    it('should track operation performance', () => {
      // Use real timers for this test since we need actual performance measurement
      jest.useRealTimers();
      
      const operation = performanceMonitor.startOperation('test_operation');
      operation.addMetadata({ itemsProcessed: 100 });
      
      // Small delay to ensure some time passes
      const start = performance.now();
      // Simple operation instead of busy wait
      let sum = 0;
      for (let i = 0; i < 1000; i++) {
        sum += i;
      }
      
      const metrics = operation.end();

      expect(metrics.operationType).toBe('test_operation');
      expect(metrics.duration).toBeGreaterThanOrEqual(0);
      expect(metrics.itemsProcessed).toBe(100);
      
      // Switch back to fake timers
      jest.useFakeTimers();
    });

    it('should provide performance statistics', () => {
      // Use real timers for this test
      jest.useRealTimers();
      
      // Create some test operations
      for (let i = 0; i < 5; i++) {
        const operation = performanceMonitor.startOperation('test_op');
        operation.addMetadata({ itemsProcessed: i * 10 });
        // Small computation to ensure some time passes
        let sum = 0;
        for (let j = 0; j < 100; j++) {
          sum += j;
        }
        operation.end();
      }

      const stats = performanceMonitor.getStats('test_op');

      expect(stats.totalOperations).toBe(5);
      expect(stats.averageDuration).toBeGreaterThanOrEqual(0);
      expect(stats.minDuration).toBeGreaterThanOrEqual(0);
      expect(stats.maxDuration).toBeGreaterThanOrEqual(stats.minDuration);
      
      // Switch back to fake timers
      jest.useFakeTimers();
    });
  });

  describe('Performance Warnings', () => {
    it('should warn for slow operations', () => {
      const warning = shouldShowPerformanceWarning('test', 100, 2000);
      
      expect(warning.shouldWarn).toBe(true);
      expect(warning.warningType).toBe('slow');
      expect(warning.message).toContain('Slow test operation');
    });

    it('should warn for large item counts', () => {
      const warning = shouldShowPerformanceWarning('test', 1500, 100);
      
      expect(warning.shouldWarn).toBe(true);
      expect(warning.warningType).toBe('large');
      expect(warning.message).toContain('Very large test');
    });

    it('should not warn for normal operations', () => {
      const warning = shouldShowPerformanceWarning('test', 50, 100);
      
      expect(warning.shouldWarn).toBe(false);
      expect(warning.warningType).toBe(null);
    });
  });

  describe('Performance Statistics', () => {
    it('should provide comprehensive performance stats', () => {
      // Add some test data
      const operation = performanceMonitor.startOperation('test');
      operation.end();

      const stats = getPerformanceStats();

      expect(stats).toHaveProperty('cache');
      expect(stats).toHaveProperty('monitor');
      expect(stats).toHaveProperty('recommendations');
      expect(Array.isArray(stats.recommendations)).toBe(true);
    });
  });

  describe('Performance Thresholds', () => {
    it('should have defined performance thresholds', () => {
      expect(PERFORMANCE_THRESHOLDS.SLOW_OPERATION).toBe(1000);
      expect(PERFORMANCE_THRESHOLDS.VERY_SLOW_OPERATION).toBe(5000);
      expect(PERFORMANCE_THRESHOLDS.LARGE_SUBNET_COUNT).toBe(500);
      expect(PERFORMANCE_THRESHOLDS.VERY_LARGE_SUBNET_COUNT).toBe(1000);
    });
  });
});