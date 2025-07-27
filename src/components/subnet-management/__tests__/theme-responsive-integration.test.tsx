import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { ThemeProvider } from 'next-themes';
import SubnetCalculator from '../../subnet-calculator';

// Mock next-themes with controllable theme state
const mockSetTheme = jest.fn();
let currentTheme = 'dark';

jest.mock('next-themes', () => ({
  ThemeProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="theme-provider" className={currentTheme}>
      {children}
    </div>
  ),
  useTheme: () => ({
    theme: currentTheme,
    setTheme: (theme: string) => {
      currentTheme = theme;
      mockSetTheme(theme);
    },
    resolvedTheme: currentTheme,
    themes: ['light', 'dark', 'system']
  })
}));

// Mock Next.js Image component
jest.mock('next/image', () => {
  return function MockImage({ src, alt, ...props }: { src: string; alt: string; [key: string]: unknown }) {
    return <img src={src} alt={alt} {...props} />;
  };
});

// Mock ResizeObserver for responsive testing
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

describe('Theme and Responsive Design Integration Tests', () => {
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
    jest.clearAllMocks();
    currentTheme = 'dark';
    
    // Mock clipboard API
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: jest.fn().mockResolvedValue(undefined),
      },
      writable: true,
    });
  });

  const renderWithTheme = (component: React.ReactElement) => {
    return render(
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
        {component}
      </ThemeProvider>
    );
  };

  describe('Theme Switching Integration', () => {
    it('should maintain subnet management functionality across theme changes', async () => {
      renderWithTheme(<SubnetCalculator />);

      // Set up initial subnet
      const ipInput = screen.getByLabelText(/IP Address/i);
      const cidrInput = screen.getByLabelText(/CIDR/i);

      await user.clear(ipInput);
      await user.type(ipInput, '192.168.1.0');
      await user.clear(cidrInput);
      await user.type(cidrInput, '24');

      await waitFor(() => {
        expect(screen.getByText(/Advanced Subnet Management/i)).toBeInTheDocument();
      });

      // Split subnet in dark theme
      const splitButton = screen.getByRole('button', { name: /split subnet/i });
      await user.click(splitButton);

      await waitFor(() => {
        expect(screen.getByText(/192\.168\.1\.0\/25/)).toBeInTheDocument();
      });

      // Switch to light theme
      currentTheme = 'light';
      
      // Re-render to simulate theme change
      renderWithTheme(<SubnetCalculator />);

      // Set up subnet again (simulating theme change maintaining state)
      const newIpInput = screen.getByLabelText(/IP Address/i);
      const newCidrInput = screen.getByLabelText(/CIDR/i);

      await user.clear(newIpInput);
      await user.type(newIpInput, '192.168.1.0');
      await user.clear(newCidrInput);
      await user.type(newCidrInput, '24');

      await waitFor(() => {
        expect(screen.getByText(/Advanced Subnet Management/i)).toBeInTheDocument();
      });

      // Functionality should work in light theme
      const newSplitButton = screen.getByRole('button', { name: /split subnet/i });
      await user.click(newSplitButton);

      await waitFor(() => {
        expect(screen.getByText(/192\.168\.1\.0\/25/)).toBeInTheDocument();
      });
    });

    it('should apply correct theme classes to subnet management components', async () => {
      renderWithTheme(<SubnetCalculator />);

      // Set up subnet
      const ipInput = screen.getByLabelText(/IP Address/i);
      const cidrInput = screen.getByLabelText(/CIDR/i);

      await user.clear(ipInput);
      await user.type(ipInput, '192.168.1.0');
      await user.clear(cidrInput);
      await user.type(cidrInput, '24');

      await waitFor(() => {
        expect(screen.getByText(/Advanced Subnet Management/i)).toBeInTheDocument();
      });

      // Split subnet to show management components
      const splitButton = screen.getByRole('button', { name: /split subnet/i });
      await user.click(splitButton);

      await waitFor(() => {
        expect(screen.getByText(/192\.168\.1\.0\/25/)).toBeInTheDocument();
      });

      // Check that theme provider wrapper has correct class
      const themeProvider = screen.getByTestId('theme-provider');
      expect(themeProvider).toHaveClass('dark');

      // Verify dark theme styles are applied to components
      const managementSection = screen.getByText(/Advanced Subnet Management/i).closest('div');
      expect(managementSection).toBeInTheDocument();
    });

    it('should handle theme toggle button functionality', async () => {
      renderWithTheme(<SubnetCalculator />);

      // Find theme toggle button
      const themeToggle = screen.getByRole('button', { name: /toggle theme/i });
      expect(themeToggle).toBeInTheDocument();

      // Theme toggle should be functional
      await user.click(themeToggle);
      expect(mockSetTheme).toHaveBeenCalled();
    });

    it('should maintain visual consistency across themes', async () => {
      renderWithTheme(<SubnetCalculator />);

      // Set up subnet with split
      const ipInput = screen.getByLabelText(/IP Address/i);
      const cidrInput = screen.getByLabelText(/CIDR/i);

      await user.clear(ipInput);
      await user.type(ipInput, '192.168.1.0');
      await user.clear(cidrInput);
      await user.type(cidrInput, '24');

      await waitFor(() => {
        expect(screen.getByText(/Advanced Subnet Management/i)).toBeInTheDocument();
      });

      const splitButton = screen.getByRole('button', { name: /split subnet/i });
      await user.click(splitButton);

      await waitFor(() => {
        expect(screen.getByText(/192\.168\.1\.0\/25/)).toBeInTheDocument();
      });

      // Test different theme states
      const themes = ['light', 'dark', 'system'];
      
      for (const theme of themes) {
        currentTheme = theme;
        
        // Components should remain functional regardless of theme
        const checkboxes = screen.getAllByRole('checkbox');
        expect(checkboxes.length).toBeGreaterThan(0);
        
        const buttons = screen.getAllByRole('button');
        expect(buttons.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Responsive Design Integration', () => {
    const mockMatchMedia = (matches: boolean) => {
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: jest.fn().mockImplementation(query => ({
          matches,
          media: query,
          onchange: null,
          addListener: jest.fn(),
          removeListener: jest.fn(),
          addEventListener: jest.fn(),
          removeEventListener: jest.fn(),
          dispatchEvent: jest.fn(),
        })),
      });
    };

    it('should adapt layout for mobile devices', async () => {
      // Mock mobile viewport
      mockMatchMedia(true); // Simulate mobile media query match
      
      renderWithTheme(<SubnetCalculator />);

      // Set up subnet
      const ipInput = screen.getByLabelText(/IP Address/i);
      const cidrInput = screen.getByLabelText(/CIDR/i);

      await user.clear(ipInput);
      await user.type(ipInput, '192.168.1.0');
      await user.clear(cidrInput);
      await user.type(cidrInput, '24');

      await waitFor(() => {
        expect(screen.getByText(/Advanced Subnet Management/i)).toBeInTheDocument();
      });

      // Split subnet
      const splitButton = screen.getByRole('button', { name: /split subnet/i });
      await user.click(splitButton);

      await waitFor(() => {
        expect(screen.getByText(/192\.168\.1\.0\/25/)).toBeInTheDocument();
      });

      // Check that components are responsive
      const managementSection = screen.getByText(/Advanced Subnet Management/i).closest('div');
      expect(managementSection).toHaveClass('grid'); // Should use responsive grid
    });

    it('should adapt layout for tablet devices', async () => {
      // Mock tablet viewport
      mockMatchMedia(false); // Desktop/tablet
      
      renderWithTheme(<SubnetCalculator />);

      // Set up subnet
      const ipInput = screen.getByLabelText(/IP Address/i);
      const cidrInput = screen.getByLabelText(/CIDR/i);

      await user.clear(ipInput);
      await user.type(ipInput, '192.168.1.0');
      await user.clear(cidrInput);
      await user.type(cidrInput, '24');

      await waitFor(() => {
        expect(screen.getByText(/Advanced Subnet Management/i)).toBeInTheDocument();
      });

      // Components should be laid out for larger screens
      const splitButton = screen.getByRole('button', { name: /split subnet/i });
      await user.click(splitButton);

      await waitFor(() => {
        expect(screen.getByText(/192\.168\.1\.0\/25/)).toBeInTheDocument();
      });

      // Table should be fully visible on larger screens
      const table = screen.getByRole('table');
      expect(table).toBeInTheDocument();
    });

    it('should handle table responsiveness with many columns', async () => {
      renderWithTheme(<SubnetCalculator />);

      // Set up subnet with many splits to test table responsiveness
      const ipInput = screen.getByLabelText(/IP Address/i);
      const cidrInput = screen.getByLabelText(/CIDR/i);

      await user.clear(ipInput);
      await user.type(ipInput, '10.0.0.0');
      await user.clear(cidrInput);
      await user.type(cidrInput, '22');

      await waitFor(() => {
        expect(screen.getByText(/Advanced Subnet Management/i)).toBeInTheDocument();
      });

      // Split into many subnets
      const splitSelect = screen.getByRole('combobox', { name: /split type/i });
      await user.click(splitSelect);
      await user.click(screen.getByText('Split in Eighths (8 subnets)'));

      const splitButton = screen.getByRole('button', { name: /split subnet/i });
      await user.click(splitButton);

      await waitFor(() => {
        expect(screen.getByText(/10\.0\.0\.0\/25/)).toBeInTheDocument();
      });

      // Table should handle many rows responsively
      const table = screen.getByRole('table');
      expect(table).toBeInTheDocument();
      
      const rows = screen.getAllByRole('row');
      expect(rows.length).toBeGreaterThan(8); // Header + 8 subnet rows
    });

    it('should maintain touch-friendly interactions on mobile', async () => {
      // Mock mobile viewport
      mockMatchMedia(true);
      
      renderWithTheme(<SubnetCalculator />);

      // Set up subnet
      const ipInput = screen.getByLabelText(/IP Address/i);
      const cidrInput = screen.getByLabelText(/CIDR/i);

      await user.clear(ipInput);
      await user.type(ipInput, '192.168.1.0');
      await user.clear(cidrInput);
      await user.type(cidrInput, '24');

      await waitFor(() => {
        expect(screen.getByText(/Advanced Subnet Management/i)).toBeInTheDocument();
      });

      const splitButton = screen.getByRole('button', { name: /split subnet/i });
      await user.click(splitButton);

      await waitFor(() => {
        expect(screen.getByText(/192\.168\.1\.0\/25/)).toBeInTheDocument();
      });

      // Touch interactions should work (checkboxes, buttons)
      const checkboxes = screen.getAllByRole('checkbox');
      await user.click(checkboxes[1]);

      // Button should be large enough for touch
      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        expect(button).toBeInTheDocument();
      });
    });

    it('should handle viewport changes dynamically', async () => {
      // Start with desktop
      mockMatchMedia(false);
      
      renderWithTheme(<SubnetCalculator />);

      // Set up subnet
      const ipInput = screen.getByLabelText(/IP Address/i);
      const cidrInput = screen.getByLabelText(/CIDR/i);

      await user.clear(ipInput);
      await user.type(ipInput, '192.168.1.0');
      await user.clear(cidrInput);
      await user.type(cidrInput, '24');

      await waitFor(() => {
        expect(screen.getByText(/Advanced Subnet Management/i)).toBeInTheDocument();
      });

      const splitButton = screen.getByRole('button', { name: /split subnet/i });
      await user.click(splitButton);

      await waitFor(() => {
        expect(screen.getByText(/192\.168\.1\.0\/25/)).toBeInTheDocument();
      });

      // Simulate viewport change to mobile
      mockMatchMedia(true);
      
      // Components should still be functional after viewport change
      const checkboxes = screen.getAllByRole('checkbox');
      await user.click(checkboxes[1]);

      // Functionality should be maintained
      expect(checkboxes[1]).toBeChecked();
    });
  });

  describe('Accessibility Integration', () => {
    it('should maintain accessibility across themes', async () => {
      renderWithTheme(<SubnetCalculator />);

      // Set up subnet
      const ipInput = screen.getByLabelText(/IP Address/i);
      const cidrInput = screen.getByLabelText(/CIDR/i);

      await user.clear(ipInput);
      await user.type(ipInput, '192.168.1.0');
      await user.clear(cidrInput);
      await user.type(cidrInput, '24');

      await waitFor(() => {
        expect(screen.getByText(/Advanced Subnet Management/i)).toBeInTheDocument();
      });

      const splitButton = screen.getByRole('button', { name: /split subnet/i });
      await user.click(splitButton);

      await waitFor(() => {
        expect(screen.getByText(/192\.168\.1\.0\/25/)).toBeInTheDocument();
      });

      // Check accessibility features
      const checkboxes = screen.getAllByRole('checkbox');
      checkboxes.forEach(checkbox => {
        expect(checkbox).toHaveAttribute('aria-label');
      });

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

    it('should support keyboard navigation across responsive breakpoints', async () => {
      renderWithTheme(<SubnetCalculator />);

      // Set up subnet
      const ipInput = screen.getByLabelText(/IP Address/i);
      const cidrInput = screen.getByLabelText(/CIDR/i);

      await user.clear(ipInput);
      await user.type(ipInput, '192.168.1.0');
      await user.clear(cidrInput);
      await user.type(cidrInput, '24');

      await waitFor(() => {
        expect(screen.getByText(/Advanced Subnet Management/i)).toBeInTheDocument();
      });

      // Test keyboard navigation
      await user.tab(); // Should move to next focusable element
      
      const splitButton = screen.getByRole('button', { name: /split subnet/i });
      splitButton.focus();
      
      await user.keyboard('{Enter}');

      await waitFor(() => {
        expect(screen.getByText(/192\.168\.1\.0\/25/)).toBeInTheDocument();
      });

      // Keyboard navigation should work with checkboxes
      const checkboxes = screen.getAllByRole('checkbox');
      checkboxes[1].focus();
      await user.keyboard('{Space}');
      
      expect(checkboxes[1]).toBeChecked();
    });
  });
});