/**
 * Simple test for IsoQuant compression
 * WITH rotation (critical for quality)
 */

// Pre-computed Lloyd-Max centroids for 4-bit (d=768, normalized vectors)
// For normalized vectors, each component has std ≈ 1/sqrt(d)
// d=768 → std ≈ 0.036
// These centroids are for Lloyd-Max with d_eff = d (from Python LloydMaxCodebook)
const LLOYD_MAX_4BIT = new Float32Array([
  -0.0986, -0.0747, -0.0584, -0.0453, -0.0340, -0.0237, -0.0140, -0.0046,
  0.0046, 0.0140, 0.0237, 0.0340, 0.0453, 0.0584, 0.0747, 0.0986
]);

// Generate random quaternions
function generateRandomQuaternions(nGroups, seed) {
  let s = seed;
  const random = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s >>> 16) / 65536;
  };

  const quaternions = new Float32Array(nGroups * 4);
  for (let i = 0; i < nGroups; i++) {
    let w = random() * 2 - 1;
    let x = random() * 2 - 1;
    let y = random() * 2 - 1;
    let z = random() * 2 - 1;
    const norm = Math.sqrt(w*w + x*x + y*y + z*z) || 1;
    quaternions[i * 4] = w / norm;
    quaternions[i * 4 + 1] = x / norm;
    quaternions[i * 4 + 2] = y / norm;
    quaternions[i * 4 + 3] = z / norm;
  }
  return quaternions;
}

// Pre-computed for d=768 (192 groups of 4)
const Q_L_768 = generateRandomQuaternions(192, 42);

// Quaternion multiply (Hamilton product)
function quatMultiply(a, b) {
  const [aw, ax, ay, az] = a;
  const [bw, bx, by, bz] = b;
  return new Float32Array([
    aw*bw - ax*bx - ay*by - az*bz,
    aw*bx + ax*bw + ay*bz - az*by,
    aw*by - ax*bz + ay*bw + az*bx,
    aw*bz + ax*by - ay*bx + az*bw
  ]);
}

// Rotate 4D block with quaternion (IsoQuant-Fast: q * v)
// The 4D vector IS the quaternion [w, x, y, z]
function rotateBlock(v, q) {
  // v is already a quaternion [w, x, y, z]
  const result = quatMultiply(q, v);
  return result; // Returns [w, x, y, z]
}

