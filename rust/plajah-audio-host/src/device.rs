//! WASAPI shared-mode output, event-driven, on the default playback device. It counts what the device
//! actually experienced: an underrun is the buffer running dry before we wrote into it, checked on
//! waking and again after filling (a stall inside `fill` is only visible then).

use crate::{BLOCK, promote_audio_thread};
use std::time::{Duration, Instant};
use windows::Win32::Devices::FunctionDiscovery::PKEY_Device_FriendlyName;
use windows::Win32::Foundation::{CloseHandle, WAIT_OBJECT_0};
use windows::Win32::Media::Audio::*;
use windows::Win32::System::Com::*;
use windows::Win32::System::Threading::{CreateEventW, WaitForSingleObject};
use windows::core::{Error, HRESULT, Result};

#[derive(Debug, Default, Clone)]
pub struct DeviceStats {
    /// Times the device's buffer ran dry: audible gaps.
    pub underruns: u64,
    /// Elapsed time minus audio delivered, in frames: a check on `underruns` that uses neither event.
    pub lost_frames: i64,
    pub blocks: u64,
    /// Blocks whose `fill` took longer than the audio they produced.
    pub late_blocks: u64,
    pub max_fill: Duration,
    pub total_fill: Duration,
}

pub struct Output {
    client: IAudioClient3,
    render: IAudioRenderClient,
    event: windows::Win32::Foundation::HANDLE,
    buffer_frames: u32,
    channels: usize,
    pub sample_rate: u32,
    pub period_frames: u32,
    pub device: String,
}

impl Output {
    /// `smallest` asks for the shortest period the driver offers; otherwise the default (usually 10 ms).
    pub fn open(smallest: bool) -> Result<Self> {
        unsafe {
            CoInitializeEx(None, COINIT_MULTITHREADED).ok()?;
            let devices: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
            let endpoint = devices.GetDefaultAudioEndpoint(eRender, eConsole)?;
            let device = endpoint
                .OpenPropertyStore(STGM_READ)
                .and_then(|p| p.GetValue(&PKEY_Device_FriendlyName))
                .map(|v| v.to_string())
                .unwrap_or_default();
            let client: IAudioClient3 = endpoint.Activate(CLSCTX_ALL, None)?;
            let format = client.GetMixFormat()?;
            let (bits, channels, sample_rate) = ((*format).wBitsPerSample, (*format).nChannels, (*format).nSamplesPerSec);
            if bits != 32 {
                CoTaskMemFree(Some(format as *const _));
                return Err(Error::new(HRESULT(-1), "device mix format is not 32-bit float"));
            }
            let (mut default, mut fundamental, mut min, mut max) = (0, 0, 0, 0);
            client.GetSharedModeEnginePeriod(format, &mut default, &mut fundamental, &mut min, &mut max)?;
            let period = if smallest { min } else { default };
            let opened = client.InitializeSharedAudioStream(AUDCLNT_STREAMFLAGS_EVENTCALLBACK, period, format, None);
            CoTaskMemFree(Some(format as *const _));
            opened?;
            let event = CreateEventW(None, false, false, None)?;
            client.SetEventHandle(event)?;
            let buffer_frames = client.GetBufferSize()?;
            let render: IAudioRenderClient = client.GetService()?;
            Ok(Self { client, render, event, buffer_frames, channels: channels as usize, sample_rate, period_frames: period, device })
        }
    }

    /// Plays until `length` has passed. `fill` produces one `BLOCK` of left/right at a time.
    pub fn run(&mut self, length: Duration, mut fill: impl FnMut(&mut [f32], &mut [f32])) -> Result<DeviceStats> {
        promote_audio_thread();
        let mut stats = DeviceStats::default();
        let block_time = Duration::from_secs_f64(BLOCK as f64 / self.sample_rate as f64);
        let (mut left, mut right) = ([0.0; BLOCK], [0.0; BLOCK]);
        let mut used = BLOCK;
        let mut written: u64 = 0;
        let mut write = |frames: u32, stats: &mut DeviceStats| -> Result<bool> {
            unsafe {
                let out = std::slice::from_raw_parts_mut(self.render.GetBuffer(frames)? as *mut f32, frames as usize * self.channels);
                for frame in out.chunks_exact_mut(self.channels) {
                    if used == BLOCK {
                        let t0 = Instant::now();
                        fill(&mut left, &mut right);
                        let took = t0.elapsed();
                        stats.blocks += 1;
                        stats.total_fill += took;
                        stats.max_fill = stats.max_fill.max(took);
                        stats.late_blocks += (took > block_time) as u64;
                        used = 0;
                    }
                    frame.fill(0.0);
                    frame[0] = left[used];
                    if let Some(r) = frame.get_mut(1) {
                        *r = right[used];
                    }
                    used += 1;
                }
                let dry = self.client.GetCurrentPadding()? == 0;
                self.render.ReleaseBuffer(frames, 0)?;
                written += frames as u64;
                Ok(dry)
            }
        };
        write(self.buffer_frames, &mut stats)?;
        unsafe { self.client.Start()? };
        let started = Instant::now();
        while started.elapsed() < length {
            if unsafe { WaitForSingleObject(self.event, 500) } != WAIT_OBJECT_0 {
                continue;
            }
            let padding = unsafe { self.client.GetCurrentPadding()? };
            let frames = self.buffer_frames - padding;
            let dry = frames > 0 && write(frames, &mut stats)?;
            stats.underruns += (padding == 0 || dry) as u64;
        }
        unsafe { self.client.Stop()? };
        let played = (started.elapsed().as_secs_f64() * self.sample_rate as f64) as i64;
        stats.lost_frames = (played - (written as i64 - self.buffer_frames as i64)).max(0);
        Ok(stats)
    }
}

impl Drop for Output {
    fn drop(&mut self) {
        unsafe {
            let _ = CloseHandle(self.event);
        }
    }
}
