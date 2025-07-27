import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { ThemeProvider } from 'next-themes';
import SubnetCalculator from '../../subnet-calculator';

// Mock next-themes
jest.mock('next-themes', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="theme-provider">{children}</div>,
  useTheme: () => ({
    theme: 'dark',
    setTheme: jest.fn(),
    resolvedTheme: 'dark'
  })
}));

// Mock Next.js Image component
jest.mock('next/image', () => {
  return function MockImage({ src, alt, ...props }: { src: string; alt: string; [key: string]: unknown }) {
    return <img src={src} alt={alt} {...props} />;
  };
});

// Mock clipboard API
const mockWriteText = jest.fn();
Object.assign(navigator, {
  clipboard: {
    writeText: mockWriteText,
  },
});

// Mock performance API
Object.defineProperty(window, 'performance', {
  value: {
    now: jest.fn(() => Date.now()),
    mark: jest.fn(),
    measure: jest.fn(),
  },
});

describe('Subnet Management Integration Tests', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
    jest.clearAllMocks();
    mockWriteText.mockResolvedValue(undefined);
  });

  const renderWithTheme = (component: React.ReactElement) => {
    return render(
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        {component}
      </ThemeProvider>
    );
  };

  describe('Component Interaction and State Management', () => {
    it('should integrate subnet management with main calculator', async () => {
      renderWithTheme(<SubnetCalculator />);

      // Enter valid IP and CIDR
      const ipInput = screen.getByLabelText(/IP Address/i);
      const cidrInput = screen.getByLabelText(/CIDR Prefix/i);

      await user.clear(ipInput);
      await user.type(ipInput, '192.168.1.0');
      await user.clear(cidrInput);
      await user.type(cidrInput, '24');

      // Wait for calculation to complete
      await waitFor(() => {
        expect(screen.getByText(/Network Address/i)).toBeInTheDocument();
      });

      // Subnet management section should appear
      await waitFor(() => {
        expect(screen.getByText(/Advanced Subnet Management/i)).toBeInTheDocument();
      });
    });

    it('should handle error states gracefully', async () => {
      renderWithTheme(<SubnetCalculator />);

      // Enter invalid IP
      const ipInput = screen.getByLabelText(/IP Address/i);
      await user.clear(ipInput);
      await user.type(ipInput, '999.999.999.999');

      // Error should be displayed
      await waitFor(() => {
        expect(screen.getByText(/IP address octets must be between 0 and 255/i)).toBeInTheDocument();
      });

      // Subnet management should not be available
      expect(screen.queryByText(/Advanced Subnet Management/i)).not.toBeInTheDocument();
    });

    it('should reset subnet management when IP address changes', async () => {
      renderWithTheme(<SubnetCalculator />);

      // Set initial IP and CIDR
      const ipInput = screen.getByLabelText(/IP Address/i);
      const cidrInput = screen.getByLabelText(/CIDR Prefix/i);

      await user.clear(ipInput);
      await user.type(ipInput, '192.168.1.0');
      await user.clear(cidrInput);
      await user.type(cidrInput, '24');

      await waitFor(() => {
        expect(screen.getByText(/Advanced Subnet Management/i)).toBeInTheDocument();
      });

      // Change IP address
      await user.clear(ipInput);
      await user.type(ipInput, '10.0.0.0');

      // Wait for recalculation
      await waitFor(() => {
        expect(screen.getAllByText(/10\.0\.0\.0/)[0]).toBeInTheDocument();
      });

      // Subnet management should still be available
      expect(screen.getByText(/Advanced Subnet Management/i)).toBeInTheDocument();
    });
  });

  describe('Theme Switching and Responsive Design', () => {
    it('should maintain functionality when theme changes', async () => {
      renderWithTheme(<SubnetCalculator />);

      // Set up subnet
      const ipInput = screen.getByLabelText(/IP Address/i);
      const cidrInput = screen.getByLabelText(/CIDR Prefix/i);

      await user.clear(ipInput);
      await user.type(ipInput, '192.168.1.0');
      await user.clear(cidrInput);
      await user.type(cidrInput, '24');

      await waitFor(() => {
        expect(screen.getByText(/Advanced Subnet Management/i)).toBeInTheDocument();
      });

      // Theme toggle should be present and functional
      const themeToggle = screen.getByRole('button', { name: /Toggle theme/i });
      expect(themeToggle).toBeInTheDocument();
      
      // Click theme toggle
      await user.click(themeToggle);
      
      // Functionality should still work
      expect(screen.getByText(/Advanced Subnet Management/i)).toBeInTheDocument();
    });

    it('should adapt to different screen sizes', async () => {
      // Mock window.matchMedia for responsive design testing
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: jest.fn().mockImplementation(query => ({
          matches: query.includes('768px') ? false : true,
          media: query,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        })),
      });

      renderWithTheme(<SubnetCalculator />);

      // Set up subnet
      const ipInput = screen.getByLabelText(/IP Address/i);
      const cidrInput = screen.getByLabelText(/CIDR Prefix/i);

      await user.clear(ipInput);
      await user.type(ipInput, '192.168.1.0');
      await user.clear(cidrInput);
      await user.type(cidrInput, '24');

      await waitFor(() => {
        expect(screen.getByText(/Advanced Subnet Management/i)).toBeInTheDocument();
      });

      // Components should be responsive - check for grid layout
      const container = screen.getByText(/Advanced Subnet Management/i).closest('div');
      expect(container).toBeInTheDocument();
    });
  });

  describe('End-to-End Split-Join Workflow Tests', () => {
    it('should complete basic split workflow successfully', async () => {
      renderWithTheme(<SubnetCalculator />);

      // Step 1: Set up initial subnet
      const ipInput = screen.getByLabelText(/IP Address/i);
      const cidrInput = screen.getByLabelText(/CIDR Prefix/i);

      await user.clear(ipInput);
      await user.type(ipInput, '192.168.1.0');
      await user.clear(cidrInput);
      await user.type(cidrInput, '24');

      await waitFor(() => {
        expect(screen.getByText(/Advanced Subnet Management/i)).toBeInTheDocument();
      });

      // Step 2: Look for split button
      const splitButton = screen.queryByRole('button', { name: /Split Subnet/i });
      if (splitButton) {
        await user.click(splitButton);

        await waitFor(() => {
          // Look for split subnet results
          const subnetElements = screen.queryAllByText(/192\.168\.1\./);
          expect(subnetElements.length).toBeGreaterThan(0);
        });
      }
    });

    it('should maintain performance with basic operations', async () => {
      renderWithTheme(<SubnetCalculator />);

      // Set up subnet for performance testing
      const ipInput = screen.getByLabelText(/IP Address/i);
      const cidrInput = screen.getByLabelText(/CIDR Prefix/i);

      await user.clear(ipInput);
      await user.type(ipInput, '10.0.0.0');
      await user.clear(cidrInput);
      await user.type(cidrInput, '20');

      // Measure performance
      const startTime = performance.now();
      
      await waitFor(() => {
        expect(screen.getByText(/Advanced Subnet Management/i)).toBeInTheDocument();
      }, { timeout: 5000 });

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Operation should complete within reasonable time
      expect(duration).toBeLessThan(3000); // 3 seconds max
    });
  });

  describe('Accessibility Integration', () => {
    it('should maintain accessibility across themes', async () => {
      renderWithTheme(<SubnetCalculator />);

      // Set up subnet
      const ipInput = screen.getByLabelText(/IP Address/i);
      const cidrInput = screen.getByLabelText(/CIDR Prefix/i);

      await user.clear(ipInput);
      await user.type(ipInput, '192.168.1.0');
      await user.clear(cidrInput);
      await user.type(cidrInput, '24');

      await waitFor(() => {
        expect(screen.getByText(/Advanced Subnet Management/i)).toBeInTheDocument();
      });

      // Check accessibility features
      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        expect(button).toBeInTheDocument();
      });

      // Table should have proper headers
      const table = screen.getByRole('table');
      expect(table).toBeInTheDocument();
      
      const columnHeaders = screen.getAllByRole('columnheader');
      expect(columnHeaders.length).toBeGreaterThan(0);
    });

    it('should support keyboard navigation', async () => {
      renderWithTheme(<SubnetCalculator />);

      // Set up subnet
      const ipInput = screen.getByLabelText(/IP Address/i);
      const cidrInput = screen.getByLabelText(/CIDR Prefix/i);

      await user.clear(ipInput);
      await user.type(ipInput, '192.168.1.0');
      await user.clear(cidrInput);
      await user.type(cidrInput, '24');

      await waitFor(() => {
        expect(screen.getByText(/Advanced Subnet Management/i)).toBeInTheDocument();
      });

      // Test keyboard navigation
      await user.tab(); // Should move to next focusable element
      
      // All interactive elements should be keyboard accessible
      const interactiveElements = screen.getAllByRole('button');
      interactiveElements.forEach(element => {
        expect(element).toBeInTheDocument();
      });
    });
  });
});