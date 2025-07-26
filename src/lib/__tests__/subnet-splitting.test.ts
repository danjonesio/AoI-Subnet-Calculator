/**
 * Unit tests for IPv4 subnet splitting functionality
 */

import {
  splitIPv4Subnet,
  validateIPv4Split,
  calculateSplitPreview,
  createSubnetError,
  validateSubnetAdjacency,
  areSubnetsAdjacent,
  findAdjacentSubnets,
  groupAdjacentSubnets,
  calculateJoinedSubnet,
  joinAdjacentSubnets,
  validateIPv4Join,
  calculateJoinPreview,
  findOptimalJoinGroups,
  batchJoinSubnets
} from '../subnet-splitting';
import { SplitSubnet, CloudReservation } from '../types';
import {
  SubnetInfo,
  SplitOptions
} from '../types';

// Test helper to create a basic SubnetInfo object
function createTestSubnet(
  network: string,
  cidr: string,
  broadcast?: string,
  id?: string
): SubnetInfo {
  const cidrNum = parseInt(cidr.replace('/', ''), 10);
  const hostBits = 32 - cidrNum;
  const totalHosts = Math.pow(2, hostBits);
  const usableHosts = hostBits <= 1 ? totalHosts : totalHosts - 2;

  return {
    id: id || 'test-subnet-1',
    network,
    broadcast: broadcast || calculateBroadcast(network, cidrNum),
    firstHost: calculateFirstHost(network, cidrNum),
    lastHost: calculateLastHost(network, cidrNum),
    subnetMask: calculateSubnetMask(cidrNum),
    wildcardMask: calculateWildcardMask(cidrNum),
    totalHosts,
    usableHosts,
    cidr,
    level: 0
  };
}

// Helper functions for test subnet creation
function calculateBroadcast(network: string, cidr: number): string {
  const networkInt = ipToInt(network);
  const hostBits = 32 - cidr;
  const wildcardMask = (1 << hostBits) - 1;
  const broadcastInt = networkInt | wildcardMask;
  return intToIp(broadcastInt);
}

function calculateFirstHost(network: string, cidr: number): string {
  const networkInt = ipToInt(network);
  const hostBits = 32 - cidr;
  
  if (hostBits === 0) return network; // /32
  if (hostBits === 1) return network; // /31
  return intToIp(networkInt + 1);
}

function calculateLastHost(network: string, cidr: number): string {
  const networkInt = ipToInt(network);
  const hostBits = 32 - cidr;
  const wildcardMask = (1 << hostBits) - 1;
  const broadcastInt = networkInt | wildcardMask;
  
  if (hostBits === 0) return network; // /32
  if (hostBits === 1) return intToIp(broadcastInt); // /31
  return intToIp(broadcastInt - 1);
}

function calculateSubnetMask(cidr: number): string {
  const hostBits = 32 - cidr;
  const mask = hostBits >= 32 ? 0 : (0xFFFFFFFF << hostBits) >>> 0;
  return intToIp(mask);
}

function calculateWildcardMask(cidr: number): string {
  const hostBits = 32 - cidr;
  const wildcardMask = hostBits >= 32 ? 0xFFFFFFFF : ((1 << hostBits) - 1);
  return intToIp(wildcardMask);
}

function ipToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function intToIp(int: number): string {
  return [
    (int >>> 24) & 255,
    (int >>> 16) & 255,
    (int >>> 8) & 255,
    int & 255
  ].join('.');
}

