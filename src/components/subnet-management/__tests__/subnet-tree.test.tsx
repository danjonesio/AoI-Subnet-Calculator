import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SubnetTree } from '../subnet-tree';
import { SplitSubnet } from '@/lib/types';

// Mock data for testing
const mockSubnets: SplitSubnet[] = [
  {
    id: 'subnet-1',
    network: '192.168.1.0',
    broadcast: '192.168.1.127',
    firstHost: '192.168.1.1',
    lastHost: '192.168.1.126',
    cidr: 25,
    totalHosts: 128,
    usableHosts: 126,
    level: 1,
    parentId: undefined,
    isSelected: false,
    ipVersion: 'ipv4'
  },
  {
    id: 'subnet-2',
    network: '192.168.1.128',
    broadcast: '192.168.1.255',
    firstHost: '192.168.1.129',
    lastHost: '192.168.1.254',
    cidr: 25,
    totalHosts: 128,
    usableHosts: 126,
    level: 1,
    parentId: undefined,
    isSelected: false,
    ipVersion: 'ipv4'
  },
  {
    id: 'subnet-3',
    network: '192.168.1.0',
    broadcast: '192.168.1.63',
    firstHost: '192.168.1.1',
    lastHost: '192.168.1.62',
    cidr: 26,
    totalHosts: 64,
    usableHosts: 62,
    level: 2,
    parentId: 'subnet-1',
    isSelected: false,
    ipVersion: 'ipv4'
  },
  {
    id: 'subnet-4',
    network: '192.168.1.64',
    broadcast: '192.168.1.127',
    firstHost: '192.168.1.65',
    lastHost: '192.168.1.126',
    cidr: 26,
    totalHosts: 64,
    usableHosts: 62,
    level: 2,
    parentId: 'subnet-1',
    isSelected: false,
    ipVersion: 'ipv4'
  }
];

