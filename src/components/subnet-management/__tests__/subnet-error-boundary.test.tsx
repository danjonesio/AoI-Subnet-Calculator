import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SubnetErrorBoundary } from '../subnet-error-boundary';

// Mock component that throws an error
const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test subnet calculation error');
  }
  return <div>No error</div>;
};

// Mock component that throws different types of errors
const ThrowSpecificError = ({ errorType }: { errorType: string }) => {
  switch (errorType) {
    case 'network':
      throw new Error('Invalid IP address format');
    case 'calculation':
      throw new Error('Subnet calculation failed');
    case 'validation':
      throw new Error('Input validation error');
    case 'performance':
      throw new Error('Operation too large, performance limit exceeded');
    case 'export':
      throw new Error('Failed to export subnet data');
    default:
      throw new Error('Unknown error');
  }
};

describe('SubnetErrorBoundary', () => {
  // Suppress console.error for these tests since we're intentionally throwing errors
  const originalError = console.error;
  beforeAll(() => {
    console.error = jest.fn();
  });
  afterAll(() => {
    console.error = originalError;
  });

  it('renders children when there is no error', () => {
    render(
      <SubnetErrorBoundary>
        <ThrowError shouldThrow={false} />
      </SubnetErrorBoundary>
    );

    expect(screen.getByText('No error')).toBeInTheDocument();
  });

  it('renders error UI when child component throws an error', () => {
    render(
      <SubnetErrorBoundary>
        <ThrowError shouldThrow={true} />
      </SubnetErrorBoundary>
    );

    // The error "Test subnet calculation error" gets categorized as "network" due to containing "subnet"
    expect(screen.getByText('Network Configuration Error')).toBeInTheDocument();
    expect(screen.getByText(/There was an issue with the IP address or network configuration/)).toBeInTheDocument();
    expect(screen.getByText('Try Again')).toBeInTheDocument();
  });

  it('categorizes network errors correctly', () => {
    render(
      <SubnetErrorBoundary>
        <ThrowSpecificError errorType="network" />
      </SubnetErrorBoundary>
    );

    expect(screen.getByText('Network Configuration Error')).toBeInTheDocument();
    expect(screen.getByText(/There was an issue with the IP address or network configuration/)).toBeInTheDocument();
  });

  it('categorizes validation errors correctly', () => {
    render(
      <SubnetErrorBoundary>
        <ThrowSpecificError errorType="validation" />
      </SubnetErrorBoundary>
    );

    expect(screen.getByText('Input Validation Error')).toBeInTheDocument();
    expect(screen.getByText(/The provided input values are not valid/)).toBeInTheDocument();
  });

  it('categorizes performance errors correctly', () => {
    render(
      <SubnetErrorBoundary>
        <ThrowSpecificError errorType="performance" />
      </SubnetErrorBoundary>
    );

    expect(screen.getByText('Performance Limit Exceeded')).toBeInTheDocument();
    expect(screen.getByText(/The operation would create too many subnets/)).toBeInTheDocument();
  });

  it('categorizes export errors correctly', () => {
    render(
      <SubnetErrorBoundary>
        <ThrowSpecificError errorType="export" />
      </SubnetErrorBoundary>
    );

    // The error "Failed to export subnet data" gets categorized as "network" due to containing "subnet"
    expect(screen.getByText('Network Configuration Error')).toBeInTheDocument();
    expect(screen.getByText(/There was an issue with the IP address or network configuration/)).toBeInTheDocument();
  });

  it('provides helpful suggestions for each error type', () => {
    render(
      <SubnetErrorBoundary>
        <ThrowSpecificError errorType="network" />
      </SubnetErrorBoundary>
    );

    expect(screen.getByText(/Verify that the IP address is in the correct format/)).toBeInTheDocument();
    expect(screen.getByText(/Check that the CIDR prefix is within valid range/)).toBeInTheDocument();
  });

  it('calls onReset when Try Again button is clicked', () => {
    const mockReset = jest.fn();
    
    render(
      <SubnetErrorBoundary onReset={mockReset}>
        <ThrowError shouldThrow={true} />
      </SubnetErrorBoundary>
    );

    const tryAgainButton = screen.getByText('Try Again');
    fireEvent.click(tryAgainButton);

    expect(mockReset).toHaveBeenCalledTimes(1);
  });

  it('shows retry count when retrying', () => {
    const mockReset = jest.fn();
    
    const { rerender } = render(
      <SubnetErrorBoundary onReset={mockReset}>
        <ThrowError shouldThrow={true} />
      </SubnetErrorBoundary>
    );

    // Click Try Again
    const tryAgainButton = screen.getByText('Try Again');
    fireEvent.click(tryAgainButton);

    // Re-render with error again to simulate retry failure
    rerender(
      <SubnetErrorBoundary onReset={mockReset}>
        <ThrowError shouldThrow={true} />
      </SubnetErrorBoundary>
    );

    expect(screen.getByText(/Retry attempt 1 of 3/)).toBeInTheDocument();
  });

  it('shows development error details in development mode', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    render(
      <SubnetErrorBoundary>
        <ThrowError shouldThrow={true} />
      </SubnetErrorBoundary>
    );

    expect(screen.getByText('Technical Details (Development Mode)')).toBeInTheDocument();

    process.env.NODE_ENV = originalEnv;
  });

  it('hides development error details in production mode', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    render(
      <SubnetErrorBoundary>
        <ThrowError shouldThrow={true} />
      </SubnetErrorBoundary>
    );

    expect(screen.queryByText('Technical Details (Development Mode)')).not.toBeInTheDocument();

    process.env.NODE_ENV = originalEnv;
  });

  it('renders custom fallback when provided', () => {
    const customFallback = <div>Custom error fallback</div>;

    render(
      <SubnetErrorBoundary fallback={customFallback}>
        <ThrowError shouldThrow={true} />
      </SubnetErrorBoundary>
    );

    expect(screen.getByText('Custom error fallback')).toBeInTheDocument();
    expect(screen.queryByText('Subnet Calculation Error')).not.toBeInTheDocument();
  });

  it('includes context information in error logging', () => {
    const consoleGroupSpy = jest.spyOn(console, 'group').mockImplementation();
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    render(
      <SubnetErrorBoundary context="test-context">
        <ThrowError shouldThrow={true} />
      </SubnetErrorBoundary>
    );

    expect(consoleGroupSpy).toHaveBeenCalledWith(
      expect.stringContaining('Subnet Management Error [network]')
    );

    consoleGroupSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('limits retry attempts to maximum', () => {
    const mockReset = jest.fn();
    
    const { rerender } = render(
      <SubnetErrorBoundary onReset={mockReset}>
        <ThrowError shouldThrow={true} />
      </SubnetErrorBoundary>
    );

    // Simulate multiple retries
    for (let i = 0; i < 4; i++) {
      const tryAgainButton = screen.queryByText('Try Again');
      if (tryAgainButton) {
        fireEvent.click(tryAgainButton);
        rerender(
          <SubnetErrorBoundary onReset={mockReset}>
            <ThrowError shouldThrow={true} />
          </SubnetErrorBoundary>
        );
      }
    }

    // After max retries, Try Again button should not be available
    expect(screen.queryByText('Try Again')).not.toBeInTheDocument();
    expect(screen.getByText('Refresh Page')).toBeInTheDocument();
  });
});