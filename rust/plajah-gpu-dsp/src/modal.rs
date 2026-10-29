//! Modal resonator bank: GPU kernel host, CPU reference, and the processor that picks between
//! them per block.

use std::sync::Arc;
use std::time::{Duration, Instant};

use crate::gpu::{GpuContext, Readback};
use crate::health::{Health, HealthConfig, Path};

pub const GROUP: usize = 64;
pub const SHADER: &str = include_str!("shaders/modal.wgsl");

#[derive(Clone, Copy, Debug)]
pub struct Mode {
    pub freq_hz: f32,
    /// Time for the mode to fall 60 dB.
    pub t60_s: f32,
    pub gain: f32,
}

/// Banks (voices) of modes, each bank padded with silent modes to whole 64-mode groups so a
/// workgroup never mixes banks.
#[derive(Clone, Debug)]
pub struct ModalLayout {
    /// Per mode: (r·cos ω, r·sin ω, gain, 0).
    pub coef: Vec<[f32; 4]>,
    pub group_bank: Vec<u32>,
    /// Per bank: (first group, group count).
    pub bank_groups: Vec<[u32; 2]>,
}

impl ModalLayout {
    pub fn new(sample_rate: f32, banks: &[Vec<Mode>]) -> Self {
        let mut coef = Vec::new();
        let mut group_bank = Vec::new();
        let mut bank_groups = Vec::new();
        for (b, modes) in banks.iter().enumerate() {
            let groups = modes.len().div_ceil(GROUP).max(1);
            bank_groups.push([group_bank.len() as u32, groups as u32]);
            group_bank.extend(std::iter::repeat_n(b as u32, groups));
            coef.extend(modes.iter().map(|m| mode_coef(sample_rate, *m)));
            coef.resize(group_bank.len() * GROUP, [0.0; 4]);
        }
        Self { coef, group_bank, bank_groups }
    }

    pub fn num_modes(&self) -> usize {
        self.coef.len()
    }
    pub fn num_groups(&self) -> usize {
        self.group_bank.len()
    }
    pub fn num_banks(&self) -> usize {
        self.bank_groups.len()
    }
}

pub fn mode_coef(sample_rate: f32, m: Mode) -> [f32; 4] {
    let sr = sample_rate as f64;
    let w = 2.0 * std::f64::consts::PI * m.freq_hz as f64 / sr;
    let r = 10f64.powf(-3.0 / (m.t60_s.max(1e-4) as f64 * sr));
    [(r * w.cos()) as f32, (r * w.sin()) as f32, m.gain, 0.0]
}

/// CPU reference. Same per-mode recurrence and the same 8-lane + tree sum as the shader, so it
/// agrees with the GPU to rounding, and serves as the fallback.
pub struct ModalCpu {
    pub layout: Arc<ModalLayout>,
    /// Per mode: (re, im).
    pub state: Vec<[f32; 2]>,
}

impl ModalCpu {
    pub fn new(layout: Arc<ModalLayout>) -> Self {
        let state = vec![[0.0; 2]; layout.num_modes()];
        Self { layout, state }
    }

    /// `excite` and `out` are [bank][n].
    pub fn render(&mut self, excite: &[f32], n: usize, out: &mut [f32]) {
        let l = &*self.layout;
        out[..l.num_banks() * n].fill(0.0);
        for (g, &bank) in l.group_bank.iter().enumerate() {
            let m0 = g * GROUP;
            let (mut c, mut s, mut k) = ([0f32; GROUP], [0f32; GROUP], [0f32; GROUP]);
            let (mut re, mut im) = ([0f32; GROUP], [0f32; GROUP]);
            for t in 0..GROUP {
                [c[t], s[t], k[t], _] = l.coef[m0 + t];
                [re[t], im[t]] = self.state[m0 + t];
            }
            let x = &excite[bank as usize * n..][..n];
            let y = &mut out[bank as usize * n..][..n];
            for i in 0..n {
                let xi = x[i];
                for t in 0..GROUP {
                    let nre = (c[t] * re[t] - s[t] * im[t]) + k[t] * xi;
                    im[t] = s[t] * re[t] + c[t] * im[t];
                    re[t] = nre;
                }
                let mut lane = [0f32; 8];
                for j in (0..GROUP).step_by(8) {
                    for q in 0..8 {
                        lane[q] += im[j + q];
                    }
                }
                let sum = ((lane[0] + lane[1]) + (lane[2] + lane[3])) + ((lane[4] + lane[5]) + (lane[6] + lane[7]));
                y[i] += sum;
            }
            for t in 0..GROUP {
                self.state[m0 + t] = [re[t], im[t]];
            }
        }
    }
}

