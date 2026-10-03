using System;
using UnityEngine;
using UnityEngine.VFX;
using UnityEngine.Rendering;
using UnityEngine.Rendering.HighDefinition;

namespace Plajah.Visualizer.UnityHDRP
{
    /// <summary>
    /// High-precision multi-stem audio reactor for Unity HDRP.
    /// Extracts 512-point FFT spectrum and drives Shader Graph properties,
    /// VFX Graph GPU particle events, and HDRP physical camera volume overrides.
    /// </summary>
    public class PlajahAudioReactor : MonoBehaviour
    {
        [Header("Audio Source Hook")]
        public AudioSource audioSource;

        [Header("VFX & Shader Graph Hooks")]
        public VisualEffect fluidSplashVfx;
        public Material fluidPbrMaterial;
        public Light keySpotLight;
        public Volume hdrpVolume;

        [Header("Stem Intensities (Read Only)")]
        [Range(0f, 2f)] public float kick;
        [Range(0f, 2f)] public float snare;
        [Range(0f, 2f)] public float voice;
        [Range(0f, 2f)] public float air;
        [Range(0f, 2f)] public float subBass;
        [Range(-1f, 1f)] public float stereoBalance;

        private float[] _spectrumL = new float[512];
        private float[] _spectrumR = new float[512];

        // Shader Property IDs (Cached for zero GC allocations)
        private static readonly int PropKickIntensity   = Shader.PropertyToID("_KickIntensity");
        private static readonly int PropVoiceEnergy     = Shader.PropertyToID("_VoiceEnergy");
        private static readonly int PropRippleSpeed     = Shader.PropertyToID("_RippleSpeed");
        private static readonly int PropCrestIridescence = Shader.PropertyToID("_CrestIridescence");
        private static readonly int EventKickImpact     = Shader.PropertyToID("OnKickImpact");

        // HDRP Volume Overrides
        private Bloom _bloom;
        private ChromaticAberration _chromaticAberration;
        private Exposure _exposure;

        private float _lastKickTime = 0f;

        void Start()
        {
            if (audioSource == null)
            {
                audioSource = GetComponent<AudioSource>();
            }

            if (hdrpVolume != null && hdrpVolume.profile != null)
            {
                hdrpVolume.profile.TryGet(out _bloom);
                hdrpVolume.profile.TryGet(out _chromaticAberration);
                hdrpVolume.profile.TryGet(out _exposure);
            }
        }

        void Update()
        {
            if (audioSource == null) return;

            // 1. Extract 512-point FFT for Left and Right Channels
            audioSource.GetSpectrumData(_spectrumL, 0, FFTWindow.BlackmanHarris);
            audioSource.GetSpectrumData(_spectrumR, 1, FFTWindow.BlackmanHarris);

            float dt = Time.deltaTime;

            // 2. Compute Multi-Stem Audio Intelligence
            // Sub-Bass (Bins 0-2: 20 - 70 Hz)
            float rawSub = (_spectrumL[0] + _spectrumR[0] + _spectrumL[1] + _spectrumR[1]) * 0.5f;
            subBass = Mathf.Lerp(subBass, rawSub * 18.0f, dt * 20.0f);

            // Kick Transient (Bins 1-4: 50 - 130 Hz)
            float rawKick = (_spectrumL[2] + _spectrumR[2] + _spectrumL[3] + _spectrumR[3]) * 0.5f;
            kick = Mathf.Lerp(kick, rawKick * 22.0f, dt * 25.0f);

            // Snare Snap (Bins 40-85: 1.8 - 3.8 kHz)
            float rawSnare = 0f;
            for (int i = 40; i < 85; i++) rawSnare += (_spectrumL[i] + _spectrumR[i]) * 0.5f;
            rawSnare = (rawSnare / 45f) * 16.0f;
            snare = Mathf.Lerp(snare, rawSnare, dt * 25.0f);

            // Vocal Formant Energy (Bins 25-55: 1.1 - 2.4 kHz)
            float rawVoice = 0f, voicePeak = 0f;
            for (int i = 25; i < 55; i++)
            {
                float v = (_spectrumL[i] + _spectrumR[i]) * 0.5f;
                rawVoice += v;
                if (v > voicePeak) voicePeak = v;
            }
            rawVoice /= 30f;
            float formantRatio = rawVoice > 0.005f ? (voicePeak / rawVoice) : 1f;
            voice = Mathf.Lerp(voice, rawVoice * 14.0f * Mathf.Clamp(formantRatio - 1f, 0.5f, 2f), dt * 14.0f);

            // Air & Shimmer (Bins 150-250: 9 - 15 kHz)
            float rawAir = 0f;
            for (int i = 150; i < 250; i++) rawAir += (_spectrumL[i] + _spectrumR[i]) * 0.5f;
            air = Mathf.Lerp(air, (rawAir / 100f) * 25.0f, dt * 16.0f);

            // Stereo Balance (-1.0 Left to +1.0 Right)
            float sumL = 0f, sumR = 0f;
            for (int i = 0; i < 100; i++) { sumL += _spectrumL[i]; sumR += _spectrumR[i]; }
            float total = sumL + sumR + 1e-4f;
            stereoBalance = Mathf.Lerp(stereoBalance, (sumR - sumL) / total, dt * 12.0f);

            // 3. Drive Shader Graph PBR Fluid Material
            if (fluidPbrMaterial != null)
            {
                fluidPbrMaterial.SetFloat(PropKickIntensity, kick);
                fluidPbrMaterial.SetFloat(PropVoiceEnergy, voice);
                fluidPbrMaterial.SetFloat(PropRippleSpeed, 2.5f + voice * 2.0f);
                fluidPbrMaterial.SetFloat(PropCrestIridescence, Mathf.Clamp01(voice * 0.7f + air * 0.5f));
            }

            // 4. Trigger Unity VFX Graph GPU Ballistic Droplet Bursts on Kick
            if (fluidSplashVfx != null && kick > 0.45f && Time.time - _lastKickTime > 0.18f)
            {
                _lastKickTime = Time.time;
                fluidSplashVfx.SetFloat("KickMagnitude", kick);
                fluidSplashVfx.SendEvent(EventKickImpact);
            }

            // 5. Drive HDRP Physical Key Spotlight Lumens
            if (keySpotLight != null)
            {
                float baseLumens = 14000f;
                keySpotLight.intensity = Mathf.Lerp(keySpotLight.intensity, baseLumens + kick * 28000f, dt * 18.0f);
            }

            // 6. Drive HDRP Post-Processing Lens Optics (Zero-White Bloom, High Chroma)
            if (_chromaticAberration != null)
            {
                _chromaticAberration.intensity.value = Mathf.Clamp01(0.1f + kick * 0.45f);
            }
            if (_bloom != null)
            {
                _bloom.intensity.value = 0.25f + voice * 0.45f; // Controlled subtle bloom without milky white-out
            }
        }
    }
}
