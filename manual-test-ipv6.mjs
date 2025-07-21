// Manual test for IPv6 utilities
import {
  validateIPv6,
  expandIPv6,
  compressIPv6,
  ipv6ToBinary,
  binaryToIPv6,
  ipv6ToBigInt,
  bigIntToIPv6
} from './out/_next/static/chunks/app/page-*.js';

console.log('Testing IPv6 utilities...');

// Test basic validation
console.log('\n=== IPv6 Validation Tests ===');
const testAddresses = [
  '2001:0db8:85a3:0000:0000:8a2e:0370:7334', // Full format
  '2001:db8:85a3::8a2e:370:7334',           // Compressed
  '::1',                                     // Loopback
  '::',                                      // All zeros
  'fe80::1',                                 // Link-local
  'invalid',                                 // Invalid
  '2001:db8::8a2e::7334'                    // Double compression (invalid)
];

testAddresses.forEach(addr => {
  try {
    const isValid = validateIPv6(addr);
    console.log(`${addr.padEnd(40)} -> ${isValid ? 'VALID' : 'INVALID'}`);
  } catch (e) {
    console.log(`${addr.padEnd(40)} -> ERROR: ${e.message}`);
  }
});

// Test expansion and compression
console.log('\n=== Expansion and Compression Tests ===');
const validAddresses = [
  '2001:db8::1',
  '::1',
  'fe80::1',
  '2001:0db8:85a3:0000:0000:8a2e:0370:7334'
];

validAddresses.forEach(addr => {
  try {
    const expanded = expandIPv6(addr);
    const compressed = compressIPv6(expanded);
    console.log(`Original:   ${addr}`);
    console.log(`Expanded:   ${expanded}`);
    console.log(`Compressed: ${compressed}`);
    console.log('---');
  } catch (e) {
    console.log(`Error with ${addr}: ${e.message}`);
  }
});

console.log('IPv6 utilities manual test completed!');