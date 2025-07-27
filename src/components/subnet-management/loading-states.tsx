"use client";

import React, { memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, Network, Calculator, Link2, Download } from 'lucide-react';

// Loading spinner with customizable size and message
interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  message?: string;
  className?: string;
}

export const LoadingSpinner = memo<LoadingSpinnerProps>(({ 
  size = 'md', 
  message,
  className = '' 
}) => {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-6 w-6',
    lg: 'h-8 w-8'
  };

  return (
    <div className={`flex items-center justify-center gap-2 ${className}`}>
      <Loader2 className={`${sizeClasses[size]} animate-spin`} />
      {message && (
        <span className={`${size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-lg' : 'text-base'} text-muted-foreground`}>
          {message}
        </span>
      )}
    </div>
  );
});

LoadingSpinner.displayName = 'LoadingSpinner';

// Progress indicator for large operations
interface ProgressIndicatorProps {
  progress: number;
  message?: string;
  showPercentage?: boolean;
  className?: string;
}

export const ProgressIndicator = memo<ProgressIndicatorProps>(({ 
  progress, 
  message,
  showPercentage = true,
  className = '' 
}) => {
  const clampedProgress = Math.max(0, Math.min(100, progress));

  return (
    <div className={`space-y-2 ${className}`}>
      {message && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{message}</span>
          {showPercentage && (
            <span className="font-medium">{Math.round(clampedProgress)}%</span>
          )}
        </div>
      )}
      <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
        <div 
          className="h-full bg-primary transition-all duration-300 ease-out rounded-full"
          style={{ width: `${clampedProgress}%` }}
        />
      </div>
    </div>
  );
});

ProgressIndicator.displayName = 'ProgressIndicator';

// Skeleton loader for subnet calculation results
export const SubnetCalculationSkeleton = memo(() => (
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Calculator className="h-5 w-5" />
        <Skeleton className="h-6 w-32" />
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-6 w-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-6 w-full" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-6 w-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-6 w-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-18" />
          <Skeleton className="h-6 w-full" />
        </div>
      </div>
    </CardContent>
  </Card>
));

SubnetCalculationSkeleton.displayName = 'SubnetCalculationSkeleton';

// Skeleton loader for subnet splitting interface
export const SubnetSplitterSkeleton = memo(() => (
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Network className="h-5 w-5" />
        <Skeleton className="h-6 w-28" />
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-16 w-full" />
      </div>
      <Skeleton className="h-10 w-full" />
    </CardContent>
  </Card>
));

SubnetSplitterSkeleton.displayName = 'SubnetSplitterSkeleton';

// Skeleton loader for subnet joining interface
export const SubnetJoinerSkeleton = memo(() => (
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Link2 className="h-5 w-5" />
        <Skeleton className="h-6 w-28" />
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center space-x-2 p-2 border rounded">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-32" />
          </div>
        ))}
      </div>
      <Skeleton className="h-10 w-full" />
    </CardContent>
  </Card>
));

SubnetJoinerSkeleton.displayName = 'SubnetJoinerSkeleton';

// Skeleton loader for subnet list
export const SubnetListSkeleton = memo(() => (
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center justify-between">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-20" />
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      <Skeleton className="h-10 w-full" />
      <div className="space-y-2">
        <div className="flex items-center space-x-4 p-2 border rounded">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-8 w-16" />
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center space-x-4 p-2 border rounded opacity-75">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </div>
    </CardContent>
  </Card>
));

SubnetListSkeleton.displayName = 'SubnetListSkeleton';

// Skeleton loader for subnet export interface
export const SubnetExportSkeleton = memo(() => (
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <Download className="h-5 w-5" />
        <Skeleton className="h-6 w-28" />
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-16" />
          ))}
        </div>
      </div>
      <Skeleton className="h-10 w-full" />
    </CardContent>
  </Card>
));

SubnetExportSkeleton.displayName = 'SubnetExportSkeleton';

// Loading overlay for operations in progress
interface LoadingOverlayProps {
  isVisible: boolean;
  message?: string;
  progress?: number;
  onCancel?: () => void;
  className?: string;
}

export const LoadingOverlay = memo<LoadingOverlayProps>(({ 
  isVisible, 
  message = 'Processing...',
  progress,
  onCancel,
  className = '' 
}) => {
  if (!isVisible) return null;

  return (
    <div className={`fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center ${className}`}>
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="space-y-4">
            <LoadingSpinner size="lg" message={message} />
            {typeof progress === 'number' && (
              <ProgressIndicator progress={progress} showPercentage />
            )}
            {onCancel && (
              <div className="flex justify-center">
                <button
                  onClick={onCancel}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
});

LoadingOverlay.displayName = 'LoadingOverlay';

// Animated transition wrapper for smooth state changes
interface AnimatedTransitionProps {
  children: React.ReactNode;
  isVisible: boolean;
  type?: 'fade' | 'slide' | 'scale';
  duration?: 'fast' | 'normal' | 'slow';
  className?: string;
}

export const AnimatedTransition = memo<AnimatedTransitionProps>(({ 
  children, 
  isVisible, 
  type = 'fade',
  duration = 'normal',
  className = '' 
}) => {
  const durationClasses = {
    fast: 'duration-150',
    normal: 'duration-300',
    slow: 'duration-500'
  };

  const transitionClasses = {
    fade: isVisible 
      ? 'opacity-100 translate-y-0' 
      : 'opacity-0 translate-y-2',
    slide: isVisible 
      ? 'opacity-100 translate-x-0' 
      : 'opacity-0 -translate-x-4',
    scale: isVisible 
      ? 'opacity-100 scale-100' 
      : 'opacity-0 scale-95'
  };

  return (
    <div className={`transition-all ${durationClasses[duration]} ${transitionClasses[type]} ${className}`}>
      {children}
    </div>
  );
});

AnimatedTransition.displayName = 'AnimatedTransition';

// Pulse animation for highlighting changes
interface PulseHighlightProps {
  children: React.ReactNode;
  isActive: boolean;
  color?: 'primary' | 'success' | 'warning' | 'error';
  className?: string;
}

export const PulseHighlight = memo<PulseHighlightProps>(({ 
  children, 
  isActive, 
  color = 'primary',
  className = '' 
}) => {
  const colorClasses = {
    primary: 'ring-primary/20 bg-primary/5',
    success: 'ring-green-500/20 bg-green-500/5',
    warning: 'ring-yellow-500/20 bg-yellow-500/5',
    error: 'ring-red-500/20 bg-red-500/5'
  };

  return (
    <div className={`
      transition-all duration-300 rounded-lg
      ${isActive ? `ring-2 ${colorClasses[color]} animate-pulse` : ''}
      ${className}
    `}>
      {children}
    </div>
  );
});

PulseHighlight.displayName = 'PulseHighlight';

// Staggered animation for lists
interface StaggeredAnimationProps {
  children: React.ReactNode[];
  isVisible: boolean;
  staggerDelay?: number;
  className?: string;
}

export const StaggeredAnimation = memo<StaggeredAnimationProps>(({ 
  children, 
  isVisible, 
  staggerDelay = 50,
  className = '' 
}) => {
  return (
    <div className={className}>
      {children.map((child, index) => (
        <div
          key={index}
          className={`transition-all duration-300 ${
            isVisible 
              ? 'opacity-100 translate-y-0' 
              : 'opacity-0 translate-y-4'
          }`}
          style={{
            transitionDelay: isVisible ? `${index * staggerDelay}ms` : '0ms'
          }}
        >
          {child}
        </div>
      ))}
    </div>
  );
});

StaggeredAnimation.displayName = 'StaggeredAnimation';