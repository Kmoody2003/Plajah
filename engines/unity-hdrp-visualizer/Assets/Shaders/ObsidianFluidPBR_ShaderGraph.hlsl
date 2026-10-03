#ifndef PLAJAH_OBSIDIAN_FLUID_INCLUDED
#define PLAJAH_OBSIDIAN_FLUID_INCLUDED

// ── Plajah Series VIII: Obsidian Fluid Concentric Ripple HLSL Node ──
// For Unity HDRP Shader Graph Custom Function Block

void CalculateConcentricRipples_float(
    float3 WorldPos,
    float Time,
    float RippleSpeed,
    float RippleFreq,
    float KickPunch,
    float VoiceEnergy,
    out float WaveHeight,
    out float3 RecomputedNormal,
    out float CrestIridescence
)
{
    float2 xz = WorldPos.xz;
    float dist = length(xz);

    // Primary audio-reactive harmonic ripple
    float baseWave = sin(dist * RippleFreq - Time * RippleSpeed) / (1.0 + dist * 0.32);
    baseWave *= (0.2 + VoiceEnergy * 0.4);

    // Secondary high-frequency shimmer ripple
    float shimmer = (sin(dist * (RippleFreq * 2.2) - Time * (RippleSpeed * 1.5)) / (1.0 + dist * 0.75)) * 0.06;

    // Transient hydraulic shockwave ring
    float shockRadius = fmod(Time * 7.5, 18.0);
    float shock = exp(-pow(dist - shockRadius, 2.0) * 1.5) * (KickPunch * 0.85);

    float h = baseWave + shimmer + shock;
    WaveHeight = h;

    // Finite difference normal recalculation
    float2 eps = float2(0.03, 0.0);
    
    // Sample neighborhood
    float distEpsX = length(xz + eps.xy);
    float hx = (sin(distEpsX * RippleFreq - Time * RippleSpeed) / (1.0 + distEpsX * 0.32)) * (0.2 + VoiceEnergy * 0.4);
    
    float distEpsZ = length(xz + eps.yx);
    float hz = (sin(distEpsZ * RippleFreq - Time * RippleSpeed) / (1.0 + distEpsZ * 0.32)) * (0.2 + VoiceEnergy * 0.4);

    float dHdX = (hx - h) / eps.x;
    float dHdZ = (hz - h) / eps.x;

    RecomputedNormal = normalize(float3(-dHdX, 1.0, -dHdZ));

    // Crest factor for iridescence and subsurface scattering
    CrestIridescence = saturate((h + 0.15) * 2.5);
}

#endif // PLAJAH_OBSIDIAN_FLUID_INCLUDED
