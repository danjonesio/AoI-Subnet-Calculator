import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { 
  ErrorDisplay, 
  ValidationErrorDisplay, 
  ValidationWarningDisplay, 
  ValidationInfoDisplay,
  useErrorDisplay 
} from '../error-display';
import { ValidationResult, SubnetError } from '@/lib/types';

// Mock the utils module
jest.mock('@/lib/utils', () => ({
  cn: (...classes: (string | undefined | null | boolean)[]) => classes.filter(Boolean).join(' ')
}));

describe('ErrorDisplay Component', () => {
  const mockValidation: ValidationResult = {
    isValid: false,
    errors: ['Invalid CIDR range', 'Subnet too small'],
    warnings: ['Performance may be impacted', 'Large number of subnets'],
    suggestions: ['Use a larger CIDR', 'Consider splitting into smaller batches']
  };

  const mockError: SubnetError = {
    type: 'validation',
    message: 'Invalid subnet configuration',
    timestamp: Date.now(),
    recoverable: true,
    code: 'SUBNET_001',
    details: { cidr: '/32', operation: 'split' }
  };

  const mockContext = {
    operation: 'Split Subnet',
    subnet: '192.168.1.0/24',
    cloudMode: 'aws',
    ipVersion: 'ipv4'
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('renders validation errors correctly', () => {
      render(<ErrorDisplay validation={mockValidation} />);
      
      expect(screen.getAllByText(/Error:/)).toHaveLength(2);
      expect(screen.getByText('Invalid CIDR range')).toBeInTheDocument();
      expect(screen.getByText('Subnet too small')).toBeInTheDocument();
    });

    it('renders validation warnings correctly', () => {
      const warningValidation: ValidationResult = {
        isValid: true,
        errors: [],
        warnings: ['Performance may be impacted'],
        suggestions: []
      };

      render(<ErrorDisplay validation={warningValidation} />);
      
      expect(screen.getByText(/Warning:/)).toBeInTheDocument();
      expect(screen.getByText('Performance may be impacted')).toBeInTheDocument();
    });

    it('renders individual error correctly', () => {
      render(<ErrorDisplay error={mockError} />);
      
      expect(screen.getByText(/Error:/)).toBeInTheDocument();
      expect(screen.getByText('Invalid subnet configuration')).toBeInTheDocument();
    });

    it('renders custom message correctly', () => {
      render(<ErrorDisplay message="Custom error message" />);
      
      expect(screen.getByText(/Error:/)).toBeInTheDocument();
      expect(screen.getByText('Custom error message')).toBeInTheDocument();
    });

    it('does not render when no content provided', () => {
      const { container } = render(<ErrorDisplay />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('Suggestions Functionality', () => {
    it('shows suggestions when available', () => {
      render(<ErrorDisplay validation={mockValidation} />);
      
      expect(screen.getByText(/Suggestions \(2\)/)).toBeInTheDocument();
    });

    it('expands suggestions when clicked', () => {
      render(<ErrorDisplay validation={mockValidation} />);
      
      const suggestionsButton = screen.getByText(/Suggestions \(2\)/);
      fireEvent.click(suggestionsButton);
      
      expect(screen.getByText('Use a larger CIDR')).toBeInTheDocument();
      expect(screen.getByText('Consider splitting into smaller batches')).toBeInTheDocument();
    });

    it('expands suggestions by default when expandSuggestions is true', () => {
      render(<ErrorDisplay validation={mockValidation} expandSuggestions={true} />);
      
      expect(screen.getByText('Use a larger CIDR')).toBeInTheDocument();
      expect(screen.getByText('Consider splitting into smaller batches')).toBeInTheDocument();
    });
  });

  describe('Context Enhancement', () => {
    it('enhances error messages with context', () => {
      render(
        <ErrorDisplay 
          message="Invalid subnet" 
          context={mockContext}
        />
      );
      
      expect(screen.getByText('Split Subnet: Invalid subnet 192.168.1.0/24 (AWS mode)')).toBeInTheDocument();
    });

    it('adds contextual suggestions for cloud modes', () => {
      render(
        <ErrorDisplay 
          validation={mockValidation} 
          context={mockContext}
          expandSuggestions={true}
        />
      );
      
      expect(screen.getByText(/Consult AWS documentation/)).toBeInTheDocument();
    });

    it('adds IPv6 specific suggestions', () => {
      const ipv6Context = { ...mockContext, ipVersion: 'ipv6' };
      render(
        <ErrorDisplay 
          validation={mockValidation} 
          context={ipv6Context}
          expandSuggestions={true}
        />
      );
      
      expect(screen.getByText(/IPv6 subnets have different addressing rules/)).toBeInTheDocument();
    });
  });

  describe('Dismissible Functionality', () => {
    it('shows dismiss button when dismissible', () => {
      render(<ErrorDisplay message="Test error" dismissible={true} />);
      
      expect(screen.getByRole('button', { name: /dismiss/i })).toBeInTheDocument();
    });

    it('calls onDismiss when dismiss button clicked', () => {
      const onDismiss = jest.fn();
      render(
        <ErrorDisplay 
          message="Test error" 
          dismissible={true} 
          onDismiss={onDismiss}
        />
      );
      
      const dismissButton = screen.getByRole('button', { name: /dismiss/i });
      fireEvent.click(dismissButton);
      
      expect(onDismiss).toHaveBeenCalled();
    });

    it('auto-clears after timeout when autoClear is enabled', async () => {
      const onDismiss = jest.fn();
      render(
        <ErrorDisplay 
          message="Test error" 
          autoClear={true}
          autoClearTimeout={100}
          onDismiss={onDismiss}
        />
      );
      
      await waitFor(() => {
        expect(onDismiss).toHaveBeenCalled();
      }, { timeout: 200 });
    });
  });

  describe('Error Details', () => {
    it('shows technical details when showDetails is true', () => {
      render(<ErrorDisplay error={mockError} showDetails={true} />);
      
      expect(screen.getByText('Technical Details')).toBeInTheDocument();
    });

    it('expands technical details when clicked', () => {
      render(<ErrorDisplay error={mockError} showDetails={true} />);
      
      const detailsButton = screen.getByText('Technical Details');
      fireEvent.click(detailsButton);
      
      expect(screen.getByText(/Error Type:/)).toBeInTheDocument();
      expect(screen.getByText('validation')).toBeInTheDocument();
      expect(screen.getByText(/Error Code:/)).toBeInTheDocument();
      expect(screen.getByText('SUBNET_001')).toBeInTheDocument();
    });

    it('shows context information in development mode', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      render(
        <ErrorDisplay 
          message="Test error" 
          context={mockContext}
        />
      );
      
      expect(screen.getByText('Context:')).toBeInTheDocument();
      expect(screen.getByText(/Operation: Split Subnet/)).toBeInTheDocument();

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Variant Styling', () => {
    it('applies error variant styling', () => {
      const { container } = render(<ErrorDisplay message="Error" variant="error" />);
      const alert = container.querySelector('[role="alert"]');
      expect(alert).toHaveClass('border-destructive/50');
    });

    it('applies warning variant styling', () => {
      const { container } = render(<ErrorDisplay message="Warning" variant="warning" />);
      const alert = container.querySelector('[role="alert"]');
      expect(alert).toHaveClass('bg-orange-50');
    });

    it('applies info variant styling', () => {
      const { container } = render(<ErrorDisplay message="Info" variant="info" />);
      const alert = container.querySelector('[role="alert"]');
      expect(alert).toHaveClass('bg-blue-50');
    });
  });

  describe('Convenience Components', () => {
    it('ValidationErrorDisplay renders with error variant', () => {
      render(<ValidationErrorDisplay message="Test error" />);
      
      const alert = screen.getByRole('alert');
      expect(alert).toHaveClass('border-destructive/50');
    });

    it('ValidationWarningDisplay renders with warning variant', () => {
      render(<ValidationWarningDisplay message="Test warning" />);
      
      const alert = screen.getByRole('alert');
      expect(alert).toHaveClass('bg-orange-50');
    });

    it('ValidationInfoDisplay renders with info variant', () => {
      render(<ValidationInfoDisplay message="Test info" />);
      
      const alert = screen.getByRole('alert');
      expect(alert).toHaveClass('bg-blue-50');
    });
  });
});

describe('useErrorDisplay Hook', () => {
  const TestComponent = () => {
    const {
      errors,
      validations,
      addError,
      removeError,
      addValidation,
      removeValidation,
      clearAll,
      hasErrors,
      hasValidations,
      hasAny
    } = useErrorDisplay();

    const testError: SubnetError = {
      type: 'validation',
      message: 'Test error',
      timestamp: Date.now(),
      recoverable: true
    };

    const testValidation: ValidationResult = {
      isValid: false,
      errors: ['Test validation error'],
      warnings: [],
      suggestions: []
    };

    return (
      <div>
        <div data-testid="has-errors">{hasErrors.toString()}</div>
        <div data-testid="has-validations">{hasValidations.toString()}</div>
        <div data-testid="has-any">{hasAny.toString()}</div>
        <div data-testid="error-count">{errors.size}</div>
        <div data-testid="validation-count">{validations.size}</div>
        
        <button onClick={() => addError('test-error', testError)}>
          Add Error
        </button>
        <button onClick={() => removeError('test-error')}>
          Remove Error
        </button>
        <button onClick={() => addValidation('test-validation', testValidation)}>
          Add Validation
        </button>
        <button onClick={() => removeValidation('test-validation')}>
          Remove Validation
        </button>
        <button onClick={clearAll}>
          Clear All
        </button>
      </div>
    );
  };

  it('manages error state correctly', () => {
    render(<TestComponent />);
    
    expect(screen.getByTestId('has-errors')).toHaveTextContent('false');
    expect(screen.getByTestId('error-count')).toHaveTextContent('0');
    
    fireEvent.click(screen.getByText('Add Error'));
    
    expect(screen.getByTestId('has-errors')).toHaveTextContent('true');
    expect(screen.getByTestId('error-count')).toHaveTextContent('1');
    expect(screen.getByTestId('has-any')).toHaveTextContent('true');
    
    fireEvent.click(screen.getByText('Remove Error'));
    
    expect(screen.getByTestId('has-errors')).toHaveTextContent('false');
    expect(screen.getByTestId('error-count')).toHaveTextContent('0');
  });

  it('manages validation state correctly', () => {
    render(<TestComponent />);
    
    expect(screen.getByTestId('has-validations')).toHaveTextContent('false');
    expect(screen.getByTestId('validation-count')).toHaveTextContent('0');
    
    fireEvent.click(screen.getByText('Add Validation'));
    
    expect(screen.getByTestId('has-validations')).toHaveTextContent('true');
    expect(screen.getByTestId('validation-count')).toHaveTextContent('1');
    expect(screen.getByTestId('has-any')).toHaveTextContent('true');
    
    fireEvent.click(screen.getByText('Remove Validation'));
    
    expect(screen.getByTestId('has-validations')).toHaveTextContent('false');
    expect(screen.getByTestId('validation-count')).toHaveTextContent('0');
  });

  it('clears all state correctly', () => {
    render(<TestComponent />);
    
    fireEvent.click(screen.getByText('Add Error'));
    fireEvent.click(screen.getByText('Add Validation'));
    
    expect(screen.getByTestId('has-any')).toHaveTextContent('true');
    
    fireEvent.click(screen.getByText('Clear All'));
    
    expect(screen.getByTestId('has-errors')).toHaveTextContent('false');
    expect(screen.getByTestId('has-validations')).toHaveTextContent('false');
    expect(screen.getByTestId('has-any')).toHaveTextContent('false');
  });
});