function quantizeScalar(value) {
  let minDist = Infinity;
  let bestIdx = 0;
  for (let i = 0; i < 16; i++) {
    const dist = Math.abs(value - LLOYD_MAX_4BIT[i]);
    if (dist < minDist) {
      minDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function compress(embedding) {
  const d = embedding.length;
  const nGroups = d / 4;
  
  // Compute norm
  let norm = 0;
  for (let i = 0; i < d; i++) norm += embedding[i] * embedding[i];
  norm = Math.sqrt(norm);
  
  // Handle zero vectors
  if (norm < 1e-8) norm = 1;
  
  // Normalize
  const normalized = new Float32Array(d);
  for (let i = 0; i < d; i++) normalized[i] = embedding[i] / norm;
  
  // Get pre-computed quaternions
  const qL = d === 768 ? Q_L_768 : generateRandomQuaternions(nGroups, 42);
  
  // Rotate and quantize each 4D block
  const indices = new Uint8Array(Math.ceil(d / 2));
  
  for (let g = 0; g < nGroups; g++) {
    // Extract 4D block
    const block = new Float32Array([
      normalized[g * 4],
      normalized[g * 4 + 1],
      normalized[g * 4 + 2],
      normalized[g * 4 + 3]
    ]);
    
    // Get quaternion for this group
    const q = new Float32Array([
      qL[g * 4],
      qL[g * 4 + 1],
      qL[g * 4 + 2],
      qL[g * 4 + 3]
    ]);
    
    // Rotate
    const rotated = rotateBlock(block, q);
    
    // Quantize each component
    const idx0 = quantizeScalar(rotated[0]);
    const idx1 = quantizeScalar(rotated[1]);
    const idx2 = quantizeScalar(rotated[2]);
    const idx3 = quantizeScalar(rotated[3]);
    
    // Pack into bytes (2 indices per byte)
    indices[g * 2] = (idx0 << 4) | idx1;
    indices[g * 2 + 1] = (idx2 << 4) | idx3;
  }
  
  return { indices, norm };
}

function decompress(indices, norm, d) {
  const nGroups = d / 4;
  
  // Get pre-computed quaternions
  const qL = d === 768 ? Q_L_768 : generateRandomQuaternions(nGroups, 42);
  
  const reconstructed = new Float32Array(d);
  
  for (let g = 0; g < nGroups; g++) {
    // Unpack indices
    const idx0 = (indices[g * 2] >> 4) & 0x0F;
    const idx1 = indices[g * 2] & 0x0F;
    const idx2 = (indices[g * 2 + 1] >> 4) & 0x0F;
    const idx3 = indices[g * 2 + 1] & 0x0F;
    
    // Dequantize
    const dequantized = new Float32Array([
      LLOYD_MAX_4BIT[idx0],
      LLOYD_MAX_4BIT[idx1],
      LLOYD_MAX_4BIT[idx2],
      LLOYD_MAX_4BIT[idx3]
    ]);
    
    // Get quaternion and compute inverse (conjugate)
    const q = new Float32Array([
      qL[g * 4],
      qL[g * 4 + 1],
      qL[g * 4 + 2],
      qL[g * 4 + 3]
    ]);
    const qInv = new Float32Array([q[0], -q[1], -q[2], -q[3]]);
    
    // Inverse rotate
    const unrotated = rotateBlock(dequantized, qInv);
    
    // Store
    for (let c = 0; c < 4; c++) {
      reconstructed[g * 4 + c] = unrotated[c];
    }
  }
  
  // Rescale by norm
  for (let i = 0; i < d; i++) {
    reconstructed[i] *= norm;
  }
  
  return reconstructed;
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Generate test embedding
function generateTestEmbedding(d, seed) {
  let s = seed;
  const random = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return (s >>> 16) / 65536;
  };
  
  const vec = new Float32Array(d);
  for (let i = 0; i < d; i++) {
    vec[i] = random() * 2 - 1;
  }
  
  // Normalize
  let norm = 0;
  for (let i = 0; i < d; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  for (let i = 0; i < d; i++) vec[i] /= norm;
  
  return vec;
}

// Run test
const DIM = 768;
const NUM_TESTS = 50;

console.log('=== IsoQuant TypeScript Validation (WITH Rotation) ===');
console.log(`Dimension: ${DIM}`);
console.log(`Tests: ${NUM_TESTS}`);
console.log('');

// Debug: test rotation
const dbgQuat = Q_L_768.slice(0, 4);
console.log('Sample quaternion:', dbgQuat);
const dbgVec = new Float32Array([0.5, 0.3, -0.2, 0.1]);
console.log('Sample vector:', dbgVec);
const dbgRotated = rotateBlock(dbgVec, dbgQuat);
console.log('Rotated:', dbgRotated);
console.log('');

// Debug first test
const dbg = generateTestEmbedding(DIM, 42);
console.log('Sample embedding (first 8 values):', dbg.slice(0, 8));
const dbgCompressed = compress(dbg);
console.log('Norm:', dbgCompressed.norm);
console.log('Indices (first 10):', Array.from(dbgCompressed.indices.slice(0, 10)));
console.log('Indices as 4-bit values:', Array.from(dbgCompressed.indices.slice(0, 10)).map(b => [(b >> 4) & 0xF, b & 0xF]).flat());

// Manual trace of first block
const dbgBlock = new Float32Array([dbg[0], dbg[1], dbg[2], dbg[3]]);
console.log('\nFirst block (normalized):', dbgBlock);
const dbgQ = new Float32Array([Q_L_768[0], Q_L_768[1], Q_L_768[2], Q_L_768[3]]);
console.log('Quaternion:', dbgQ);
const dbgRot = rotateBlock(dbgBlock, dbgQ);
console.log('Rotated:', dbgRot);

// Check Lloyd-Max quantization
for (let i = 0; i < 4; i++) {
  let minDist = Infinity, bestIdx = 0;
  for (let j = 0; j < 16; j++) {
    const dist = Math.abs(dbgRot[i] - LLOYD_MAX_4BIT[j]);
    if (dist < minDist) { minDist = dist; bestIdx = j; }
  }
  console.log(`Rotated[${i}]=${dbgRot[i].toFixed(3)} -> Lloyd-Max[${bestIdx}]=${LLOYD_MAX_4BIT[bestIdx]}`);
}

const dbgDecompressed = decompress(dbgCompressed.indices, dbgCompressed.norm, DIM);
console.log('\nDecompressed (first 8 values):', dbgDecompressed.slice(0, 8));

// Check cosine similarity for this one
let dbgCos = 0, dbgNormA = 0, dbgNormB = 0;
for (let i = 0; i < DIM; i++) {
  dbgCos += dbg[i] * dbgDecompressed[i];
  dbgNormA += dbg[i] * dbg[i];
  dbgNormB += dbgDecompressed[i] * dbgDecompressed[i];
}
console.log('Cosine similarity (first test):', (dbgCos / (Math.sqrt(dbgNormA) * Math.sqrt(dbgNormB))).toFixed(4));
console.log('');

let totalCosine = 0;
let totalMSE = 0;
let validTests = 0;

for (let i = 0; i < NUM_TESTS; i++) {
  const original = generateTestEmbedding(DIM, 42 + i);
  const { indices, norm } = compress(original);
  const reconstructed = decompress(indices, norm, DIM);
  
  // Check for valid values
  let hasInvalid = false;
  for (let j = 0; j < DIM; j++) {
    if (isNaN(original[j]) || isNaN(reconstructed[j])) {
      hasInvalid = true;
      break;
    }
  }
  if (hasInvalid) continue;
  
  const cosSim = cosineSimilarity(original, reconstructed);
  if (isNaN(cosSim)) continue;
  
  totalCosine += cosSim;
  
  let mse = 0;
  for (let j = 0; j < DIM; j++) {
    mse += Math.pow(original[j] - reconstructed[j], 2);
  }
  mse /= DIM;
  totalMSE += mse;
  validTests++;
}

console.log(`Valid tests: ${validTests}/${NUM_TESTS}`);
if (validTests > 0) {
  console.log(`Cosine Similarity: ${(totalCosine / validTests).toFixed(4)}`);
  console.log(`MSE: ${(totalMSE / validTests).toFixed(6)}`);
}
console.log(`Compression: 4.0x`);
console.log('');

// Storage comparison
console.log('=== Storage Comparison ===');
console.log(`Original (FP16): ${DIM * 2} bytes per embedding`);
console.log(`Compressed (4-bit): ${Math.ceil(DIM / 2) + 4} bytes per embedding`);
console.log(`Savings: ${((DIM * 2) / (Math.ceil(DIM / 2) + 4)).toFixed(1)}x`);
console.log('');

if (totalCosine / NUM_TESTS > 0.95) {
  console.log('✅ PASS: Compression quality validated');
} else {
  console.log('❌ FAIL: Quality below threshold');
}