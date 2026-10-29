//! Render-ahead benchmark: % of real time and speed-up versus the CPU reference, on every GPU.
//!   cargo run --release --example bench [-- <adapter filter>]
//! Times are wall clock per call, upload + kernels + readback included (what a deadline sees).
//!   cargo run --release --example bench -- <adapter filter> --contention
//! instead runs a modal bank while another device saturates the same GPU (a stand-in for
//! Plajah's visualizers) and reports deadline misses and CPU fallbacks.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

use plajah_gpu_dsp::*;

const SR: f32 = 48_000.0;
const GPU_REPS: usize = 15;
const CPU_REPS: usize = 3;

fn noise(seed: u32, n: usize) -> Vec<f32> {
    let mut s = seed.wrapping_mul(2_654_435_761).max(1);
    (0..n)
        .map(|_| {
            s ^= s << 13;
            s ^= s >> 17;
            s ^= s << 5;
            (s as f32 / u32::MAX as f32) * 2.0 - 1.0
        })
        .collect()
}

fn median(mut v: Vec<Duration>) -> Duration {
    v.sort();
    v[v.len() / 2]
}

fn ms(d: Duration) -> f64 {
    d.as_secs_f64() * 1e3
}

struct Row {
    name: String,
    audio: Duration,
    cpu: Duration,
    gpu: Vec<(String, Duration, Duration)>,
}

fn print(rows: &[Row]) {
    for r in rows {
        let a = r.audio.as_secs_f64();
        println!(
            "| {} | {:.0} ms | CPU {:.1} ms ({:.0}% RT) |",
            r.name,
            a * 1e3,
            ms(r.cpu),
            r.cpu.as_secs_f64() / a * 100.0
        );
        for (g, med, max) in &r.gpu {
            println!(
                "|   {g} | median {:.2} ms ({:.1}% RT), worst {:.2} ms | {:.1}x vs CPU |",
                ms(*med),
                med.as_secs_f64() / a * 100.0,
                ms(*max),
                r.cpu.as_secs_f64() / med.as_secs_f64()
            );
        }
    }
}

fn modal_banks(banks: usize, per: usize) -> Vec<Vec<Mode>> {
    (0..banks)
        .map(|b| {
            let f0 = 50.0 + 13.0 * b as f32;
            (0..per)
                .map(|i| Mode {
                    freq_hz: (f0 * (1.0 + i as f32 * 0.913)).min(20_000.0),
                    t60_s: 0.3 + 4.0 / (1.0 + i as f32 * 0.03),
                    gain: 1.0 / (1.0 + i as f32 * 0.05),
                })
                .collect()
        })
        .collect()
}

/// Keep the GPU saturated from a second device until `stop`: back-to-back ~frame-sized compute
/// submits, like a visualizer that never idles.
fn hog(ctx: Arc<GpuContext>, stop: Arc<AtomicBool>) {
    let d = &ctx.device;
    let module = d.create_shader_module(wgpu::ShaderModuleDescriptor {
        label: Some("hog"),
        source: wgpu::ShaderSource::Wgsl(
            "@group(0) @binding(0) var<storage, read_write> b: array<f32>;
             @compute @workgroup_size(256) fn main(@builtin(global_invocation_id) g: vec3<u32>) {
               var x = b[g.x]; for (var i = 0u; i < 2048u; i++) { x = x * 1.0001 + 0.5; } b[g.x] = x; }"
                .into(),
        ),
    });
    let pipe = d.create_compute_pipeline(&wgpu::ComputePipelineDescriptor {
        label: None,
        layout: None,
        module: &module,
        entry_point: Some("main"),
        compilation_options: Default::default(),
        cache: None,
    });
    let buf = d.create_buffer(&wgpu::BufferDescriptor { label: None, size: 4 << 20, usage: wgpu::BufferUsages::STORAGE, mapped_at_creation: false });
    let bg = d.create_bind_group(&wgpu::BindGroupDescriptor {
        label: None,
        layout: &pipe.get_bind_group_layout(0),
        entries: &[wgpu::BindGroupEntry { binding: 0, resource: buf.as_entire_binding() }],
    });
    while !stop.load(Ordering::Relaxed) {
        let mut enc = d.create_command_encoder(&Default::default());
        {
            let mut pass = enc.begin_compute_pass(&Default::default());
            pass.set_pipeline(&pipe);
            pass.set_bind_group(0, &bg, &[]);
            pass.dispatch_workgroups(4096, 1, 1);
        }
        ctx.queue.submit(Some(enc.finish()));
        let _ = d.poll(wgpu::PollType::Wait);
    }
}