describe('IPv4 Subnet Splitting', () => {
  describe('splitIPv4Subnet', () => {
    test('should split /24 subnet into 2 equal /25 subnets', () => {
      const parentSubnet = createTestSubnet('192.168.1.0', '/24');
      const splitOptions: SplitOptions = {
        splitType: 'equal',
        splitCount: 2
      };

      const result = splitIPv4Subnet(parentSubnet, splitOptions, 'normal');

      expect(result.subnets).toHaveLength(2);
      expect(result.totalSubnets).toBe(2);
      
      // First subnet: 192.168.1.0/25
      expect(result.subnets[0].network).toBe('192.168.1.0');
      expect(result.subnets[0].cidr).toBe(25);
      expect(result.subnets[0].broadcast).toBe('192.168.1.127');
      expect(result.subnets[0].totalHosts).toBe(128);
      expect(result.subnets[0].usableHosts).toBe(126);
      expect(result.subnets[0].ipVersion).toBe('ipv4');
      
      // Second subnet: 192.168.1.128/25
      expect(result.subnets[1].network).toBe('192.168.1.128');
      expect(result.subnets[1].cidr).toBe(25);
      expect(result.subnets[1].broadcast).toBe('192.168.1.255');
      expect(result.subnets[1].totalHosts).toBe(128);
      expect(result.subnets[1].usableHosts).toBe(126);
    });

    test('should split /24 subnet into 4 equal /26 subnets', () => {
      const parentSubnet = createTestSubnet('10.0.0.0', '/24');
      const splitOptions: SplitOptions = {
        splitType: 'equal',
        splitCount: 4
      };

      const result = splitIPv4Subnet(parentSubnet, splitOptions, 'normal');

      expect(result.subnets).toHaveLength(4);
      expect(result.totalSubnets).toBe(4);
      
      const expectedNetworks = ['10.0.0.0', '10.0.0.64', '10.0.0.128', '10.0.0.192'];
      const expectedBroadcasts = ['10.0.0.63', '10.0.0.127', '10.0.0.191', '10.0.0.255'];
      
      result.subnets.forEach((subnet, index) => {
        expect(subnet.network).toBe(expectedNetworks[index]);
        expect(subnet.broadcast).toBe(expectedBroadcasts[index]);
        expect(subnet.cidr).toBe(26);
        expect(subnet.totalHosts).toBe(64);
        expect(subnet.usableHosts).toBe(62);
      });
    });

    test('should split using custom CIDR', () => {
      const parentSubnet = createTestSubnet('172.16.0.0', '/22');
      const splitOptions: SplitOptions = {
        splitType: 'custom',
        customCidr: 24
      };

      const result = splitIPv4Subnet(parentSubnet, splitOptions, 'normal');

      expect(result.subnets).toHaveLength(4); // /22 to /24 = 2^(24-22) = 4 subnets
      expect(result.totalSubnets).toBe(4);
      
      const expectedNetworks = ['172.16.0.0', '172.16.1.0', '172.16.2.0', '172.16.3.0'];
      
      result.subnets.forEach((subnet, index) => {
        expect(subnet.network).toBe(expectedNetworks[index]);
        expect(subnet.cidr).toBe(24);
        expect(subnet.totalHosts).toBe(256);
        expect(subnet.usableHosts).toBe(254);
      });
    });

    test('should handle /31 subnets (point-to-point)', () => {
      const parentSubnet = createTestSubnet('192.168.1.0', '/30');
      const splitOptions: SplitOptions = {
        splitType: 'custom',
        customCidr: 31
      };

      const result = splitIPv4Subnet(parentSubnet, splitOptions, 'normal');

      expect(result.subnets).toHaveLength(2);
      
      // /31 subnets should have 2 usable hosts each (RFC 3021)
      result.subnets.forEach(subnet => {
        expect(subnet.totalHosts).toBe(2);
        expect(subnet.usableHosts).toBe(2);
        expect(subnet.firstHost).toBe(subnet.network);
        expect(subnet.lastHost).toBe(subnet.broadcast);
      });
    });

    test('should handle /32 subnets (host routes)', () => {
      const parentSubnet = createTestSubnet('192.168.1.0', '/30');
      const splitOptions: SplitOptions = {
        splitType: 'custom',
        customCidr: 32
      };

      const result = splitIPv4Subnet(parentSubnet, splitOptions, 'normal');

      expect(result.subnets).toHaveLength(4);
      
      // /32 subnets should have 1 usable host each
      result.subnets.forEach(subnet => {
        expect(subnet.totalHosts).toBe(1);
        expect(subnet.usableHosts).toBe(1);
        expect(subnet.firstHost).toBe(subnet.network);
        expect(subnet.lastHost).toBe(subnet.network);
        expect(subnet.network).toBe(subnet.broadcast);
      });
    });

    test('should apply AWS cloud provider constraints', () => {
      const parentSubnet = createTestSubnet('10.0.0.0', '/24');
      const splitOptions: SplitOptions = {
        splitType: 'equal',
        splitCount: 2
      };

      const result = splitIPv4Subnet(parentSubnet, splitOptions, 'aws');

      expect(result.subnets).toHaveLength(2);
      
      result.subnets.forEach(subnet => {
        // AWS reserves 5 IPs per subnet
        expect(subnet.usableHosts).toBe(subnet.totalHosts - 5);
        expect(subnet.cloudReserved).toHaveLength(5);
        
        // Check AWS-specific reservations
        const reservations = subnet.cloudReserved!;
        expect(reservations[0].purpose).toBe('Network Address');
        expect(reservations[1].purpose).toBe('VPC Router');
        expect(reservations[2].purpose).toBe('DNS Server');
        expect(reservations[3].purpose).toBe('Future Use');
        expect(reservations[4].purpose).toBe('Broadcast Address');
        
        // First usable host should be network + 4 (after AWS reservations)
        const networkInt = ipToInt(subnet.network);
        const expectedFirstUsable = intToIp(networkInt + 4);
        expect(subnet.firstHost).toBe(expectedFirstUsable);
      });
    });

    test('should apply Azure cloud provider constraints', () => {
      const parentSubnet = createTestSubnet('10.0.0.0', '/24');
      const splitOptions: SplitOptions = {
        splitType: 'equal',
        splitCount: 2
      };

      const result = splitIPv4Subnet(parentSubnet, splitOptions, 'azure');

      expect(result.subnets).toHaveLength(2);
      
      result.subnets.forEach(subnet => {
        // Azure reserves 5 IPs per subnet
        expect(subnet.usableHosts).toBe(subnet.totalHosts - 5);
        expect(subnet.cloudReserved).toHaveLength(5);
        
        // Check Azure-specific reservations
        const reservations = subnet.cloudReserved!;
        expect(reservations[1].purpose).toBe('Default Gateway');
        expect(reservations[2].purpose).toBe('DNS Mapping');
        expect(reservations[3].purpose).toBe('DNS Mapping');
      });
    });

    test('should apply GCP cloud provider constraints', () => {
      const parentSubnet = createTestSubnet('10.0.0.0', '/24');
      const splitOptions: SplitOptions = {
        splitType: 'equal',
        splitCount: 2
      };

      const result = splitIPv4Subnet(parentSubnet, splitOptions, 'gcp');

      expect(result.subnets).toHaveLength(2);
      
      result.subnets.forEach(subnet => {
        // GCP reserves 4 IPs per subnet
        expect(subnet.usableHosts).toBe(subnet.totalHosts - 4);
        expect(subnet.cloudReserved).toHaveLength(4);
        
        // Check GCP-specific reservations
        const reservations = subnet.cloudReserved!;
        expect(reservations[1].purpose).toBe('Default Gateway');
        expect(reservations[2].purpose).toBe('Second-to-last IP');
        
        // First usable host should be network + 2 (after GCP reservations)
        const networkInt = ipToInt(subnet.network);
        const expectedFirstUsable = intToIp(networkInt + 2);
        expect(subnet.firstHost).toBe(expectedFirstUsable);
      });
    });

    test('should respect maxResults limit', () => {
      const parentSubnet = createTestSubnet('10.0.0.0', '/20');
      const splitOptions: SplitOptions = {
        splitType: 'custom',
        customCidr: 26, // This creates 64 subnets, which is under the limit
        maxResults: 50  // Limit to 50
      };

      const result = splitIPv4Subnet(parentSubnet, splitOptions, 'normal');

      // /20 to /26 would normally create 64 subnets, but limited to 50
      expect(result.subnets).toHaveLength(50);
      expect(result.totalSubnets).toBe(50);
    });

    test('should handle invalid inputs gracefully', () => {
      const parentSubnet = createTestSubnet('192.168.1.0', '/24');
      const invalidSplitOptions: SplitOptions = {
        splitType: 'equal',
        splitCount: 0 // Invalid split count
      };

      const result = splitIPv4Subnet(parentSubnet, invalidSplitOptions, 'normal');

      expect(result.subnets).toHaveLength(0);
      expect(result.totalSubnets).toBe(0);
    });

    test('should generate unique subnet IDs', () => {
      const parentSubnet = createTestSubnet('192.168.1.0', '/24');
      const splitOptions: SplitOptions = {
        splitType: 'equal',
        splitCount: 4
      };

      const result = splitIPv4Subnet(parentSubnet, splitOptions, 'normal');

      const ids = result.subnets.map(subnet => subnet.id);
      const uniqueIds = new Set(ids);
      
      expect(uniqueIds.size).toBe(ids.length); // All IDs should be unique
      
      // Check ID format
      ids.forEach(id => {
        expect(id).toMatch(/^subnet_[a-z0-9]+_[a-z0-9]+$/);
      });
    });

    test('should set correct hierarchy information', () => {
      const parentSubnet = createTestSubnet('192.168.1.0', '/24', undefined, 'parent-subnet-id');
      parentSubnet.level = 1;
      
      const splitOptions: SplitOptions = {
        splitType: 'equal',
        splitCount: 2
      };

      const result = splitIPv4Subnet(parentSubnet, splitOptions, 'normal');

      result.subnets.forEach(subnet => {
        expect(subnet.parentId).toBe('parent-subnet-id');
        expect(subnet.level).toBe(2); // Parent level + 1
        expect(subnet.isSelected).toBe(false);
      });
    });
  });

  describe('validateIPv4Split', () => {
    test('should validate successful split configuration', () => {
      const parentSubnet = createTestSubnet('192.168.1.0', '/24');
      const splitOptions: SplitOptions = {
        splitType: 'equal',
        splitCount: 2
      };

      const validation = validateIPv4Split(parentSubnet, splitOptions, 'normal');

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    test('should detect invalid split count', () => {
      const parentSubnet = createTestSubnet('192.168.1.0', '/24');
      const splitOptions: SplitOptions = {
        splitType: 'equal',
        splitCount: 1 // Invalid - must be at least 2
      };

      const validation = validateIPv4Split(parentSubnet, splitOptions, 'normal');

      expect(validation.isValid).toBe(false);
      expect(validation.errors).toContain('Split count must be at least 2 for equal splits');
    });

    test('should detect target CIDR exceeding /32', () => {
      const parentSubnet = createTestSubnet('192.168.1.0', '/31');
      const splitOptions: SplitOptions = {
        splitType: 'custom',
        customCidr: 33 // Invalid - exceeds /32
      };

      const validation = validateIPv4Split(parentSubnet, splitOptions, 'normal');

      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(error => error.includes('Target CIDR must be between 0 and 32'))).toBe(true);
    });

    test('should detect cloud provider CIDR violations', () => {
      const parentSubnet = createTestSubnet('10.0.0.0', '/24');
      const splitOptions: SplitOptions = {
        splitType: 'custom',
        customCidr: 30 // Too small for AWS (max /28)
      };

      const validation = validateIPv4Split(parentSubnet, splitOptions, 'aws');

      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(error => error.includes('AWS does not support subnets smaller than /28'))).toBe(true);
    });

    test('should warn about performance impact', () => {
      const parentSubnet = createTestSubnet('10.0.0.0', '/16');
      const splitOptions: SplitOptions = {
        splitType: 'custom',
        customCidr: 24 // Will create 256 subnets
      };

      const validation = validateIPv4Split(parentSubnet, splitOptions, 'normal');

      expect(validation.isValid).toBe(true);
      expect(validation.warnings.some(warning => warning.includes('may impact performance'))).toBe(true);
    });

    test('should provide helpful suggestions', () => {
      const parentSubnet = createTestSubnet('10.0.0.0', '/24');
      const splitOptions: SplitOptions = {
        splitType: 'custom',
        customCidr: 30 // Small subnets for AWS
      };

      const validation = validateIPv4Split(parentSubnet, splitOptions, 'aws');

      expect(validation.suggestions).toBeDefined();
      expect(validation.suggestions!.length).toBeGreaterThan(0);
    });
  });

  describe('calculateSplitPreview', () => {
    test('should calculate preview for equal split', () => {
      const splitOptions: SplitOptions = {
        splitType: 'equal',
        splitCount: 4
      };

      const preview = calculateSplitPreview(24, splitOptions);

      expect(preview.isValid).toBe(true);
      expect(preview.targetCidr).toBe(26); // 24 + 2 bits for 4 subnets
      expect(preview.subnetCount).toBe(4);
      expect(preview.subnetSize).toBe(64); // 2^(32-26)
    });

    test('should calculate preview for custom split', () => {
      const splitOptions: SplitOptions = {
        splitType: 'custom',
        customCidr: 28
      };

      const preview = calculateSplitPreview(24, splitOptions);

      expect(preview.isValid).toBe(true);
      expect(preview.targetCidr).toBe(28);
      expect(preview.subnetCount).toBe(16); // 2^(28-24)
      expect(preview.subnetSize).toBe(16); // 2^(32-28)
    });

    test('should handle invalid split configurations', () => {
      const splitOptions: SplitOptions = {
        splitType: 'equal',
        splitCount: 0
      };

      const preview = calculateSplitPreview(24, splitOptions);

      expect(preview.isValid).toBe(false);
      expect(preview.error).toBe('Split count must be at least 2');
    });

    test('should detect CIDR out of bounds', () => {
      const splitOptions: SplitOptions = {
        splitType: 'custom',
        customCidr: 33 // Invalid
      };

      const preview = calculateSplitPreview(24, splitOptions);

      expect(preview.isValid).toBe(false);
      expect(preview.error).toContain('not exceed /32');
    });
  });

  describe('createSubnetError', () => {
    test('should create validation error', () => {
      const error = createSubnetError('validation', 'Invalid input', { field: 'cidr' });

      expect(error.type).toBe('validation');
      expect(error.message).toBe('Invalid input');
      expect(error.details).toEqual({ field: 'cidr' });
      expect(error.recoverable).toBe(true);
      expect(error.timestamp).toBeGreaterThan(0);
    });

    test('should create calculation error', () => {
      const error = createSubnetError('calculation', 'Math error');

      expect(error.type).toBe('calculation');
      expect(error.message).toBe('Math error');
      expect(error.recoverable).toBe(false);
    });

    test('should create performance error', () => {
      const error = createSubnetError('performance', 'Too many subnets');

      expect(error.type).toBe('performance');
      expect(error.recoverable).toBe(true);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle very large subnets', () => {
      const parentSubnet = createTestSubnet('10.0.0.0', '/16'); // Large subnet
      const splitOptions: SplitOptions = {
        splitType: 'custom',
        customCidr: 24, // Creates 256 subnets
        maxResults: 10 // Limit to prevent memory issues
      };

      const result = splitIPv4Subnet(parentSubnet, splitOptions, 'normal');

      expect(result.subnets).toHaveLength(10);
      expect(result.subnets[0].network).toBe('10.0.0.0');
      expect(result.subnets[1].network).toBe('10.0.1.0');
    });

    test('should handle subnet at network boundary', () => {
      const parentSubnet = createTestSubnet('255.255.255.0', '/24');
      const splitOptions: SplitOptions = {
        splitType: 'equal',
        splitCount: 2
      };

      const result = splitIPv4Subnet(parentSubnet, splitOptions, 'normal');

      expect(result.subnets).toHaveLength(2);
      expect(result.subnets[0].network).toBe('255.255.255.0');
      expect(result.subnets[1].network).toBe('255.255.255.128');
    });

    test('should handle missing split options', () => {
      const parentSubnet = createTestSubnet('192.168.1.0', '/24');
      const result = splitIPv4Subnet(parentSubnet, null as unknown as SplitOptions, 'normal');

      expect(result.subnets).toHaveLength(0);
      expect(result.totalSubnets).toBe(0);
    });

    test('should handle malformed parent subnet', () => {
      const malformedSubnet = {
        ...createTestSubnet('192.168.1.0', '/24'),
        cidr: 'invalid-cidr'
      };

      const splitOptions: SplitOptions = {
        splitType: 'equal',
        splitCount: 2
      };

      const result = splitIPv4Subnet(malformedSubnet, splitOptions, 'normal');

      expect(result.subnets).toHaveLength(0);
    });
  });
});
describe('IPv4 Subnet Adjacency Validation', () => {
  describe('validateSubnetAdjacency', () => {
    test('should validate adjacent subnets successfully', () => {
      const subnet1 = createTestSubnet('192.168.1.0', '/25');
      const subnet2 = createTestSubnet('192.168.1.128', '/25');
      
      const splitSubnet1: SplitSubnet = {
        id: 'subnet1',
        network: subnet1.network,
        broadcast: subnet1.broadcast,
        firstHost: subnet1.firstHost,
        lastHost: subnet1.lastHost,
        cidr: 25,
        totalHosts: subnet1.totalHosts,
        usableHosts: subnet1.usableHosts,
        parentId: 'parent1',
        level: 1,
        isSelected: false,
        ipVersion: 'ipv4'
      };

      const splitSubnet2: SplitSubnet = {
        id: 'subnet2',
        network: subnet2.network,
        broadcast: subnet2.broadcast,
        firstHost: subnet2.firstHost,
        lastHost: subnet2.lastHost,
        cidr: 25,
        totalHosts: subnet2.totalHosts,
        usableHosts: subnet2.usableHosts,
        parentId: 'parent1',
        level: 1,
        isSelected: false,
        ipVersion: 'ipv4'
      };

      const result = validateSubnetAdjacency([splitSubnet1, splitSubnet2]);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should detect non-adjacent subnets', () => {
      const subnet1 = createTestSubnet('192.168.1.0', '/25');
      const subnet2 = createTestSubnet('192.168.2.0', '/25'); // Gap between 1.x and 2.x
      
      const splitSubnet1: SplitSubnet = {
        id: 'subnet1',
        network: subnet1.network,
        broadcast: subnet1.broadcast,
        firstHost: subnet1.firstHost,
        lastHost: subnet1.lastHost,
        cidr: 25,
        totalHosts: subnet1.totalHosts,
        usableHosts: subnet1.usableHosts,
        parentId: 'parent1',
        level: 1,
        isSelected: false,
        ipVersion: 'ipv4'
      };

      const splitSubnet2: SplitSubnet = {
        id: 'subnet2',
        network: subnet2.network,
        broadcast: subnet2.broadcast,
        firstHost: subnet2.firstHost,
        lastHost: subnet2.lastHost,
        cidr: 25,
        totalHosts: subnet2.totalHosts,
        usableHosts: subnet2.usableHosts,
        parentId: 'parent1',
        level: 1,
        isSelected: false,
        ipVersion: 'ipv4'
      };

      const result = validateSubnetAdjacency([splitSubnet1, splitSubnet2]);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('Gap detected'))).toBe(true);
    });

    test('should detect different sized subnets', () => {
      const subnet1 = createTestSubnet('192.168.1.0', '/25');
      const subnet2 = createTestSubnet('192.168.1.128', '/26');
      
      const splitSubnet1: SplitSubnet = {
        id: 'subnet1',
        network: subnet1.network,
        broadcast: subnet1.broadcast,
        firstHost: subnet1.firstHost,
        lastHost: subnet1.lastHost,
        cidr: 25,
        totalHosts: subnet1.totalHosts,
        usableHosts: subnet1.usableHosts,
        parentId: 'parent1',
        level: 1,
        isSelected: false,
        ipVersion: 'ipv4'
      };

      const splitSubnet2: SplitSubnet = {
        id: 'subnet2',
        network: subnet2.network,
        broadcast: subnet2.broadcast,
        firstHost: subnet2.firstHost,
        lastHost: subnet2.lastHost,
        cidr: 26,
        totalHosts: subnet2.totalHosts,
        usableHosts: subnet2.usableHosts,
        parentId: 'parent1',
        level: 1,
        isSelected: false,
        ipVersion: 'ipv4'
      };

      const result = validateSubnetAdjacency([splitSubnet1, splitSubnet2]);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('same size'))).toBe(true);
    });

    test('should detect overlapping subnets', () => {
      const subnet1 = createTestSubnet('192.168.1.0', '/24');
      const subnet2 = createTestSubnet('192.168.1.128', '/25'); // Overlaps with subnet1
      
      const splitSubnet1: SplitSubnet = {
        id: 'subnet1',
        network: subnet1.network,
        broadcast: subnet1.broadcast,
        firstHost: subnet1.firstHost,
        lastHost: subnet1.lastHost,
        cidr: 24,
        totalHosts: subnet1.totalHosts,
        usableHosts: subnet1.usableHosts,
        parentId: 'parent1',
        level: 1,
        isSelected: false,
        ipVersion: 'ipv4'
      };

      const splitSubnet2: SplitSubnet = {
        id: 'subnet2',
        network: subnet2.network,
        broadcast: subnet2.broadcast,
        firstHost: subnet2.firstHost,
        lastHost: subnet2.lastHost,
        cidr: 25,
        totalHosts: subnet2.totalHosts,
        usableHosts: subnet2.usableHosts,
        parentId: 'parent1',
        level: 1,
        isSelected: false,
        ipVersion: 'ipv4'
      };

      const result = validateSubnetAdjacency([splitSubnet1, splitSubnet2]);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('overlap'))).toBe(true);
    });

    test('should validate power of 2 requirement', () => {
      // Create 3 adjacent /26 subnets (not a power of 2)
      const subnets: SplitSubnet[] = [];
      for (let i = 0; i < 3; i++) {
        const network = `192.168.1.${i * 64}`;
        const subnet = createTestSubnet(network, '/26');
        subnets.push({
          id: `subnet${i}`,
          network: subnet.network,
          broadcast: subnet.broadcast,
          firstHost: subnet.firstHost,
          lastHost: subnet.lastHost,
          cidr: 26,
          totalHosts: subnet.totalHosts,
          usableHosts: subnet.usableHosts,
          parentId: 'parent1',
          level: 1,
          isSelected: false,
          ipVersion: 'ipv4'
        });
      }

      const result = validateSubnetAdjacency(subnets);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('power of 2'))).toBe(true);
    });

    test('should validate network boundary alignment', () => {
      // Create 2 /26 subnets that don't align to /25 boundary
      const subnet1 = createTestSubnet('192.168.1.64', '/26'); // Starts at .64, not .0
      const subnet2 = createTestSubnet('192.168.1.128', '/26');
      
      const splitSubnet1: SplitSubnet = {
        id: 'subnet1',
        network: subnet1.network,
        broadcast: subnet1.broadcast,
        firstHost: subnet1.firstHost,
        lastHost: subnet1.lastHost,
        cidr: 26,
        totalHosts: subnet1.totalHosts,
        usableHosts: subnet1.usableHosts,
        parentId: 'parent1',
        level: 1,
        isSelected: false,
        ipVersion: 'ipv4'
      };

      const splitSubnet2: SplitSubnet = {
        id: 'subnet2',
        network: subnet2.network,
        broadcast: subnet2.broadcast,
        firstHost: subnet2.firstHost,
        lastHost: subnet2.lastHost,
        cidr: 26,
        totalHosts: subnet2.totalHosts,
        usableHosts: subnet2.usableHosts,
        parentId: 'parent1',
        level: 1,
        isSelected: false,
        ipVersion: 'ipv4'
      };

      const result = validateSubnetAdjacency([splitSubnet1, splitSubnet2]);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('boundary'))).toBe(true);
    });

    test('should handle insufficient subnets', () => {
      const result = validateSubnetAdjacency([]);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('At least 2 subnets'))).toBe(true);
    });

    test('should handle mixed IP versions', () => {
      const subnet1 = createTestSubnet('192.168.1.0', '/25');
      const splitSubnet1: SplitSubnet = {
        id: 'subnet1',
        network: subnet1.network,
        broadcast: subnet1.broadcast,
        firstHost: subnet1.firstHost,
        lastHost: subnet1.lastHost,
        cidr: 25,
        totalHosts: subnet1.totalHosts,
        usableHosts: subnet1.usableHosts,
        parentId: 'parent1',
        level: 1,
        isSelected: false,
        ipVersion: 'ipv6' // Mixed with IPv4
      };

      const subnet2 = createTestSubnet('192.168.1.128', '/25');
      const splitSubnet2: SplitSubnet = {
        id: 'subnet2',
        network: subnet2.network,
        broadcast: subnet2.broadcast,
        firstHost: subnet2.firstHost,
        lastHost: subnet2.lastHost,
        cidr: 25,
        totalHosts: subnet2.totalHosts,
        usableHosts: subnet2.usableHosts,
        parentId: 'parent1',
        level: 1,
        isSelected: false,
        ipVersion: 'ipv4'
      };

      const result = validateSubnetAdjacency([splitSubnet1, splitSubnet2]);

      expect(result.isValid).toBe(false);
      expect(result.errors.some(error => error.includes('IPv4'))).toBe(true);
    });
  });

  describe('areSubnetsAdjacent', () => {
    test('should detect adjacent subnets', () => {
      const subnet1 = createTestSubnet('192.168.1.0', '/25');
      const subnet2 = createTestSubnet('192.168.1.128', '/25');
      
      const splitSubnet1: SplitSubnet = {
        id: 'subnet1',
        network: subnet1.network,
        broadcast: subnet1.broadcast,
        firstHost: subnet1.firstHost,
        lastHost: subnet1.lastHost,
        cidr: 25,
        totalHosts: subnet1.totalHosts,
        usableHosts: subnet1.usableHosts,
        parentId: 'parent1',
        level: 1,
        isSelected: false,
        ipVersion: 'ipv4'
      };

      const splitSubnet2: SplitSubnet = {
        id: 'subnet2',
        network: subnet2.network,
        broadcast: subnet2.broadcast,
        firstHost: subnet2.firstHost,
        lastHost: subnet2.lastHost,
        cidr: 25,
        totalHosts: subnet2.totalHosts,
        usableHosts: subnet2.usableHosts,
        parentId: 'parent1',
        level: 1,
        isSelected: false,
        ipVersion: 'ipv4'
      };

      expect(areSubnetsAdjacent(splitSubnet1, splitSubnet2)).toBe(true);
      expect(areSubnetsAdjacent(splitSubnet2, splitSubnet1)).toBe(true); // Should work both ways
    });

    test('should detect non-adjacent subnets', () => {
      const subnet1 = createTestSubnet('192.168.1.0', '/25');
      const subnet2 = createTestSubnet('192.168.2.0', '/25');
      
      const splitSubnet1: SplitSubnet = {
        id: 'subnet1',
        network: subnet1.network,
        broadcast: subnet1.broadcast,
        firstHost: subnet1.firstHost,
        lastHost: subnet1.lastHost,
        cidr: 25,
        totalHosts: subnet1.totalHosts,
        usableHosts: subnet1.usableHosts,
        parentId: 'parent1',
        level: 1,
        isSelected: false,
        ipVersion: 'ipv4'
      };

      const splitSubnet2: SplitSubnet = {
        id: 'subnet2',
        network: subnet2.network,
        broadcast: subnet2.broadcast,
        firstHost: subnet2.firstHost,
        lastHost: subnet2.lastHost,
        cidr: 25,
        totalHosts: subnet2.totalHosts,
        usableHosts: subnet2.usableHosts,
        parentId: 'parent1',
        level: 1,
        isSelected: false,
        ipVersion: 'ipv4'
      };

      expect(areSubnetsAdjacent(splitSubnet1, splitSubnet2)).toBe(false);
    });

    test('should handle different sized subnets', () => {
      const subnet1 = createTestSubnet('192.168.1.0', '/25');
      const subnet2 = createTestSubnet('192.168.1.128', '/26');
      
      const splitSubnet1: SplitSubnet = {
        id: 'subnet1',
        network: subnet1.network,
        broadcast: subnet1.broadcast,
        firstHost: subnet1.firstHost,
        lastHost: subnet1.lastHost,
        cidr: 25,
        totalHosts: subnet1.totalHosts,
        usableHosts: subnet1.usableHosts,
        parentId: 'parent1',
        level: 1,
        isSelected: false,
        ipVersion: 'ipv4'
      };

      const splitSubnet2: SplitSubnet = {
        id: 'subnet2',
        network: subnet2.network,
        broadcast: subnet2.broadcast,
        firstHost: subnet2.firstHost,
        lastHost: subnet2.lastHost,
        cidr: 26,
        totalHosts: subnet2.totalHosts,
        usableHosts: subnet2.usableHosts,
        parentId: 'parent1',
        level: 1,
        isSelected: false,
        ipVersion: 'ipv4'
      };

      expect(areSubnetsAdjacent(splitSubnet1, splitSubnet2)).toBe(false);
    });

    test('should handle IPv6 subnets', () => {
      const subnet1 = createTestSubnet('192.168.1.0', '/25');
      const subnet2 = createTestSubnet('192.168.1.128', '/25');
      
      const splitSubnet1: SplitSubnet = {
        id: 'subnet1',
        network: subnet1.network,
        broadcast: subnet1.broadcast,
        firstHost: subnet1.firstHost,
        lastHost: subnet1.lastHost,
        cidr: 25,
        totalHosts: subnet1.totalHosts,
        usableHosts: subnet1.usableHosts,
        parentId: 'parent1',
        level: 1,
        isSelected: false,
        ipVersion: 'ipv6' // IPv6 should return false
      };

      const splitSubnet2: SplitSubnet = {
        id: 'subnet2',
        network: subnet2.network,
        broadcast: subnet2.broadcast,
        firstHost: subnet2.firstHost,
        lastHost: subnet2.lastHost,
        cidr: 25,
        totalHosts: subnet2.totalHosts,
        usableHosts: subnet2.usableHosts,
        parentId: 'parent1',
        level: 1,
        isSelected: false,
        ipVersion: 'ipv4'
      };

      expect(areSubnetsAdjacent(splitSubnet1, splitSubnet2)).toBe(false);
    });
  });

  describe('findAdjacentSubnets', () => {
    test('should find adjacent subnets', () => {
      const subnets: SplitSubnet[] = [];
      
      // Create 4 adjacent /26 subnets
      for (let i = 0; i < 4; i++) {
        const network = `192.168.1.${i * 64}`;
        const subnet = createTestSubnet(network, '/26');
        subnets.push({
          id: `subnet${i}`,
          network: subnet.network,
          broadcast: subnet.broadcast,
          firstHost: subnet.firstHost,
          lastHost: subnet.lastHost,
          cidr: 26,
          totalHosts: subnet.totalHosts,
          usableHosts: subnet.usableHosts,
          parentId: 'parent1',
          level: 1,
          isSelected: false,
          ipVersion: 'ipv4'
        });
      }

      const adjacentToFirst = findAdjacentSubnets(subnets[0], subnets);
      expect(adjacentToFirst).toHaveLength(1);
      expect(adjacentToFirst[0].id).toBe('subnet1');

      const adjacentToSecond = findAdjacentSubnets(subnets[1], subnets);
      expect(adjacentToSecond).toHaveLength(2);
      expect(adjacentToSecond.map(s => s.id).sort()).toEqual(['subnet0', 'subnet2']);
    });

    test('should exclude the target subnet itself', () => {
      const subnet1 = createTestSubnet('192.168.1.0', '/25');
      const subnet2 = createTestSubnet('192.168.1.128', '/25');
      
      const splitSubnet1: SplitSubnet = {
        id: 'subnet1',
        network: subnet1.network,
        broadcast: subnet1.broadcast,
        firstHost: subnet1.firstHost,
        lastHost: subnet1.lastHost,
        cidr: 25,
        totalHosts: subnet1.totalHosts,
        usableHosts: subnet1.usableHosts,
        parentId: 'parent1',
        level: 1,
        isSelected: false,
        ipVersion: 'ipv4'
      };

      const splitSubnet2: SplitSubnet = {
        id: 'subnet2',
        network: subnet2.network,
        broadcast: subnet2.broadcast,
        firstHost: subnet2.firstHost,
        lastHost: subnet2.lastHost,
        cidr: 25,
        totalHosts: subnet2.totalHosts,
        usableHosts: subnet2.usableHosts,
        parentId: 'parent1',
        level: 1,
        isSelected: false,
        ipVersion: 'ipv4'
      };

      const adjacent = findAdjacentSubnets(splitSubnet1, [splitSubnet1, splitSubnet2]);
      expect(adjacent).toHaveLength(1);
      expect(adjacent[0].id).toBe('subnet2');
    });
  });

  describe('groupAdjacentSubnets', () => {
    test('should group adjacent subnets correctly', () => {
      const subnets: SplitSubnet[] = [];
      
      // Create 2 groups of adjacent subnets with a gap between them
      // Group 1: 192.168.1.0/26 and 192.168.1.64/26
      // Gap: 192.168.1.128/26 is missing
      // Group 2: 192.168.1.192/26 (isolated)
      // Group 3: 192.168.3.0/26 (isolated, different octet with gap)
      const networks = ['192.168.1.0', '192.168.1.64', '192.168.1.192', '192.168.3.0'];
      
      for (let i = 0; i < networks.length; i++) {
        const subnet = createTestSubnet(networks[i], '/26');
        subnets.push({
          id: `subnet${i}`,
          network: subnet.network,
          broadcast: subnet.broadcast,
          firstHost: subnet.firstHost,
          lastHost: subnet.lastHost,
          cidr: 26,
          totalHosts: subnet.totalHosts,
          usableHosts: subnet.usableHosts,
          parentId: 'parent1',
          level: 1,
          isSelected: false,
          ipVersion: 'ipv4'
        });
      }

      const groups = groupAdjacentSubnets(subnets);
      
      expect(groups).toHaveLength(1); // Only the first two should be grouped (adjacent)
      expect(groups[0]).toHaveLength(2);
      expect(groups[0].map(s => s.network).sort()).toEqual(['192.168.1.0', '192.168.1.64']);
    });

    test('should handle single subnets (no groups)', () => {
      const subnet = createTestSubnet('192.168.1.0', '/24');
      const splitSubnet: SplitSubnet = {
        id: 'subnet1',
        network: subnet.network,
        broadcast: subnet.broadcast,
        firstHost: subnet.firstHost,
        lastHost: subnet.lastHost,
        cidr: 24,
        totalHosts: subnet.totalHosts,
        usableHosts: subnet.usableHosts,
        parentId: 'parent1',
        level: 1,
        isSelected: false,
        ipVersion: 'ipv4'
      };

      const groups = groupAdjacentSubnets([splitSubnet]);
      expect(groups).toHaveLength(0); // No groups since we need at least 2 subnets
    });
  });

  describe('calculateJoinedSubnet', () => {
    test('should calculate joined subnet correctly', () => {
      const subnet1 = createTestSubnet('192.168.1.0', '/25');
      const subnet2 = createTestSubnet('192.168.1.128', '/25');
      
      const splitSubnet1: SplitSubnet = {
        id: 'subnet1',
        network: subnet1.network,
        broadcast: subnet1.broadcast,
        firstHost: subnet1.firstHost,
        lastHost: subnet1.lastHost,
        cidr: 25,
        totalHosts: subnet1.totalHosts,
        usableHosts: subnet1.usableHosts,
        parentId: 'parent1',
        level: 2,
        isSelected: false,
        ipVersion: 'ipv4'
      };

      const splitSubnet2: SplitSubnet = {
        id: 'subnet2',
        network: subnet2.network,
        broadcast: subnet2.broadcast,
        firstHost: subnet2.firstHost,
        lastHost: subnet2.lastHost,
        cidr: 25,
        totalHosts: subnet2.totalHosts,
        usableHosts: subnet2.usableHosts,
        parentId: 'parent1',
        level: 2,
        isSelected: false,
        ipVersion: 'ipv4'
      };

      const joined = calculateJoinedSubnet([splitSubnet1, splitSubnet2]);

      expect(joined).not.toBeNull();
      expect(joined!.network).toBe('192.168.1.0');
      expect(joined!.broadcast).toBe('192.168.1.255');
      expect(joined!.cidr).toBe(24); // /25 + /25 = /24
      expect(joined!.totalHosts).toBe(256);
      expect(joined!.usableHosts).toBe(254);
      expect(joined!.level).toBe(1); // One level up from original
      expect(joined!.parentId).toBe('parent1');
      expect(joined!.ipVersion).toBe('ipv4');
    });

    test('should handle /31 and /32 edge cases', () => {
      // Test /32 joining
      const subnet1 = createTestSubnet('192.168.1.0', '/32');
      const subnet2 = createTestSubnet('192.168.1.1', '/32');
      
      const splitSubnet1: SplitSubnet = {
        id: 'subnet1',
        network: subnet1.network,
        broadcast: subnet1.broadcast,
        firstHost: subnet1.firstHost,
        lastHost: subnet1.lastHost,
        cidr: 32,
        totalHosts: 1,
        usableHosts: 1,
        parentId: 'parent1',
        level: 2,
        isSelected: false,
        ipVersion: 'ipv4'
      };

      const splitSubnet2: SplitSubnet = {
        id: 'subnet2',
        network: subnet2.network,
        broadcast: subnet2.broadcast,
        firstHost: subnet2.firstHost,
        lastHost: subnet2.lastHost,
        cidr: 32,
        totalHosts: 1,
        usableHosts: 1,
        parentId: 'parent1',
        level: 2,
        isSelected: false,
        ipVersion: 'ipv4'
      };

      const joined = calculateJoinedSubnet([splitSubnet1, splitSubnet2]);

      expect(joined).not.toBeNull();
      expect(joined!.cidr).toBe(31); // /32 + /32 = /31
      expect(joined!.totalHosts).toBe(2);
      expect(joined!.usableHosts).toBe(2); // /31 has 2 usable hosts (RFC 3021)
      expect(joined!.firstHost).toBe('192.168.1.0');
      expect(joined!.lastHost).toBe('192.168.1.1');
    });

    test('should return null for invalid subnet groups', () => {
      const subnet1 = createTestSubnet('192.168.1.0', '/25');
      const subnet2 = createTestSubnet('192.168.2.0', '/25'); // Not adjacent
      
      const splitSubnet1: SplitSubnet = {
        id: 'subnet1',
        network: subnet1.network,
        broadcast: subnet1.broadcast,
        firstHost: subnet1.firstHost,
        lastHost: subnet1.lastHost,
        cidr: 25,
        totalHosts: subnet1.totalHosts,
        usableHosts: subnet1.usableHosts,
        parentId: 'parent1',
        level: 2,
        isSelected: false,
        ipVersion: 'ipv4'
      };

      const splitSubnet2: SplitSubnet = {
        id: 'subnet2',
        network: subnet2.network,
        broadcast: subnet2.broadcast,
        firstHost: subnet2.firstHost,
        lastHost: subnet2.lastHost,
        cidr: 25,
        totalHosts: subnet2.totalHosts,
        usableHosts: subnet2.usableHosts,
        parentId: 'parent1',
        level: 2,
        isSelected: false,
        ipVersion: 'ipv4'
      };

      const joined = calculateJoinedSubnet([splitSubnet1, splitSubnet2]);
      expect(joined).toBeNull();
    });

    test('should preserve cloud provider constraints', () => {
      const subnet1 = createTestSubnet('10.0.0.0', '/25');
      const subnet2 = createTestSubnet('10.0.0.128', '/25');
      
      // Add AWS cloud reservations to the first subnet
      const awsReservations: CloudReservation[] = [
        { ip: '10.0.0.0', purpose: 'Network Address', description: 'Network identifier' },
        { ip: '10.0.0.1', purpose: 'VPC Router', description: 'Reserved for VPC router' },
        { ip: '10.0.0.2', purpose: 'DNS Server', description: 'Reserved for DNS' },
        { ip: '10.0.0.3', purpose: 'Future Use', description: 'Reserved for future use' },
        { ip: '10.0.0.127', purpose: 'Broadcast Address', description: 'Broadcast address' }
      ];

      const splitSubnet1: SplitSubnet = {
        id: 'subnet1',
        network: subnet1.network,
        broadcast: subnet1.broadcast,
        firstHost: '10.0.0.4', // AWS offset
        lastHost: subnet1.lastHost,
        cidr: 25,
        totalHosts: subnet1.totalHosts,
        usableHosts: subnet1.totalHosts - 5, // AWS reserves 5 IPs
        parentId: 'parent1',
        level: 2,
        isSelected: false,
        ipVersion: 'ipv4',
        cloudReserved: awsReservations
      };

      const splitSubnet2: SplitSubnet = {
        id: 'subnet2',
        network: subnet2.network,
        broadcast: subnet2.broadcast,
        firstHost: subnet2.firstHost,
        lastHost: subnet2.lastHost,
        cidr: 25,
        totalHosts: subnet2.totalHosts,
        usableHosts: subnet2.usableHosts,
        parentId: 'parent1',
        level: 2,
        isSelected: false,
        ipVersion: 'ipv4'
      };

      const joined = calculateJoinedSubnet([splitSubnet1, splitSubnet2]);

      expect(joined).not.toBeNull();
      expect(joined!.cloudReserved).toBeDefined();
      expect(joined!.cloudReserved).toHaveLength(5);
      expect(joined!.firstHost).toBe('10.0.0.4'); // Should maintain AWS offset
      expect(joined!.usableHosts).toBe(joined!.totalHosts - 5); // AWS constraint applied
    });
  });
});describe
('IPv4 Subnet Joining Algorithm', () => {
  describe('joinAdjacentSubnets', () => {
    test('should join two adjacent /25 subnets into /24', () => {
      const subnet1 = createTestSubnet('192.168.1.0', '/25');
      const subnet2 = createTestSubnet('192.168.1.128', '/25');
      
      const splitSubnet1: SplitSubnet = {
        id: 'subnet1',
        network: subnet1.network,
        broadcast: subnet1.broadcast,
        firstHost: subnet1.firstHost,
        lastHost: subnet1.lastHost,
        cidr: 25,
        totalHosts: subnet1.totalHosts,
        usableHosts: subnet1.usableHosts,
        parentId: 'parent1',
        level: 2,
        isSelected: false,
        ipVersion: 'ipv4'
      };

      const splitSubnet2: SplitSubnet = {
        id: 'subnet2',
        network: subnet2.network,
        broadcast: subnet2.broadcast,
        firstHost: subnet2.firstHost,
        lastHost: subnet2.lastHost,
        cidr: 25,
        totalHosts: subnet2.totalHosts,
        usableHosts: subnet2.usableHosts,
        parentId: 'parent1',
        level: 2,
        isSelected: false,
        ipVersion: 'ipv4'
      };

      const result = joinAdjacentSubnets([splitSubnet1, splitSubnet2], 'normal');

      expect(result.subnets).toHaveLength(1);
      expect(result.totalSubnets).toBe(1);
      
      const joinedSubnet = result.subnets[0];
      expect(joinedSubnet.network).toBe('192.168.1.0');
      expect(joinedSubnet.broadcast).toBe('192.168.1.255');
      expect(joinedSubnet.cidr).toBe(24);
      expect(joinedSubnet.totalHosts).toBe(256);
      expect(joinedSubnet.usableHosts).toBe(254);
      expect(joinedSubnet.level).toBe(1); // One level up
    });

    test('should join four adjacent /26 subnets into /24', () => {
      const subnets: SplitSubnet[] = [];
      
      // Create 4 adjacent /26 subnets
      for (let i = 0; i < 4; i++) {
        const network = `192.168.1.${i * 64}`;
        const subnet = createTestSubnet(network, '/26');
        subnets.push({
          id: `subnet${i}`,
          network: subnet.network,
          broadcast: subnet.broadcast,
          firstHost: subnet.firstHost,
          lastHost: subnet.lastHost,
          cidr: 26,
          totalHosts: subnet.totalHosts,
          usableHosts: subnet.usableHosts,
          parentId: 'parent1',
          level: 2,
          isSelected: false,
          ipVersion: 'ipv4'
        });
      }

      const result = joinAdjacentSubnets(subnets, 'normal');

      expect(result.subnets).toHaveLength(1);
      
      const joinedSubnet = result.subnets[0];
      expect(joinedSubnet.network).toBe('192.168.1.0');
      expect(joinedSubnet.broadcast).toBe('192.168.1.255');
      expect(joinedSubnet.cidr).toBe(24); // /26 -> /24 (4 subnets = 2^2, so 26-2=24)
      expect(joinedSubnet.totalHosts).toBe(256);
      expect(joinedSubnet.usableHosts).toBe(254);
    });

    test('should apply AWS cloud provider constraints', () => {
      const subnet1 = createTestSubnet('10.0.0.0', '/25');
      const subnet2 = createTestSubnet('10.0.0.128', '/25');
      
      const splitSubnet1: SplitSubnet = {
        id: 'subnet1',
        network: subnet1.network,
        broadcast: subnet1.broadcast,
        firstHost: subnet1.firstHost,
        lastHost: subnet1.lastHost,
        cidr: 25,
        totalHosts: subnet1.totalHosts,
        usableHosts: subnet1.usableHosts,
        parentId: 'parent1',
        level: 2,
        isSelected: false,
        ipVersion: 'ipv4'
      };

      const splitSubnet2: SplitSubnet = {
        id: 'subnet2',
        network: subnet2.network,
        broadcast: subnet2.broadcast,
        firstHost: subnet2.firstHost,
        lastHost: subnet2.lastHost,
        cidr: 25,
        totalHosts: subnet2.totalHosts,
        usableHosts: subnet2.usableHosts,
        parentId: 'parent1',
        level: 2,
        isSelected: false,
        ipVersion: 'ipv4'
      };

      const result = joinAdjacentSubnets([splitSubnet1, splitSubnet2], 'aws');

      expect(result.subnets).toHaveLength(1);
      
      const joinedSubnet = result.subnets[0];
      expect(joinedSubnet.cloudReserved).toHaveLength(5); // AWS reserves 5 IPs
      expect(joinedSubnet.usableHosts).toBe(joinedSubnet.totalHosts - 5);
      expect(joinedSubnet.firstHost).toBe('10.0.0.4'); // AWS offset
    });

    test('should handle invalid inputs gracefully', () => {
      const result = joinAdjacentSubnets([], 'normal');

      expect(result.subnets).toHaveLength(0);
      expect(result.totalSubnets).toBe(0);
    });

    test('should handle non-adjacent subnets', () => {
      const subnet1 = createTestSubnet('192.168.1.0', '/25');
      const subnet2 = createTestSubnet('192.168.2.0', '/25'); // Not adjacent
      
      const splitSubnet1: SplitSubnet = {
        id: 'subnet1',
        network: subnet1.network,
        broadcast: subnet1.broadcast,
        firstHost: subnet1.firstHost,
        lastHost: subnet1.lastHost,
        cidr: 25,
        totalHosts: subnet1.totalHosts,
        usableHosts: subnet1.usableHosts,
        parentId: 'parent1',
        level: 2,
        isSelected: false,
        ipVersion: 'ipv4'
      };

      const splitSubnet2: SplitSubnet = {
        id: 'subnet2',
        network: subnet2.network,
        broadcast: subnet2.broadcast,
        firstHost: subnet2.firstHost,
        lastHost: subnet2.lastHost,
        cidr: 25,
        totalHosts: subnet2.totalHosts,
        usableHosts: subnet2.usableHosts,
        parentId: 'parent1',
        level: 2,
        isSelected: false,
        ipVersion: 'ipv4'
      };

      const result = joinAdjacentSubnets([splitSubnet1, splitSubnet2], 'normal');

      expect(result.subnets).toHaveLength(0); // Should fail
    });

    test('should handle mixed IP versions', () => {
      const subnet1 = createTestSubnet('192.168.1.0', '/25');
      const subnet2 = createTestSubnet('192.168.1.128', '/25');
      
      const splitSubnet1: SplitSubnet = {
        id: 'subnet1',
        network: subnet1.network,
        broadcast: subnet1.broadcast,
        firstHost: subnet1.firstHost,
        lastHost: subnet1.lastHost,
        cidr: 25,
        totalHosts: subnet1.totalHosts,
        usableHosts: subnet1.usableHosts,
        parentId: 'parent1',
        level: 2,
        isSelected: false,
        ipVersion: 'ipv6' // Mixed IP version
      };

      const splitSubnet2: SplitSubnet = {
        id: 'subnet2',
        network: subnet2.network,
        broadcast: subnet2.broadcast,
        firstHost: subnet2.firstHost,
        lastHost: subnet2.lastHost,
        cidr: 25,
        totalHosts: subnet2.totalHosts,
        usableHosts: subnet2.usableHosts,
        parentId: 'parent1',
        level: 2,
        isSelected: false,
        ipVersion: 'ipv4'
      };

      const result = joinAdjacentSubnets([splitSubnet1, splitSubnet2], 'normal');

      expect(result.subnets).toHaveLength(0); // Should fail
    });
  });

  describe('validateIPv4Join', () => {
    test('should validate successful join configuration', () => {
      const subnet1 = createTestSubnet('192.168.1.0', '/25');
      const subnet2 = createTestSubnet('192.168.1.128', '/25');
      
      const splitSubnet1: SplitSubnet = {
        id: 'subnet1',
        network: subnet1.network,
        broadcast: subnet1.broadcast,
        firstHost: subnet1.firstHost,
        lastHost: subnet1.lastHost,
        cidr: 25,
        totalHosts: subnet1.totalHosts,
        usableHosts: subnet1.usableHosts,
        parentId: 'parent1',
        level: 2,
        isSelected: false,
        ipVersion: 'ipv4'
      };

      const splitSubnet2: SplitSubnet = {
        id: 'subnet2',
        network: subnet2.network,
        broadcast: subnet2.broadcast,
        firstHost: subnet2.firstHost,
        lastHost: subnet2.lastHost,
        cidr: 25,
        totalHosts: subnet2.totalHosts,
        usableHosts: subnet2.usableHosts,
        parentId: 'parent1',
        level: 2,
        isSelected: false,
        ipVersion: 'ipv4'
      };

      const validation = validateIPv4Join([splitSubnet1, splitSubnet2], 'normal');

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    test('should detect insufficient subnets', () => {
      const subnet1 = createTestSubnet('192.168.1.0', '/25');
      const splitSubnet1: SplitSubnet = {
        id: 'subnet1',
        network: subnet1.network,
        broadcast: subnet1.broadcast,
        firstHost: subnet1.firstHost,
        lastHost: subnet1.lastHost,
        cidr: 25,
        totalHosts: subnet1.totalHosts,
        usableHosts: subnet1.usableHosts,
        parentId: 'parent1',
        level: 2,
        isSelected: false,
        ipVersion: 'ipv4'
      };

      const validation = validateIPv4Join([splitSubnet1], 'normal');

      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(error => error.includes('At least 2 subnets'))).toBe(true);
    });

    test('should detect cloud provider violations', () => {
      // Create subnets that would result in a /15 when joined (too large for AWS)
      const subnet1 = createTestSubnet('10.0.0.0', '/16');
      const subnet2 = createTestSubnet('10.1.0.0', '/16');
      
      const splitSubnet1: SplitSubnet = {
        id: 'subnet1',
        network: subnet1.network,
        broadcast: subnet1.broadcast,
        firstHost: subnet1.firstHost,
        lastHost: subnet1.lastHost,
        cidr: 16,
        totalHosts: subnet1.totalHosts,
        usableHosts: subnet1.usableHosts,
        parentId: 'parent1',
        level: 2,
        isSelected: false,
        ipVersion: 'ipv4'
      };

      const splitSubnet2: SplitSubnet = {
        id: 'subnet2',
        network: subnet2.network,
        broadcast: subnet2.broadcast,
        firstHost: subnet2.firstHost,
        lastHost: subnet2.lastHost,
        cidr: 16,
        totalHosts: subnet2.totalHosts,
        usableHosts: subnet2.usableHosts,
        parentId: 'parent1',
        level: 2,
        isSelected: false,
        ipVersion: 'ipv4'
      };

      const validation = validateIPv4Join([splitSubnet1, splitSubnet2], 'aws');

      expect(validation.isValid).toBe(false);
      expect(validation.errors.some(error => error.includes('AWS does not support subnets larger than /16'))).toBe(true);
    });

    test('should warn about performance impact', () => {
      const subnets: SplitSubnet[] = [];
      
      // Create 20 adjacent /27 subnets (more than 16)
      for (let i = 0; i < 20; i++) {
        const network = `10.0.0.${i * 32}`;
        const subnet = createTestSubnet(network, '/27');
        subnets.push({
          id: `subnet${i}`,
          network: subnet.network,
          broadcast: subnet.broadcast,
          firstHost: subnet.firstHost,
          lastHost: subnet.lastHost,
          cidr: 27,
          totalHosts: subnet.totalHosts,
          usableHosts: subnet.usableHosts,
          parentId: 'parent1',
          level: 2,
          isSelected: false,
          ipVersion: 'ipv4'
        });
      }

      const validation = validateIPv4Join(subnets, 'normal');

      expect(validation.warnings.some(warning => warning.includes('may impact performance'))).toBe(true);
    });
  });

  describe('calculateJoinPreview', () => {
    test('should calculate join preview correctly', () => {
      const subnet1 = createTestSubnet('192.168.1.0', '/25');
      const subnet2 = createTestSubnet('192.168.1.128', '/25');
      
      const splitSubnet1: SplitSubnet = {
        id: 'subnet1',
        network: subnet1.network,
        broadcast: subnet1.broadcast,
        firstHost: subnet1.firstHost,
        lastHost: subnet1.lastHost,
        cidr: 25,
        totalHosts: subnet1.totalHosts,
        usableHosts: subnet1.usableHosts,
        parentId: 'parent1',
        level: 2,
        isSelected: false,
        ipVersion: 'ipv4'
      };

      const splitSubnet2: SplitSubnet = {
        id: 'subnet2',
        network: subnet2.network,
        broadcast: subnet2.broadcast,
        firstHost: subnet2.firstHost,
        lastHost: subnet2.lastHost,
        cidr: 25,
        totalHosts: subnet2.totalHosts,
        usableHosts: subnet2.usableHosts,
        parentId: 'parent1',
        level: 2,
        isSelected: false,
        ipVersion: 'ipv4'
      };

      const preview = calculateJoinPreview([splitSubnet1, splitSubnet2]);

      expect(preview.isValid).toBe(true);
      expect(preview.joinedSubnet).toBeDefined();
      expect(preview.networkRange).toBe('192.168.1.0/24');
      expect(preview.cidrReduction).toBe(1); // /25 -> /24
      expect(preview.addressGain).toBe(0); // No gain in total addresses for adjacent subnets
    });

    test('should handle invalid join configurations', () => {
      const subnet1 = createTestSubnet('192.168.1.0', '/25');
      const subnet2 = createTestSubnet('192.168.2.0', '/25'); // Not adjacent
      
      const splitSubnet1: SplitSubnet = {
        id: 'subnet1',
        network: subnet1.network,
        broadcast: subnet1.broadcast,
        firstHost: subnet1.firstHost,
        lastHost: subnet1.lastHost,
        cidr: 25,
        totalHosts: subnet1.totalHosts,
        usableHosts: subnet1.usableHosts,
        parentId: 'parent1',
        level: 2,
        isSelected: false,
        ipVersion: 'ipv4'
      };

      const splitSubnet2: SplitSubnet = {
        id: 'subnet2',
        network: subnet2.network,
        broadcast: subnet2.broadcast,
        firstHost: subnet2.firstHost,
        lastHost: subnet2.lastHost,
        cidr: 25,
        totalHosts: subnet2.totalHosts,
        usableHosts: subnet2.usableHosts,
        parentId: 'parent1',
        level: 2,
        isSelected: false,
        ipVersion: 'ipv4'
      };

      const preview = calculateJoinPreview([splitSubnet1, splitSubnet2]);

      expect(preview.isValid).toBe(false);
      expect(preview.error).toBeDefined();
    });
  });

  describe('findOptimalJoinGroups', () => {
    test('should find optimal join groups', () => {
      const subnets: SplitSubnet[] = [];
      
      // Create 6 subnets: 4 adjacent /26 subnets and 2 adjacent /25 subnets
      // Group 1: 4 adjacent /26 subnets (192.168.1.0/26 to 192.168.1.192/26)
      for (let i = 0; i < 4; i++) {
        const network = `192.168.1.${i * 64}`;
        const subnet = createTestSubnet(network, '/26');
        subnets.push({
          id: `subnet26_${i}`,
          network: subnet.network,
          broadcast: subnet.broadcast,
          firstHost: subnet.firstHost,
          lastHost: subnet.lastHost,
          cidr: 26,
          totalHosts: subnet.totalHosts,
          usableHosts: subnet.usableHosts,
          parentId: 'parent1',
          level: 2,
          isSelected: false,
          ipVersion: 'ipv4'
        });
      }

      // Group 2: 2 adjacent /25 subnets (192.168.2.0/25 and 192.168.2.128/25)
      for (let i = 0; i < 2; i++) {
        const network = `192.168.2.${i * 128}`;
        const subnet = createTestSubnet(network, '/25');
        subnets.push({
          id: `subnet25_${i}`,
          network: subnet.network,
          broadcast: subnet.broadcast,
          firstHost: subnet.firstHost,
          lastHost: subnet.lastHost,
          cidr: 25,
          totalHosts: subnet.totalHosts,
          usableHosts: subnet.usableHosts,
          parentId: 'parent1',
          level: 2,
          isSelected: false,
          ipVersion: 'ipv4'
        });
      }

      const result = findOptimalJoinGroups(subnets);

      expect(result.groups).toHaveLength(2);
      
      // Should prioritize the group with more CIDR reduction (4 /26 subnets)
      expect(result.groups[0]).toHaveLength(4); // 4 /26 subnets
      expect(result.groups[1]).toHaveLength(2); // 2 /25 subnets
    });

    test('should handle no joinable groups', () => {
      const subnet1 = createTestSubnet('192.168.1.0', '/24');
      const splitSubnet1: SplitSubnet = {
        id: 'subnet1',
        network: subnet1.network,
        broadcast: subnet1.broadcast,
        firstHost: subnet1.firstHost,
        lastHost: subnet1.lastHost,
        cidr: 24,
        totalHosts: subnet1.totalHosts,
        usableHosts: subnet1.usableHosts,
        parentId: 'parent1',
        level: 2,
        isSelected: false,
        ipVersion: 'ipv4'
      };

      const result = findOptimalJoinGroups([splitSubnet1]);

      expect(result.groups).toHaveLength(0);
      expect(result.recommendations.some(rec => rec.includes('No adjacent subnet groups found'))).toBe(true);
    });

    test('should exclude IPv6 subnets', () => {
      const subnet1 = createTestSubnet('192.168.1.0', '/25');
      const subnet2 = createTestSubnet('192.168.1.128', '/25');
      
      const splitSubnet1: SplitSubnet = {
        id: 'subnet1',
        network: subnet1.network,
        broadcast: subnet1.broadcast,
        firstHost: subnet1.firstHost,
        lastHost: subnet1.lastHost,
        cidr: 25,
        totalHosts: subnet1.totalHosts,
        usableHosts: subnet1.usableHosts,
        parentId: 'parent1',
        level: 2,
        isSelected: false,
        ipVersion: 'ipv6' // IPv6 subnet
      };

      const splitSubnet2: SplitSubnet = {
        id: 'subnet2',
        network: subnet2.network,
        broadcast: subnet2.broadcast,
        firstHost: subnet2.firstHost,
        lastHost: subnet2.lastHost,
        cidr: 25,
        totalHosts: subnet2.totalHosts,
        usableHosts: subnet2.usableHosts,
        parentId: 'parent1',
        level: 2,
        isSelected: false,
        ipVersion: 'ipv4'
      };

      const result = findOptimalJoinGroups([splitSubnet1, splitSubnet2]);

      expect(result.groups).toHaveLength(0); // No groups since only 1 IPv4 subnet
      expect(result.recommendations.some(rec => rec.includes('Only IPv4 subnets can be joined'))).toBe(true);
    });
  });

  describe('batchJoinSubnets', () => {
    test('should perform batch joining successfully', () => {
      // Create two groups of adjacent subnets
      const group1: SplitSubnet[] = [];
      const group2: SplitSubnet[] = [];

      // Group 1: 2 adjacent /25 subnets
      for (let i = 0; i < 2; i++) {
        const network = `192.168.1.${i * 128}`;
        const subnet = createTestSubnet(network, '/25');
        group1.push({
          id: `group1_subnet${i}`,
          network: subnet.network,
          broadcast: subnet.broadcast,
          firstHost: subnet.firstHost,
          lastHost: subnet.lastHost,
          cidr: 25,
          totalHosts: subnet.totalHosts,
          usableHosts: subnet.usableHosts,
          parentId: 'parent1',
          level: 2,
          isSelected: false,
          ipVersion: 'ipv4'
        });
      }

      // Group 2: 2 adjacent /25 subnets
      for (let i = 0; i < 2; i++) {
        const network = `192.168.2.${i * 128}`;
        const subnet = createTestSubnet(network, '/25');
        group2.push({
          id: `group2_subnet${i}`,
          network: subnet.network,
          broadcast: subnet.broadcast,
          firstHost: subnet.firstHost,
          lastHost: subnet.lastHost,
          cidr: 25,
          totalHosts: subnet.totalHosts,
          usableHosts: subnet.usableHosts,
          parentId: 'parent1',
          level: 2,
          isSelected: false,
          ipVersion: 'ipv4'
        });
      }

      const result = batchJoinSubnets([group1, group2], 'normal');

      expect(result.results).toHaveLength(2);
      expect(result.summary.totalGroupsProcessed).toBe(2);
      expect(result.summary.successfulJoins).toBe(2);
      expect(result.summary.failedJoins).toBe(0);
      expect(result.summary.totalSubnetsJoined).toBe(4);
      expect(result.summary.totalSubnetsCreated).toBe(2);
      expect(result.errors).toHaveLength(0);
    });

    test('should handle failed joins gracefully', () => {
      // Create a group with non-adjacent subnets
      const invalidGroup: SplitSubnet[] = [];
      
      const subnet1 = createTestSubnet('192.168.1.0', '/25');
      const subnet2 = createTestSubnet('192.168.3.0', '/25'); // Not adjacent
      
      invalidGroup.push({
        id: 'subnet1',
        network: subnet1.network,
        broadcast: subnet1.broadcast,
        firstHost: subnet1.firstHost,
        lastHost: subnet1.lastHost,
        cidr: 25,
        totalHosts: subnet1.totalHosts,
        usableHosts: subnet1.usableHosts,
        parentId: 'parent1',
        level: 2,
        isSelected: false,
        ipVersion: 'ipv4'
      });

      invalidGroup.push({
        id: 'subnet2',
        network: subnet2.network,
        broadcast: subnet2.broadcast,
        firstHost: subnet2.firstHost,
        lastHost: subnet2.lastHost,
        cidr: 25,
        totalHosts: subnet2.totalHosts,
        usableHosts: subnet2.usableHosts,
        parentId: 'parent1',
        level: 2,
        isSelected: false,
        ipVersion: 'ipv4'
      });

      const result = batchJoinSubnets([invalidGroup], 'normal');

      expect(result.summary.totalGroupsProcessed).toBe(1);
      expect(result.summary.successfulJoins).toBe(0);
      expect(result.summary.failedJoins).toBe(1);
      expect(result.errors).toHaveLength(1);
    });
  });
});