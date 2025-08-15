/**
 * UI Styling Validation Tests - Simplified
 * 
 * This test suite validates the key styling requirements from the UI Layout Redesign specification.
 * Focus on testing the actual DOM structure and CSS classes applied.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SubnetCalculator from '@/components/subnet-calculator';
import '@testing-library/jest-dom';

// Mock Next.js Image component
jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt, ...props }: { src: string; alt: string; [key: string]: unknown }) => <img src={src} alt={alt} {...props} />,
}));

// Mock next-themes
jest.mock('next-themes', () => ({
  useTheme: jest.fn(() => ({
    theme: 'light',
    setTheme: jest.fn(),
  })),
}));

describe('UI Styling Validation - Key Requirements', () => {
  beforeEach(() => {
    // Reset any mocks
    jest.clearAllMocks();
  });

  test('main container has 80% width constraint with centering', async () => {
    render(<SubnetCalculator />);
    
    await waitFor(() => {
      expect(screen.getByText('Network Configuration')).toBeInTheDocument();
    });

    // Find the main container element
    const mainContainer = document.querySelector('.max-w-\\[80vw\\]');
    expect(mainContainer).toBeInTheDocument();
    
    // Check for centering and max-width classes
    expect(mainContainer).toHaveClass('mx-auto');
    expect(mainContainer).toHaveClass('max-w-6xl');
    
    // Check for responsive padding
    expect(mainContainer).toHaveClass('px-4');
    expect(mainContainer).toHaveClass('sm:px-6');
    expect(mainContainer).toHaveClass('lg:px-8');
  });

  test('cards use consistent styling classes', async () => {
    render(<SubnetCalculator />);
    
    await waitFor(() => {
      expect(screen.getByText('Network Configuration')).toBeInTheDocument();
    });

    // Find all card elements
    const cards = document.querySelectorAll('[class*="rounded-lg"][class*="shadow-md"]');
    expect(cards.length).toBeGreaterThan(0);

    // Check each card has consistent styling
    cards.forEach((card) => {
      expect(card).toHaveClass('rounded-lg');
      expect(card).toHaveClass('shadow-md');
    });
  });

  test('card titles use consistent typography', async () => {
    render(<SubnetCalculator />);
    
    await waitFor(() => {
      expect(screen.getByText('Network Configuration')).toBeInTheDocument();
    });

    // Check specific card titles
    const networkConfigTitle = screen.getByText('Network Configuration');
    expect(networkConfigTitle).toHaveClass('text-lg');
    expect(networkConfigTitle).toHaveClass('font-medium');
  });

  test('page title uses correct typography hierarchy', async () => {
    render(<SubnetCalculator />);
    
    await waitFor(() => {
      expect(screen.getByText('Professional Subnet Calculator')).toBeInTheDocument();
    });

    const pageTitle = screen.getByText('Professional Subnet Calculator');
    expect(pageTitle).toHaveClass('text-2xl');
    expect(pageTitle).toHaveClass('font-bold');
  });

  test('section header uses correct typography', async () => {
    render(<SubnetCalculator />);
    
    await waitFor(() => {
      expect(screen.getByText('Advanced IPv4/IPv6 Network Planning for Cloud Infrastructure')).toBeInTheDocument();
    });

    const sectionHeader = screen.getByText('Advanced IPv4/IPv6 Network Planning for Cloud Infrastructure');
    expect(sectionHeader).toHaveClass('text-xl');
    expect(sectionHeader).toHaveClass('font-semibold');
  });

  test('main container has systematic spacing', async () => {
    render(<SubnetCalculator />);
    
    await waitFor(() => {
      expect(screen.getByText('Network Configuration')).toBeInTheDocument();
    });

    // Check for systematic spacing classes
    const spacingElements = document.querySelectorAll('[class*="space-y"]');
    expect(spacingElements.length).toBeGreaterThan(0);

    // Verify spacing follows systematic scale (including 3 which is used in responsive design)
    spacingElements.forEach((element) => {
      const classes = element.className;
      // Should use systematic spacing values (2, 3, 4, 6, 8)
      expect(classes).toMatch(/space-y-[23468]/);
    });
  });

  test('buttons have consistent sizing', async () => {
    render(<SubnetCalculator />);
    
    await waitFor(() => {
      expect(screen.getByText('Calculate Subnet')).toBeInTheDocument();
    });

    const calculateButton = screen.getByText('Calculate Subnet');
    const buttonElement = calculateButton.closest('button');
    
    // Check button has proper classes
    expect(buttonElement).toHaveClass('w-full');
    
    // Should have size class (the exact class may vary based on button variant)
    const buttonClasses = buttonElement?.className || '';
    expect(buttonClasses).toMatch(/h-\d+/); // Should have height class
  });

  test('form inputs have consistent styling', async () => {
    render(<SubnetCalculator />);
    
    await waitFor(() => {
      expect(screen.getByLabelText('IP Address')).toBeInTheDocument();
    });

    const ipInput = screen.getByLabelText('IP Address');
    const cidrInput = screen.getByLabelText('CIDR Prefix');

    // Both inputs should have consistent width
    expect(ipInput).toHaveClass('w-full');
    expect(cidrInput).toHaveClass('w-full');
  });

  test('table appears with consistent styling after calculation', async () => {
    render(<SubnetCalculator />);
    
    // Trigger subnet calculation
    const ipInput = screen.getByLabelText('IP Address');
    const cidrInput = screen.getByLabelText('CIDR Prefix');
    const calculateButton = screen.getByText('Calculate Subnet');

    fireEvent.change(ipInput, { target: { value: '192.168.1.0' } });
    fireEvent.change(cidrInput, { target: { value: '24' } });
    fireEvent.click(calculateButton);

    await waitFor(() => {
      expect(screen.getByText('Network Address')).toBeInTheDocument();
    });

    // Check that table elements exist
    const tableHeaders = document.querySelectorAll('th');
    const tableCells = document.querySelectorAll('td');
    
    expect(tableHeaders.length).toBeGreaterThan(0);
    expect(tableCells.length).toBeGreaterThan(0);
  });

  test('responsive classes are properly applied', async () => {
    render(<SubnetCalculator />);
    
    await waitFor(() => {
      expect(screen.getByText('Network Configuration')).toBeInTheDocument();
    });

    // Check that responsive classes exist in the DOM
    const responsiveElements = document.querySelectorAll('[class*="sm:"], [class*="lg:"]');
    expect(responsiveElements.length).toBeGreaterThan(0);

    // Check specific responsive patterns on main container
    const mainContainer = document.querySelector('.max-w-\\[80vw\\]');
    expect(mainContainer).toHaveClass('sm:px-6');
    expect(mainContainer).toHaveClass('lg:px-8');
  });

  test('systematic design tokens are used', async () => {
    render(<SubnetCalculator />);
    
    await waitFor(() => {
      expect(screen.getByText('Network Configuration')).toBeInTheDocument();
    });

    // Check that typography follows systematic scale
    const headings = document.querySelectorAll('h1, h2, h3, [class*="text-"]');
    let hasSystematicTypography = false;
    
    headings.forEach((heading) => {
      const classes = heading.className || '';
      if (classes.match && classes.match(/text-(sm|base|lg|xl|2xl)/) && classes.match(/font-(medium|semibold|bold)/)) {
        hasSystematicTypography = true;
      }
    });
    
    expect(hasSystematicTypography).toBe(true);
  });

  test('all major sections are present with consistent structure', async () => {
    render(<SubnetCalculator />);
    
    // Trigger calculation to show all sections
    const ipInput = screen.getByLabelText('IP Address');
    const cidrInput = screen.getByLabelText('CIDR Prefix');
    const calculateButton = screen.getByText('Calculate Subnet');

    fireEvent.change(ipInput, { target: { value: '192.168.1.0' } });
    fireEvent.change(cidrInput, { target: { value: '24' } });
    fireEvent.click(calculateButton);

    await waitFor(() => {
      expect(screen.getByText('Calculated Network Details')).toBeInTheDocument();
    });

    // Verify major sections are present
    expect(screen.getByText('Network Configuration')).toBeInTheDocument();
    expect(screen.getByText('Calculated Network Details')).toBeInTheDocument();
    expect(screen.getByText('Professional Subnet Calculator')).toBeInTheDocument();

    // Check that all cards have consistent styling
    const allCards = document.querySelectorAll('[class*="rounded-lg"][class*="shadow-md"]');
    expect(allCards.length).toBeGreaterThanOrEqual(2);
    
    allCards.forEach((card) => {
      expect(card).toHaveClass('rounded-lg');
      expect(card).toHaveClass('shadow-md');
    });
  });
});