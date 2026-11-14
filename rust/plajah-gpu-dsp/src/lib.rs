//! Chora's cross-vendor GPU audio DSP.
//!
//! WGSL compute kernels run through wgpu on D3D12 / Vulkan (Intel, AMD, NVIDIA, Qualcomm
//! Adreno on ARM64 Windows) and Metal (Apple Silicon); the same `.wgsl` files run under browser
//! WebGPU (see `labs/gpu-dsp`). Only for work with latency slack: render-ahead of sequenced
//! tracks, offline bounces, long convolution. The live, played-now voice stays on the CPU
//! engine (`plajah-audio`).
//!
//! Every GPU processor has a CPU reference that follows the kernel's operation order (so the two
//! agree to rounding) and doubles as the fallback; `health` drops a processor back to the CPU
//! when the GPU misses a block's deadline.

pub mod conv;
pub mod fft;
pub mod gpu;
pub mod health;
pub mod modal;

pub use conv::{ConvCpu, ConvGpu, ConvIr, Convolver};
pub use gpu::GpuContext;
pub use health::{Health, HealthConfig, Path};
pub use modal::{ModalBank, ModalCpu, ModalGpu, ModalLayout, Mode};
