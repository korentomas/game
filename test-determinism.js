// Test that junk generation is deterministic
function seededRandom(seed) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13; h >>>= 0;
    h ^= h >> 17; h >>>= 0;
    h ^= h << 5;  h >>>= 0;
    return (h >>> 0) / 4294967296;
  };
}

// Test with same seed
const rng1 = seededRandom('junk_0_0');
const rng2 = seededRandom('junk_0_0');

console.log('Testing determinism with same seed:');
for (let i = 0; i < 5; i++) {
  const val1 = rng1();
  const val2 = rng2();
  console.log(`  RNG1: ${val1.toFixed(6)}, RNG2: ${val2.toFixed(6)}, Match: ${val1 === val2}`);
}

// Test different seeds produce different results
const rng3 = seededRandom('junk_0_1');
console.log('\nTesting different seed produces different values:');
const rng4 = seededRandom('junk_0_0');
for (let i = 0; i < 3; i++) {
  const val3 = rng3();
  const val4 = rng4();
  console.log(`  Seed1: ${val3.toFixed(6)}, Seed2: ${val4.toFixed(6)}, Different: ${val3 !== val4}`);
}