/// GPU host for shaders/modal.wgsl. State lives on the GPU between blocks; each block's state
/// is read back with its output so the CPU can take over at any block boundary.
pub struct ModalGpu {
    ctx: Arc<GpuContext>,
    layout: Arc<ModalLayout>,
    max_block: usize,
    params: wgpu::Buffer,
    state: wgpu::Buffer,
    excite: wgpu::Buffer,
    out: wgpu::Buffer,
    modes_pipe: wgpu::ComputePipeline,
    reduce_pipe: wgpu::ComputePipeline,
    modes_bind: wgpu::BindGroup,
    reduce_bind: wgpu::BindGroup,
    readback: Readback,
    last_n: usize,
}

impl ModalGpu {
    pub fn new(ctx: Arc<GpuContext>, layout: Arc<ModalLayout>, max_block: usize) -> Self {
        assert!(max_block % GROUP == 0, "block length must be a multiple of {GROUP}");
        let use_ = wgpu::BufferUsages::empty();
        let src = wgpu::BufferUsages::COPY_SRC;
        let (modes, groups, banks) = (layout.num_modes() as u64, layout.num_groups() as u64, layout.num_banks() as u64);
        let n = max_block as u64;
        let params = ctx.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("modal params"),
            size: 16,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let coef = ctx.storage("modal coef", modes * 16, use_);
        let state = ctx.storage("modal state", modes * 8, src);
        let group_bank = ctx.storage("modal group_bank", groups * 4, use_);
        let excite = ctx.storage("modal excite", banks * n * 4, use_);
        let partial = ctx.storage("modal partial", groups * n * 4, use_);
        let bank_groups = ctx.storage("modal bank_groups", banks * 8, use_);
        let out = ctx.storage("modal out", banks * n * 4, src);
        ctx.queue.write_buffer(&coef, 0, bytemuck::cast_slice(&layout.coef));
        ctx.queue.write_buffer(&group_bank, 0, bytemuck::cast_slice(&layout.group_bank));
        ctx.queue.write_buffer(&bank_groups, 0, bytemuck::cast_slice(&layout.bank_groups));

        let module = ctx.device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("modal.wgsl"),
            source: wgpu::ShaderSource::Wgsl(SHADER.into()),
        });
        let modes_pipe = ctx.pipeline(&module, "modes");
        let reduce_pipe = ctx.pipeline(&module, "reduce");
        let all = [
            (0, &params),
            (1, &coef),
            (2, &state),
            (3, &group_bank),
            (4, &excite),
            (5, &partial),
            (6, &bank_groups),
            (7, &out),
        ];
        let modes_bind = ctx.bind(&modes_pipe, &all, &[0, 1, 2, 3, 4, 5]);
        let reduce_bind = ctx.bind(&reduce_pipe, &all, &[0, 5, 6, 7]);
        let readback = Readback::new(&ctx, banks * n * 4 + modes * 8);
        Self {
            ctx,
            layout,
            max_block,
            params,
            state,
            excite,
            out,
            modes_pipe,
            reduce_pipe,
            modes_bind,
            reduce_bind,
            readback,
            last_n: 0,
        }
    }

    pub fn upload_state(&mut self, state: &[[f32; 2]]) {
        self.readback.settle(&self.ctx);
        self.ctx.queue.write_buffer(&self.state, 0, bytemuck::cast_slice(state));
    }

    /// Queue one block. Follow with `wait`, then `take` (or let the read go stale and `settle`).
    pub fn submit(&mut self, excite: &[f32], n: usize) {
        assert!(n % GROUP == 0 && n <= self.max_block);
        let l = &self.layout;
        self.readback.settle(&self.ctx);
        let q = &self.ctx.queue;
        q.write_buffer(&self.params, 0, bytemuck::cast_slice(&[n as u32, l.num_groups() as u32, l.num_banks() as u32, 0]));
        q.write_buffer(&self.excite, 0, bytemuck::cast_slice(&excite[..l.num_banks() * n]));
        let mut enc = self.ctx.device.create_command_encoder(&Default::default());
        {
            let mut pass = enc.begin_compute_pass(&Default::default());
            pass.set_pipeline(&self.modes_pipe);
            pass.set_bind_group(0, &self.modes_bind, &[]);
            pass.dispatch_workgroups(l.num_groups() as u32, 1, 1);
            pass.set_pipeline(&self.reduce_pipe);
            pass.set_bind_group(0, &self.reduce_bind, &[]);
            pass.dispatch_workgroups(n.div_ceil(256) as u32, l.num_banks() as u32, 1);
        }
        let out_bytes = (l.num_banks() * n * 4) as u64;
        enc.copy_buffer_to_buffer(&self.out, 0, &self.readback.buf, 0, out_bytes);
        enc.copy_buffer_to_buffer(&self.state, 0, &self.readback.buf, out_bytes, (l.num_modes() * 8) as u64);
        q.submit(Some(enc.finish()));
        self.last_n = n;
        self.readback.request(self.bytes());
    }

    fn bytes(&self) -> u64 {
        ((self.layout.num_banks() * self.last_n + self.layout.num_modes() * 2) * 4) as u64
    }

    pub fn wait(&mut self, deadline: Instant) -> bool {
        self.readback.wait(&self.ctx, deadline)
    }

    pub fn take(&mut self, out: &mut [f32], state: &mut [[f32; 2]]) {
        let split = self.layout.num_banks() * self.last_n;
        let bytes = self.bytes();
        self.readback.take(bytes, |v| {
            out[..split].copy_from_slice(&v[..split]);
            state.copy_from_slice(bytemuck::cast_slice(&v[split..]));
        });
    }
}

