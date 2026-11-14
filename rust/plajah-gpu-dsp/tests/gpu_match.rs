//! GPU kernels against their CPU references (and the convolution against direct f64 math), on
//! every adapter the machine exposes. Machines without a GPU skip the GPU half.

use std::sync::Arc;
use std::time::Instant;

use plajah_gpu_dsp::*;

const SR: f32 = 48_000.0;

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

fn contexts() -> Vec<Arc<GpuContext>> {
    let v: Vec<_> = GpuContext::adapters()
        .iter()
        .filter(|a| a.get_info().device_type != wgpu::DeviceType::Cpu)
        .filter_map(GpuContext::from_adapter)
        .collect();
    if v.is_empty() {
        eprintln!("no GPU adapter: GPU half skipped");
    }
    v
}

/// Max |a - b| relative to the peak of `b`.
fn rel_err(a: &[f32], b: &[f32]) -> f32 {
    let peak = b.iter().fold(0f32, |m, v| m.max(v.abs())).max(1e-12);
    a.iter().zip(b).fold(0f32, |m, (x, y)| m.max((x - y).abs())) / peak
}

fn test_banks(banks: usize, modes_per_bank: usize) -> Vec<Vec<Mode>> {
    (0..banks)
        .map(|b| {
            let f0 = 60.0 + 37.0 * b as f32;
            (0..modes_per_bank)
                .map(|i| {
                    let r = 1.0 + i as f32 * 0.731 + (i as f32).sqrt() * 0.17;
                    Mode { freq_hz: (f0 * r).min(20_000.0), t60_s: 0.2 + 3.0 / (1.0 + i as f32 * 0.05), gain: 1.0 / (1.0 + i as f32 * 0.1) }
                })
                .collect()
        })
        .collect()
}

fn excitation(banks: usize, n: usize, blk: usize) -> Vec<f32> {
    // An impulse at the start of the first block plus a little noise, per bank.
    let mut x = noise(blk as u32 * 31 + 7, banks * n);
    for v in &mut x {
        *v *= 0.01;
    }
    if blk == 0 {
        for b in 0..banks {
            x[b * n] = 1.0;
        }
    }
    x
}

#[test]
fn modal_gpu_matches_cpu() {
    let (banks, n, blocks) = (6, 2048, 4);
    // 100 modes per bank: two groups each, the second padded — exercises bank/group mapping.
    let layout = ModalLayout::new(SR, &test_banks(banks, 100));
    for ctx in contexts() {
        let layout = Arc::new(layout.clone());
        let mut cpu = ModalCpu::new(layout.clone());
        let mut gpu = ModalGpu::new(ctx.clone(), layout.clone(), n);
        let mut gpu_state = cpu.state.clone();
        gpu.upload_state(&gpu_state);
        let (mut a, mut b) = (vec![0.0; banks * n], vec![0.0; banks * n]);
        for blk in 0..blocks {
            let x = excitation(banks, n, blk);
            cpu.render(&x, n, &mut a);
            gpu.submit(&x, n);
            assert!(gpu.wait(Instant::now() + std::time::Duration::from_secs(10)));
            gpu.take(&mut b, &mut gpu_state);
            let e = rel_err(&b, &a);
            eprintln!("modal {} block {blk}: rel err {e:.2e}", ctx.label());
            assert!(e < 1e-4, "modal block {blk} on {}: rel err {e}", ctx.label());
            assert!(a.iter().any(|v| v.abs() > 1e-3), "reference is silent");
        }
    }
}

/// Direct linear convolution in f64.
fn direct(x: &[f32], h: &[f32]) -> Vec<f32> {
    (0..x.len())
        .map(|n| (0..h.len().min(n + 1)).map(|k| x[n - k] as f64 * h[k] as f64).sum::<f64>() as f32)
        .collect()
}

fn test_irs(channels: usize, len: usize) -> Vec<Vec<f32>> {
    (0..channels)
        .map(|c| {
            noise(100 + c as u32, len)
                .iter()
                .enumerate()
                .map(|(i, v)| v * (-(i as f32) / (len as f32 * 0.3)).exp())
                .collect()
        })
        .collect()
}

