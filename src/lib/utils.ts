import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// IPv6 utility functions

/**
 * Validates an IPv6 address in both full and compressed formats
 * Supports formats like:
 * - Full: 2001:0db8:85a3:0000:0000:8a2e:0370:7334
 * - Compressed: 2001:db8:85a3::8a2e:370:7334
 * - Loopback: ::1
 * - All zeros: ::
 */
export function validateIPv6(ipv6: string): boolean {
  if (!ipv6 || typeof ipv6 !== 'string') {
    return false;
  }

  // Remove leading/trailing whitespace
  ipv6 = ipv6.trim();

  // Check for invalid characters (only hex digits, colons, and dots for IPv4-mapped addresses)
  if (!/^[0-9a-fA-F:\.]+$/.test(ipv6)) {
    return false;
  }

  // Handle special cases
  if (ipv6 === '::') {
    return true; // All zeros address
  }

  // Check for multiple :: (only one allowed)
  const doubleColonCount = (ipv6.match(/::/g) || []).length;
  if (doubleColonCount > 1) {
    return false;
  }

  // Split by :: to handle compression
  const parts = ipv6.split('::');
  
  if (parts.length > 2) {
    return false;
  }

  const leftPart = parts[0] || '';
  const rightPart = parts[1] || '';

  // Remove empty strings from splitting
  const leftGroups = leftPart ? leftPart.split(':').filter(group => group !== '') : [];
  const rightGroups = rightPart ? rightPart.split(':').filter(group => group !== '') : [];

  // Check if we have IPv4-mapped IPv6 address (ends with IPv4)
  const ipv4Pattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  let hasIPv4Suffix = false;
  
  if (rightGroups.length > 0) {
    const lastGroup = rightGroups[rightGroups.length - 1];
    if (ipv4Pattern.test(lastGroup)) {
      hasIPv4Suffix = true;
      // Validate IPv4 part
      const ipv4Parts = lastGroup.split('.').map(Number);
      if (ipv4Parts.some(part => part > 255)) {
        return false;
      }
      // Remove the IPv4 part and add 2 groups (IPv4 = 32 bits = 2 IPv6 groups)
      rightGroups.pop();
      rightGroups.push('0000', '0000'); // Placeholder for validation
    }
  }

  // If no compression (::), we should have exactly 8 groups
  if (doubleColonCount === 0) {
    const allGroups = [...leftGroups, ...rightGroups];
    if (hasIPv4Suffix) {
      // IPv4-mapped addresses should have 6 IPv6 groups + IPv4 (which counts as 2 groups)
      if (allGroups.length !== 8) {
        return false;
      }
    } else {
      if (allGroups.length !== 8) {
        return false;
      }
    }
  } else {
    // With compression, total groups should be less than 8
    const totalGroups = leftGroups.length + rightGroups.length;
    if (totalGroups >= 8) {
      return false;
    }
  }

  // Validate each group (should be 1-4 hex digits)
  const allGroups = [...leftGroups, ...rightGroups];
  for (const group of allGroups) {
    if (group === '') continue; // Skip empty groups from compression
    
    // Skip the placeholder groups we added for IPv4 suffix
    if (hasIPv4Suffix && group === '0000') continue;
    
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) {
      return false;
    }
  }

  return true;
}

/**
 * Expands a compressed IPv6 address to its full form
 * Example: 2001:db8::1 -> 2001:0db8:0000:0000:0000:0000:0000:0001
 */
export function expandIPv6(ipv6: string): string {
  if (!validateIPv6(ipv6)) {
    throw new Error('Invalid IPv6 address');
  }

  // Handle special case of all zeros
  if (ipv6 === '::') {
    return '0000:0000:0000:0000:0000:0000:0000:0000';
  }

  // Handle IPv4-mapped addresses
  const ipv4Pattern = /^(.*)::(.*)\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const ipv4Match = ipv6.match(ipv4Pattern);
  
  if (ipv4Match) {
    const [, leftPart, , oct1, oct2, oct3, oct4] = ipv4Match;
    // Convert IPv4 to hex
    const hex1 = (parseInt(oct1) * 256 + parseInt(oct2)).toString(16).padStart(4, '0');
    const hex2 = (parseInt(oct3) * 256 + parseInt(oct4)).toString(16).padStart(4, '0');
    ipv6 = `${leftPart}::${hex1}:${hex2}`;
  }

  const result = ipv6;

  // If there's no compression, just pad each group
  if (!result.includes('::')) {
    return result.split(':').map(group => group.padStart(4, '0')).join(':');
  }

  // Handle compression
  const parts = result.split('::');
  const leftPart = parts[0] || '';
  const rightPart = parts[1] || '';

  const leftGroups = leftPart ? leftPart.split(':') : [];
  const rightGroups = rightPart ? rightPart.split(':') : [];

  // Calculate how many zero groups to insert
  const totalGroups = leftGroups.length + rightGroups.length;
  const zeroGroups = 8 - totalGroups;

  // Pad existing groups
  const paddedLeft = leftGroups.map(group => group.padStart(4, '0'));
  const paddedRight = rightGroups.map(group => group.padStart(4, '0'));

  // Insert zero groups
  const zeroGroupsArray = Array(zeroGroups).fill('0000');

  return [...paddedLeft, ...zeroGroupsArray, ...paddedRight].join(':');
}

