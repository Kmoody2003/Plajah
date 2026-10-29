//! Uniformly partitioned FFT convolution: GPU kernel host, CPU reference, and the processor
//! that picks between them per call.

use std::sync::Arc;
use std::time::{Duration, Instant};

use crate::fft::{C32, Fft, cmul};
use crate::gpu::{GpuContext, Readback};
use crate::health::{Health, HealthConfig, Path};

pub const SHADER: &str = include_str!("shaders/conv.wgsl");

/// The shader with its size constants prepended (the browser lab builds the same header).
pub fn shader_source(fft_n: usize) -> String {
    let wg = (fft_n / 2).min(256);
    format!(
        "const FFT_N: u32 = {fft_n}u;\nconst LOG2_N: u32 = {}u;\nconst WG: u32 = {wg}u;\nconst BINS: u32 = {}u;\n{SHADER}",
        fft_n.trailing_zeros(),
        fft_n / 2 + 1
    )
}

/// An IR per channel, cut into partitions of B and transformed (N = 2B) once.
pub struct ConvIr {
    pub part: usize,
    pub parts: usize,
    pub channels: usize,
    /// [ch][P][B + 1]
    pub spectra: Vec<C32>,
}

impl ConvIr {
    pub fn new(part: usize, irs: &[Vec<f32>]) -> Self {
        assert!(part.is_power_of_two() && (16..=1024).contains(&part), "partition must be 16..=1024, power of two");
        let fft = Fft::new(part * 2);
        let bins = part + 1;
        let parts = irs.iter().map(|h| h.len().div_ceil(part)).max().unwrap_or(1).max(1);
        let mut spectra = vec![[0.0; 2]; irs.len() * parts * bins];
        let mut window = vec![0.0; part * 2];
        let mut buf = vec![[0.0; 2]; part * 2];
        for (ch, h) in irs.iter().enumerate() {
            for p in 0..parts {
                window.fill(0.0);
                let seg = h.get(p * part..).unwrap_or(&[]);
                let len = seg.len().min(part);
                window[..len].copy_from_slice(&seg[..len]);
                let dst = (ch * parts + p) * bins;
                fft.forward_real(&window, &mut buf, &mut spectra[dst..dst + bins]);
            }
        }
        Self { part, parts, channels: irs.len(), spectra }
    }

    pub fn bins(&self) -> usize {
        self.part + 1
    }
}

/// Last P·B input samples per channel: enough to rebuild the P - 1 spectra of the frequency-
/// domain delay line, plus the B that precede the oldest window. Whichever side takes over after
/// a switch rebuilds its delay line from this.
pub struct History {
    pub len: usize,
    /// [ch][len], most recent sample last.
    pub data: Vec<f32>,
}

impl History {
    fn new(ir: &ConvIr) -> Self {
        let len = ir.parts * ir.part;
        Self { len, data: vec![0.0; len * ir.channels] }
    }

    fn push(&mut self, input: &[f32], samples: usize) {
        let len = self.len;
        for (ch, h) in self.data.chunks_mut(len).enumerate() {
            let x = &input[ch * samples..][..samples];
            if samples >= len {
                h.copy_from_slice(&x[samples - len..]);
            } else {
                h.copy_within(samples.., 0);
                h[len - samples..].copy_from_slice(x);
            }
        }
    }

    fn channel(&self, ch: usize) -> &[f32] {
        &self.data[ch * self.len..][..self.len]
    }
}

/// CPU reference: block-by-block UPOLS with the same FFT, the same partition-order accumulation
/// and the same inverse as the shader.
pub struct ConvCpu {
    pub ir: Arc<ConvIr>,
    fft: Fft,
    /// [ch][P][bins] ring of input spectra; slot `head` holds the newest.
    fdl: Vec<C32>,
    head: usize,
    /// [ch][B]: the B samples before the next block.
    prev: Vec<f32>,
    buf: Vec<C32>,
    window: Vec<f32>,
    acc: Vec<C32>,
}

impl ConvCpu {
    pub fn new(ir: Arc<ConvIr>) -> Self {
        let (b, bins) = (ir.part, ir.bins());
        Self {
            fft: Fft::new(2 * b),
            fdl: vec![[0.0; 2]; ir.channels * ir.parts * bins],
            head: 0,
            prev: vec![0.0; ir.channels * b],
            buf: vec![[0.0; 2]; 2 * b],
            window: vec![0.0; 2 * b],
            acc: vec![[0.0; 2]; bins],
            ir,
        }
    }

    /// Rebuild the delay line from time-domain history (after the GPU had the stream).
    pub fn prime(&mut self, hist: &History) {
        let (b, parts, bins) = (self.ir.part, self.ir.parts, self.ir.bins());
        self.fdl.fill([0.0; 2]);
        self.head = parts - 1;
        for ch in 0..self.ir.channels {
            let h = hist.channel(ch);
            // Segment s (0-based, oldest first) ends at (s + 2)·B; the newest is P - 2.
            for s in 0..parts - 1 {
                let slot = (self.head + parts - (parts - 2 - s)) % parts;
                let dst = (ch * parts + slot) * bins;
                self.fft.forward_real(&h[s * b..s * b + 2 * b], &mut self.buf, &mut self.fdl[dst..dst + bins]);
            }
            self.prev[ch * b..][..b].copy_from_slice(&h[hist.len - b..]);
        }
    }

