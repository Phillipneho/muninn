//! IsoQuant WASM - Cloudflare Workers compatible
//! 
//! Build with: cargo build --target wasm32-unknown-unknown --release
//! No wasm-bindgen - pure WASM for Workers runtime

// Pre-computed Lloyd-Max centroids for 4-bit (d=768)
static LLOYD_MAX_4BIT_D768: [f32; 16] = [
    -0.0986, -0.0747, -0.0584, -0.0453, -0.0340, -0.0237, -0.0140, -0.0046,
    0.0046, 0.0140, 0.0237, 0.0340, 0.0453, 0.0584, 0.0747, 0.0986
];

// WASM exports for Cloudflare Workers
// These functions are callable from JS via WebAssembly.instantiate

/// Generate quaternions for rotation
fn generate_quaternions(n_groups: usize, seed: u32) -> Vec<f32> {
    let mut s = seed;
    let mut random = || -> f32 {
        s = s.wrapping_mul(1664525).wrapping_add(1013904223);
        ((s >> 16) as f32) / 65536.0
    };
    
    let mut quaternions = Vec::with_capacity(n_groups * 4);
    for _ in 0..n_groups {
        let w = random() * 2.0 - 1.0;
        let x = random() * 2.0 - 1.0;
        let y = random() * 2.0 - 1.0;
        let z = random() * 2.0 - 1.0;
        let norm = (w*w + x*x + y*y + z*z).sqrt().max(1e-10);
        quaternions.push(w / norm);
        quaternions.push(x / norm);
        quaternions.push(y / norm);
        quaternions.push(z / norm);
    }
    quaternions
}

/// Quaternion multiplication
fn quat_multiply(q: &[f32], v: &[f32]) -> [f32; 4] {
    let (qw, qx, qy, qz) = (q[0], q[1], q[2], q[3]);
    let (vw, vx, vy, vz) = (v[0], v[1], v[2], v[3]);
    
    [
        qw * vw - qx * vx - qy * vy - qz * vz,
        qw * vx + qx * vw + qy * vz - qz * vy,
        qw * vy - qx * vz + qy * vw + qz * vx,
        qw * vz + qx * vy - qy * vx + qz * vw,
    ]
}

/// Quantize a single scalar value
fn quantize_scalar(value: f32) -> u8 {
    let mut min_dist = f32::MAX;
    let mut best_idx = 0u8;
    for i in 0..16u8 {
        let dist = (value - LLOYD_MAX_4BIT_D768[i as usize]).abs();
        if dist < min_dist {
            min_dist = dist;
            best_idx = i;
        }
    }
    best_idx
}

/// Compress a 768-dimensional embedding to 388 bytes
/// 
/// # Arguments
/// * `embedding_ptr` - Pointer to f32 array in WASM memory
/// * `embedding_len` - Length of embedding (must be 768)
/// * `output_ptr` - Pointer to output buffer (must be 388 bytes)
#[no_mangle]
pub unsafe extern "C" fn compress_isoquant(
    embedding_ptr: *const f32,
    embedding_len: usize,
    output_ptr: *mut u8,
) -> usize {
    if embedding_len != 768 {
        return 0; // Error: wrong dimension
    }
    
    let embedding = std::slice::from_raw_parts(embedding_ptr, embedding_len);
    let output = std::slice::from_raw_parts_mut(output_ptr, 388);
    
    let n_groups = 192;
    let quaternions = generate_quaternions(n_groups, 42);
    
    // Compute norm
    let norm: f32 = embedding.iter().map(|x| x * x).sum::<f32>().sqrt();
    output[384..388].copy_from_slice(&norm.to_le_bytes());
    
    // Process each 4D block
    for g in 0..n_groups {
        let q = &quaternions[g * 4..g * 4 + 4];
        let block = &embedding[g * 4..g * 4 + 4];
        
        // Rotate block (treating as quaternion with w=0)
        let rotated = quat_multiply(q, block);
        
        // Quantize
        let idx0 = quantize_scalar(rotated[0]);
        let idx1 = quantize_scalar(rotated[1]);
        let idx2 = quantize_scalar(rotated[2]);
        let idx3 = quantize_scalar(rotated[3]);
        
        // Pack
        output[g * 2] = (idx0 << 4) | idx1;
        output[g * 2 + 1] = (idx2 << 4) | idx3;
    }
    
    388 // Return output size
}

/// Decompress IsoQuant compressed data back to embedding
#[no_mangle]
pub unsafe extern "C" fn decompress_isoquant(
    compressed_ptr: *const u8,
    compressed_len: usize,
    output_ptr: *mut f32,
) -> usize {
    if compressed_len != 388 {
        return 0; // Error: wrong size
    }
    
    let compressed = std::slice::from_raw_parts(compressed_ptr, compressed_len);
    let output = std::slice::from_raw_parts_mut(output_ptr, 768);
    
    let n_groups = 192;
    let norm = f32::from_le_bytes([
        compressed[384], compressed[385], compressed[386], compressed[387]
    ]);
    
    let quaternions = generate_quaternions(n_groups, 42);
    
    for g in 0..n_groups {
        let idx0 = (compressed[g * 2] >> 4) & 0x0F;
        let idx1 = compressed[g * 2] & 0x0F;
        let idx2 = (compressed[g * 2 + 1] >> 4) & 0x0F;
        let idx3 = compressed[g * 2 + 1] & 0x0F;
        
        // Dequantize
        let dequantized = [
            LLOYD_MAX_4BIT_D768[idx0 as usize],
            LLOYD_MAX_4BIT_D768[idx1 as usize],
            LLOYD_MAX_4BIT_D768[idx2 as usize],
            LLOYD_MAX_4BIT_D768[idx3 as usize],
        ];
        
        // Inverse rotate (conjugate)
        let q = &quaternions[g * 4..g * 4 + 4];
        let q_inv = [q[0], -q[1], -q[2], -q[3]];
        let unrotated = quat_multiply(&q_inv, &dequantized);
        
        // Store
        output[g * 4..g * 4 + 4].copy_from_slice(&unrotated);
    }
    
    // Scale by norm
    for i in 0..768 {
        output[i] *= norm;
    }
    
    768 // Return output size
}

/// Compute cosine similarity between two embeddings
#[no_mangle]
pub unsafe extern "C" fn cosine_similarity(
    a_ptr: *const f32,
    b_ptr: *const f32,
    len: usize,
) -> f32 {
    let a = std::slice::from_raw_parts(a_ptr, len);
    let b = std::slice::from_raw_parts(b_ptr, len);
    
    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum();
    let norm_b: f32 = b.iter().map(|x| x * x).sum();
    
    dot / (norm_a.sqrt() * norm_b.sqrt() + 1e-10)
}

/// Allocate memory for WASM
#[no_mangle]
pub extern "C" fn alloc(size: usize) -> *mut u8 {
    let mut buf = Vec::with_capacity(size);
    let ptr = buf.as_mut_ptr();
    std::mem::forget(buf);
    ptr
}

/// Free memory from WASM
#[no_mangle]
pub extern "C" fn dealloc(ptr: *mut u8, size: usize) {
    unsafe {
        let _ = Vec::from_raw_parts(ptr, size, size);
    }
}