/**
 * Compresses an IPv6 address by removing leading zeros and replacing longest zero sequence with ::
 * Example: 2001:0db8:0000:0000:0000:0000:0000:0001 -> 2001:db8::1
 */
export function compressIPv6(ipv6: string): string {
  // First expand to ensure we have a valid full format
  const expanded = expandIPv6(ipv6);
  
  // Remove leading zeros from each group
  const groups = expanded.split(':').map(group => {
    return group.replace(/^0+/, '') || '0';
  });

  // Find the longest sequence of consecutive zero groups
  let maxZeroStart = -1;
  let maxZeroLength = 0;
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
      if (currentZeroLength > maxZeroLength) {
        maxZeroStart = currentZeroStart;
        maxZeroLength = currentZeroLength;
      }
      currentZeroStart = -1;
      currentZeroLength = 0;
    }
  }

  // Check the last sequence
  if (currentZeroLength > maxZeroLength) {
    maxZeroStart = currentZeroStart;
    maxZeroLength = currentZeroLength;
  }

  // Only compress if we have at least 2 consecutive zeros
  if (maxZeroLength >= 2) {
    const beforeZeros = groups.slice(0, maxZeroStart);
    const afterZeros = groups.slice(maxZeroStart + maxZeroLength);
    
    if (beforeZeros.length === 0 && afterZeros.length === 0) {
      return '::'; // All zeros
    } else if (beforeZeros.length === 0) {
      return '::' + afterZeros.join(':');
    } else if (afterZeros.length === 0) {
      return beforeZeros.join(':') + '::';
    } else {
      return beforeZeros.join(':') + '::' + afterZeros.join(':');
    }
  }

  return groups.join(':');
}

/**
 * Converts an IPv6 address to its binary representation (128 bits)
 * Returns an array of 128 boolean values (true = 1, false = 0)
 */
export function ipv6ToBinary(ipv6: string): boolean[] {
  const expanded = expandIPv6(ipv6);
  const groups = expanded.split(':');
  
  const binary: boolean[] = [];
  
  for (const group of groups) {
    const num = parseInt(group, 16);
    // Convert 16-bit number to 16 boolean values
    for (let i = 15; i >= 0; i--) {
      binary.push((num & (1 << i)) !== 0);
    }
  }
  
  return binary;
}

/**
 * Converts a binary representation back to IPv6 address
 * Takes an array of 128 boolean values and returns compressed IPv6 string
 */
export function binaryToIPv6(binary: boolean[]): string {
  if (binary.length !== 128) {
    throw new Error('Binary array must be exactly 128 bits');
  }
  
  const groups: string[] = [];
  
  // Process 16 bits at a time to create each group
  for (let i = 0; i < 128; i += 16) {
    let groupValue = 0;
    for (let j = 0; j < 16; j++) {
      if (binary[i + j]) {
        groupValue |= (1 << (15 - j));
      }
    }
    groups.push(groupValue.toString(16).padStart(4, '0'));
  }
  
  const fullAddress = groups.join(':');
  return compressIPv6(fullAddress);
}

/**
 * Converts IPv6 address to a BigInt representation for mathematical operations
 */
export function ipv6ToBigInt(ipv6: string): bigint {
  const expanded = expandIPv6(ipv6);
  const groups = expanded.split(':');
  
  let result = 0n;
  
  for (const group of groups) {
    result = (result << 16n) + BigInt(parseInt(group, 16));
  }
  
  return result;
}

/**
 * Converts a BigInt back to IPv6 address
 */
export function bigIntToIPv6(value: bigint): string {
  if (value < 0n || value > (2n ** 128n - 1n)) {
    throw new Error('Value out of range for IPv6 address');
  }
  
  const groups: string[] = [];
  let remaining = value;
  
  // Extract 16 bits at a time from right to left
  for (let i = 0; i < 8; i++) {
    const group = remaining & 0xFFFFn;
    groups.unshift(group.toString(16).padStart(4, '0'));
    remaining = remaining >> 16n;
  }
  
  const fullAddress = groups.join(':');
  return compressIPv6(fullAddress);
}

// IPv6 subnet calculation utilities

/**
 * Validates IPv6 CIDR prefix length
 * IPv6 supports prefix lengths from /0 to /128
 */