    /// `input` and `out` are [ch][blocks·B].
    pub fn process(&mut self, input: &[f32], blocks: usize, out: &mut [f32]) {
        let (b, parts, bins) = (self.ir.part, self.ir.parts, self.ir.bins());
        let total = blocks * b;
        for m in 0..blocks {
            self.head = (self.head + 1) % parts;
            for ch in 0..self.ir.channels {
                let x = &input[ch * total + m * b..][..b];
                let prev = &mut self.prev[ch * b..][..b];
                self.window[..b].copy_from_slice(prev);
                self.window[b..].copy_from_slice(x);
                prev.copy_from_slice(x);
                let dst = (ch * parts + self.head) * bins;
                self.fft.forward_real(&self.window, &mut self.buf, &mut self.fdl[dst..dst + bins]);

                self.acc.fill([0.0; 2]);
                for p in 0..parts {
                    let slot = (self.head + parts - p) % parts;
                    let xs = &self.fdl[(ch * parts + slot) * bins..][..bins];
                    let hs = &self.ir.spectra[(ch * parts + p) * bins..][..bins];
                    for k in 0..bins {
                        let v = cmul(xs[k], hs[k]);
                        self.acc[k][0] += v[0];
                        self.acc[k][1] += v[1];
                    }
                }
                self.fft.inverse_real_tail(&self.acc, &mut self.buf, &mut out[ch * total + m * b..][..b]);
            }
        }
    }
}

/// GPU host for shaders/conv.wgsl. The input-spectrum ring lives on the GPU; after the CPU has
/// had the stream it is rebuilt by transforming the history along with the new blocks.
pub struct ConvGpu {
    ctx: Arc<GpuContext>,
    ir: Arc<ConvIr>,
    max_blocks: usize,
    ring: usize,
    next_slot: usize,
    params: wgpu::Buffer,
    input: wgpu::Buffer,
    out: wgpu::Buffer,
    pipes: [wgpu::ComputePipeline; 3],
    binds: [wgpu::BindGroup; 3],
    readback: Readback,
    last_bytes: u64,
    staging: Vec<f32>,
}

