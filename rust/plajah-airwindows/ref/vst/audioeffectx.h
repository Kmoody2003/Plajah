// Minimal stand-in for the VST2 SDK header the Airwindows LinuxVST sources include, so the
// original C++ compiles into the reference renderer (ref/harness.cpp). Only what those sources
// touch is declared; nothing here is used by the shipped Rust/wasm code.
#pragma once
#define __audioeffect__
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <math.h>

// MSVC's and wasi-libc's rand() differ, which would make reverb start positions and noise
// incomparable. Both builds use this one, seeded per instance from the dither seed.
inline uint32_t& awRandState() { static uint32_t s = 1; return s; }
inline int awRand() { uint32_t& s = awRandState(); s = s * 1103515245u + 12345u; return (int)((s >> 16) & 0x7fff); }
#define rand awRand
#undef RAND_MAX
#define RAND_MAX 32767

typedef int32_t VstInt32;
typedef void* audioMasterCallback;
enum VstPlugCategory { kPlugCategUnknown = 0, kPlugCategEffect, kPlugCategRoomFx };
enum { kVstMaxProgNameLen = 24, kVstMaxParamStrLen = 8, kVstMaxVendorStrLen = 64, kVstMaxProductStrLen = 64, kVstMaxEffectNameLen = 32 };

inline void vst_strncpy(char* dst, const char* src, size_t n) { strncpy(dst, src, n); dst[n] = 0; }
#ifdef __wasm__
// No printf in the wasm builds (it drags in stdio): same text as "%f"/"%d", cut to n characters.
inline void float2string(float v, char* text, VstInt32 n) {
  char b[64]; int i = 0; double d = v;
  if (d != d) { vst_strncpy(text, "nan", n); return; }
  if (d < 0) { b[i++] = '-'; d = -d; }
  if (d > 1e15) { vst_strncpy(text, b[0] == '-' ? "-inf" : "inf", n); return; }
  d += 0.0000005;
  unsigned long long whole = (unsigned long long)d; double frac = d - (double)whole;
  char w[24]; int k = 0; do { w[k++] = (char)('0' + whole % 10); whole /= 10; } while (whole);
  while (k) b[i++] = w[--k];
  b[i++] = '.';
  for (int j = 0; j < 6; j++) { frac *= 10; int digit = (int)frac; b[i++] = (char)('0' + digit); frac -= digit; }
  b[i] = 0; vst_strncpy(text, b, n);
}
inline void int2string(VstInt32 v, char* text, VstInt32 n) {
  char b[16]; int i = 0; long long u = v; if (u < 0) { b[i++] = '-'; u = -u; }
  char w[12]; int k = 0; do { w[k++] = (char)('0' + u % 10); u /= 10; } while (u);
  while (k) b[i++] = w[--k];
  b[i] = 0; vst_strncpy(text, b, n);
}
#else
inline void float2string(float v, char* text, VstInt32 n) { snprintf(text, (size_t)n + 1, "%f", v); }
inline void int2string(VstInt32 v, char* text, VstInt32 n) { snprintf(text, (size_t)n + 1, "%d", v); }
#endif
inline void dB2string(float v, char* text, VstInt32 n) {
  if (v <= 0) vst_strncpy(text, "-oo", n); else float2string((float)(20. * log10(v)), text, n);
}

// The harness sets this before constructing a plugin; every plugin reads it via getSampleRate().
extern double g_refSampleRate;

class AudioEffect {
public:
  virtual ~AudioEffect() {}
};

class AudioEffectX : public AudioEffect {
public:
  AudioEffectX(audioMasterCallback, VstInt32, VstInt32) {}
  double getSampleRate() { return g_refSampleRate; }
  void setNumInputs(VstInt32) {}
  void setNumOutputs(VstInt32) {}
  void setUniqueID(VstInt32) {}
  void canProcessReplacing(bool = true) {}
  void canDoubleReplacing(bool = true) {}
  void programsAreChunks(bool = true) {}
  virtual void setParameter(VstInt32, float) {}
  // ClipOnly has no knobs at all and declares none of these.
  virtual float getParameter(VstInt32) { return 0.f; }
  virtual void getParameterName(VstInt32, char*) {}
  virtual void getParameterLabel(VstInt32, char*) {}
  virtual void getParameterDisplay(VstInt32, char*) {}
  virtual void processReplacing(float**, float**, VstInt32) = 0;
};
