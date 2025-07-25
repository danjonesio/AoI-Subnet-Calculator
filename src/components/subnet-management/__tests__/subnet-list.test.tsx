import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SubnetList } from '../subnet-list';
import { SplitSubnet } from '@/lib/types';

// Mock data for testing
const mockSubnets: SplitSubnet[] = [
  {
    id: '1',
    network: '192.168.1.0',
    broadcast: '192.168.1.127',
    firstHost: '192.168.1.1',
    lastHost: '192.168.1.126',
    cidr: 25,
    totalHosts: 128,
    usableHosts: 126,
    parentId: undefined,
    level: 0,
    isSelected: false
  },
  {
    id: '2',
    network: '192.168.1.128',
    broadcast: '192.168.1.255',
    firstHost: '192.168.1.129',
    lastHost: '192.168.1.254',
    cidr: 25,
    totalHosts: 128,
    usableHosts: 126,
    parentId: undefined,
    level: 0,
    isSelected: false
  }
];

describe('SubnetList', () => {
  const mockOnSelectionChange = jest.fn();
  const mockOnSort = jest.fn();
  const mockOnFilter = jest.fn();
  const mockOnCopySubnet = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders subnet list with correct data', () => {
    render(
      <SubnetList
        subnets={mockSubnets}
        selectedSubnets={new Set()}
        onSelectionChange={mockOnSelectionChange}
      />
    );

    expect(screen.getByText('Subnet List (2 subnets)')).toBeInTheDocument();
    expect(screen.getByText('192.168.1.0')).toBeInTheDocument();
    expect(screen.getByText('192.168.1.128')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(
      <SubnetList
        subnets={[]}
        selectedSubnets={new Set()}
        onSelectionChange={mockOnSelectionChange}
        loading={true}
      />
    );

    expect(screen.getByText('Loading subnets...')).toBeInTheDocument();
  });

  it('shows empty state when no subnets', () => {
    render(
      <SubnetList
        subnets={[]}
        selectedSubnets={new Set()}
        onSelectionChange={mockOnSelectionChange}
      />
    );

    expect(screen.getByText('No subnets to display')).toBeInTheDocument();
  });

  it('handles search/filter functionality', () => {
    render(
      <SubnetList
        subnets={mockSubnets}
        selectedSubnets={new Set()}
        onSelectionChange={mockOnSelectionChange}
        onFilter={mockOnFilter}
      />
    );

    const searchInput = screen.getByPlaceholderText('Search subnets by network, CIDR, or host range...');
    fireEvent.change(searchInput, { target: { value: '192.168.1.0' } });

    expect(mockOnFilter).toHaveBeenCalledWith('192.168.1.0');
  });

  it('handles column sorting', () => {
    render(
      <SubnetList
        subnets={mockSubnets}
        selectedSubnets={new Set()}
        onSelectionChange={mockOnSelectionChange}
        onSort={mockOnSort}
      />
    );

    const networkHeader = screen.getByText('Network');
    fireEvent.click(networkHeader);

    expect(mockOnSort).toHaveBeenCalledWith('network', 'asc');
  });

  it('handles subnet selection', () => {
    render(
      <SubnetList
        subnets={mockSubnets}
        selectedSubnets={new Set()}
        onSelectionChange={mockOnSelectionChange}
      />
    );

    const checkboxes = screen.getAllByRole('checkbox');
    // First checkbox is "select all", second is first subnet
    fireEvent.click(checkboxes[1]);

    expect(mockOnSelectionChange).toHaveBeenCalledWith(new Set(['1']));
  });

  it('shows filtered results count', () => {
    render(
      <SubnetList
        subnets={mockSubnets}
        selectedSubnets={new Set()}
        onSelectionChange={mockOnSelectionChange}
        filterText="192.168.1.0"
      />
    );

    // Should show filtered results
    expect(screen.getByText(/Showing \d+ of \d+ subnets/)).toBeInTheDocument();
  });

  it('shows no results message when filter matches nothing', () => {
    render(
      <SubnetList
        subnets={mockSubnets}
        selectedSubnets={new Set()}
        onSelectionChange={mockOnSelectionChange}
        filterText="10.0.0.0"
      />
    );

    expect(screen.getByText('No subnets match your search criteria')).toBeInTheDocument();
  });
});