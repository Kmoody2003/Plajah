// One Airwindows plugin compiled from its ORIGINAL C++ to its own small wasm, behind the same
// flat aw_* ABI as the Rust crate so airwindows.worklet.js hosts both. Built per plugin by
// scripts/buildAirwindowsAll.mjs with -DPLUGIN=<Name>; the plugin's sources are unity-included.
//
// Extra exports (aw_param_*) read the plug-in's own names, defaults, units and readouts: the
// catalog is generated from them and the rack prints knob values through them.


#include <math.h>
#include "audioeffectx.h"


#define throw abort()    // setParameter's out-of-range default: unreachable, aw_set_param clamps
#define private public   // reach fpdL/fpdR so seeds can be pinned (std headers already in)
#define virtual          // so processDoubleReplacing, chunks etc. fall out of the vtable and get GC'd
#include PLUGIN_H
#undef virtual
#include PLUGIN_CPP
#include PLUGIN_PROC
#undef private
#undef throw

double g_refSampleRate = 48000.0;

// No libc++ in these builds (its operator new drags in stdio through its error paths).
void* operator new(size_t n) { return malloc(n); }
void operator delete(void* p) noexcept { free(p); }
void operator delete(void* p, size_t) noexcept { free(p); }
extern "C" void __cxa_pure_virtual() { abort(); }

template <class T> static auto seedOf(T* fx, uint32_t l, uint32_t r, int) -> decltype(fx->fpdL = l, fx->fpdR = r, void()) { fx->fpdL = l; fx->fpdR = r; }
template <class T> static void seedOf(T*, uint32_t, uint32_t, long) {}

static const int MAX_BLOCK = 512;
static float inL[MAX_BLOCK], inR[MAX_BLOCK], outL[MAX_BLOCK], outR[MAX_BLOCK];
static PLUGIN* fx = nullptr;
static char text[64];

extern "C" {
__attribute__((export_name("aw_abi_version"))) int aw_abi_version() { return 1; }
__attribute__((export_name("aw_kind_count"))) int aw_kind_count() { return 1; }
__attribute__((export_name("aw_init"))) int aw_init(int, float sampleRate, uint32_t seedL, uint32_t seedR) {
  g_refSampleRate = sampleRate;
  if (!fx) { awRandState() = seedL; fx = (PLUGIN*)createEffectInstance(nullptr); }
  seedOf(fx, seedL, seedR, 0);
  return kNumParameters;
}
__attribute__((export_name("aw_set_param"))) void aw_set_param(int i, float v) {
  if (fx && i >= 0 && i < kNumParameters) fx->setParameter(i, v < 0 ? 0 : v > 1 ? 1 : v);
}
__attribute__((export_name("aw_buf"))) float* aw_buf(int ch) { return ch == 0 ? inL : inR; }
__attribute__((export_name("aw_process"))) void aw_process(int frames) {
  if (!fx || frames <= 0 || frames > MAX_BLOCK) return;
  float* ins[2] = { inL, inR };
  float* outs[2] = { outL, outR };
  fx->processReplacing(ins, outs, frames);
  for (int i = 0; i < frames; i++) {
    inL[i] = isfinite(outL[i]) ? outL[i] : 0.f;
    inR[i] = isfinite(outR[i]) ? outR[i] : 0.f;
  }
}
__attribute__((export_name("aw_param_default"))) float aw_param_default(int i) { return fx->getParameter(i); }
__attribute__((export_name("aw_param_name"))) const char* aw_param_name(int i) { text[0] = 0; fx->getParameterName(i, text); return text; }
__attribute__((export_name("aw_param_label"))) const char* aw_param_label(int i) { text[0] = 0; fx->getParameterLabel(i, text); return text; }
__attribute__((export_name("aw_param_display"))) const char* aw_param_display(int i) { text[0] = 0; fx->getParameterDisplay(i, text); return text; }
}
