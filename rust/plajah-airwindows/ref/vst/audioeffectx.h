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

typedef int32_t VstInt32;
typedef void* audioMasterCallback;
enum VstPlugCategory { kPlugCategUnknown = 0, kPlugCategEffect, kPlugCategRoomFx };
enum { kVstMaxProgNameLen = 24, kVstMaxParamStrLen = 8, kVstMaxVendorStrLen = 64, kVstMaxProductStrLen = 64, kVstMaxEffectNameLen = 32 };

inline void vst_strncpy(char* dst, const char* src, size_t n) { strncpy(dst, src, n); dst[n] = 0; }
inline void float2string(float v, char* text, VstInt32 n) { snprintf(text, (size_t)n + 1, "%f", v); }
inline void int2string(VstInt32 v, char* text, VstInt32 n) { snprintf(text, (size_t)n + 1, "%d", v); }
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
  virtual void processReplacing(float**, float**, VstInt32) = 0;
};
