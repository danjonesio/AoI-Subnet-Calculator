/**
 * Subnet Splitting Calculation Functions
 * 
 * This module provides functions for splitting IPv4 and IPv6 subnets into smaller subnets
 * with support for cloud provider constraints and validation.
 */

import {
  SplitSubnet,
  SplitOptions,
  SubnetInfo,
  CloudMode,
  IPVersion,
  ValidationResult,
  SubnetCalculationResult,
  CloudReservation,
  SubnetError
} from './types';
import {
  generateSubnetId,
  validateSplitConfiguration,
  calculatePerformanceMetrics
} from './utils';

// Cloud provider configurations for subnet splitting
interface CloudProviderConfig {
  name: string;
  minCidr: number;
  maxCidr: number;
  reservedCount: number;
  firstUsableOffset: number;
  getReservations: (networkInt: number, broadcastInt: number, intToIp: (int: number) => string) => CloudReservation[];
}

const CLOUD_PROVIDERS: Record<Exclude<CloudMode, "normal">, CloudProviderConfig> = {
  aws: {
    name: "AWS",
    minCidr: 16,
    maxCidr: 28,
    reservedCount: 5,
    firstUsableOffset: 4,
    getReservations: (networkInt, broadcastInt, intToIp) => [
      { ip: intToIp(networkInt), purpose: "Network Address", description: "Network identifier (not assignable)" },
      { ip: intToIp(networkInt + 1), purpose: "VPC Router", description: "Reserved for the VPC router" },
      { ip: intToIp(networkInt + 2), purpose: "DNS Server", description: "Reserved for DNS server" },
      { ip: intToIp(networkInt + 3), purpose: "Future Use", description: "Reserved for future use" },
      { ip: intToIp(broadcastInt), purpose: "Broadcast Address", description: "Network broadcast address (not assignable)" }
    ]
  },
  azure: {
    name: "Azure",
    minCidr: 8,
    maxCidr: 29,
    reservedCount: 5,
    firstUsableOffset: 4,
    getReservations: (networkInt, broadcastInt, intToIp) => [
      { ip: intToIp(networkInt), purpose: "Network Address", description: "Network identifier (not assignable)" },
      { ip: intToIp(networkInt + 1), purpose: "Default Gateway", description: "Reserved for default gateway" },
      { ip: intToIp(networkInt + 2), purpose: "DNS Mapping", description: "Reserved for Azure DNS" },
      { ip: intToIp(networkInt + 3), purpose: "DNS Mapping", description: "Reserved for Azure DNS" },
      { ip: intToIp(broadcastInt), purpose: "Broadcast Address", description: "Network broadcast address (not assignable)" }
    ]
  },
  gcp: {
    name: "Google Cloud",
    minCidr: 8,
    maxCidr: 29,
    reservedCount: 4,
    firstUsableOffset: 2,
    getReservations: (networkInt, broadcastInt, intToIp) => [
      { ip: intToIp(networkInt), purpose: "Network Address", description: "Network identifier (not assignable)" },
      { ip: intToIp(networkInt + 1), purpose: "Default Gateway", description: "Reserved for default gateway" },
      { ip: intToIp(broadcastInt - 1), purpose: "Second-to-last IP", description: "Reserved by Google Cloud" },
      { ip: intToIp(broadcastInt), purpose: "Broadcast Address", description: "Network broadcast address (not assignable)" }
    ]
  }
};

/**
 * Converts IPv4 address string to 32-bit integer
 */
function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

/**
 * Converts 32-bit integer to IPv4 address string
 */
function intToIPv4(int: number): string {
  return [
    (int >>> 24) & 255,
    (int >>> 16) & 255,
    (int >>> 8) & 255,
    int & 255
  ].join('.');
}

/**
 * Calculates detailed subnet information for a given network range
 */
function calculateSubnetDetails(
  networkInt: number,
  broadcastInt: number,
  cidr: number,
  cloudMode: CloudMode = 'normal'
): Omit<SplitSubnet, 'id' | 'parentId' | 'level' | 'isSelected' | 'ipVersion'> {
  const network = intToIPv4(networkInt);
  const broadcast = intToIPv4(broadcastInt);
  
  const hostBits = 32 - cidr;
  const totalHosts = Math.pow(2, hostBits);
  
  let firstHost: string;
  let lastHost: string;
  let usableHosts: number;
  let cloudReserved: CloudReservation[] | undefined;

  // Handle edge cases for host calculation
  if (hostBits === 0) {
    // /32 subnet - single host route
    firstHost = network;
    lastHost = network;
    usableHosts = 1;
  } else if (hostBits === 1) {
    // /31 subnet - point-to-point link (RFC 3021)
    firstHost = network;
    lastHost = broadcast;
    usableHosts = 2;
  } else {
    // Traditional subnetting
    firstHost = intToIPv4(networkInt + 1);
    lastHost = intToIPv4(broadcastInt - 1);
    usableHosts = totalHosts - 2; // Subtract network and broadcast
  }

  // Apply cloud provider constraints
  if (cloudMode !== 'normal') {
    const provider = CLOUD_PROVIDERS[cloudMode];
    if (provider) {
      // Validate subnet size meets cloud provider requirements
      if (totalHosts >= provider.reservedCount) {
        usableHosts = Math.max(0, totalHosts - provider.reservedCount);
        
        // Adjust first usable host based on cloud provider offset
        if (hostBits > 1) { // Only for subnets larger than /31
          const firstUsableOffset = networkInt + provider.firstUsableOffset;
          if (firstUsableOffset <= broadcastInt - 1) {
            firstHost = intToIPv4(firstUsableOffset);
          }
        }
        
        // Generate cloud reservations
        cloudReserved = provider.getReservations(networkInt, broadcastInt, intToIPv4);
      } else {
        // Subnet too small for cloud provider
        usableHosts = 0;
        cloudReserved = [];
      }
    }
  }

  return {
    network,
    broadcast,
    firstHost,
    lastHost,
    cidr,
    totalHosts,
    usableHosts,
    cloudReserved
  };
}

/**
 * Validates split options and parent subnet compatibility
 */
