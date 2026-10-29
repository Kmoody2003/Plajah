// Uniformly partitioned FFT convolution (overlap-save, frequency-domain delay line).
//
// Partition size B, FFT size N = 2B. The IR is cut into P partitions, each zero-padded to N
// and transformed once on the host (H_p). Per input block m the host's window is the previous
// B samples + the B new ones; its spectrum X_m goes into a ring of input spectra and
//     Y_m = Σ_p X_{m-p} · H_p,     y_m = last B samples of IFFT(Y_m).
// A render-ahead call transforms all its new blocks at once (fwd), multiplies every
// (bin, block, channel) in parallel (mac) and inverts every block at once (inv).
//
// The host prepends:  const FFT_N: u32; const LOG2_N: u32; const WG: u32; const BINS: u32;
// (WG = min(256, FFT_N / 2), BINS = FFT_N / 2 + 1). Shared verbatim by the native host and
// the browser lab. CPU mirror: rust/plajah-gpu-dsp/src/fft.rs + conv.rs (same operation order).

struct ConvParams {
    part: u32,       // B
    parts: u32,      // P
    ring: u32,       // ring slots per channel (≥ P - 1 + blocks)
    segs: u32,       // segments transformed this call
    seg_slot0: u32,  // ring slot of the first transformed segment
    blocks: u32,     // output blocks this call
    out_slot0: u32,  // ring slot holding the first output block's own spectrum
    channels: u32,
}

@group(0) @binding(0) var<uniform> C: ConvParams;
@group(0) @binding(1) var<storage, read> tw: array<vec2<f32>>;               // e^{-2πij/N}, j < N/2
@group(0) @binding(2) var<storage, read> input: array<f32>;                  // [ch][(segs + 1)·B]
@group(0) @binding(3) var<storage, read_write> spectra: array<vec2<f32>>;    // [ch][ring][BINS]
@group(0) @binding(4) var<storage, read> ir: array<vec2<f32>>;               // [ch][P][BINS]
@group(0) @binding(5) var<storage, read_write> yspec: array<vec2<f32>>;      // [ch][blocks][BINS]
@group(0) @binding(6) var<storage, read_write> out_buf: array<f32>;          // [ch][blocks·B]

var<workgroup> buf: array<vec2<f32>, FFT_N>;

fn cmul(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
    return vec2<f32>(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

fn bitrev(i: u32) -> u32 {
    return reverseBits(i) >> (32u - LOG2_N);
}

// In-place radix-2 DIT on `buf`, which must already hold its input in bit-reversed order.
// Loop bounds are uniform so every barrier is reached by the whole workgroup.
fn fft_in_place(t: u32) {
    for (var s = 1u; s <= LOG2_N; s++) {
        let half = 1u << (s - 1u);
        let tw_stride = FFT_N >> s;
        for (var r = 0u; r < (FFT_N / 2u) / WG; r++) {
            let b = r * WG + t;
            let j = b & (half - 1u);
            let i0 = ((b >> (s - 1u)) << s) + j;
            let i1 = i0 + half;
            let v = cmul(buf[i1], tw[j * tw_stride]);
            let a = buf[i0];
            buf[i0] = a + v;
            buf[i1] = a - v;
        }
        workgroupBarrier();
    }
}

// Workgroup per (segment, channel): window [seg·B, seg·B + 2B) of the channel's input.
@compute @workgroup_size(WG)
fn fwd(@builtin(workgroup_id) wg: vec3<u32>, @builtin(local_invocation_index) t: u32) {
    let seg = wg.x;
    let ch = wg.y;
    let base = ch * (C.segs + 1u) * C.part + seg * C.part;
    for (var r = 0u; r < FFT_N / WG; r++) {
        let i = r * WG + t;
        buf[i] = vec2<f32>(input[base + bitrev(i)], 0.0);
    }
    workgroupBarrier();
    fft_in_place(t);
    let slot = (C.seg_slot0 + seg) % C.ring;
    let dst = (ch * C.ring + slot) * BINS;
    for (var r = 0u; r < FFT_N / WG; r++) {
        let i = r * WG + t;
        if (i < BINS) {
            spectra[dst + i] = buf[i];
        }
    }
}

// Thread per (bin, block, channel): Y = Σ_p X_{m-p} · H_p, accumulated in partition order.
@compute @workgroup_size(64)
fn mac(@builtin(global_invocation_id) gid: vec3<u32>) {
    let k = gid.x;
    let m = gid.y;
    let ch = gid.z;
    if (k >= BINS || m >= C.blocks) {
        return;
    }
    let slot0 = C.out_slot0 + m;
    let ring_base = ch * C.ring;
    let ir_base = ch * C.parts * BINS;
    var acc = vec2<f32>(0.0, 0.0);
    for (var p = 0u; p < C.parts; p++) {
        let slot = (slot0 + C.ring - p) % C.ring;
        acc += cmul(spectra[(ring_base + slot) * BINS + k], ir[ir_base + p * BINS + k]);
    }
    yspec[(ch * C.blocks + m) * BINS + k] = acc;
}

// Workgroup per (block, channel): rebuild the Hermitian spectrum, inverse via
// conj(FFT(conj(Y))) / N, keep the real part of the last B samples.
@compute @workgroup_size(WG)
fn inv(@builtin(workgroup_id) wg: vec3<u32>, @builtin(local_invocation_index) t: u32) {
    let m = wg.x;
    let ch = wg.y;
    let src = (ch * C.blocks + m) * BINS;
    for (var r = 0u; r < FFT_N / WG; r++) {
        let i = r * WG + t;
        let j = bitrev(i);
        var v: vec2<f32>;
        if (j < BINS) {
            v = yspec[src + j];
            v = vec2<f32>(v.x, -v.y);
        } else {
            v = yspec[src + FFT_N - j];
        }
        buf[i] = v;
    }
    workgroupBarrier();
    fft_in_place(t);
    let scale = 1.0 / f32(FFT_N);
    let dst = ch * C.blocks * C.part + m * C.part;
    for (var r = 0u; r < (FFT_N / 2u) / WG; r++) {
        let i = r * WG + t;
        out_buf[dst + i] = buf[C.part + i].x * scale;
    }
}
