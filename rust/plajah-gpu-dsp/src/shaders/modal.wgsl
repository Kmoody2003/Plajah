// Modal resonator bank — thousands of independent damped two-pole modes, stepped per sample,
// batched over a whole render-ahead block.
//
// Each mode is a complex one-pole z' = r·e^{iω}·z + g·x (a damped two-pole resonator in
// coupled form, stable in f32 even at low ω); its output is Im(z). Modes never talk to each
// other, so a thread owns one mode for the whole block and only meets its workgroup once per
// 64-sample tile to sum — two barriers per 64 samples, never one per sample.
//
// Shared verbatim by the native host (wgpu) and the browser lab (WebGPU).
// CPU mirror: rust/plajah-gpu-dsp/src/modal.rs (same operation order).

struct ModalParams {
    block_len: u32,   // samples this call, multiple of TILE
    num_groups: u32,  // 64-mode groups
    num_banks: u32,   // voices / excitation channels
    _pad: u32,
}

@group(0) @binding(0) var<uniform> P: ModalParams;
@group(0) @binding(1) var<storage, read> coef: array<vec4<f32>>;        // per mode: (r·cos ω, r·sin ω, gain, 0)
@group(0) @binding(2) var<storage, read_write> state: array<vec2<f32>>; // per mode: (re, im)
@group(0) @binding(3) var<storage, read> group_bank: array<u32>;        // per group: its bank
@group(0) @binding(4) var<storage, read> excite: array<f32>;            // [bank][block_len]
@group(0) @binding(5) var<storage, read_write> partial: array<f32>;     // [group][block_len]
@group(0) @binding(6) var<storage, read> bank_groups: array<vec2<u32>>; // per bank: (first group, count)
@group(0) @binding(7) var<storage, read_write> out_buf: array<f32>;     // [bank][block_len]

const TILE: u32 = 64u;
// 64 samples × 64 modes. Column = mode XOR sample, so both the write (fixed sample, threads
// across modes) and the read (fixed mode, threads across samples) hit distinct banks.
var<workgroup> tile: array<f32, 4096>;

@compute @workgroup_size(64)
fn modes(@builtin(workgroup_id) wg: vec3<u32>, @builtin(local_invocation_index) t: u32) {
    let g = wg.x;
    let m = g * TILE + t;
    let k = coef[m];
    var re = state[m].x;
    var im = state[m].y;
    let xbase = group_bank[g] * P.block_len;
    let pbase = g * P.block_len;
    let chunks = P.block_len / TILE;
    for (var c = 0u; c < chunks; c++) {
        let n0 = c * TILE;
        for (var i = 0u; i < TILE; i++) {
            let x = excite[xbase + n0 + i];
            let nre = (k.x * re - k.y * im) + k.z * x;
            im = k.y * re + k.x * im;
            re = nre;
            tile[i * TILE + (t ^ i)] = im;
        }
        workgroupBarrier();
        // Thread t now sums sample t across the group's 64 modes in 8 lanes (lane l takes modes
        // l, l+8, …) then a fixed tree — the order the CPU reference vectorizes with.
        let row = t * TILE;
        var lo = vec4<f32>(0.0);
        var hi = vec4<f32>(0.0);
        for (var j = 0u; j < TILE; j += 8u) {
            lo += vec4<f32>(tile[row + (j ^ t)], tile[row + ((j + 1u) ^ t)],
                            tile[row + ((j + 2u) ^ t)], tile[row + ((j + 3u) ^ t)]);
            hi += vec4<f32>(tile[row + ((j + 4u) ^ t)], tile[row + ((j + 5u) ^ t)],
                            tile[row + ((j + 6u) ^ t)], tile[row + ((j + 7u) ^ t)]);
        }
        partial[pbase + n0 + t] = ((lo.x + lo.y) + (lo.z + lo.w)) + ((hi.x + hi.y) + (hi.z + hi.w));
        workgroupBarrier();
    }
    state[m] = vec2<f32>(re, im);
}

// One thread per (sample, bank): add the bank's group partials in group order.
@compute @workgroup_size(256)
fn reduce(@builtin(global_invocation_id) gid: vec3<u32>) {
    let n = gid.x;
    let b = gid.y;
    if (n >= P.block_len || b >= P.num_banks) {
        return;
    }
    let r = bank_groups[b];
    var s = 0.0;
    for (var g = r.x; g < r.x + r.y; g++) {
        s += partial[g * P.block_len + n];
    }
    out_buf[b * P.block_len + n] = s;
}
