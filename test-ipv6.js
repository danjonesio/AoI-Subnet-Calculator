// Simple test script for IPv6 utilities
const {
  validateIPv6,
  expandIPv6,
  compressIPv6,
  ipv6ToBinary,
  binaryToIPv6,
  ipv6ToBigInt,
  bigIntToIPv6
} = require('./src/lib/utils.ts');

console.log('Testing IPv6 utilities...');

// Test validateIPv6
console.log('\n=== validateIPv6 tests ===');
const validAddresses = [
  '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
  '2001:db8:85a3::8a2e:370:7334',
  '::1',
  '::',
  'fe80::1'
];

const invalidAddresses = [
  'invalid',
  '2001:db8::8a2e::7334',
  '2001:db8:85a3:gggg:0000:8a2e:0370:7334'
];

validAddresses.forEach(addr => {
  console.log(`${addr}: ${validateIPv6(addr) ? 'VALID' : 'INVALID'}`);
});

invalidAddresses.forEach(addr => {
  console.log(`${addr}: ${validateIPv6(addr) ? 'VALID' : 'INVALID'}`);
});

// Test expansion and compression
console.log('\n=== expandIPv6 and compressIPv6 tests ===');
const testAddresses = ['2001:db8::1', '::1', 'fe80::1'];

testAddresses.forEach(addr => {
  try {
    const expanded = expandIPv6(addr);
    const compressed = compressIPv6(expanded);
    console.log(`${addr} -> ${expanded} -> ${compressed}`);
  } catch (e) {
    console.log(`Error with ${addr}: ${e.message}`);
  }
});

console.log('\nIPv6 utilities test completed!');