export function validateIPv6CIDR(prefix: string): boolean {
  const num = parseInt(prefix);
  return !isNaN(num) && num >= 0 && num <= 128;
}

/**
 * Calculates IPv6 subnet information
 * Returns network address, first/last host addresses, and address count
 */
export function calculateIPv6Subnet(ipv6: string, prefixLength: number): {
  network: string;
  firstHost: string;
  lastHost: string;
  totalAddresses: bigint;
  usableAddresses: bigint;
  prefixLength: number;
} {
  if (!validateIPv6(ipv6)) {
    throw new Error('Invalid IPv6 address');
  }

  if (!validateIPv6CIDR(prefixLength.toString())) {
    throw new Error('Invalid IPv6 prefix length. Must be between 0 and 128');
  }

  // Convert IPv6 to BigInt for calculations
  const ipBigInt = ipv6ToBigInt(ipv6);
  
  // Calculate subnet mask
  const hostBits = 128 - prefixLength;
  const subnetMask = hostBits >= 128 ? 0n : (2n ** 128n - 1n) << BigInt(hostBits);
  
  // Calculate network address
  const networkBigInt = ipBigInt & subnetMask;
  const network = bigIntToIPv6(networkBigInt);
  
  // Calculate total addresses in subnet
  const totalAddresses = hostBits >= 128 ? 2n ** 128n : 2n ** BigInt(hostBits);
  
  // For IPv6, there's no broadcast address concept like IPv4
  // All addresses in the subnet are potentially usable
  const usableAddresses = totalAddresses;
  
  // Calculate first and last host addresses
  const firstHostBigInt = networkBigInt;
  const lastHostBigInt = networkBigInt + totalAddresses - 1n;
  
  const firstHost = bigIntToIPv6(firstHostBigInt);
  const lastHost = bigIntToIPv6(lastHostBigInt);
  
  return {
    network,
    firstHost,
    lastHost,
    totalAddresses,
    usableAddresses,
    prefixLength
  };
}

/**
 * Formats large IPv6 address counts for display
 * Handles very large numbers that exceed JavaScript's safe integer range
 */
export function formatIPv6AddressCount(count: bigint): string {
  if (count <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(count).toLocaleString();
  }
  
  // For very large numbers, use scientific notation or special formatting
  const countStr = count.toString();
  
  if (countStr.length > 15) {
    // Use scientific notation for very large numbers
    const exponent = countStr.length - 1;
    const mantissa = countStr[0] + '.' + countStr.slice(1, 4);
    return `${mantissa} × 10^${exponent}`;
  }
  
  // For moderately large numbers, add commas
  return countStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Checks if an IPv6 address is within a given subnet
 */
export function isIPv6InSubnet(ipv6: string, networkAddress: string, prefixLength: number): boolean {
  if (!validateIPv6(ipv6) || !validateIPv6(networkAddress)) {
    return false;
  }
  
  if (!validateIPv6CIDR(prefixLength.toString())) {
    return false;
  }
  
  try {
    const ipBigInt = ipv6ToBigInt(ipv6);
    const networkBigInt = ipv6ToBigInt(networkAddress);
    
    const hostBits = 128 - prefixLength;
    const subnetMask = hostBits >= 128 ? 0n : (2n ** 128n - 1n) << BigInt(hostBits);
    
    return (ipBigInt & subnetMask) === (networkBigInt & subnetMask);
  } catch {
    return false;
  }
}

/**
 * Generates IPv6 subnet summary information
 */
export function getIPv6SubnetSummary(ipv6: string, prefixLength: number): {
  address: string;
  network: string;
  prefixLength: number;
  hostBits: number;
  totalAddresses: string;
  usableAddresses: string;
  addressType: string;
} {
  const subnet = calculateIPv6Subnet(ipv6, prefixLength);
  const hostBits = 128 - prefixLength;
  
  // Determine address type based on prefix
  let addressType = 'Global Unicast';
  const compressed = compressIPv6(ipv6);
  
  if (compressed.startsWith('fe80:')) {
    addressType = 'Link-Local';
  } else if (compressed.startsWith('fc') || compressed.startsWith('fd')) {
    addressType = 'Unique Local';
  } else if (compressed === '::1') {
    addressType = 'Loopback';
  } else if (compressed.startsWith('::')) {
    addressType = 'Unspecified/Special';
  } else if (compressed.startsWith('2001:db8:')) {
    addressType = 'Documentation';
  }
  
  return {
    address: compressIPv6(ipv6),
    network: subnet.network,
    prefixLength,
    hostBits,
    totalAddresses: formatIPv6AddressCount(subnet.totalAddresses),
    usableAddresses: formatIPv6AddressCount(subnet.usableAddresses),
    addressType
  };
}