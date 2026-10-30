// Reference renderer: the ORIGINAL Airwindows C++ for one plugin, driven exactly the way the
// Rust port is driven in tests/reference.rs — same test signal, same 128-frame blocks, same
// dither seeds — so the two outputs can be compared sample for sample.
//
//   ref_<Name>.exe <sampleRate> <frames> <out.f32> <seedL> <seedR> [p0 p1 ...]
//
// Writes interleaved f32 frames [inL, inR, outL, outR]. Built by ref/build.ps1.
#include <set>
#include <string>
#include <vector>
#include "audioeffectx.h"
#define private public   // reach fpdL/fpdR so the seeds match the port's (std headers already in)
#include PLUGIN_HEADER
#undef private

double g_refSampleRate = 48000.0;
AudioEffect* createEffectInstance(audioMasterCallback audioMaster);

// Deterministic, deliberately nasty: sines, a pitched kick, LCG noise bursts, a level ramp past
// full scale, and a stretch of true silence (exercises the denormal guard and reverb tails).
static void testSignal(std::vector<float>& l, std::vector<float>& r, double sr) {
  const size_t n = l.size();
  uint32_t lcg = 0x12345678u;
  for (size_t i = 0; i < n; i++) {
    const double t = (double)i / sr;
    const double frac = (double)i / (double)n;
    double s = 0.0, u = 0.0;
    if (frac < 0.7) {
      const double ramp = 0.05 + 1.25 * frac / 0.7;
      s = ramp * (0.6 * sin(2.0 * 3.141592653589793 * 110.0 * t) + 0.3 * sin(2.0 * 3.141592653589793 * 1733.0 * t));
      u = ramp * (0.6 * sin(2.0 * 3.141592653589793 * 165.0 * t) + 0.3 * sin(2.0 * 3.141592653589793 * 5011.0 * t));
      const double beat = fmod(t, 0.25);
      const double kick = exp(-beat * 18.0) * sin(2.0 * 3.141592653589793 * (50.0 + 140.0 * exp(-beat * 40.0)) * beat);
      s += 0.8 * kick; u += 0.8 * kick;
      if (fmod(t, 0.5) > 0.42) {
        lcg = lcg * 1664525u + 1013904223u; s += 0.4 * ((double)(lcg >> 8) / 8388608.0 - 1.0);
        lcg = lcg * 1664525u + 1013904223u; u += 0.4 * ((double)(lcg >> 8) / 8388608.0 - 1.0);
      }
    }
    l[i] = (float)s; r[i] = (float)u;
  }
}

int main(int argc, char** argv) {
  if (argc < 6) { fprintf(stderr, "usage: sr frames out seedL seedR [params]\n"); return 2; }
  g_refSampleRate = atof(argv[1]);
  const int frames = atoi(argv[2]);
  const char* outPath = argv[3];
  const uint32_t seedL = (uint32_t)strtoul(argv[4], 0, 10), seedR = (uint32_t)strtoul(argv[5], 0, 10);

  PLUGIN* fx = (PLUGIN*)createEffectInstance(0);
  fx->fpdL = seedL; fx->fpdR = seedR;
  for (int p = 6; p < argc; p++) fx->setParameter(p - 6, (float)atof(argv[p]));

  std::vector<float> inL(frames), inR(frames), outL(frames), outR(frames);
  testSignal(inL, inR, g_refSampleRate);
  const int block = 128;
  for (int off = 0; off < frames; off += block) {
    const int n = frames - off < block ? frames - off : block;
    float* ins[2] = { &inL[off], &inR[off] };
    float* outs[2] = { &outL[off], &outR[off] };
    fx->processReplacing(ins, outs, n);
  }
  FILE* f = fopen(outPath, "wb");
  if (!f) return 3;
  for (int i = 0; i < frames; i++) { float fr[4] = { inL[i], inR[i], outL[i], outR[i] }; fwrite(fr, sizeof(float), 4, f); }
  fclose(f);
  delete fx;
  return 0;
}
