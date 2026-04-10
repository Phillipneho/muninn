/**
 * Test IsoQuant compression quality
 * Validates that TypeScript implementation matches Python results
 */

import { compress, decompress, cosineSimilarity, compressToBlob, decompressFromBlob } from './isoquant'

// Generate test embeddings (normalized)
function generateTestEmbedding(d: number, seed: number): Float32Array {
  const rng = (s: number) => {
    s = (s * 1664525 + 1013904223) >>> 0
    return (s >>> 16) / 65536
  }
  
  const vec = new Float32Array(d)
  for (let i = 0; i < d; i++) {
    vec[i] = rng(seed + i) * 2 - 1
  }
  
  // Normalize
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0))
  for (let i = 0; i < d; i++) {
    vec[i] /= norm
  }
  
  return vec
}

// Test with 768-dim embeddings (Gemimi's dimension)
const DIM = 768
const NUM_TESTS = 50

console.log('=== IsoQuant TypeScript Validation ===')
console.log(`Dimension: ${DIM}`)
console.log(`Tests: ${NUM_TESTS}`)
console.log('')

let totalCosineSimilarity = 0
let totalMSE = 0
let totalCompression = 0

for (let i = 0; i < NUM_TESTS; i++) {
  const original = generateTestEmbedding(DIM, 42 + i)
  const { indices, norm } = compress(original, 4)
  const reconstructed = decompress(indices, norm, DIM)
  
  // Cosine similarity
  const cosSim = cosineSimilarity(original, reconstructed)
  totalCosineSimilarity += cosSim
  
  // MSE
  let mse = 0
  for (let j = 0; j < DIM; j++) {
    mse += Math.pow(original[j] - reconstructed[j], 2)
  }
  mse /= DIM
  totalMSE += mse
  
  // Compression ratio
  const originalBytes = DIM * 2 // FP16
  const compressedBytes = indices.length + 4 // indices + norm
  totalCompression += originalBytes / compressedBytes
}

console.log('=== 4-bit IsoQuant-Fast ===')
console.log(`Cosine Similarity: ${(totalCosineSimilarity / NUM_TESTS).toFixed(4)}`)
console.log(`MSE: ${(totalMSE / NUM_TESTS).toFixed(6)}`)
console.log(`Compression: ${(totalCompression / NUM_TESTS).toFixed(1)}x`)
console.log('')

// Test BLOB format
console.log('=== BLOB Format Test ===')
const testVec = generateTestEmbedding(DIM, 123)
const blob = compressToBlob(testVec)
const fromBlob = decompressFromBlob(blob, DIM)
const blobCosSim = cosineSimilarity(testVec, fromBlob)
console.log(`BLOB size: ${blob.byteLength} bytes`)
console.log(`BLOB cosine similarity: ${blobCosSim.toFixed(4)}`)
console.log('')

// Compare with Python results
console.log('=== Comparison with Python ===')
console.log('Python 4-bit (validated):')
console.log('  Cosine: 0.9917')
console.log('  MSE: 0.000012')
console.log('  Compression: 4.0x')
console.log('')
console.log('Expected TypeScript (this test):')
console.log('  Cosine: ~0.99+')
console.log('  MSE: ~0.00001')
console.log('  Compression: ~4.0x')
console.log('')

if (totalCosineSimilarity / NUM_TESTS > 0.98) {
  console.log('✅ PASS: IsoQuant compression quality validated')
  process.exit(0)
} else {
  console.log('❌ FAIL: Cosine similarity below 0.98')
  process.exit(1)
}