function validateSplitOptions(
  parentSubnet: SubnetInfo,
  splitOptions: SplitOptions,
  cloudMode: CloudMode
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  // Extract parent CIDR
  const parentCidrMatch = parentSubnet.cidr.match(/\/(\d+)/);
  if (!parentCidrMatch) {
    errors.push('Invalid parent subnet CIDR format');
    return { isValid: false, errors, warnings, suggestions };
  }

  const parentCidr = parseInt(parentCidrMatch[1], 10);

  // Determine target CIDR based on split type
  let targetCidr: number;
  let expectedSubnetCount: number;

  if (splitOptions.splitType === 'equal') {
    if (!splitOptions.splitCount || splitOptions.splitCount < 2) {
      errors.push('Split count must be at least 2 for equal splits');
      return { isValid: false, errors, warnings, suggestions };
    }

    // Calculate required bits for the split count
    const bitsNeeded = Math.ceil(Math.log2(splitOptions.splitCount));
    targetCidr = parentCidr + bitsNeeded;
    expectedSubnetCount = Math.pow(2, bitsNeeded);

    if (expectedSubnetCount !== splitOptions.splitCount) {
      warnings.push(`Split count ${splitOptions.splitCount} will be rounded up to ${expectedSubnetCount} (next power of 2)`);
    }
  } else if (splitOptions.splitType === 'custom') {
    if (!splitOptions.customCidr) {
      errors.push('Custom CIDR is required for custom splits');
      return { isValid: false, errors, warnings, suggestions };
    }

    targetCidr = splitOptions.customCidr;
    expectedSubnetCount = Math.pow(2, targetCidr - parentCidr);
  } else {
    errors.push('Invalid split type. Must be "equal" or "custom"');
    return { isValid: false, errors, warnings, suggestions };
  }

  // Validate target CIDR
  const validation = validateSplitConfiguration(
    parentCidr,
    targetCidr,
    'ipv4',
    splitOptions.maxResults || 1000,
    !!splitOptions.maxResults // Allow override if maxResults is specified
  );

  errors.push(...validation.errors);
  warnings.push(...validation.warnings);

  // Cloud provider specific validations
  if (cloudMode !== 'normal') {
    const provider = CLOUD_PROVIDERS[cloudMode];
    if (provider) {
      if (targetCidr > provider.maxCidr) {
        errors.push(`${provider.name} does not support subnets smaller than /${provider.maxCidr}`);
      }

      if (targetCidr < provider.minCidr) {
        errors.push(`${provider.name} requires subnets to be at least /${provider.minCidr}`);
      }

      // Check if resulting subnets will have enough IPs for cloud provider requirements
      const resultingSubnetSize = Math.pow(2, 32 - targetCidr);
      if (resultingSubnetSize < provider.reservedCount) {
        errors.push(`${provider.name} requires at least ${provider.reservedCount} IP addresses per subnet (resulting subnets will have ${resultingSubnetSize})`);
        suggestions.push(`Use a larger target CIDR (smaller number) to ensure sufficient IP addresses for ${provider.name} requirements`);
      }
    }
  }

  // Performance warnings
  if (expectedSubnetCount > 100) {
    warnings.push(`Split will create ${expectedSubnetCount} subnets, which may impact performance`);
    suggestions.push('Consider using pagination or virtual scrolling for large subnet lists');
  }

  if (expectedSubnetCount > 1000) {
    errors.push(`Split would create ${expectedSubnetCount} subnets, exceeding recommended maximum of 1000`);
    suggestions.push('Use a smaller split count or larger target CIDR to reduce the number of resulting subnets');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    suggestions
  };
}

/**
 * Main function to split an IPv4 subnet into smaller subnets
 */
export function splitIPv4Subnet(
  parentSubnet: SubnetInfo,
  splitOptions: SplitOptions,
  cloudMode: CloudMode = 'normal'
): SubnetCalculationResult {
  const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

  try {
    // Validate inputs
    if (!parentSubnet || !splitOptions) {
      throw new Error('Parent subnet and split options are required');
    }

    // Validate split options
    const validation = validateSplitOptions(parentSubnet, splitOptions, cloudMode);
    if (!validation.isValid) {
      throw new Error(`Split validation failed: ${validation.errors.join(', ')}`);
    }

    // Extract parent subnet information
    const parentCidrMatch = parentSubnet.cidr.match(/\/(\d+)/);
    if (!parentCidrMatch) {
      throw new Error('Invalid parent subnet CIDR format');
    }

    const parentCidr = parseInt(parentCidrMatch[1], 10);
    const parentNetworkInt = ipv4ToInt(parentSubnet.network);

    // Determine target CIDR and subnet count
    let targetCidr: number;
    let subnetCount: number;

    if (splitOptions.splitType === 'equal') {
      const bitsNeeded = Math.ceil(Math.log2(splitOptions.splitCount || 2));
      targetCidr = parentCidr + bitsNeeded;
      subnetCount = Math.pow(2, bitsNeeded);
    } else {
      targetCidr = splitOptions.customCidr!;
      subnetCount = Math.pow(2, targetCidr - parentCidr);
    }

    // Apply maximum results limit
    const maxResults = splitOptions.maxResults || 1000;
    if (subnetCount > maxResults) {
      subnetCount = maxResults;
    }

    // Calculate subnet size
    const subnetSize = Math.pow(2, 32 - targetCidr);
    const results: SplitSubnet[] = [];

    // Generate split subnets
    for (let i = 0; i < subnetCount; i++) {
      const networkInt = parentNetworkInt + (i * subnetSize);
      const broadcastInt = networkInt + subnetSize - 1;

      // Ensure we don't exceed the parent subnet boundaries
      const parentBroadcastInt = ipv4ToInt(parentSubnet.broadcast || intToIPv4(parentNetworkInt + Math.pow(2, 32 - parentCidr) - 1));
      if (networkInt > parentBroadcastInt) {
        break; // Stop if we exceed parent subnet
      }

      const subnetDetails = calculateSubnetDetails(
        networkInt,
        Math.min(broadcastInt, parentBroadcastInt),
        targetCidr,
        cloudMode
      );

      const splitSubnet: SplitSubnet = {
        id: generateSubnetId(),
        ...subnetDetails,
        parentId: parentSubnet.id,
        level: (parentSubnet.level || 0) + 1,
        isSelected: false,
        ipVersion: 'ipv4' as IPVersion
      };

      results.push(splitSubnet);
    }

    const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const performanceMetrics = calculatePerformanceMetrics(startTime, endTime, results.length, 'split');

    // Calculate totals
    const totalAddresses = results.reduce((sum, subnet) => sum + subnet.totalHosts, 0);
    const usableAddresses = results.reduce((sum, subnet) => sum + subnet.usableHosts, 0);

    return {
      subnets: results,
      totalSubnets: results.length,
      totalAddresses,
      usableAddresses,
      performance: {
        calculationTime: performanceMetrics.duration,
        memoryUsage: undefined // Could be implemented with performance.measureUserAgentSpecificMemory if available
      }
    };

  } catch (error) {
    const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const duration = endTime - startTime;

    console.error('IPv4 subnet splitting error:', error);
    
    // Return empty result with error information
    return {
      subnets: [],
      totalSubnets: 0,
      totalAddresses: 0,
      usableAddresses: 0,
      performance: {
        calculationTime: duration
      }
    };
  }
}

/**
 * Validates if a subnet split configuration is valid
 * This is a convenience function for pre-validation before calling splitIPv4Subnet
 */
export function validateIPv4Split(
  parentSubnet: SubnetInfo,
  splitOptions: SplitOptions,
  cloudMode: CloudMode = 'normal'
): ValidationResult {
  return validateSplitOptions(parentSubnet, splitOptions, cloudMode);
}

/**
 * Calculates the number of subnets that would result from a split operation
 * Useful for preview functionality
 */