impl ConvGpu {
    pub fn new(ctx: Arc<GpuContext>, ir: Arc<ConvIr>, max_blocks: usize) -> Self {
        let (b, parts, bins, chs) = (ir.part as u64, ir.parts as u64, ir.bins() as u64, ir.channels as u64);
        let ring = ir.parts - 1 + max_blocks;
        let none = wgpu::BufferUsages::empty();
        let params = ctx.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("conv params"),
            size: 32,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let fft = Fft::new(ir.part * 2);
        let tw = ctx.storage("conv twiddles", fft.twiddles.len() as u64 * 8, none);
        let max_segs = parts - 1 + max_blocks as u64;
        let input = ctx.storage("conv input", chs * (max_segs + 1) * b * 4, none);
        let spectra = ctx.storage("conv spectra", chs * ring as u64 * bins * 8, none);
        let irbuf = ctx.storage("conv ir", chs * parts * bins * 8, none);
        let yspec = ctx.storage("conv yspec", chs * max_blocks as u64 * bins * 8, none);
        let out = ctx.storage("conv out", chs * max_blocks as u64 * b * 4, wgpu::BufferUsages::COPY_SRC);
        ctx.queue.write_buffer(&tw, 0, bytemuck::cast_slice(&fft.twiddles));
        ctx.queue.write_buffer(&irbuf, 0, bytemuck::cast_slice(&ir.spectra));

        let module = ctx.device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("conv.wgsl"),
            source: wgpu::ShaderSource::Wgsl(shader_source(ir.part * 2).into()),
        });
        let pipes = [ctx.pipeline(&module, "fwd"), ctx.pipeline(&module, "mac"), ctx.pipeline(&module, "inv")];
        let all = [(0, &params), (1, &tw), (2, &input), (3, &spectra), (4, &irbuf), (5, &yspec), (6, &out)];
        let binds = [
            ctx.bind(&pipes[0], &all, &[0, 1, 2, 3]),
            ctx.bind(&pipes[1], &all, &[0, 3, 4, 5]),
            ctx.bind(&pipes[2], &all, &[0, 1, 5, 6]),
        ];
        let readback = Readback::new(&ctx, chs * max_blocks as u64 * b * 4);
        Self {
            ctx,
            ir,
            max_blocks,
            ring,
            next_slot: 0,
            params,
            input,
            out,
            pipes,
            binds,
            readback,
            last_bytes: 0,
            staging: Vec::new(),
        }
    }

    /// Queue `blocks` blocks. With `rebuild`, the ring is invalid and `hist` (the P·B samples
    /// before this call) is transformed too; otherwise only its last B samples are needed.
    pub fn submit(&mut self, input: &[f32], blocks: usize, hist: &History, rebuild: bool) {
        assert!(blocks >= 1 && blocks <= self.max_blocks);
        self.readback.settle(&self.ctx);
        let (b, parts, chs) = (self.ir.part, self.ir.parts, self.ir.channels);
        let total = blocks * b;
        let lead = if rebuild { hist.len } else { b };
        let segs = blocks + if rebuild { parts - 1 } else { 0 };
        let seg_slot0 = (self.next_slot + self.ring - (segs - blocks)) % self.ring;
        self.staging.clear();
        for ch in 0..chs {
            let h = hist.channel(ch);
            self.staging.extend_from_slice(&h[h.len() - lead..]);
            self.staging.extend_from_slice(&input[ch * total..][..total]);
        }
        let q = &self.ctx.queue;
        let p = [b, parts, self.ring, segs, seg_slot0, blocks, self.next_slot, chs].map(|v| v as u32);
        q.write_buffer(&self.params, 0, bytemuck::cast_slice(&p));
        q.write_buffer(&self.input, 0, bytemuck::cast_slice(&self.staging));
        let mut enc = self.ctx.device.create_command_encoder(&Default::default());
        {
            let mut pass = enc.begin_compute_pass(&Default::default());
            pass.set_pipeline(&self.pipes[0]);
            pass.set_bind_group(0, &self.binds[0], &[]);
            pass.dispatch_workgroups(segs as u32, chs as u32, 1);
            pass.set_pipeline(&self.pipes[1]);
            pass.set_bind_group(0, &self.binds[1], &[]);
            pass.dispatch_workgroups(self.ir.bins().div_ceil(64) as u32, blocks as u32, chs as u32);
            pass.set_pipeline(&self.pipes[2]);
            pass.set_bind_group(0, &self.binds[2], &[]);
            pass.dispatch_workgroups(blocks as u32, chs as u32, 1);
        }
        self.last_bytes = (chs * total * 4) as u64;
        enc.copy_buffer_to_buffer(&self.out, 0, &self.readback.buf, 0, self.last_bytes);
        q.submit(Some(enc.finish()));
        self.next_slot = (self.next_slot + blocks) % self.ring;
        self.readback.request(self.last_bytes);
    }

    pub fn wait(&mut self, deadline: Instant) -> bool {
        self.readback.wait(&self.ctx, deadline)
    }

    pub fn take(&mut self, out: &mut [f32]) {
        let bytes = self.last_bytes;
        self.readback.take(bytes, |v| out[..v.len()].copy_from_slice(v));
    }
}

/// The processor Chora would hold for a convolution reverb / cab IR on a render-ahead track.
pub struct Convolver {
    pub sample_rate: f32,
    pub cpu: ConvCpu,
    pub gpu: Option<ConvGpu>,
    pub health: Health,
    hist: History,
    cpu_valid: bool,
    gpu_valid: bool,
}

impl Convolver {
    pub fn new(sample_rate: f32, ir: ConvIr, max_blocks: usize, gpu: Option<Arc<GpuContext>>) -> Self {
        let ir = Arc::new(ir);
        Self {
            sample_rate,
            hist: History::new(&ir),
            cpu: ConvCpu::new(ir.clone()),
            gpu: gpu.map(|ctx| ConvGpu::new(ctx, ir, max_blocks)),
            health: Health::new(HealthConfig::default()),
            cpu_valid: true,
            gpu_valid: false,
        }
    }

    pub fn partition(&self) -> usize {
        self.cpu.ir.part
    }

    /// Process `blocks` partitions of every channel. `input`/`out` are [ch][blocks·B].
    pub fn process(&mut self, input: &[f32], blocks: usize, out: &mut [f32], deadline: Option<Instant>) -> Path {
        let samples = blocks * self.partition();
        let block = Duration::from_secs_f64(samples as f64 / self.sample_rate as f64);
        let mut path = Path::Cpu;
        if let (Some(gpu), Path::Gpu) = (self.gpu.as_mut(), self.health.choose()) {
            let t0 = Instant::now();
            let deadline = deadline.unwrap_or(t0 + self.health.deadline(block));
            gpu.submit(input, blocks, &self.hist, !self.gpu_valid);
            if gpu.wait(deadline) {
                gpu.take(out);
                self.health.record_gpu(t0.elapsed(), block);
                self.gpu_valid = true;
                self.cpu_valid = false;
                path = Path::Gpu;
            } else {
                // The late job still advanced the GPU ring; rebuild it next time.
                self.health.record_miss();
                self.gpu_valid = false;
            }
        }
        if path == Path::Cpu {
            if !self.cpu_valid {
                self.cpu.prime(&self.hist);
                self.cpu_valid = true;
            }
            self.cpu.process(input, blocks, out);
            self.gpu_valid = false;
            self.health.record_cpu();
        }
        self.hist.push(input, samples);
        path
    }
}