fn contention(ctxs: &[Arc<GpuContext>]) {
    let n = 8192;
    let layout = ModalLayout::new(SR, &modal_banks(64, 256));
    let x = noise(1, layout.num_banks() * n);
    let mut out = vec![0.0; layout.num_banks() * n];
    println!("### Contention — modal 16384 modes, 8192-sample blocks, deadline = 50% of block (85 ms)
");
    for ctx in ctxs {
        for loaded in [false, true] {
            let stop = Arc::new(AtomicBool::new(false));
            let hog_thread = loaded.then(|| {
                let (adapter_ctx, stop) = (GpuContext::adapters(), stop.clone());
                let info = ctx.info.clone();
                let a = adapter_ctx.into_iter().find(|a| {
                    let i = a.get_info();
                    i.name == info.name && i.backend == info.backend
                });
                let hog_ctx = a.and_then(|a| GpuContext::from_adapter(&a)).expect("second device");
                std::thread::spawn(move || hog(hog_ctx, stop))
            });
            if loaded {
                std::thread::sleep(Duration::from_millis(500));
            }
            let mut bank = ModalBank::new(SR, layout.clone(), n, Some(ctx.clone()));
            bank.render(&x, n, &mut out, Some(Instant::now() + Duration::from_secs(30)));
            let mut lat = Vec::new();
            let mut cpu_blocks = 0;
            for _ in 0..30 {
                let t = Instant::now();
                if bank.render(&x, n, &mut out, None) == Path::Cpu {
                    cpu_blocks += 1;
                }
                lat.push(t.elapsed());
            }
            stop.store(true, Ordering::Relaxed);
            if let Some(h) = hog_thread {
                h.join().unwrap();
            }
            let s = bank.health.stats;
            println!(
                "| {} | {} | block median {:.1} ms, worst {:.1} ms | GPU latency worst {:.1} ms | misses {} | CPU blocks {cpu_blocks}/30 |",
                ctx.label(),
                if loaded { "GPU saturated" } else { "idle" },
                ms(median(lat.clone())),
                ms(*lat.iter().max().unwrap()),
                ms(s.worst_latency),
                s.misses
            );
        }
    }
}

fn main() {
    let filter = std::env::args().nth(1).unwrap_or_default().to_lowercase();
    let filter = if filter.starts_with("--") { String::new() } else { filter };
    let mut seen = Vec::new();
    let ctxs: Vec<Arc<GpuContext>> = GpuContext::adapters()
        .into_iter()
        .filter(|a| {
            let i = a.get_info();
            let key = (i.name.clone(), i.backend);
            let keep = i.device_type != wgpu::DeviceType::Cpu
                && !seen.contains(&key)
                && format!("{} {:?}", i.name, i.backend).to_lowercase().contains(&filter);
            seen.push(key);
            keep
        })
        .filter_map(|a| GpuContext::from_adapter(&a))
        .collect();
    for c in &ctxs {
        println!("adapter: {}  driver {} {}", c.label(), c.info.driver, c.info.driver_info);
    }
    println!("DXC: {:?}\n", plajah_gpu_dsp::gpu::dxc_dir());
    if std::env::args().any(|a| a == "--contention") {
        contention(&ctxs);
        return;
    }

    // ---- Modal bank: one 8192-sample render-ahead block (170 ms) ----
    let n = 8192;
    let audio = Duration::from_secs_f64(n as f64 / SR as f64);
    let mut rows = Vec::new();
    for (banks, per) in [(16, 64), (16, 256), (64, 256), (128, 512)] {
        let layout = ModalLayout::new(SR, &modal_banks(banks, per));
        let x = noise(1, banks * n);
        let mut out = vec![0.0; banks * n];
        let mut cpu = ModalCpu::new(Arc::new(layout.clone()));
        let cpu_t = median(
            (0..CPU_REPS)
                .map(|_| {
                    let t = Instant::now();
                    cpu.render(&x, n, &mut out);
                    t.elapsed()
                })
                .collect(),
        );
        let mut row = Row { name: format!("modal {} modes ({banks} banks × {per})", layout.num_modes()), audio, cpu: cpu_t, gpu: vec![] };
        for ctx in &ctxs {
            let mut bank = ModalBank::new(SR, layout.clone(), n, Some(ctx.clone()));
            let mut times = Vec::new();
            for i in 0..GPU_REPS + 2 {
                let t = Instant::now();
                let p = bank.render(&x, n, &mut out, Some(Instant::now() + Duration::from_secs(30)));
                assert_eq!(p, Path::Gpu);
                if i >= 2 {
                    times.push(t.elapsed());
                }
            }
            let max = *times.iter().max().unwrap();
            row.gpu.push((ctx.label(), median(times), max));
        }
        rows.push(row);
    }
    println!("### Modal resonator bank — 8192-sample block\n");
    print(&rows);

    // ---- Partitioned convolution: B = 512, 16 partitions per call (8192 samples, 170 ms) ----
    let (b, blocks) = (512, 16);
    let samples = b * blocks;
    let audio = Duration::from_secs_f64(samples as f64 / SR as f64);
    let mut rows = Vec::new();
    for (secs, chs, label) in [(2.0, 2, "2 s stereo reverb"), (6.0, 2, "6 s stereo hall"), (2.0, 16, "8 stereo sends × 2 s"), (10.0, 4, "10 s true-stereo (4 ch)")] {
        let len = (secs * SR) as usize;
        let irs: Vec<Vec<f32>> = (0..chs)
            .map(|c| noise(10 + c as u32, len).iter().enumerate().map(|(i, v)| v * (-(i as f32) / (len as f32 * 0.25)).exp()).collect())
            .collect();
        let x = noise(2, chs * samples);
        let mut out = vec![0.0; chs * samples];
        let mut cpu = Convolver::new(SR, ConvIr::new(b, &irs), blocks, None);
        let cpu_t = median(
            (0..CPU_REPS)
                .map(|_| {
                    let t = Instant::now();
                    cpu.process(&x, blocks, &mut out, None);
                    t.elapsed()
                })
                .collect(),
        );
        let parts = cpu.cpu.ir.parts;
        let mut row = Row { name: format!("conv {label} (B={b}, P={parts})"), audio, cpu: cpu_t, gpu: vec![] };
        for ctx in &ctxs {
            let mut conv = Convolver::new(SR, ConvIr::new(b, &irs), blocks, Some(ctx.clone()));
            let mut times = Vec::new();
            for i in 0..GPU_REPS + 2 {
                let t = Instant::now();
                let p = conv.process(&x, blocks, &mut out, Some(Instant::now() + Duration::from_secs(30)));
                assert_eq!(p, Path::Gpu);
                if i >= 2 {
                    times.push(t.elapsed());
                }
            }
            let max = *times.iter().max().unwrap();
            row.gpu.push((ctx.label(), median(times), max));
        }
        rows.push(row);
    }
    println!("\n### Partitioned convolution — 8192 samples per call\n");
    print(&rows);
}