describe('SubnetTree', () => {
  const mockOnSelectionChange = jest.fn();
  const mockOnCopySubnet = jest.fn();
  const mockOnSubnetDetails = jest.fn();
  const mockOnExpandChange = jest.fn();
  const mockOnFilter = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders subnet tree with hierarchical structure', () => {
    render(
      <SubnetTree
        subnets={mockSubnets}
        selectedSubnets={new Set()}
        onSelectionChange={mockOnSelectionChange}
      />
    );

    expect(screen.getByText('Subnet Hierarchy (4 subnets)')).toBeInTheDocument();
    expect(screen.getByText('192.168.1.0/25')).toBeInTheDocument();
    expect(screen.getByText('192.168.1.128/25')).toBeInTheDocument();
  });

  it('shows expandable nodes for parent subnets', () => {
    render(
      <SubnetTree
        subnets={mockSubnets}
        selectedSubnets={new Set()}
        onSelectionChange={mockOnSelectionChange}
      />
    );

    // Parent subnet should have expand button
    const expandButtons = screen.getAllByRole('button', { name: /expand subnet/i });
    expect(expandButtons.length).toBeGreaterThan(0);
  });

  it('expands and shows child subnets when expand button is clicked', () => {
    render(
      <SubnetTree
        subnets={mockSubnets}
        selectedSubnets={new Set()}
        onSelectionChange={mockOnSelectionChange}
      />
    );

    // Initially child subnets should not be visible
    expect(screen.queryByText('192.168.1.0/26')).not.toBeInTheDocument();

    // Click expand button for parent subnet
    const expandButton = screen.getByRole('button', { name: /expand subnet/i });
    fireEvent.click(expandButton);

    // Child subnets should now be visible
    expect(screen.getByText('192.168.1.0/26')).toBeInTheDocument();
    expect(screen.getByText('192.168.1.64/26')).toBeInTheDocument();
  });

  it('handles subnet selection', () => {
    render(
      <SubnetTree
        subnets={mockSubnets}
        selectedSubnets={new Set()}
        onSelectionChange={mockOnSelectionChange}
      />
    );

    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[1]); // Click first subnet checkbox (skip select all)

    expect(mockOnSelectionChange).toHaveBeenCalledWith(new Set(['subnet-1']));
  });

  it('handles select all functionality', () => {
    render(
      <SubnetTree
        subnets={mockSubnets}
        selectedSubnets={new Set()}
        onSelectionChange={mockOnSelectionChange}
      />
    );

    const selectAllCheckbox = screen.getByLabelText('Select all subnets');
    fireEvent.click(selectAllCheckbox);

    expect(mockOnSelectionChange).toHaveBeenCalledWith(
      new Set(['subnet-1', 'subnet-2', 'subnet-3', 'subnet-4'])
    );
  });

  it('filters subnets based on search text', () => {
    render(
      <SubnetTree
        subnets={mockSubnets}
        selectedSubnets={new Set()}
        onSelectionChange={mockOnSelectionChange}
        onFilter={mockOnFilter}
      />
    );

    const searchInput = screen.getByPlaceholderText('Search subnets in hierarchy...');
    fireEvent.change(searchInput, { target: { value: '192.168.1.128' } });

    expect(mockOnFilter).toHaveBeenCalledWith('192.168.1.128');
  });

  it('shows expand all and collapse all buttons', () => {
    render(
      <SubnetTree
        subnets={mockSubnets}
        selectedSubnets={new Set()}
        onSelectionChange={mockOnSelectionChange}
      />
    );

    expect(screen.getByText('Expand All')).toBeInTheDocument();
    expect(screen.getByText('Collapse All')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(
      <SubnetTree
        subnets={[]}
        selectedSubnets={new Set()}
        onSelectionChange={mockOnSelectionChange}
        loading={true}
      />
    );

    expect(screen.getByText('Loading subnet hierarchy...')).toBeInTheDocument();
  });

  it('shows empty state when no subnets', () => {
    render(
      <SubnetTree
        subnets={[]}
        selectedSubnets={new Set()}
        onSelectionChange={mockOnSelectionChange}
      />
    );

    expect(screen.getByText('No subnets to display')).toBeInTheDocument();
    expect(screen.getByText('Split a subnet to see the hierarchy')).toBeInTheDocument();
  });

  it('shows copy and details buttons when actions are enabled', () => {
    render(
      <SubnetTree
        subnets={mockSubnets}
        selectedSubnets={new Set()}
        onSelectionChange={mockOnSelectionChange}
        onCopySubnet={mockOnCopySubnet}
        onSubnetDetails={mockOnSubnetDetails}
        showActions={true}
      />
    );

    const copyButtons = screen.getAllByTitle('Copy subnet information');
    const detailsButtons = screen.getAllByTitle('View subnet details');
    
    expect(copyButtons.length).toBeGreaterThan(0);
    expect(detailsButtons.length).toBeGreaterThan(0);
  });

  it('handles copy subnet functionality', async () => {
    // Mock clipboard API
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockImplementation(() => Promise.resolve()),
      },
    });

    render(
      <SubnetTree
        subnets={mockSubnets}
        selectedSubnets={new Set()}
        onSelectionChange={mockOnSelectionChange}
        onCopySubnet={mockOnCopySubnet}
        showActions={true}
      />
    );

    const copyButton = screen.getAllByTitle('Copy subnet information')[0];
    fireEvent.click(copyButton);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('Network: 192.168.1.0/25')
    );
  });

  it('shows level indicators when showRelationships is enabled', () => {
    render(
      <SubnetTree
        subnets={mockSubnets}
        selectedSubnets={new Set()}
        onSelectionChange={mockOnSelectionChange}
        showRelationships={true}
      />
    );

    // Expand parent to see child levels
    const expandButton = screen.getByRole('button', { name: /expand subnet/i });
    fireEvent.click(expandButton);

    // Should show multiple Level 2 indicators for child subnets
    const levelIndicators = screen.getAllByText('Level 2');
    expect(levelIndicators.length).toBe(2); // Two child subnets at level 2
  });
});