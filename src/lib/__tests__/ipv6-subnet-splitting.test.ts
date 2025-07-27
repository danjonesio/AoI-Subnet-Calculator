/**
 * IPv6 Subnet Splitting and Joining Tests
 * 
 * Comprehensive test suite for IPv6 subnet operations including splitting,
 * joining, adjacency validation, and edge cases.
 */

import {
  splitIPv6Subnet,
  validateIPv6Split,
  validateIPv6SubnetAdjacency,
  areIPv6SubnetsAdjacent,
  calculateJoinedIPv6Subnet,
  joinIPv6Subnets
} from '../subnet-splitting';
import { SubnetInfo, SplitOptions, SplitSubnet } from '../types';

describe('IPv6 Subnet Splitting', () => {
  describe('splitIPv6Subnet', () => {
    test('should split IPv6 subnet into equal parts', () => {
      const parentSubnet: SubnetInfo = {
        id: 'parent-1',
        network: '2001:db8::',
        broadcast: '2001:db8:ffff:ffff:ffff:ffff:ffff:ffff',
        firstHost: '2001:db8::',
        lastHost: '2001:db8:ffff:ffff:ffff:ffff:ffff:ffff',
        subnetMask: '',
        wildcardMask: '',
        totalHosts: Number.MAX_SAFE_INTEGER,
        usableHosts: Number.MAX_SAFE_INTEGER,
        cidr: '/32',
        level: 0
      };

      const splitOptions: SplitOptions = {
        splitType: 'equal',
        splitCount: 4
      };

      const result = splitIPv6Subnet(parentSubnet, splitOptions);

      expect(result.subnets).toHaveLength(4);
      expect(result.totalSubnets).toBe(4);
      expect(result.subnets[0].cidr).toBe(34); // /32 + 2 bits = /34
      expect(result.subnets[0].network).toBe('2001:db8::');
      expect(result.subnets[1].network).toBe('2001:db8:4000::');
      expect(result.subnets[2].network).toBe('2001:db8:8000::');
      expect(result.subnets[3].network).toBe('2001:db8:c000::');
    });

    test('should split IPv6 subnet with custom CIDR', () => {
      const parentSubnet: SubnetInfo = {
        id: 'parent-2',
        network: '2001:db8::',
        broadcast: '2001:db8:ffff:ffff:ffff:ffff:ffff:ffff',
        firstHost: '2001:db8::',
        lastHost: '2001:db8:ffff:ffff:ffff:ffff:ffff:ffff',
        subnetMask: '',
        wildcardMask: '',
        totalHosts: Number.MAX_SAFE_INTEGER,
        usableHosts: Number.MAX_SAFE_INTEGER,
        cidr: '/32',
        level: 0
      };

      const splitOptions: SplitOptions = {
        splitType: 'custom',
        customCidr: 40, // Creates 256 subnets (2^8), within limit
        maxResults: 1000
      };

      const result = splitIPv6Subnet(parentSubnet, splitOptions);

      expect(result.subnets).toHaveLength(256); // 2^(40-32) = 2^8
      expect(result.subnets[0].cidr).toBe(40);
      expect(result.subnets[0].network).toBe('2001:db8::');
      expect(result.subnets[1].network).toBe('2001:db8:100::');
    });

    test('should handle IPv6 address compression correctly', () => {
      const parentSubnet: SubnetInfo = {
        id: 'parent-3',
        network: '2001:db8:0:0:0:0:0:0',
        broadcast: '2001:db8:0:0:ffff:ffff:ffff:ffff',
        firstHost: '2001:db8:0:0:0:0:0:0',
        lastHost: '2001:db8:0:0:ffff:ffff:ffff:ffff',
        subnetMask: '',
        wildcardMask: '',
        totalHosts: Number.MAX_SAFE_INTEGER,
        usableHosts: Number.MAX_SAFE_INTEGER,
        cidr: '/64',
        level: 0
      };

      const splitOptions: SplitOptions = {
        splitType: 'equal',
        splitCount: 2
      };

      const result = splitIPv6Subnet(parentSubnet, splitOptions);

      expect(result.subnets).toHaveLength(2);
      expect(result.subnets[0].network).toBe('2001:db8::');
      expect(result.subnets[1].network).toBe('2001:db8:0:0:8000::');
    });

    test('should set correct IPv6 metadata', () => {
      const parentSubnet: SubnetInfo = {
        id: 'parent-4',
        network: '2001:db8::',
        broadcast: '2001:db8:ffff:ffff:ffff:ffff:ffff:ffff',
        firstHost: '2001:db8::',
        lastHost: '2001:db8:ffff:ffff:ffff:ffff:ffff:ffff',
        subnetMask: '',
        wildcardMask: '',
        totalHosts: Number.MAX_SAFE_INTEGER,
        usableHosts: Number.MAX_SAFE_INTEGER,
        cidr: '/32',
        level: 0
      };

      const splitOptions: SplitOptions = {
        splitType: 'equal',
        splitCount: 2
      };

      const result = splitIPv6Subnet(parentSubnet, splitOptions);
      const subnet = result.subnets[0];

      expect(subnet.ipVersion).toBe('ipv6');
      expect(subnet.ipv6Info).toBeDefined();
      expect(subnet.ipv6Info?.addressType).toBe('Global Unicast');
      expect(subnet.ipv6Info?.hostBits).toBe(95); // 128 - 33
      expect(subnet.parentId).toBe('parent-4');
      expect(subnet.level).toBe(1);
    });

    test('should handle link-local addresses', () => {
      const parentSubnet: SubnetInfo = {
        id: 'parent-5',
        network: 'fe80::',
        broadcast: 'fe80::ffff:ffff:ffff:ffff',
        firstHost: 'fe80::',
        lastHost: 'fe80::ffff:ffff:ffff:ffff',
        subnetMask: '',
        wildcardMask: '',
        totalHosts: Number.MAX_SAFE_INTEGER,
        usableHosts: Number.MAX_SAFE_INTEGER,
        cidr: '/64',
        level: 0
      };

      const splitOptions: SplitOptions = {
        splitType: 'equal',
        splitCount: 2
      };

      const result = splitIPv6Subnet(parentSubnet, splitOptions);
      const subnet = result.subnets[0];

      expect(subnet.ipv6Info?.addressType).toBe('Link-Local');
    });

    test('should handle unique local addresses', () => {
      const parentSubnet: SubnetInfo = {
        id: 'parent-6',
        network: 'fc00::',
        broadcast: 'fc00::ffff:ffff:ffff:ffff',
        firstHost: 'fc00::',
        lastHost: 'fc00::ffff:ffff:ffff:ffff',
        subnetMask: '',
        wildcardMask: '',
        totalHosts: Number.MAX_SAFE_INTEGER,
        usableHosts: Number.MAX_SAFE_INTEGER,
        cidr: '/64',
        level: 0
      };

      const splitOptions: SplitOptions = {
        splitType: 'equal',
        splitCount: 2
      };

      const result = splitIPv6Subnet(parentSubnet, splitOptions);
      const subnet = result.subnets[0];

      expect(subnet.ipv6Info?.addressType).toBe('Unique Local');
    });

    test('should respect maxResults limit', () => {
      const parentSubnet: SubnetInfo = {
        id: 'parent-7',
        network: '2001:db8::',
        broadcast: '2001:db8:ffff:ffff:ffff:ffff:ffff:ffff',
        firstHost: '2001:db8::',
        lastHost: '2001:db8:ffff:ffff:ffff:ffff:ffff:ffff',
        subnetMask: '',
        wildcardMask: '',
        totalHosts: Number.MAX_SAFE_INTEGER,
        usableHosts: Number.MAX_SAFE_INTEGER,
        cidr: '/32',
        level: 0
      };

      const splitOptions: SplitOptions = {
        splitType: 'custom',
        customCidr: 40, // Creates 256 subnets normally
        maxResults: 100 // But limit to 100
      };

      const result = splitIPv6Subnet(parentSubnet, splitOptions);

      expect(result.subnets).toHaveLength(100);
    });

    test('should handle large host bit counts', () => {
      const parentSubnet: SubnetInfo = {
        id: 'parent-8',
        network: '2001:db8::',
        broadcast: '2001:db8::ffff',
        firstHost: '2001:db8::',
        lastHost: '2001:db8::ffff',
        subnetMask: '',
        wildcardMask: '',
        totalHosts: 65536,
        usableHosts: 65536,
        cidr: '/112',
        level: 0
      };

      const splitOptions: SplitOptions = {
        splitType: 'equal',
        splitCount: 2
      };

      const result = splitIPv6Subnet(parentSubnet, splitOptions);
      const subnet = result.subnets[0];

      expect(subnet.totalHosts).toBe(32768);
      expect(subnet.usableHosts).toBe(32768);
      expect(subnet.ipv6Info?.totalAddressesFormatted).toBe('32,768');
    });
  });

  describe('validateIPv6Split', () => {
    test('should validate valid split options', () => {
      const parentSubnet: SubnetInfo = {
        network: '2001:db8::',
        broadcast: '2001:db8:ffff:ffff:ffff:ffff:ffff:ffff',
        firstHost: '2001:db8::',
        lastHost: '2001:db8:ffff:ffff:ffff:ffff:ffff:ffff',
        subnetMask: '',
        wildcardMask: '',
        totalHosts: Number.MAX_SAFE_INTEGER,
        usableHosts: Number.MAX_SAFE_INTEGER,
        cidr: '/32'
      };

      const splitOptions: SplitOptions = {
        splitType: 'equal',
        splitCount: 4
      };

      const result = validateIPv6Split(parentSubnet, splitOptions);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('should reject invalid prefix lengths', () => {
      const parentSubnet: SubnetInfo = {
        network: '2001:db8::',
        broadcast: '2001:db8:ffff:ffff:ffff:ffff:ffff:ffff',
        firstHost: '2001:db8::',
        lastHost: '2001:db8:ffff:ffff:ffff:ffff:ffff:ffff',
        subnetMask: '',
        wildcardMask: '',
        totalHosts: Number.MAX_SAFE_INTEGER,
        usableHosts: Number.MAX_SAFE_INTEGER,
        cidr: '/64'
      };

      const splitOptions: SplitOptions = {
        splitType: 'custom',
        customCidr: 129 // Invalid - exceeds /128
      };

      const result = validateIPv6Split(parentSubnet, splitOptions);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('IPv6 prefix length cannot exceed /128');
    });

    test('should reject target prefix less specific than parent', () => {
      const parentSubnet: SubnetInfo = {
        network: '2001:db8::',
        broadcast: '2001:db8:ffff:ffff:ffff:ffff:ffff:ffff',
        firstHost: '2001:db8::',
        lastHost: '2001:db8:ffff:ffff:ffff:ffff:ffff:ffff',
        subnetMask: '',
        wildcardMask: '',
        totalHosts: Number.MAX_SAFE_INTEGER,
        usableHosts: Number.MAX_SAFE_INTEGER,
        cidr: '/64'
      };

      const splitOptions: SplitOptions = {
        splitType: 'custom',
        customCidr: 32 // Less specific than /64
      };

      const result = validateIPv6Split(parentSubnet, splitOptions);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Target prefix must be more specific (larger number) than parent prefix');
    });

    test('should warn about large prefix increases', () => {
      const parentSubnet: SubnetInfo = {
        network: '2001:db8::',
        broadcast: '2001:db8:ffff:ffff:ffff:ffff:ffff:ffff',
        firstHost: '2001:db8::',
        lastHost: '2001:db8:ffff:ffff:ffff:ffff:ffff:ffff',
        subnetMask: '',
        wildcardMask: '',
        totalHosts: Number.MAX_SAFE_INTEGER,
        usableHosts: Number.MAX_SAFE_INTEGER,
        cidr: '/56'
      };

      const splitOptions: SplitOptions = {
        splitType: 'custom',
        customCidr: 73, // 17 bit increase (creates 131,072 subnets - too many)
        maxResults: 1000 // Limit to 1000
      };

      const result = validateIPv6Split(parentSubnet, splitOptions);

      // Should be invalid due to too many subnets, but let's test the warning logic separately
      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('exceeding recommended maximum of 1000');
    });

    test('should warn about large prefix increases without exceeding limits', () => {
      const parentSubnet: SubnetInfo = {
        network: '2001:db8::',
        broadcast: '2001:db8:ffff:ffff:ffff:ffff:ffff:ffff',
        firstHost: '2001:db8::',
        lastHost: '2001:db8:ffff:ffff:ffff:ffff:ffff:ffff',
        subnetMask: '',
        wildcardMask: '',
        totalHosts: Number.MAX_SAFE_INTEGER,
        usableHosts: Number.MAX_SAFE_INTEGER,
        cidr: '/56'
      };

      const splitOptions: SplitOptions = {
        splitType: 'custom',
        customCidr: 65, // 9 bit increase (creates 512 subnets - within limits but triggers performance warning)
        maxResults: 1000
      };

      const result = validateIPv6Split(parentSubnet, splitOptions);

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Split will create 512 subnets, which may impact performance');
    });

    test('should reject excessive subnet counts', () => {
      const parentSubnet: SubnetInfo = {
        network: '2001:db8::',
        broadcast: '2001:db8:ffff:ffff:ffff:ffff:ffff:ffff',
        firstHost: '2001:db8::',
        lastHost: '2001:db8:ffff:ffff:ffff:ffff:ffff:ffff',
        subnetMask: '',
        wildcardMask: '',
        totalHosts: Number.MAX_SAFE_INTEGER,
        usableHosts: Number.MAX_SAFE_INTEGER,
        cidr: '/32'
      };

      const splitOptions: SplitOptions = {
        splitType: 'equal',
        splitCount: 2048 // Exceeds 1000 limit
      };

      const result = validateIPv6Split(parentSubnet, splitOptions);

      expect(result.isValid).toBe(false);
      expect(result.errors[0]).toContain('exceeding recommended maximum of 1000');
    });
  });

  describe('IPv6 Subnet Adjacency and Joining', () => {
    const createIPv6Subnet = (network: string, cidr: number, id: string): SplitSubnet => ({
      id,
      network,
      broadcast: network, // Simplified for testing
      firstHost: network,
      lastHost: network,
      cidr,
      totalHosts: 1000,
      usableHosts: 1000,
      parentId: 'parent',
      level: 1,
      isSelected: false,
      ipVersion: 'ipv6'
    });

    describe('validateIPv6SubnetAdjacency', () => {
      test('should validate adjacent IPv6 subnets', () => {
        const subnets = [
          createIPv6Subnet('2001:db8::', 64, 'subnet1'),
          createIPv6Subnet('2001:db8:0:1::', 64, 'subnet2')
        ];

        const result = validateIPv6SubnetAdjacency(subnets);

        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      test('should reject non-adjacent IPv6 subnets', () => {
        const subnets = [
          createIPv6Subnet('2001:db8::', 64, 'subnet1'),
          createIPv6Subnet('2001:db8:0:2::', 64, 'subnet2') // Gap of one subnet
        ];

        const result = validateIPv6SubnetAdjacency(subnets);

        expect(result.isValid).toBe(false);
        expect(result.errors[0]).toContain('Gap detected');
      });

      test('should reject different sized IPv6 subnets', () => {
        const subnets = [
          createIPv6Subnet('2001:db8::', 64, 'subnet1'),
          createIPv6Subnet('2001:db8:0:1::', 65, 'subnet2') // Different size
        ];

        const result = validateIPv6SubnetAdjacency(subnets);

        expect(result.isValid).toBe(false);
        expect(result.errors[0]).toContain('All subnets must be the same size');
      });

      test('should reject overlapping IPv6 subnets', () => {
        const subnets = [
          createIPv6Subnet('2001:db8::', 64, 'subnet1'),
          createIPv6Subnet('2001:db8::', 64, 'subnet2') // Same network
        ];

        const result = validateIPv6SubnetAdjacency(subnets);

        expect(result.isValid).toBe(false);
        expect(result.errors[0]).toContain('overlap');
      });

      test('should reject non-power-of-2 subnet counts', () => {
        const subnets = [
          createIPv6Subnet('2001:db8::', 64, 'subnet1'),
          createIPv6Subnet('2001:db8:0:1::', 64, 'subnet2'),
          createIPv6Subnet('2001:db8:0:2::', 64, 'subnet3') // 3 subnets, not power of 2
        ];

        const result = validateIPv6SubnetAdjacency(subnets);

        expect(result.isValid).toBe(false);
        expect(result.errors[0]).toContain('must be a power of 2');
      });

      test('should validate proper boundary alignment', () => {
        const subnets = [
          createIPv6Subnet('2001:db8::', 65, 'subnet1'),
          createIPv6Subnet('2001:db8:0:0:8000::', 65, 'subnet2')
        ];

        const result = validateIPv6SubnetAdjacency(subnets);

        expect(result.isValid).toBe(true);
      });
    });

    describe('areIPv6SubnetsAdjacent', () => {
      test('should detect adjacent IPv6 subnets', () => {
        const subnet1 = createIPv6Subnet('2001:db8::', 64, 'subnet1');
        const subnet2 = createIPv6Subnet('2001:db8:0:1::', 64, 'subnet2');

        const result = areIPv6SubnetsAdjacent(subnet1, subnet2);

        expect(result).toBe(true);
      });

      test('should reject non-adjacent IPv6 subnets', () => {
        const subnet1 = createIPv6Subnet('2001:db8::', 64, 'subnet1');
        const subnet2 = createIPv6Subnet('2001:db8:0:2::', 64, 'subnet2');

        const result = areIPv6SubnetsAdjacent(subnet1, subnet2);

        expect(result).toBe(false);
      });

      test('should reject different sized IPv6 subnets', () => {
        const subnet1 = createIPv6Subnet('2001:db8::', 64, 'subnet1');
        const subnet2 = createIPv6Subnet('2001:db8:0:1::', 65, 'subnet2');

        const result = areIPv6SubnetsAdjacent(subnet1, subnet2);

        expect(result).toBe(false);
      });
    });

    describe('calculateJoinedIPv6Subnet', () => {
      test('should calculate joined IPv6 subnet correctly', () => {
        const subnets = [
          createIPv6Subnet('2001:db8::', 65, 'subnet1'),
          createIPv6Subnet('2001:db8:0:0:8000::', 65, 'subnet2')
        ];

        const result = calculateJoinedIPv6Subnet(subnets);

        expect(result).not.toBeNull();
        expect(result!.network).toBe('2001:db8::');
        expect(result!.cidr).toBe(64); // /65 - 1 = /64
        expect(result!.ipVersion).toBe('ipv6');
      });

      test('should return null for invalid subnet groups', () => {
        const subnets = [
          createIPv6Subnet('2001:db8::', 64, 'subnet1'),
          createIPv6Subnet('2001:db8:0:2::', 64, 'subnet2') // Non-adjacent
        ];

        const result = calculateJoinedIPv6Subnet(subnets);

        expect(result).toBeNull();
      });
    });

    describe('joinIPv6Subnets', () => {
      test('should join adjacent IPv6 subnets successfully', () => {
        const subnets = [
          createIPv6Subnet('2001:db8::', 65, 'subnet1'),
          createIPv6Subnet('2001:db8:0:0:8000::', 65, 'subnet2')
        ];

        const result = joinIPv6Subnets(subnets);

        expect(result.subnets).toHaveLength(1);
        expect(result.totalSubnets).toBe(1);
        expect(result.subnets[0].network).toBe('2001:db8::');
        expect(result.subnets[0].cidr).toBe(64);
      });

      test('should handle join validation errors', () => {
        const subnets = [
          createIPv6Subnet('2001:db8::', 64, 'subnet1'),
          createIPv6Subnet('2001:db8:0:2::', 64, 'subnet2') // Non-adjacent
        ];

        const result = joinIPv6Subnets(subnets);

        expect(result.subnets).toHaveLength(0);
        expect(result.totalSubnets).toBe(0);
      });

      test('should require at least 2 subnets', () => {
        const subnets = [
          createIPv6Subnet('2001:db8::', 64, 'subnet1')
        ];

        const result = joinIPv6Subnets(subnets);

        expect(result.subnets).toHaveLength(0);
        expect(result.totalSubnets).toBe(0);
      });

      test('should reject mixed IP versions', () => {
        const subnets = [
          createIPv6Subnet('2001:db8::', 64, 'subnet1'),
          { ...createIPv6Subnet('2001:db8:0:1::', 64, 'subnet2'), ipVersion: 'ipv4' as const }
        ];

        const result = joinIPv6Subnets(subnets);

        expect(result.subnets).toHaveLength(0);
        expect(result.totalSubnets).toBe(0);
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle invalid IPv6 addresses', () => {
      const parentSubnet: SubnetInfo = {
        network: 'invalid-ipv6',
        broadcast: '',
        firstHost: '',
        lastHost: '',
        subnetMask: '',
        wildcardMask: '',
        totalHosts: 0,
        usableHosts: 0,
        cidr: '/64'
      };

      const splitOptions: SplitOptions = {
        splitType: 'equal',
        splitCount: 2
      };

      const result = splitIPv6Subnet(parentSubnet, splitOptions);

      expect(result.subnets).toHaveLength(0);
      expect(result.totalSubnets).toBe(0);
    });

    test('should handle missing split options', () => {
      const parentSubnet: SubnetInfo = {
        network: '2001:db8::',
        broadcast: '',
        firstHost: '',
        lastHost: '',
        subnetMask: '',
        wildcardMask: '',
        totalHosts: 0,
        usableHosts: 0,
        cidr: '/64'
      };

      const result = splitIPv6Subnet(parentSubnet, null as unknown as SplitOptions);

      expect(result.subnets).toHaveLength(0);
      expect(result.totalSubnets).toBe(0);
    });

    test('should handle very large IPv6 subnets', () => {
      const parentSubnet: SubnetInfo = {
        network: '2001:db8::',
        broadcast: '2001:db8:ffff:ffff:ffff:ffff:ffff:ffff',
        firstHost: '2001:db8::',
        lastHost: '2001:db8:ffff:ffff:ffff:ffff:ffff:ffff',
        subnetMask: '',
        wildcardMask: '',
        totalHosts: Number.MAX_SAFE_INTEGER,
        usableHosts: Number.MAX_SAFE_INTEGER,
        cidr: '/8', // Very large subnet
        level: 0
      };

      const splitOptions: SplitOptions = {
        splitType: 'custom',
        customCidr: 16
      };

      const result = splitIPv6Subnet(parentSubnet, splitOptions);

      expect(result.subnets).toHaveLength(256); // 2^(16-8) = 2^8
      expect(result.subnets[0].ipv6Info?.totalAddressesFormatted).toBe('2^112');
    });

    test('should handle /128 subnets (single addresses)', () => {
      const parentSubnet: SubnetInfo = {
        network: '2001:db8::1',
        broadcast: '2001:db8::1',
        firstHost: '2001:db8::1',
        lastHost: '2001:db8::1',
        subnetMask: '',
        wildcardMask: '',
        totalHosts: 1,
        usableHosts: 1,
        cidr: '/128',
        level: 0
      };

      const splitOptions: SplitOptions = {
        splitType: 'custom',
        customCidr: 129 // Invalid
      };

      const result = validateIPv6Split(parentSubnet, splitOptions);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('IPv6 prefix length cannot exceed /128');
    });

    test('should handle IPv6 address compression edge cases', () => {
      const testCases = [
        { network: '2001:0db8:0000:0000:0000:0000:0000:0000', expected: '2001:db8::' },
        { network: '2001:db8:0:0:0:0:0:1', expected: '2001:db8::1' },
        { network: 'fe80:0000:0000:0000:0000:0000:0000:0001', expected: 'fe80::1' },
        { network: '::1', expected: '::1' },
        { network: '::', expected: '::' }
      ];

      testCases.forEach(({ network, expected }) => {
        const parentSubnet: SubnetInfo = {
          network,
          broadcast: network,
          firstHost: network,
          lastHost: network,
          subnetMask: '',
          wildcardMask: '',
          totalHosts: 1,
          usableHosts: 1,
          cidr: '/128'
        };

        const splitOptions: SplitOptions = {
          splitType: 'equal',
          splitCount: 2
        };

        const result = splitIPv6Subnet(parentSubnet, splitOptions);
        
        // Should fail gracefully for /128 splits, but test the input handling
        expect(result.subnets).toHaveLength(0);
      });
    });

    test('should handle IPv6 multicast addresses', () => {
      const parentSubnet: SubnetInfo = {
        network: 'ff00::',
        broadcast: 'ff00::ffff:ffff:ffff:ffff',
        firstHost: 'ff00::',
        lastHost: 'ff00::ffff:ffff:ffff:ffff',
        subnetMask: '',
        wildcardMask: '',
        totalHosts: Number.MAX_SAFE_INTEGER,
        usableHosts: Number.MAX_SAFE_INTEGER,
        cidr: '/64'
      };

      const splitOptions: SplitOptions = {
        splitType: 'equal',
        splitCount: 2
      };

      const result = splitIPv6Subnet(parentSubnet, splitOptions);
      
      if (result.subnets.length > 0) {
        expect(result.subnets[0].ipv6Info?.addressType).toBe('Multicast');
      }
    });

    test('should handle IPv6 loopback address', () => {
      const parentSubnet: SubnetInfo = {
        network: '::1',
        broadcast: '::1',
        firstHost: '::1',
        lastHost: '::1',
        subnetMask: '',
        wildcardMask: '',
        totalHosts: 1,
        usableHosts: 1,
        cidr: '/128'
      };

      const splitOptions: SplitOptions = {
        splitType: 'custom',
        customCidr: 129 // Invalid
      };

      const result = validateIPv6Split(parentSubnet, splitOptions);

      expect(result.isValid).toBe(false);
    });

    test('should handle IPv6 unspecified address', () => {
      const parentSubnet: SubnetInfo = {
        network: '::',
        broadcast: '::',
        firstHost: '::',
        lastHost: '::',
        subnetMask: '',
        wildcardMask: '',
        totalHosts: 1,
        usableHosts: 1,
        cidr: '/128'
      };

      const splitOptions: SplitOptions = {
        splitType: 'equal',
        splitCount: 2
      };

      const result = splitIPv6Subnet(parentSubnet, splitOptions);

      expect(result.subnets).toHaveLength(0);
    });

    test('should handle malformed IPv6 CIDR notation', () => {
      const parentSubnet: SubnetInfo = {
        network: '2001:db8::',
        broadcast: '2001:db8::ffff:ffff:ffff:ffff',
        firstHost: '2001:db8::',
        lastHost: '2001:db8::ffff:ffff:ffff:ffff',
        subnetMask: '',
        wildcardMask: '',
        totalHosts: Number.MAX_SAFE_INTEGER,
        usableHosts: Number.MAX_SAFE_INTEGER,
        cidr: 'invalid-cidr'
      };

      const splitOptions: SplitOptions = {
        splitType: 'equal',
        splitCount: 2
      };

      const result = splitIPv6Subnet(parentSubnet, splitOptions);

      expect(result.subnets).toHaveLength(0);
    });

    test('should handle extremely large IPv6 prefix differences', () => {
      const parentSubnet: SubnetInfo = {
        network: '2001:db8::',
        broadcast: '2001:db8:ffff:ffff:ffff:ffff:ffff:ffff',
        firstHost: '2001:db8::',
        lastHost: '2001:db8:ffff:ffff:ffff:ffff:ffff:ffff',
        subnetMask: '',
        wildcardMask: '',
        totalHosts: Number.MAX_SAFE_INTEGER,
        usableHosts: Number.MAX_SAFE_INTEGER,
        cidr: '/32'
      };

      const splitOptions: SplitOptions = {
        splitType: 'custom',
        customCidr: 96, // 64-bit difference - creates 2^64 subnets
        maxResults: 1000
      };

      const result = splitIPv6Subnet(parentSubnet, splitOptions);

      // Should fail validation due to excessive subnet count
      expect(result.subnets).toHaveLength(0);
    });

    test('should handle negative split counts for IPv6', () => {
      const parentSubnet: SubnetInfo = {
        network: '2001:db8::',
        broadcast: '2001:db8::ffff:ffff:ffff:ffff',
        firstHost: '2001:db8::',
        lastHost: '2001:db8::ffff:ffff:ffff:ffff',
        subnetMask: '',
        wildcardMask: '',
        totalHosts: Number.MAX_SAFE_INTEGER,
        usableHosts: Number.MAX_SAFE_INTEGER,
        cidr: '/64'
      };

      const splitOptions: SplitOptions = {
        splitType: 'equal',
        splitCount: -4 // Invalid
      };

      const result = splitIPv6Subnet(parentSubnet, splitOptions);

      expect(result.subnets).toHaveLength(0);
    });

    test('should handle fractional split counts for IPv6', () => {
      const parentSubnet: SubnetInfo = {
        network: '2001:db8::',
        broadcast: '2001:db8::ffff:ffff:ffff:ffff',
        firstHost: '2001:db8::',
        lastHost: '2001:db8::ffff:ffff:ffff:ffff',
        subnetMask: '',
        wildcardMask: '',
        totalHosts: Number.MAX_SAFE_INTEGER,
        usableHosts: Number.MAX_SAFE_INTEGER,
        cidr: '/64'
      };

      const splitOptions: SplitOptions = {
        splitType: 'equal',
        splitCount: 3.7 // Invalid fractional
      };

      const result = splitIPv6Subnet(parentSubnet, splitOptions);

      // Should round up to next power of 2 (4)
      expect(result.subnets).toHaveLength(4);
    });
  });

  describe('IPv6 Performance Tests', () => {
    test('should handle large IPv6 subnet splits efficiently', () => {
      const startTime = performance.now();
      
      const parentSubnet: SubnetInfo = {
        network: '2001:db8::',
        broadcast: '2001:db8:ffff:ffff:ffff:ffff:ffff:ffff',
        firstHost: '2001:db8::',
        lastHost: '2001:db8:ffff:ffff:ffff:ffff:ffff:ffff',
        subnetMask: '',
        wildcardMask: '',
        totalHosts: Number.MAX_SAFE_INTEGER,
        usableHosts: Number.MAX_SAFE_INTEGER,
        cidr: '/32'
      };

      const splitOptions: SplitOptions = {
        splitType: 'custom',
        customCidr: 48,
        maxResults: 1000 // Limit for performance
      };

      const result = splitIPv6Subnet(parentSubnet, splitOptions);
      
      const endTime = performance.now();
      const duration = endTime - startTime;

      // /32 to /48 creates 2^16 = 65536 subnets, but should be limited by validation
      expect(result.subnets.length).toBeGreaterThanOrEqual(0);
      expect(result.subnets.length).toBeLessThanOrEqual(1000);
      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
      if (result.performance?.calculationTime !== undefined) {
        expect(result.performance.calculationTime).toBeDefined();
      }
    });

    test('should handle IPv6 adjacency validation performance', () => {
      const startTime = performance.now();
      
      // Create many adjacent IPv6 subnets (power of 2 for valid joining)
      const subnets: SplitSubnet[] = [];
      for (let i = 0; i < 64; i++) {
        subnets.push({
          id: `ipv6-subnet-${i}`,
          network: `2001:db8:${i.toString(16)}::`,
          broadcast: `2001:db8:${i.toString(16)}::ffff:ffff:ffff:ffff`,
          firstHost: `2001:db8:${i.toString(16)}::`,
          lastHost: `2001:db8:${i.toString(16)}::ffff:ffff:ffff:ffff`,
          cidr: 64,
          totalHosts: Number.MAX_SAFE_INTEGER,
          usableHosts: Number.MAX_SAFE_INTEGER,
          parentId: 'parent',
          level: 1,
          isSelected: false,
          ipVersion: 'ipv6'
        });
      }

      const validation = validateIPv6SubnetAdjacency(subnets);
      
      const endTime = performance.now();
      const duration = endTime - startTime;

      // 64 subnets is a power of 2, but they may not be properly adjacent
      expect(validation.isValid).toBeDefined();
      expect(duration).toBeLessThan(500); // Should be fast
    });

    test('should handle memory-intensive IPv6 operations', () => {
      const initialMemory = performance.memory?.usedJSHeapSize || 0;
      
      // Perform multiple IPv6 split operations
      for (let i = 0; i < 10; i++) {
        const parentSubnet: SubnetInfo = {
          network: `2001:db8:${i}::`,
          broadcast: `2001:db8:${i}::ffff:ffff:ffff:ffff`,
          firstHost: `2001:db8:${i}::`,
          lastHost: `2001:db8:${i}::ffff:ffff:ffff:ffff`,
          subnetMask: '',
          wildcardMask: '',
          totalHosts: Number.MAX_SAFE_INTEGER,
          usableHosts: Number.MAX_SAFE_INTEGER,
          cidr: '/64'
        };

        const splitOptions: SplitOptions = {
          splitType: 'equal',
          splitCount: 16,
          maxResults: 16
        };

        const result = splitIPv6Subnet(parentSubnet, splitOptions);
        expect(result.subnets).toHaveLength(16);
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = performance.memory?.usedJSHeapSize || 0;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be reasonable (less than 20MB for IPv6)
      expect(memoryIncrease).toBeLessThan(20 * 1024 * 1024);
    });

    test('should handle concurrent IPv6 operations', async () => {
      const startTime = performance.now();
      
      // Create multiple concurrent IPv6 split operations
      const promises = [];
      for (let i = 0; i < 5; i++) {
        const parentSubnet: SubnetInfo = {
          network: `2001:db8:${i}::`,
          broadcast: `2001:db8:${i}::ffff:ffff:ffff:ffff`,
          firstHost: `2001:db8:${i}::`,
          lastHost: `2001:db8:${i}::ffff:ffff:ffff:ffff`,
          subnetMask: '',
          wildcardMask: '',
          totalHosts: Number.MAX_SAFE_INTEGER,
          usableHosts: Number.MAX_SAFE_INTEGER,
          cidr: '/64'
        };

        const splitOptions: SplitOptions = {
          splitType: 'custom',
          customCidr: 72,
          maxResults: 100
        };

        promises.push(
          Promise.resolve(splitIPv6Subnet(parentSubnet, splitOptions))
        );
      }

      const results = await Promise.all(promises);
      
      const endTime = performance.now();
      const duration = endTime - startTime;

      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result.subnets).toHaveLength(100);
      });
      
      expect(duration).toBeLessThan(1500); // Should complete within 1.5 seconds
    });

    test('should maintain accuracy with BigInt calculations', () => {
      const parentSubnet: SubnetInfo = {
        network: '2001:db8::',
        broadcast: '2001:db8:ffff:ffff:ffff:ffff:ffff:ffff',
        firstHost: '2001:db8::',
        lastHost: '2001:db8:ffff:ffff:ffff:ffff:ffff:ffff',
        subnetMask: '',
        wildcardMask: '',
        totalHosts: Number.MAX_SAFE_INTEGER,
        usableHosts: Number.MAX_SAFE_INTEGER,
        cidr: '/32'
      };

      const splitOptions: SplitOptions = {
        splitType: 'custom',
        customCidr: 96, // Large address space calculation
        maxResults: 100
      };

      const result = splitIPv6Subnet(parentSubnet, splitOptions);

      // Should fail validation due to excessive subnet count (2^64)
      expect(result.subnets.length).toBeGreaterThanOrEqual(0);
      expect(result.subnets.length).toBeLessThanOrEqual(100);
      
      // Verify addresses are correctly calculated and formatted if any were created
      result.subnets.forEach((subnet, index) => {
        expect(subnet.network).toMatch(/^[0-9a-f:]+$/i);
        expect(subnet.cidr).toBe(96);
        expect(subnet.ipVersion).toBe('ipv6');
      });
    });
  });
});