export function calculateSplitPreview(
  parentCidr: number,
  splitOptions: SplitOptions
): {
  targetCidr: number;
  subnetCount: number;
  subnetSize: number;
  isValid: boolean;
  error?: string;
} {
  try {
    let targetCidr: number;

    if (splitOptions.splitType === 'equal') {
      if (!splitOptions.splitCount || splitOptions.splitCount < 2) {
        return {
          targetCidr: 0,
          subnetCount: 0,
          subnetSize: 0,
          isValid: false,
          error: 'Split count must be at least 2'
        };
      }

      const bitsNeeded = Math.ceil(Math.log2(splitOptions.splitCount));
      targetCidr = parentCidr + bitsNeeded;
    } else if (splitOptions.splitType === 'custom') {
      if (!splitOptions.customCidr) {
        return {
          targetCidr: 0,
          subnetCount: 0,
          subnetSize: 0,
          isValid: false,
          error: 'Custom CIDR is required'
        };
      }

      targetCidr = splitOptions.customCidr;
    } else {
      return {
        targetCidr: 0,
        subnetCount: 0,
        subnetSize: 0,
        isValid: false,
        error: 'Invalid split type'
      };
    }

    if (targetCidr <= parentCidr || targetCidr > 32) {
      return {
        targetCidr,
        subnetCount: 0,
        subnetSize: 0,
        isValid: false,
        error: 'Target CIDR must be more specific than parent and not exceed /32'
      };
    }

    const subnetCount = Math.pow(2, targetCidr - parentCidr);
    const subnetSize = Math.pow(2, 32 - targetCidr);

    return {
      targetCidr,
      subnetCount,
      subnetSize,
      isValid: true
    };

  } catch (error) {
    return {
      targetCidr: 0,
      subnetCount: 0,
      subnetSize: 0,
      isValid: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Creates a SubnetError for consistent error handling
 */
export function createSubnetError(
  type: 'validation' | 'calculation' | 'performance',
  message: string,
  details?: Record<string, unknown>
): SubnetError {
  return {
    type,
    message,
    details,
    timestamp: Date.now(),
    recoverable: type === 'validation' || type === 'performance'
  };
}

/**
 * IPv4 Subnet Adjacency Validation Functions
 * 
 * These functions validate whether subnets are adjacent in the address space
 * and can be joined together.
 */

/**
 * Validates if a list of IPv4 subnets are adjacent and can be joined
 */
export function validateSubnetAdjacency(subnets: SplitSubnet[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  if (!subnets || subnets.length < 2) {
    errors.push('At least 2 subnets are required for adjacency validation');
    return { isValid: false, errors, warnings, suggestions };
  }

  // Check if all subnets are IPv4
  const nonIPv4Subnets = subnets.filter(subnet => subnet.ipVersion !== 'ipv4');
  if (nonIPv4Subnets.length > 0) {
    errors.push('All subnets must be IPv4 for adjacency validation');
    return { isValid: false, errors, warnings, suggestions };
  }

  // Check if all subnets have the same CIDR (same size)
  const firstCidr = subnets[0].cidr;
  const differentSizeSubnets = subnets.filter(subnet => subnet.cidr !== firstCidr);
  if (differentSizeSubnets.length > 0) {
    errors.push(`All subnets must be the same size (same CIDR) to be joined. Found CIDRs: ${[...new Set(subnets.map(s => s.cidr))].join(', ')}`);
    suggestions.push('Only select subnets with the same CIDR prefix length for joining operations');
  }

  // Sort subnets by network address for adjacency checking
  const sortedSubnets = [...subnets].sort((a, b) => {
    const aInt = ipv4ToInt(a.network);
    const bInt = ipv4ToInt(b.network);
    return aInt - bInt;
  });

  // Check for overlapping subnets
  for (let i = 0; i < sortedSubnets.length - 1; i++) {
    const currentSubnet = sortedSubnets[i];
    const nextSubnet = sortedSubnets[i + 1];
    
    const currentBroadcastInt = ipv4ToInt(currentSubnet.broadcast);
    const nextNetworkInt = ipv4ToInt(nextSubnet.network);
    
    if (currentBroadcastInt >= nextNetworkInt) {
      errors.push(`Subnets ${currentSubnet.network}/${currentSubnet.cidr} and ${nextSubnet.network}/${nextSubnet.cidr} overlap`);
    }
  }

  // If we have errors so far, return early
  if (errors.length > 0) {
    return { isValid: false, errors, warnings, suggestions };
  }

  // Check adjacency - subnets must be contiguous in address space
  const subnetSize = Math.pow(2, 32 - firstCidr);
  
  for (let i = 0; i < sortedSubnets.length - 1; i++) {
    const currentSubnet = sortedSubnets[i];
    const nextSubnet = sortedSubnets[i + 1];
    
    const currentNetworkInt = ipv4ToInt(currentSubnet.network);
    const nextNetworkInt = ipv4ToInt(nextSubnet.network);
    
    const expectedNextNetwork = currentNetworkInt + subnetSize;
    
    if (nextNetworkInt !== expectedNextNetwork) {
      const gap = nextNetworkInt - expectedNextNetwork;
      if (gap > 0) {
        errors.push(`Gap detected between ${currentSubnet.network}/${currentSubnet.cidr} and ${nextSubnet.network}/${nextSubnet.cidr}. Missing ${gap} IP addresses.`);
        suggestions.push('Ensure all subnets in the range are selected for joining, with no gaps in the address space');
      } else {
        errors.push(`Subnets ${currentSubnet.network}/${currentSubnet.cidr} and ${nextSubnet.network}/${nextSubnet.cidr} are not properly ordered or have addressing conflicts`);
      }
    }
  }

  // Validate that the combined subnets would form a valid larger subnet
  if (errors.length === 0) {
    const totalSubnets = subnets.length;
    const requiredPowerOfTwo = Math.log2(totalSubnets);
    
    if (!Number.isInteger(requiredPowerOfTwo)) {
      errors.push(`Cannot join ${totalSubnets} subnets. The number of subnets must be a power of 2 (2, 4, 8, 16, etc.)`);
      suggestions.push(`Select ${Math.pow(2, Math.floor(requiredPowerOfTwo))} or ${Math.pow(2, Math.ceil(requiredPowerOfTwo))} subnets instead`);
    } else {
      // Check if the first subnet starts at the correct boundary for the larger subnet
      const newCidr = firstCidr - requiredPowerOfTwo;
      const newSubnetSize = Math.pow(2, 32 - newCidr);
      const firstNetworkInt = ipv4ToInt(sortedSubnets[0].network);
      
      if (firstNetworkInt % newSubnetSize !== 0) {
        errors.push(`Selected subnets do not align to a proper ${newCidr}-bit boundary for joining`);
        suggestions.push('Ensure the first subnet in the selection starts at the correct network boundary');
      }
    }
  }

  // Performance warnings for large joins
  if (subnets.length > 16) {
    warnings.push(`Joining ${subnets.length} subnets may impact performance`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    suggestions
  };
}

/**
 * Checks if two specific IPv4 subnets are adjacent
 */
export function areSubnetsAdjacent(subnet1: SplitSubnet, subnet2: SplitSubnet): boolean {
  if (subnet1.ipVersion !== 'ipv4' || subnet2.ipVersion !== 'ipv4') {
    return false;
  }

  if (subnet1.cidr !== subnet2.cidr) {
    return false;
  }

  const subnet1NetworkInt = ipv4ToInt(subnet1.network);
  const subnet2NetworkInt = ipv4ToInt(subnet2.network);
  const subnetSize = Math.pow(2, 32 - subnet1.cidr);

  // Check if subnet2 immediately follows subnet1
  if (subnet2NetworkInt === subnet1NetworkInt + subnetSize) {
    return true;
  }

  // Check if subnet1 immediately follows subnet2
  if (subnet1NetworkInt === subnet2NetworkInt + subnetSize) {
    return true;
  }

  return false;
}

/**
 * Finds all subnets that are adjacent to a given subnet
 */
export function findAdjacentSubnets(targetSubnet: SplitSubnet, candidateSubnets: SplitSubnet[]): SplitSubnet[] {
  return candidateSubnets.filter(candidate => 
    candidate.id !== targetSubnet.id && areSubnetsAdjacent(targetSubnet, candidate)
  );
}

/**
 * Groups subnets into adjacent clusters that can be joined together
 */
export function groupAdjacentSubnets(subnets: SplitSubnet[]): SplitSubnet[][] {
  const ipv4Subnets = subnets.filter(subnet => subnet.ipVersion === 'ipv4');
  const groups: SplitSubnet[][] = [];
  const processed = new Set<string>();

  // Sort subnets by CIDR first, then by network address
  const sortedSubnets = ipv4Subnets.sort((a, b) => {
    if (a.cidr !== b.cidr) {
      return a.cidr - b.cidr;
    }
    return ipv4ToInt(a.network) - ipv4ToInt(b.network);
  });

  for (const subnet of sortedSubnets) {
    if (processed.has(subnet.id)) {
      continue;
    }

    // Start a new group with this subnet
    const group = [subnet];
    processed.add(subnet.id);

    // Find all adjacent subnets of the same size
    let foundAdjacent = true;
    while (foundAdjacent) {
      foundAdjacent = false;
      
      for (const candidate of sortedSubnets) {
        if (processed.has(candidate.id) || candidate.cidr !== subnet.cidr) {
          continue;
        }

        // Check if this candidate is adjacent to any subnet in the current group
        const isAdjacentToGroup = group.some(groupSubnet => 
          areSubnetsAdjacent(groupSubnet, candidate)
        );

        if (isAdjacentToGroup) {
          group.push(candidate);
          processed.add(candidate.id);
          foundAdjacent = true;
        }
      }

      // Sort the group to maintain order
      group.sort((a, b) => ipv4ToInt(a.network) - ipv4ToInt(b.network));
    }

    // Only include groups with more than one subnet
    if (group.length > 1) {
      groups.push(group);
    }
  }

  return groups;
}

/**
 * Validates that a group of subnets can be joined into a single larger subnet
 */
export function validateJoinableGroup(subnets: SplitSubnet[]): ValidationResult {
  const validation = validateSubnetAdjacency(subnets);
  
  if (!validation.isValid) {
    return validation;
  }

  // Additional validation specific to joining operations
  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  // Check if subnets have the same parent (if available)
  const parentsSet = new Set(subnets.map(s => s.parentId).filter(Boolean));
  if (parentsSet.size > 1) {
    warnings.push('Selected subnets have different parent subnets, which may indicate they are from different network segments');
  }

  // Check if subnets are at the same hierarchy level
  const levelsSet = new Set(subnets.map(s => s.level));
  if (levelsSet.size > 1) {
    warnings.push('Selected subnets are at different hierarchy levels');
    suggestions.push('Consider selecting subnets from the same hierarchy level for cleaner network organization');
  }

  return {
    isValid: validation.isValid && errors.length === 0,
    errors: [...validation.errors, ...errors],
    warnings: [...validation.warnings, ...warnings],
    suggestions: [...(validation.suggestions || []), ...suggestions]
  };
}

/**
 * Calculates the resulting subnet that would be created by joining adjacent subnets
 */
export function calculateJoinedSubnet(subnets: SplitSubnet[]): SplitSubnet | null {
  const validation = validateJoinableGroup(subnets);
  
  if (!validation.isValid) {
    return null;
  }

  // Sort subnets by network address
  const sortedSubnets = [...subnets].sort((a, b) => 
    ipv4ToInt(a.network) - ipv4ToInt(b.network)
  );

  const firstSubnet = sortedSubnets[0];
  const lastSubnet = sortedSubnets[sortedSubnets.length - 1];
  
  // Calculate the new CIDR
  const subnetCount = subnets.length;
  const bitsReduced = Math.log2(subnetCount);
  const newCidr = firstSubnet.cidr - bitsReduced;
  
  // Calculate the new network and broadcast addresses
  const newNetworkInt = ipv4ToInt(firstSubnet.network);
  const newSubnetSize = Math.pow(2, 32 - newCidr);
  const newBroadcastInt = newNetworkInt + newSubnetSize - 1;
  
  const newNetwork = intToIPv4(newNetworkInt);
  const newBroadcast = intToIPv4(newBroadcastInt);
  
  // Calculate host addresses
  let newFirstHost: string;
  let newLastHost: string;
  let newUsableHosts: number;
  const newTotalHosts = newSubnetSize;
  
  if (newCidr === 32) {
    // /32 subnet - single host route
    newFirstHost = newNetwork;
    newLastHost = newNetwork;
    newUsableHosts = 1;
  } else if (newCidr === 31) {
    // /31 subnet - point-to-point link (RFC 3021)
    newFirstHost = newNetwork;
    newLastHost = newBroadcast;
    newUsableHosts = 2;
  } else {
    // Traditional subnetting
    newFirstHost = intToIPv4(newNetworkInt + 1);
    newLastHost = intToIPv4(newBroadcastInt - 1);
    newUsableHosts = newTotalHosts - 2;
  }

  // Determine cloud reservations if any of the original subnets had them
  let cloudReserved: CloudReservation[] | undefined;
  const hasCloudReservations = subnets.some(s => s.cloudReserved && s.cloudReserved.length > 0);
  
  if (hasCloudReservations) {
    // Use the cloud reservations from the first subnet as a template
    const firstSubnetWithReservations = subnets.find(s => s.cloudReserved && s.cloudReserved.length > 0);
    if (firstSubnetWithReservations?.cloudReserved) {
      // Recalculate cloud reservations for the new larger subnet
      // This is a simplified approach - in practice, you might want more sophisticated logic
      cloudReserved = firstSubnetWithReservations.cloudReserved.map(reservation => ({
        ...reservation,
        ip: reservation.purpose === 'Network Address' ? newNetwork :
            reservation.purpose === 'Broadcast Address' ? newBroadcast :
            reservation.ip // Keep original for other reservations
      }));
      
      // Adjust usable hosts for cloud provider constraints
      newUsableHosts = Math.max(0, newTotalHosts - cloudReserved.length);
      
      // Adjust first host for cloud provider offset
      if (newCidr < 31) {
        const cloudProvider = firstSubnetWithReservations.cloudReserved.length === 5 ? 'aws' : 
                             firstSubnetWithReservations.cloudReserved.length === 4 ? 'gcp' : 'azure';
        const offset = cloudProvider === 'aws' || cloudProvider === 'azure' ? 4 : 2;
        newFirstHost = intToIPv4(newNetworkInt + offset);
      }
    }
  }

  return {
    id: generateSubnetId(),
    network: newNetwork,
    broadcast: newBroadcast,
    firstHost: newFirstHost,
    lastHost: newLastHost,
    cidr: newCidr,
    totalHosts: newTotalHosts,
    usableHosts: newUsableHosts,
    parentId: firstSubnet.parentId,
    level: Math.max(0, firstSubnet.level - 1), // Move up one level in hierarchy
    isSelected: false,
    ipVersion: 'ipv4' as IPVersion,
    cloudReserved
  };
}/**
 * I
Pv4 Subnet Joining Algorithm
 * 
 * This function implements the main algorithm for joining adjacent IPv4 subnets
 * into larger subnets with comprehensive validation and error handling.
 */

/**
 * Main function to join adjacent IPv4 subnets into a single larger subnet
 */
export function joinAdjacentSubnets(
  subnets: SplitSubnet[],
  cloudMode: CloudMode = 'normal'
): SubnetCalculationResult {
  const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

  try {
    // Validate inputs
    if (!subnets || subnets.length < 2) {
      throw new Error('At least 2 subnets are required for joining');
    }

    // Validate that all subnets are IPv4
    const nonIPv4Subnets = subnets.filter(subnet => subnet.ipVersion !== 'ipv4');
    if (nonIPv4Subnets.length > 0) {
      throw new Error('All subnets must be IPv4 for joining operations');
    }

    // Validate subnet adjacency and joinability
    const validation = validateJoinableGroup(subnets);
    if (!validation.isValid) {
      throw new Error(`Join validation failed: ${validation.errors.join(', ')}`);
    }

    // Calculate the joined subnet
    const joinedSubnet = calculateJoinedSubnet(subnets);
    if (!joinedSubnet) {
      throw new Error('Failed to calculate joined subnet');
    }

    // Apply cloud provider constraints if needed
    if (cloudMode !== 'normal') {
      const provider = CLOUD_PROVIDERS[cloudMode];
      if (provider) {
        // Recalculate cloud reservations for the joined subnet
        const networkInt = ipv4ToInt(joinedSubnet.network);
        const broadcastInt = ipv4ToInt(joinedSubnet.broadcast);
        
        joinedSubnet.cloudReserved = provider.getReservations(networkInt, broadcastInt, intToIPv4);
        joinedSubnet.usableHosts = Math.max(0, joinedSubnet.totalHosts - provider.reservedCount);
        
        // Adjust first host for cloud provider offset
        if (joinedSubnet.cidr < 31) {
          const firstUsableOffset = networkInt + provider.firstUsableOffset;
          if (firstUsableOffset <= broadcastInt - 1) {
            joinedSubnet.firstHost = intToIPv4(firstUsableOffset);
          }
        }
      }
    }

    const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const performanceMetrics = calculatePerformanceMetrics(startTime, endTime, 1, 'join');

    // Calculate totals (single joined subnet)
    return {
      subnets: [joinedSubnet],
      totalSubnets: 1,
      totalAddresses: joinedSubnet.totalHosts,
      usableAddresses: joinedSubnet.usableHosts,
      performance: {
        calculationTime: performanceMetrics.duration,
        memoryUsage: undefined
      }
    };

  } catch (error) {
    const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const duration = endTime - startTime;

    console.error('IPv4 subnet joining error:', error);
    
    // Return empty result with error information
    return {
      subnets: [],
      totalSubnets: 0,
      totalAddresses: 0,
      usableAddresses: 0,
      performance: {
        calculationTime: duration
      }
    };
  }
}

/**
 * Validates if a group of subnets can be joined and returns detailed validation results
 */
export function validateIPv4Join(
  subnets: SplitSubnet[],
  cloudMode: CloudMode = 'normal'
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  // Basic input validation
  if (!subnets || subnets.length < 2) {
    errors.push('At least 2 subnets are required for joining');
    return { isValid: false, errors, warnings, suggestions };
  }

  // Check IP version consistency
  const nonIPv4Subnets = subnets.filter(subnet => subnet.ipVersion !== 'ipv4');
  if (nonIPv4Subnets.length > 0) {
    errors.push('All subnets must be IPv4 for joining operations');
    return { isValid: false, errors, warnings, suggestions };
  }

  // Validate adjacency
  const adjacencyValidation = validateJoinableGroup(subnets);
  errors.push(...adjacencyValidation.errors);
  warnings.push(...adjacencyValidation.warnings);
  suggestions.push(...(adjacencyValidation.suggestions || []));

  // Cloud provider specific validations
  if (cloudMode !== 'normal' && errors.length === 0) {
    const provider = CLOUD_PROVIDERS[cloudMode];
    if (provider) {
      // Calculate what the joined subnet would be
      const joinedSubnet = calculateJoinedSubnet(subnets);
      if (joinedSubnet) {
        // Check if joined subnet meets cloud provider requirements
        if (joinedSubnet.cidr < provider.minCidr) {
          errors.push(`${provider.name} does not support subnets larger than /${provider.minCidr}`);
        }
        
        if (joinedSubnet.cidr > provider.maxCidr) {
          errors.push(`${provider.name} requires subnets to be at least /${provider.maxCidr}`);
        }

        // Check if joined subnet will have enough IPs for cloud provider requirements
        if (joinedSubnet.totalHosts < provider.reservedCount) {
          errors.push(`${provider.name} requires at least ${provider.reservedCount} IP addresses per subnet`);
        }
      }
    }
  }

  // Performance warnings
  if (subnets.length > 16) {
    warnings.push(`Joining ${subnets.length} subnets may impact performance`);
  }

  // Hierarchy warnings
  const levels = new Set(subnets.map(s => s.level));
  if (levels.size > 1) {
    warnings.push('Selected subnets are at different hierarchy levels');
    suggestions.push('Consider selecting subnets from the same hierarchy level');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    suggestions
  };
}

/**
 * Calculates a preview of what the joined subnet would look like without actually performing the join
 */
export function calculateJoinPreview(subnets: SplitSubnet[]): {
  isValid: boolean;
  joinedSubnet?: SplitSubnet;
  error?: string;
  networkRange?: string;
  cidrReduction?: number;
  addressGain?: number;
} {
  try {
    if (!subnets || subnets.length < 2) {
      return {
        isValid: false,
        error: 'At least 2 subnets are required for joining'
      };
    }

    const validation = validateJoinableGroup(subnets);
    if (!validation.isValid) {
      return {
        isValid: false,
        error: validation.errors.join(', ')
      };
    }

    const joinedSubnet = calculateJoinedSubnet(subnets);
    if (!joinedSubnet) {
      return {
        isValid: false,
        error: 'Failed to calculate joined subnet'
      };
    }

    // Calculate metrics
    const originalCidr = subnets[0].cidr;
    const cidrReduction = originalCidr - joinedSubnet.cidr;
    const originalTotalAddresses = subnets.reduce((sum, subnet) => sum + subnet.totalHosts, 0);
    const addressGain = joinedSubnet.totalHosts - originalTotalAddresses;

    return {
      isValid: true,
      joinedSubnet,
      networkRange: `${joinedSubnet.network}/${joinedSubnet.cidr}`,
      cidrReduction,
      addressGain
    };

  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    };
  }
}

/**
 * Finds the optimal grouping of subnets for joining operations
 * Returns groups of subnets that can be joined together
 */
export function findOptimalJoinGroups(subnets: SplitSubnet[]): {
  groups: SplitSubnet[][];
  recommendations: string[];
} {
  const recommendations: string[] = [];
  
  // Filter to IPv4 subnets only
  const ipv4Subnets = subnets.filter(subnet => subnet.ipVersion === 'ipv4');
  
  if (ipv4Subnets.length !== subnets.length) {
    recommendations.push('Only IPv4 subnets can be joined. IPv6 subnets have been excluded.');
  }

  // Group by CIDR size first
  const subnetsByCidr = new Map<number, SplitSubnet[]>();
  for (const subnet of ipv4Subnets) {
    if (!subnetsByCidr.has(subnet.cidr)) {
      subnetsByCidr.set(subnet.cidr, []);
    }
    subnetsByCidr.get(subnet.cidr)!.push(subnet);
  }

  const groups: SplitSubnet[][] = [];

  // For each CIDR size, find adjacent groups
  for (const [cidr, subnetsOfSize] of subnetsByCidr) {
    if (subnetsOfSize.length < 2) {
      continue; // Need at least 2 subnets to join
    }

    const adjacentGroups = groupAdjacentSubnets(subnetsOfSize);
    
    // Filter groups to only include those that are powers of 2
    const validGroups = adjacentGroups.filter(group => {
      const count = group.length;
      return count >= 2 && (count & (count - 1)) === 0; // Check if power of 2
    });

    groups.push(...validGroups);

    // Add recommendations
    if (adjacentGroups.length > validGroups.length) {
      recommendations.push(`Some groups of /${cidr} subnets cannot be joined because they don't form power-of-2 counts`);
    }
  }

  // Sort groups by potential benefit (larger groups first, then by CIDR reduction)
  groups.sort((a, b) => {
    const aReduction = Math.log2(a.length);
    const bReduction = Math.log2(b.length);
    
    if (aReduction !== bReduction) {
      return bReduction - aReduction; // Larger reduction first
    }
    
    return a[0].cidr - b[0].cidr; // Smaller CIDR (larger subnets) first
  });

  if (groups.length === 0) {
    recommendations.push('No adjacent subnet groups found that can be joined');
    recommendations.push('Ensure subnets are adjacent and in power-of-2 quantities (2, 4, 8, 16, etc.)');
  }

  return {
    groups,
    recommendations
  };
}

/**
 * Performs batch joining of multiple subnet groups
 */
export function batchJoinSubnets(
  subnetGroups: SplitSubnet[][],
  cloudMode: CloudMode = 'normal'
): {
  results: SubnetCalculationResult[];
  summary: {
    totalGroupsProcessed: number;
    successfulJoins: number;
    failedJoins: number;
    totalSubnetsJoined: number;
    totalSubnetsCreated: number;
  };
  errors: string[];
} {
  const results: SubnetCalculationResult[] = [];
  const errors: string[] = [];
  let successfulJoins = 0;
  let failedJoins = 0;
  let totalSubnetsJoined = 0;
  let totalSubnetsCreated = 0;

  for (const group of subnetGroups) {
    try {
      const result = joinAdjacentSubnets(group, cloudMode);
      
      if (result.subnets.length > 0) {
        results.push(result);
        successfulJoins++;
        totalSubnetsJoined += group.length;
        totalSubnetsCreated += result.totalSubnets;
      } else {
        failedJoins++;
        errors.push(`Failed to join group of ${group.length} subnets starting with ${group[0].network}`);
      }
    } catch (error) {
      failedJoins++;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Error joining group of ${group.length} subnets: ${errorMessage}`);
    }
  }

  return {
    results,
    summary: {
      totalGroupsProcessed: subnetGroups.length,
      successfulJoins,
      failedJoins,
      totalSubnetsJoined,
      totalSubnetsCreated
    },
    errors
  };
}
/**
 * I
Pv6 Subnet Splitting and Joining Functions
 * 
 * These functions handle IPv6 subnet operations using BigInt for large address space calculations.
 */

/**
 * Converts IPv6 address string to BigInt representation
 */
function ipv6ToBigInt(ipv6: string): bigint {
  // Remove any leading/trailing whitespace and convert to lowercase
  const cleanIpv6 = ipv6.trim().toLowerCase();
  
  // Handle IPv6 address compression (::)
  let expandedIpv6: string;
  
  if (cleanIpv6.includes('::')) {
    // Split on :: to get parts before and after
    const parts = cleanIpv6.split('::');
    const beforeParts = parts[0] ? parts[0].split(':') : [];
    const afterParts = parts[1] ? parts[1].split(':') : [];
    
    // Calculate how many zero groups we need to insert
    const totalGroups = 8;
    const existingGroups = beforeParts.length + afterParts.length;
    const zeroGroups = totalGroups - existingGroups;
    
    // Build the expanded address
    const expandedParts = [
      ...beforeParts,
      ...Array(zeroGroups).fill('0'),
      ...afterParts
    ];
    
    expandedIpv6 = expandedParts.join(':');
  } else {
    expandedIpv6 = cleanIpv6;
  }
  
  // Split into 8 groups and convert each to a 16-bit value
  const groups = expandedIpv6.split(':');
  if (groups.length !== 8) {
    throw new Error(`Invalid IPv6 address format: ${ipv6}`);
  }
  
  let result = BigInt(0);
  for (let i = 0; i < 8; i++) {
    const group = groups[i] || '0';
    const value = parseInt(group, 16);
    if (isNaN(value) || value < 0 || value > 0xFFFF) {
      throw new Error(`Invalid IPv6 group: ${group}`);
    }
    result = (result << BigInt(16)) + BigInt(value);
  }
  
  return result;
}

/**
 * Converts BigInt representation back to IPv6 address string with compression
 */
function bigIntToIPv6(value: bigint, compress: boolean = true): string {
  // Extract 8 groups of 16 bits each
  const groups: string[] = [];
  let remaining = value;
  
  for (let i = 0; i < 8; i++) {
    const group = Number(remaining & BigInt(0xFFFF));
    groups.unshift(group.toString(16));
    remaining = remaining >> BigInt(16);
  }
  
  if (!compress) {
    return groups.join(':');
  }
  
  // Apply IPv6 compression rules
  const address = groups.join(':');
  
  // Find the longest sequence of consecutive zero groups
  let longestZeroStart = -1;
  let longestZeroLength = 0;
  let currentZeroStart = -1;
  let currentZeroLength = 0;
  
  for (let i = 0; i < groups.length; i++) {
    if (groups[i] === '0') {
      if (currentZeroStart === -1) {
        currentZeroStart = i;
        currentZeroLength = 1;
      } else {
        currentZeroLength++;
      }
    } else {
      if (currentZeroLength > longestZeroLength) {
        longestZeroStart = currentZeroStart;
        longestZeroLength = currentZeroLength;
      }
      currentZeroStart = -1;
      currentZeroLength = 0;
    }
  }
  
  // Check the last sequence
  if (currentZeroLength > longestZeroLength) {
    longestZeroStart = currentZeroStart;
    longestZeroLength = currentZeroLength;
  }
  
  // Apply compression if we have at least 2 consecutive zeros
  if (longestZeroLength >= 2) {
    const beforeZeros = groups.slice(0, longestZeroStart).join(':');
    const afterZeros = groups.slice(longestZeroStart + longestZeroLength).join(':');
    
    if (longestZeroStart === 0) {
      return '::' + (afterZeros || '');
    } else if (longestZeroStart + longestZeroLength === 8) {
      return (beforeZeros || '') + '::';
    } else {
      return beforeZeros + '::' + afterZeros;
    }
  }
  
  return address;
}

/**
 * Calculates detailed IPv6 subnet information
 */
function calculateIPv6SubnetDetails(
  networkBigInt: bigint,
  prefixLength: number
): Omit<SplitSubnet, 'id' | 'parentId' | 'level' | 'isSelected' | 'ipVersion'> {
  const hostBits = 128 - prefixLength;
  const network = bigIntToIPv6(networkBigInt);
  
  // IPv6 doesn't have broadcast addresses, so we calculate the last address in the subnet
  const subnetSizeBigInt = BigInt(2) ** BigInt(hostBits);
  const lastAddressBigInt = networkBigInt + subnetSizeBigInt - BigInt(1);
  const lastAddress = bigIntToIPv6(lastAddressBigInt);
  
  // For IPv6, first and last host are the same as network and last address
  // since there's no concept of network/broadcast addresses like in IPv4
  const firstHost = network;
  const lastHost = lastAddress;
  
  // Calculate total addresses (use string representation for very large numbers)
  let totalHosts: number;
  let usableHosts: number;
  let totalAddressesFormatted: string;
  let usableAddressesFormatted: string;
  
  if (hostBits <= 53) {
    // Can represent exactly as JavaScript number
    totalHosts = Number(subnetSizeBigInt);
    usableHosts = totalHosts; // IPv6 doesn't reserve network/broadcast
    totalAddressesFormatted = totalHosts.toLocaleString();
    usableAddressesFormatted = usableHosts.toLocaleString();
  } else {
    // Too large for JavaScript number, use BigInt string representation
    totalHosts = Number.MAX_SAFE_INTEGER; // Placeholder for display
    usableHosts = Number.MAX_SAFE_INTEGER;
    totalAddressesFormatted = `2^${hostBits}`;
    usableAddressesFormatted = `2^${hostBits}`;
  }
  
  // Determine address type
  let addressType = 'Global Unicast';
  if (network.startsWith('fe80:')) {
    addressType = 'Link-Local';
  } else if (network.startsWith('fc') || network.startsWith('fd')) {
    addressType = 'Unique Local';
  } else if (network.startsWith('ff')) {
    addressType = 'Multicast';
  } else if (network === '::1') {
    addressType = 'Loopback';
  } else if (network === '::') {
    addressType = 'Unspecified';
  }
  
  return {
    network,
    broadcast: lastAddress, // Using last address instead of broadcast for IPv6
    firstHost,
    lastHost,
    cidr: prefixLength,
    totalHosts,
    usableHosts,
    ipv6Info: {
      addressType,
      hostBits,
      totalAddressesFormatted,
      usableAddressesFormatted
    }
  };
}

/**
 * Validates IPv6 split options and parent subnet compatibility
 */
function validateIPv6SplitOptions(
  parentSubnet: SubnetInfo,
  splitOptions: SplitOptions
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  // Extract parent prefix length
  const parentCidrMatch = parentSubnet.cidr.match(/\/(\d+)/);
  if (!parentCidrMatch) {
    errors.push('Invalid parent subnet CIDR format');
    return { isValid: false, errors, warnings, suggestions };
  }

  const parentPrefix = parseInt(parentCidrMatch[1], 10);

  // Determine target prefix based on split type
  let targetPrefix: number;
  let expectedSubnetCount: number;

  if (splitOptions.splitType === 'equal') {
    if (!splitOptions.splitCount || splitOptions.splitCount < 2) {
      errors.push('Split count must be at least 2 for equal splits');
      return { isValid: false, errors, warnings, suggestions };
    }

    // Calculate required bits for the split count
    const bitsNeeded = Math.ceil(Math.log2(splitOptions.splitCount));
    targetPrefix = parentPrefix + bitsNeeded;
    expectedSubnetCount = Math.pow(2, bitsNeeded);

    if (expectedSubnetCount !== splitOptions.splitCount) {
      warnings.push(`Split count ${splitOptions.splitCount} will be rounded up to ${expectedSubnetCount} (next power of 2)`);
    }
  } else if (splitOptions.splitType === 'custom') {
    if (!splitOptions.customCidr) {
      errors.push('Custom prefix length is required for custom splits');
      return { isValid: false, errors, warnings, suggestions };
    }

    targetPrefix = splitOptions.customCidr;
    expectedSubnetCount = Math.pow(2, targetPrefix - parentPrefix);
  } else {
    errors.push('Invalid split type. Must be "equal" or "custom"');
    return { isValid: false, errors, warnings, suggestions };
  }

  // Validate target prefix
  if (targetPrefix <= parentPrefix) {
    errors.push('Target prefix must be more specific (larger number) than parent prefix');
  }

  if (targetPrefix > 128) {
    errors.push('IPv6 prefix length cannot exceed /128');
  }

  // IPv6-specific validations
  if (targetPrefix - parentPrefix > 16) {
    warnings.push(`Large prefix increase (${targetPrefix - parentPrefix} bits) may result in very many subnets`);
    suggestions.push('Consider smaller prefix increases for more manageable subnet counts');
  }

  // Performance warnings for IPv6
  if (expectedSubnetCount > 1000) {
    errors.push(`Split would create ${expectedSubnetCount} subnets, exceeding recommended maximum of 1000`);
    suggestions.push('Use a smaller split count or larger target prefix to reduce the number of resulting subnets');
  } else if (expectedSubnetCount > 100) {
    warnings.push(`Split will create ${expectedSubnetCount} subnets, which may impact performance`);
    suggestions.push('Consider using pagination or virtual scrolling for large subnet lists');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    suggestions
  };
}

/**
 * Main function to split an IPv6 subnet into smaller subnets
 */
export function splitIPv6Subnet(
  parentSubnet: SubnetInfo,
  splitOptions: SplitOptions
): SubnetCalculationResult {
  const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

  try {
    // Validate inputs
    if (!parentSubnet || !splitOptions) {
      throw new Error('Parent subnet and split options are required');
    }

    // Validate split options
    const validation = validateIPv6SplitOptions(parentSubnet, splitOptions);
    if (!validation.isValid) {
      throw new Error(`IPv6 split validation failed: ${validation.errors.join(', ')}`);
    }

    // Extract parent subnet information
    const parentCidrMatch = parentSubnet.cidr.match(/\/(\d+)/);
    if (!parentCidrMatch) {
      throw new Error('Invalid parent subnet CIDR format');
    }

    const parentPrefix = parseInt(parentCidrMatch[1], 10);
    const parentNetworkBigInt = ipv6ToBigInt(parentSubnet.network);

    // Determine target prefix and subnet count
    let targetPrefix: number;
    let subnetCount: number;

    if (splitOptions.splitType === 'equal') {
      const bitsNeeded = Math.ceil(Math.log2(splitOptions.splitCount || 2));
      targetPrefix = parentPrefix + bitsNeeded;
      subnetCount = Math.pow(2, bitsNeeded);
    } else {
      targetPrefix = splitOptions.customCidr!;
      subnetCount = Math.pow(2, targetPrefix - parentPrefix);
    }

    // Apply maximum results limit
    const maxResults = splitOptions.maxResults || 1000;
    if (subnetCount > maxResults) {
      subnetCount = maxResults;
    }

    // Calculate subnet size using BigInt
    const subnetSizeBigInt = BigInt(2) ** BigInt(128 - targetPrefix);
    const results: SplitSubnet[] = [];

    // Generate split subnets
    for (let i = 0; i < subnetCount; i++) {
      const networkBigInt = parentNetworkBigInt + (BigInt(i) * subnetSizeBigInt);
      
      const subnetDetails = calculateIPv6SubnetDetails(networkBigInt, targetPrefix);

      const splitSubnet: SplitSubnet = {
        id: generateSubnetId(),
        ...subnetDetails,
        parentId: parentSubnet.id,
        level: (parentSubnet.level || 0) + 1,
        isSelected: false,
        ipVersion: 'ipv6' as IPVersion
      };

      results.push(splitSubnet);
    }

    const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const performanceMetrics = calculatePerformanceMetrics(startTime, endTime, results.length, 'split');

    // Calculate totals (use safe numbers for display)
    const totalAddresses = results.reduce((sum, subnet) => {
      return sum + (subnet.totalHosts === Number.MAX_SAFE_INTEGER ? 0 : subnet.totalHosts);
    }, 0);
    const usableAddresses = results.reduce((sum, subnet) => {
      return sum + (subnet.usableHosts === Number.MAX_SAFE_INTEGER ? 0 : subnet.usableHosts);
    }, 0);

    return {
      subnets: results,
      totalSubnets: results.length,
      totalAddresses,
      usableAddresses,
      performance: {
        calculationTime: performanceMetrics.duration,
        memoryUsage: undefined
      }
    };

  } catch (error) {
    const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const duration = endTime - startTime;

    console.error('IPv6 subnet splitting error:', error);
    
    return {
      subnets: [],
      totalSubnets: 0,
      totalAddresses: 0,
      usableAddresses: 0,
      performance: {
        calculationTime: duration
      }
    };
  }
}

/**
 * Validates if a subnet split configuration is valid for IPv6
 */
export function validateIPv6Split(
  parentSubnet: SubnetInfo,
  splitOptions: SplitOptions
): ValidationResult {
  return validateIPv6SplitOptions(parentSubnet, splitOptions);
}

/**
 * IPv6 Subnet Adjacency Validation Functions
 */

/**
 * Validates if a list of IPv6 subnets are adjacent and can be joined
 */
export function validateIPv6SubnetAdjacency(subnets: SplitSubnet[]): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const suggestions: string[] = [];

  if (!subnets || subnets.length < 2) {
    errors.push('At least 2 subnets are required for adjacency validation');
    return { isValid: false, errors, warnings, suggestions };
  }

  // Check if all subnets are IPv6
  const nonIPv6Subnets = subnets.filter(subnet => subnet.ipVersion !== 'ipv6');
  if (nonIPv6Subnets.length > 0) {
    errors.push('All subnets must be IPv6 for adjacency validation');
    return { isValid: false, errors, warnings, suggestions };
  }

  // Check if all subnets have the same prefix length (same size)
  const firstPrefix = subnets[0].cidr;
  const differentSizeSubnets = subnets.filter(subnet => subnet.cidr !== firstPrefix);
  if (differentSizeSubnets.length > 0) {
    errors.push(`All subnets must be the same size (same prefix length) to be joined. Found prefixes: ${[...new Set(subnets.map(s => s.cidr))].join(', ')}`);
    suggestions.push('Only select subnets with the same prefix length for joining operations');
  }

  // Sort subnets by network address for adjacency checking
  const sortedSubnets = [...subnets].sort((a, b) => {
    const aBigInt = ipv6ToBigInt(a.network);
    const bBigInt = ipv6ToBigInt(b.network);
    return aBigInt < bBigInt ? -1 : aBigInt > bBigInt ? 1 : 0;
  });

  // Check for overlapping subnets
  const subnetSizeBigInt = BigInt(2) ** BigInt(128 - firstPrefix);
  
  for (let i = 0; i < sortedSubnets.length - 1; i++) {
    const currentSubnet = sortedSubnets[i];
    const nextSubnet = sortedSubnets[i + 1];
    
    const currentNetworkBigInt = ipv6ToBigInt(currentSubnet.network);
    const currentLastBigInt = currentNetworkBigInt + subnetSizeBigInt - BigInt(1);
    const nextNetworkBigInt = ipv6ToBigInt(nextSubnet.network);
    
    if (currentLastBigInt >= nextNetworkBigInt) {
      errors.push(`Subnets ${currentSubnet.network}/${currentSubnet.cidr} and ${nextSubnet.network}/${nextSubnet.cidr} overlap`);
    }
  }

  // If we have errors so far, return early
  if (errors.length > 0) {
    return { isValid: false, errors, warnings, suggestions };
  }

  // Check adjacency - subnets must be contiguous in address space
  for (let i = 0; i < sortedSubnets.length - 1; i++) {
    const currentSubnet = sortedSubnets[i];
    const nextSubnet = sortedSubnets[i + 1];
    
    const currentNetworkBigInt = ipv6ToBigInt(currentSubnet.network);
    const nextNetworkBigInt = ipv6ToBigInt(nextSubnet.network);
    
    const expectedNextNetwork = currentNetworkBigInt + subnetSizeBigInt;
    
    if (nextNetworkBigInt !== expectedNextNetwork) {
      const gap = nextNetworkBigInt - expectedNextNetwork;
      if (gap > 0) {
        errors.push(`Gap detected between ${currentSubnet.network}/${currentSubnet.cidr} and ${nextSubnet.network}/${nextSubnet.cidr}`);
        suggestions.push('Ensure all subnets in the range are selected for joining, with no gaps in the address space');
      } else {
        errors.push(`Subnets ${currentSubnet.network}/${currentSubnet.cidr} and ${nextSubnet.network}/${nextSubnet.cidr} are not properly ordered or have addressing conflicts`);
      }
    }
  }

  // Validate that the combined subnets would form a valid larger subnet
  if (errors.length === 0) {
    const totalSubnets = subnets.length;
    const requiredPowerOfTwo = Math.log2(totalSubnets);
    
    if (!Number.isInteger(requiredPowerOfTwo)) {
      errors.push(`Cannot join ${totalSubnets} subnets. The number of subnets must be a power of 2 (2, 4, 8, 16, etc.)`);
      suggestions.push(`Select ${Math.pow(2, Math.floor(requiredPowerOfTwo))} or ${Math.pow(2, Math.ceil(requiredPowerOfTwo))} subnets instead`);
    } else {
      // Check if the first subnet starts at the correct boundary for the larger subnet
      const newPrefix = firstPrefix - requiredPowerOfTwo;
      const newSubnetSizeBigInt = BigInt(2) ** BigInt(128 - newPrefix);
      const firstNetworkBigInt = ipv6ToBigInt(sortedSubnets[0].network);
      
      if (firstNetworkBigInt % newSubnetSizeBigInt !== BigInt(0)) {
        errors.push(`Selected subnets do not align to a proper /${newPrefix} boundary for joining`);
        suggestions.push('Ensure the first subnet in the selection starts at the correct network boundary');
      }
    }
  }

  // Performance warnings for large joins
  if (subnets.length > 16) {
    warnings.push(`Joining ${subnets.length} subnets may impact performance`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    suggestions
  };
}

/**
 * Checks if two specific IPv6 subnets are adjacent
 */
export function areIPv6SubnetsAdjacent(subnet1: SplitSubnet, subnet2: SplitSubnet): boolean {
  if (subnet1.ipVersion !== 'ipv6' || subnet2.ipVersion !== 'ipv6') {
    return false;
  }

  if (subnet1.cidr !== subnet2.cidr) {
    return false;
  }

  const subnet1NetworkBigInt = ipv6ToBigInt(subnet1.network);
  const subnet2NetworkBigInt = ipv6ToBigInt(subnet2.network);
  const subnetSizeBigInt = BigInt(2) ** BigInt(128 - subnet1.cidr);

  // Check if subnet2 immediately follows subnet1
  if (subnet2NetworkBigInt === subnet1NetworkBigInt + subnetSizeBigInt) {
    return true;
  }

  // Check if subnet1 immediately follows subnet2
  if (subnet1NetworkBigInt === subnet2NetworkBigInt + subnetSizeBigInt) {
    return true;
  }

  return false;
}

/**
 * Calculates the resulting IPv6 subnet that would be created by joining adjacent subnets
 */
export function calculateJoinedIPv6Subnet(subnets: SplitSubnet[]): SplitSubnet | null {
  const validation = validateIPv6SubnetAdjacency(subnets);
  
  if (!validation.isValid) {
    return null;
  }

  // Sort subnets by network address
  const sortedSubnets = [...subnets].sort((a, b) => {
    const aBigInt = ipv6ToBigInt(a.network);
    const bBigInt = ipv6ToBigInt(b.network);
    return aBigInt < bBigInt ? -1 : aBigInt > bBigInt ? 1 : 0;
  });

  const firstSubnet = sortedSubnets[0];
  
  // Calculate the new prefix length
  const subnetCount = subnets.length;
  const bitsReduced = Math.log2(subnetCount);
  const newPrefix = firstSubnet.cidr - bitsReduced;
  
  // Calculate the new network address
  const newNetworkBigInt = ipv6ToBigInt(firstSubnet.network);
  
  const joinedSubnetDetails = calculateIPv6SubnetDetails(newNetworkBigInt, newPrefix);

  return {
    id: generateSubnetId(),
    ...joinedSubnetDetails,
    parentId: firstSubnet.parentId,
    level: Math.max(0, firstSubnet.level - 1), // Move up one level in hierarchy
    isSelected: false,
    ipVersion: 'ipv6' as IPVersion
  };
}

/**
 * Main function to join adjacent IPv6 subnets into a single larger subnet
 */
export function joinIPv6Subnets(subnets: SplitSubnet[]): SubnetCalculationResult {
  const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

  try {
    // Validate inputs
    if (!subnets || subnets.length < 2) {
      throw new Error('At least 2 subnets are required for joining');
    }

    // Validate that all subnets are IPv6
    const nonIPv6Subnets = subnets.filter(subnet => subnet.ipVersion !== 'ipv6');
    if (nonIPv6Subnets.length > 0) {
      throw new Error('All subnets must be IPv6 for joining operations');
    }

    // Validate subnet adjacency and joinability
    const validation = validateIPv6SubnetAdjacency(subnets);
    if (!validation.isValid) {
      throw new Error(`IPv6 join validation failed: ${validation.errors.join(', ')}`);
    }

    // Calculate the joined subnet
    const joinedSubnet = calculateJoinedIPv6Subnet(subnets);
    if (!joinedSubnet) {
      throw new Error('Failed to calculate joined IPv6 subnet');
    }

    const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const performanceMetrics = calculatePerformanceMetrics(startTime, endTime, 1, 'join');

    return {
      subnets: [joinedSubnet],
      totalSubnets: 1,
      totalAddresses: joinedSubnet.totalHosts,
      usableAddresses: joinedSubnet.usableHosts,
      performance: {
        calculationTime: performanceMetrics.duration,
        memoryUsage: undefined
      }
    };

  } catch (error) {
    const endTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const duration = endTime - startTime;

    console.error('IPv6 subnet joining error:', error);
    
    return {
      subnets: [],
      totalSubnets: 0,
      totalAddresses: 0,
      usableAddresses: 0,
      performance: {
        calculationTime: duration
      }
    };
  }
}
