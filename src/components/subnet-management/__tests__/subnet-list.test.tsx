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

  // Mock clipboard API
  const mockWriteText = jest.fn();
  Object.assign(navigator, {
    clipboard: {
      writeText: mockWriteText,
    },
  });

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

  it('handles copy subnet functionality', async () => {
    mockWriteText.mockResolvedValue(undefined);

    render(
      <SubnetList
        subnets={mockSubnets}
        selectedSubnets={new Set()}
        onSelectionChange={mockOnSelectionChange}
        onCopySubnet={mockOnCopySubnet}
      />
    );

    // Find and click the first copy button
    const copyButtons = screen.getAllByTitle('Copy subnet information');
    fireEvent.click(copyButtons[0]);

    // Wait for the async operation to complete
    await new Promise(resolve => setTimeout(resolve, 0));

    // Verify clipboard was called with formatted subnet information
    expect(mockWriteText).toHaveBeenCalledWith(
      expect.stringContaining('Subnet Information')
    );
    expect(mockWriteText).toHaveBeenCalledWith(
      expect.stringContaining('Network Address:    192.168.1.0/25')
    );
    expect(mockWriteText).toHaveBeenCalledWith(
      expect.stringContaining('Broadcast Address:  192.168.1.127')
    );
    expect(mockWriteText).toHaveBeenCalledWith(
      expect.stringContaining('First Host IP:      192.168.1.1')
    );
    expect(mockWriteText).toHaveBeenCalledWith(
      expect.stringContaining('Last Host IP:       192.168.1.126')
    );

    // Verify the callback was called
    expect(mockOnCopySubnet).toHaveBeenCalledWith(mockSubnets[0]);
  });

  it('shows success feedback after copying subnet', async () => {
    mockWriteText.mockResolvedValue(undefined);

    render(
      <SubnetList
        subnets={mockSubnets}
        selectedSubnets={new Set()}
        onSelectionChange={mockOnSelectionChange}
        onCopySubnet={mockOnCopySubnet}
      />
    );

    // Find and click the first copy button
    const copyButtons = screen.getAllByTitle('Copy subnet information');
    fireEvent.click(copyButtons[0]);

    // Wait for the async operation to complete
    await new Promise(resolve => setTimeout(resolve, 0));

    // Check for success feedback
    expect(screen.getByText(/Subnet 192\.168\.1\.0\/25 information copied to clipboard/)).toBeInTheDocument();
  });

  it('handles copy failure gracefully', async () => {
    mockWriteText.mockRejectedValue(new Error('Clipboard not available'));

    render(
      <SubnetList
        subnets={mockSubnets}
        selectedSubnets={new Set()}
        onSelectionChange={mockOnSelectionChange}
        onCopySubnet={mockOnCopySubnet}
      />
    );

    // Find and click the first copy button
    const copyButtons = screen.getAllByTitle('Copy subnet information');
    fireEvent.click(copyButtons[0]);

    // Wait for the async operation to complete
    await new Promise(resolve => setTimeout(resolve, 0));

    // Should show error feedback
    expect(screen.getByText(/Failed to copy subnet: Clipboard not available/)).toBeInTheDocument();
  });
});