//! GPU context and the deadline-aware readback every processor uses.

use std::future::Future;
use std::pin::pin;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::task::{Context, Poll, Waker};
use std::time::Instant;

/// One device + queue. Processors share it through an `Arc`.
pub struct GpuContext {
    pub device: wgpu::Device,
    pub queue: wgpu::Queue,
    pub info: wgpu::AdapterInfo,
}

impl GpuContext {
    /// Every adapter on the native APIs: D3D12 + Vulkan on Windows (Intel, AMD, NVIDIA,
    /// Qualcomm Adreno), Metal on Apple, Vulkan on Linux.
    pub fn adapters() -> Vec<wgpu::Adapter> {
        let instance = instance();
        instance.enumerate_adapters(wgpu::Backends::PRIMARY)
    }

    /// The default adapter for the given preference, or None when the machine has no usable GPU.
    pub fn new(power: wgpu::PowerPreference) -> Option<Arc<Self>> {
        let instance = instance();
        let adapter = block_on(instance.request_adapter(&wgpu::RequestAdapterOptions {
            power_preference: power,
            force_fallback_adapter: false,
            compatible_surface: None,
        }))
        .ok()?;
        Self::from_adapter(&adapter)
    }

    pub fn from_adapter(adapter: &wgpu::Adapter) -> Option<Arc<Self>> {
        // Ask for the adapter's real limits: big render-ahead blocks need more than the
        // WebGPU defaults for buffer sizes.
        let (device, queue) = block_on(adapter.request_device(&wgpu::DeviceDescriptor {
            label: Some("plajah-gpu-dsp"),
            required_features: wgpu::Features::empty(),
            required_limits: adapter.limits(),
            memory_hints: wgpu::MemoryHints::Performance,
            trace: wgpu::Trace::Off,
        }))
        .ok()?;
        Some(Arc::new(Self { device, queue, info: adapter.get_info() }))
    }

    pub fn label(&self) -> String {
        format!("{} ({:?}, {:?})", self.info.name, self.info.backend, self.info.device_type)
    }

    pub(crate) fn storage(&self, label: &str, bytes: u64, extra: wgpu::BufferUsages) -> wgpu::Buffer {
        self.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some(label),
            size: bytes.max(16),
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST | extra,
            mapped_at_creation: false,
        })
    }

    pub(crate) fn pipeline(&self, module: &wgpu::ShaderModule, entry: &str) -> wgpu::ComputePipeline {
        self.device.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
            label: Some(entry),
            layout: None,
            module,
            entry_point: Some(entry),
            compilation_options: Default::default(),
            cache: None,
        })
    }

    /// Bind group for an auto-layout pipeline: only the bindings that entry point uses.
    pub(crate) fn bind(
        &self,
        pipeline: &wgpu::ComputePipeline,
        all: &[(u32, &wgpu::Buffer)],
        used: &[u32],
    ) -> wgpu::BindGroup {
        let entries: Vec<_> = all
            .iter()
            .filter(|(b, _)| used.contains(b))
            .map(|(b, buf)| wgpu::BindGroupEntry { binding: *b, resource: buf.as_entire_binding() })
            .collect();
        self.device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: None,
            layout: &pipeline.get_bind_group_layout(0),
            entries: &entries,
        })
    }
}

fn instance() -> wgpu::Instance {
    let mut desc = wgpu::InstanceDescriptor { backends: wgpu::Backends::PRIMARY, ..Default::default() };
    if let Some(dir) = dxc_dir() {
        desc.backend_options.dx12.shader_compiler = wgpu::Dx12Compiler::DynamicDxc {
            dxc_path: dir.join("dxcompiler.dll").to_string_lossy().into_owned(),
            dxil_path: dir.join("dxil.dll").to_string_lossy().into_owned(),
            max_shader_model: wgpu::DxcShaderModel::V6_5,
        };
    }
    wgpu::Instance::new(&desc)
}