/// The processor Chora would hold: GPU when healthy, CPU otherwise, seamless at block edges.
pub struct ModalBank {
    pub sample_rate: f32,
    pub cpu: ModalCpu,
    pub gpu: Option<ModalGpu>,
    pub health: Health,
    gpu_state_valid: bool,
}

impl ModalBank {
    pub fn new(sample_rate: f32, layout: ModalLayout, max_block: usize, gpu: Option<Arc<GpuContext>>) -> Self {
        let layout = Arc::new(layout);
        Self {
            sample_rate,
            cpu: ModalCpu::new(layout.clone()),
            gpu: gpu.map(|ctx| ModalGpu::new(ctx, layout, max_block)),
            health: Health::new(HealthConfig::default()),
            gpu_state_valid: false,
        }
    }

    /// Render one block. `deadline` defaults to the health budget from now.
    pub fn render(&mut self, excite: &[f32], n: usize, out: &mut [f32], deadline: Option<Instant>) -> Path {
        let block = Duration::from_secs_f64(n as f64 / self.sample_rate as f64);
        if let (Some(gpu), Path::Gpu) = (self.gpu.as_mut(), self.health.choose()) {
            if !self.gpu_state_valid {
                gpu.upload_state(&self.cpu.state);
                self.gpu_state_valid = true;
            }
            let t0 = Instant::now();
            let deadline = deadline.unwrap_or(t0 + self.health.deadline(block));
            gpu.submit(excite, n);
            if gpu.wait(deadline) {
                gpu.take(out, &mut self.cpu.state);
                self.health.record_gpu(t0.elapsed(), block);
                return Path::Gpu;
            }
            self.health.record_miss();
        }
        // CPU continues from the last good state; the GPU copy is stale until re-uploaded.
        self.cpu.render(excite, n, out);
        self.gpu_state_valid = false;
        self.health.record_cpu();
        Path::Cpu
    }
}
