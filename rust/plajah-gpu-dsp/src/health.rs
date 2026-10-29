//! Deadline health: decides per block whether a processor may use the GPU.
//!
//! Plajah's visualizers share the GPU with audio. When a render-ahead block comes back late
//! (contention, a driver hiccup, a power-state change) the block is rendered on the CPU instead
//! and the GPU sits out a cooldown that doubles on each repeat miss, so a busy GPU is not
//! hammered while audio stays on time. A clean GPU block halves the cooldown again.

use std::time::Duration;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Path {
    Gpu,
    Cpu,
}

#[derive(Clone, Copy, Debug)]
pub struct HealthConfig {
    /// Share of a block's audio duration the GPU may take before the block counts as late.
    pub budget: f64,
    pub min_cooldown_blocks: u32,
    pub max_cooldown_blocks: u32,
}

impl Default for HealthConfig {
    fn default() -> Self {
        Self { budget: 0.5, min_cooldown_blocks: 4, max_cooldown_blocks: 256 }
    }
}

#[derive(Clone, Copy, Debug, Default)]
pub struct HealthStats {
    pub gpu_blocks: u64,
    pub cpu_blocks: u64,
    pub misses: u64,
    pub last_latency: Duration,
    pub worst_latency: Duration,
    /// Smoothed GPU latency as a share of block duration (1.0 = exactly real time).
    pub load: f64,
}

#[derive(Clone, Debug)]
pub struct Health {
    pub cfg: HealthConfig,
    pub stats: HealthStats,
    cooldown: u32,
    cpu_left: u32,
}

impl Health {
    pub fn new(cfg: HealthConfig) -> Self {
        Self { cfg, stats: HealthStats::default(), cooldown: cfg.min_cooldown_blocks, cpu_left: 0 }
    }

    pub fn choose(&self) -> Path {
        if self.cpu_left > 0 { Path::Cpu } else { Path::Gpu }
    }

    pub fn deadline(&self, block: Duration) -> Duration {
        block.mul_f64(self.cfg.budget)
    }

    pub fn record_gpu(&mut self, latency: Duration, block: Duration) {
        let s = &mut self.stats;
        s.gpu_blocks += 1;
        s.last_latency = latency;
        s.worst_latency = s.worst_latency.max(latency);
        let load = latency.as_secs_f64() / block.as_secs_f64().max(1e-9);
        s.load = if s.gpu_blocks == 1 { load } else { s.load * 0.9 + load * 0.1 };
        self.cooldown = (self.cooldown / 2).max(self.cfg.min_cooldown_blocks);
    }

    pub fn record_miss(&mut self) {
        self.stats.misses += 1;
        self.cpu_left = self.cooldown;
        self.cooldown = (self.cooldown * 2).min(self.cfg.max_cooldown_blocks);
    }

    pub fn record_cpu(&mut self) {
        self.stats.cpu_blocks += 1;
        self.cpu_left = self.cpu_left.saturating_sub(1);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn miss_backs_off_then_recovers() {
        let mut h = Health::new(HealthConfig { budget: 0.5, min_cooldown_blocks: 2, max_cooldown_blocks: 8 });
        let block = Duration::from_millis(100);
        assert_eq!(h.choose(), Path::Gpu);
        h.record_miss();
        assert_eq!(h.choose(), Path::Cpu);
        h.record_cpu();
        h.record_cpu();
        assert_eq!(h.choose(), Path::Gpu);
        // A repeat miss sits out twice as long.
        h.record_miss();
        for _ in 0..4 {
            assert_eq!(h.choose(), Path::Cpu);
            h.record_cpu();
        }
        assert_eq!(h.choose(), Path::Gpu);
        h.record_gpu(Duration::from_millis(10), block);
        h.record_gpu(Duration::from_millis(10), block);
        h.record_miss();
        assert_eq!(h.cpu_left, 2);
        assert!((h.stats.load - 0.1).abs() < 1e-9);
        assert_eq!(h.deadline(block), Duration::from_millis(50));
    }
}
