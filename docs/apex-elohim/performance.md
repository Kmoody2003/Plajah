# Apex Elohim performance targets

Target: 60 FPS (16.67 ms per frame), Intel Arc integrated graphics first. Keep the
same visible geometry, textures, lighting, weather and display resolution while
removing work that cannot contribute to the image.

## Hardware matrix

| Target | Current validation |
| --- | --- |
| Local Intel Arc integrated GPU, ANGLE D3D11, device 0x7D55 | Detected in the browser; initial scene is over budget. 60 FPS is not achieved. |
| Local NVIDIA RTX 4070 Laptop GPU | User-confirmed local target. Separate rendering benchmark still required. |
| AMD desktop and integrated GPUs | Shared WebGL2 path; hardware benchmark required. |
| Qualcomm Adreno, Windows ARM | Shared WebGL2 path; hardware benchmark required. |
| Qualcomm Adreno, Android ARM | Shared WebGL2 path; device, thermal and sustained-run benchmark required. |

GPU preference in Graphics requests the system-default, power-saving or
high-performance adapter and reloads. It does not guarantee which adapter the
browser/OS selects. The actual adapter appears under Performance. The URL can
also request `?gpu=low-power` or `?gpu=high-performance` for repeatable test runs.

## Implemented first pass

- Keep the existing city instance batches and original assets. Compact their
  visible instances against the union of the camera and shadow frusta. Shadow-only
  casters remain present. Re-upload matrices only when the visible list changes.
- Reuse each building placement for all of its mesh parts during construction.
- Skip the colour-grade copy pass when both the LUT and film lens are off.
- At zero speed blur, fetch the original chromatic-aberration samples once rather
  than averaging nine identical copies. Moving blur retains its original samples.
- Keep sparse lens rain in the existing cinematic pass, with a clear-lens fast
  path and a bounding-box rejection before expensive droplet refraction.
- Add local frame statistics, CPU submission time, asynchronous GPU timer queries,
  draw/triangle counts, texture/program counts and compression capabilities.
  Nothing is uploaded. GPU timer absence is reported rather than estimated.

No automatic resolution reduction, texture reduction, geometry simplification,
shadow removal or weather reduction has been enabled.

## Repeatable benchmark

1. Run the standalone game at `http://127.0.0.1:4332/region.html`.
2. Pick the GPU preference, then verify the actual adapter in Settings >
   Performance. Record output buffer size as well as the requested preference.
3. Let the city, car, trees and shaders finish loading. Keep the game foreground
   and visible. Do not compare a loading sample with a warmed sample.
4. Compare the same camera, weather and time of day: map overview; city start line
   in rain; city drive; dense forest; coastal drive; night/storm. Camera coordinates,
   weather and mode are included in the local report.
5. Use Record 10 seconds in Performance for frame median and p95. Also record GPU
   and CPU submission medians. CPU and GPU work overlap; do not add their times and
   call the result FPS. Browser background throttling is not a GPU measurement.
6. Repeat on each adapter. Capture the same view for visual comparison. A detected
   GPU family or a passing build is not proof of 60 FPS on that hardware.

Initial Arc observations included about 9.6 million submitted triangles and 1,036
draws in the overview, with GPU time above 16.67 ms. Subsequent samples had different
loading/visibility conditions and are not a controlled before/after speedup.

## Next work before declaring the target met

Measure scene/shadow and post-processing GPU costs separately. Address the largest
measured cost first. Validate distance/occlusion and shadow batching without losing
off-screen casters; measure texture bandwidth and alpha overdraw; compare native
output and image differences before adopting any LOD or compressed-texture changes.
Validate the RTX 4070 separately, followed by AMD and Qualcomm Windows/Android.