#[test]
fn conv_cpu_matches_direct() {
    let (b, chs, blocks) = (64, 2, 12);
    let irs = test_irs(chs, 300); // 5 partitions, last one partial
    let mut cpu = ConvCpu::new(Arc::new(ConvIr::new(b, &irs)));
    let x = noise(9, chs * blocks * b);
    let mut y = vec![0.0; x.len()];
    // Uneven calls: 1, 5, 6 blocks.
    let total = blocks * b;
    let mut done = 0;
    for m in [1, 5, 6] {
        let inp: Vec<f32> = (0..chs).flat_map(|c| x[c * total + done * b..][..m * b].to_vec()).collect();
        let mut out = vec![0.0; inp.len()];
        cpu.process(&inp, m, &mut out);
        for c in 0..chs {
            y[c * total + done * b..][..m * b].copy_from_slice(&out[c * m * b..][..m * b]);
        }
        done += m;
    }
    for c in 0..chs {
        let want = direct(&x[c * total..][..total], &irs[c]);
        let e = rel_err(&y[c * total..][..total], &want);
        assert!(e < 1e-5, "channel {c}: rel err {e}");
    }
}

#[test]
fn conv_gpu_matches_cpu() {
    let (b, chs) = (256, 2);
    let irs = test_irs(chs, 256 * 9 + 17);
    for ctx in contexts() {
        let mut cpu = Convolver::new(SR, ConvIr::new(b, &irs), 8, None);
        let mut gpu = Convolver::new(SR, ConvIr::new(b, &irs), 8, Some(ctx.clone()));
        let far = Some(Instant::now() + std::time::Duration::from_secs(30));
        for (call, m) in [3usize, 8, 1, 5].into_iter().enumerate() {
            let x = noise(call as u32 + 50, chs * m * b);
            let (mut a, mut g) = (vec![0.0; x.len()], vec![0.0; x.len()]);
            cpu.process(&x, m, &mut a, far);
            assert_eq!(gpu.process(&x, m, &mut g, far), Path::Gpu);
            let e = rel_err(&g, &a);
            eprintln!("conv {} call {call}: rel err {e:.2e}", ctx.label());
            assert!(e < 1e-4, "conv call {call} on {}: rel err {e}", ctx.label());
        }
    }
}

/// Force deadline misses mid-stream: output must stay identical (to rounding) to a pure CPU
/// run across GPU → CPU → GPU hand-overs, for both processors.
#[test]
fn fallback_is_seamless() {
    for ctx in contexts().into_iter().take(1) {
        // Modal
        let (banks, n) = (3, 1024);
        let layout = ModalLayout::new(SR, &test_banks(banks, 64));
        let mut reference = ModalBank::new(SR, layout.clone(), n, None);
        let mut bank = ModalBank::new(SR, layout, n, Some(ctx.clone()));
        bank.health.cfg.min_cooldown_blocks = 2;
        let mut paths = Vec::new();
        for blk in 0..10 {
            let x = excitation(banks, n, blk);
            let (mut a, mut g) = (vec![0.0; banks * n], vec![0.0; banks * n]);
            reference.render(&x, n, &mut a, None);
            let deadline = if blk == 3 { Instant::now() } else { Instant::now() + std::time::Duration::from_secs(10) };
            paths.push(bank.render(&x, n, &mut g, Some(deadline)));
            let e = rel_err(&g, &a);
            assert!(e < 1e-4, "modal block {blk} ({:?}): rel err {e}", paths[blk]);
        }
        assert_eq!(paths[2], Path::Gpu);
        assert_eq!(paths[3], Path::Cpu, "forced miss falls back");
        assert_eq!(paths[4], Path::Cpu, "cooldown");
        assert_eq!(paths[5], Path::Gpu, "recovers");
        assert_eq!(bank.health.stats.misses, 1);

        // Convolution
        let (b, chs) = (128, 2);
        let irs = test_irs(chs, 128 * 6);
        let mut reference = Convolver::new(SR, ConvIr::new(b, &irs), 4, None);
        let mut conv = Convolver::new(SR, ConvIr::new(b, &irs), 4, Some(ctx.clone()));
        conv.health.cfg.min_cooldown_blocks = 2;
        let mut paths = Vec::new();
        for call in 0..10 {
            let x = noise(call as u32 + 300, chs * 4 * b);
            let (mut a, mut g) = (vec![0.0; x.len()], vec![0.0; x.len()]);
            reference.process(&x, 4, &mut a, None);
            let deadline = if call == 3 { Instant::now() } else { Instant::now() + std::time::Duration::from_secs(10) };
            paths.push(conv.process(&x, 4, &mut g, Some(deadline)));
            let e = rel_err(&g, &a);
            assert!(e < 1e-4, "conv call {call} ({:?}): rel err {e}", paths[call]);
        }
        assert_eq!(&paths[2..6], &[Path::Gpu, Path::Cpu, Path::Cpu, Path::Gpu]);
    }
}