/// D3D12 needs DXC: wgpu's default FXC compiler takes minutes (or never returns) on the modal
/// kernel's loops. DXC (dxcompiler.dll + dxil.dll, Microsoft-redistributable) is looked up in
/// `PLAJAH_DXC_DIR`, next to the executable, then in the newest Windows SDK. Without it D3D12
/// adapters fall back to FXC; Vulkan adapters are unaffected.
pub fn dxc_dir() -> Option<std::path::PathBuf> {
    use std::path::PathBuf;
    let has = |d: &PathBuf| d.join("dxcompiler.dll").is_file() && d.join("dxil.dll").is_file();
    let mut dirs: Vec<PathBuf> = Vec::new();
    if let Some(d) = std::env::var_os("PLAJAH_DXC_DIR") {
        dirs.push(d.into());
    }
    if let Some(d) = std::env::current_exe().ok().and_then(|e| e.parent().map(PathBuf::from)) {
        dirs.push(d);
    }
    let arch = if cfg!(target_arch = "aarch64") { "arm64" } else { "x64" };
    if let Ok(rd) = std::fs::read_dir(r"C:\Program Files (x86)\Windows Kits\10\bin") {
        let mut sdks: Vec<PathBuf> = rd.flatten().map(|e| e.path().join(arch)).collect();
        sdks.sort();
        dirs.extend(sdks.into_iter().rev());
    }
    dirs.into_iter().find(has)
}

/// Minimal executor: wgpu's native futures resolve without a reactor.
pub fn block_on<F: Future>(f: F) -> F::Output {
    let mut cx = Context::from_waker(Waker::noop());
    let mut f = pin!(f);
    loop {
        if let Poll::Ready(v) = f.as_mut().poll(&mut cx) {
            return v;
        }
        std::thread::yield_now();
    }
}

/// A MAP_READ staging buffer with a deadline-aware wait. A read that misses its deadline stays
/// pending; `settle` drains it before the buffer is used again.
pub(crate) struct Readback {
    pub buf: wgpu::Buffer,
    ready: Arc<AtomicBool>,
    pending: bool,
}

impl Readback {
    pub fn new(ctx: &GpuContext, bytes: u64) -> Self {
        let buf = ctx.device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("readback"),
            size: bytes.max(16),
            usage: wgpu::BufferUsages::MAP_READ | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        Self { buf, ready: Arc::new(AtomicBool::new(false)), pending: false }
    }

    /// Call right after the submit that copies into `buf`.
    pub fn request(&mut self, bytes: u64) {
        self.ready.store(false, Ordering::Release);
        self.pending = true;
        let ready = self.ready.clone();
        // Set on any completion so `settle` can't hang; a failed map only happens on device
        // loss, which the caller sees as a panic in `take`.
        self.buf.slice(0..bytes).map_async(wgpu::MapMode::Read, move |_| {
            ready.store(true, Ordering::Release);
        });
    }

    /// True once the result is mapped; false if `deadline` passed first (checked before
    /// polling, so a deadline already in the past always misses).
    pub fn wait(&mut self, ctx: &GpuContext, deadline: Instant) -> bool {
        loop {
            if self.ready.load(Ordering::Acquire) {
                return true;
            }
            if Instant::now() >= deadline {
                return false;
            }
            let _ = ctx.device.poll(wgpu::PollType::Poll);
            std::hint::spin_loop();
        }
    }

    /// Copy the mapped bytes out as f32 and release the mapping.
    pub fn take(&mut self, bytes: u64, f: impl FnOnce(&[f32])) {
        {
            let view = self.buf.slice(0..bytes).get_mapped_range();
            f(bytemuck::cast_slice(&view));
        }
        self.buf.unmap();
        self.pending = false;
    }

    /// Finish a late read (blocking) so the staging buffer can be reused.
    pub fn settle(&mut self, ctx: &GpuContext) {
        if !self.pending {
            return;
        }
        while !self.ready.load(Ordering::Acquire) {
            let _ = ctx.device.poll(wgpu::PollType::Wait);
        }
        self.buf.unmap();
        self.pending = false;
    }
}
