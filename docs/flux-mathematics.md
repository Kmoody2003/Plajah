# Flux mathematical collection

## Platform availability

All twelve studies and Mathematical Odyssey have persisted VisualizerMode identifiers and bidirectional Flux mappings. The shared Flux platform catalog feeds Pixels scene rails, generator libraries and output views, the universal preset shelf, FX Stage, and Ambo visualizer/template pickers. Discover lists every built Flux preset. DJ Studio already enumerates the underlying Flux scene catalog. Fabula's generator list, live SceneView monitor, shared preview tiles, and offline export also route these platform modes to the real Flux renderer. Ambo and offline exports use the richer music sampler so frequency forces, vocal/harmonic estimates, and transient direction are available beyond the test gallery. Existing FX Stage Flux preset indices remain unchanged.

The gallery is `/flux-gallery.html`. Upload MP3, WAV or M4A, or play the generated test groove. Audio stays in the local browser. Twelve generators are registered in the shared Flux catalog, with a thirteenth scene, Mathematical Odyssey, that visits them all. Every scene now uses 114,688 GPU particles across a source manifold and three emitted depth layers, with additive spectral light and the existing Flux bloom pipeline.

## Implemented equations

Angles a and b sample a common particle domain. h=2π(t mod 24)/24 is the looping phase. Audio deformations are applied after the base map, preserving silence animation. Parameters are deliberately bounded to prevent projection singularities.

| Generator | Base construction | Visual character |
|---|---|---|
| Neon Knot | ((2.2+.72 cos(5a+h)) cos(3a), (2.2+.72 cos(5a+h)) sin(3a), .72 sin(5a+h)), plus a small circular filament | Braided (3,5) torus knot |
| Hopf Halo | q=(cos η cos a, cos η sin a, sin η cos(a+ψ), sin η sin(a+ψ)); p=1.25 q.xyz/(1−q.w), η=.52+.20 cos b, ψ=b+h | Linked fibres on a band of S³ projected into 3D |
| Clifford Dream | q=(cos a,sin a,cos b,sin b)/√2; rotate xz and yw; p=1.8 q.xyz/(1.45−q.w) | Four-dimensional torus; offset perspective projection for bounded framing |
| Superformula Bloom | r(θ)=(abs(cos(mθ/4))²+abs(sin(mθ/4))²)^(−1/n); spherical product of two radii | Gielis-derived lobes; base clamped for stable particles |
| Klein Mirage | w=cos(a/2)sin b−sin(a/2)sin(2b); p=((2+w)cos a,(2+w)sin a,sin(a/2)sin b+cos(a/2)sin(2b)) | Figure-eight immersion of a Klein bottle |
| Möbius Ribbon | p=((2+w cos(a/2))cos a,(2+w cos(a/2))sin a,w sin(a/2)) | One-sided ribbon |
| Enneper Portal | p=.95(x−x³/3+xy²,y−y³/3+yx²,x²−y²) | Polynomial minimal-surface saddle |
| Harmonic Chrysalis | r=1.65+.55 sin(5a+h)sin²θ+.35 cos(6θ−h), p=r(sinθ cos a,sinθ sin a,cosθ) | Spherical Fourier radial sculpture, not an eigenfunction spherical harmonic |
| Rhodonea Nebula | r=2.8 cos(7a+h)(.2+.8v), p=(r cos a,r sin a,.65 sin(b+h)sin(7a)) | Layered seven-petal polar rose |
| Hypnotic Spirograph | p=.55(4cos a+d cos4a,4sin a−d sin4a,sin(b+h)) | Closed rolling-circle hypotrochoid with R=5,r=1 |
| Chladni Cathedral | f=cos(3x)cos(5y)−cos(5x)cos(3y); blend with modes (2,7); opacity exp(−8abs(f)) | Nodal interference lace; artistic standing-wave model |
| Recursive Silk | F(q)=Σ 2^(−j−1)sin(qj.x)cos(qj.y); nested vector fields w=F₂(q), z=F₂(q+3w), height=F(q+4z) | Four-octave analytic domain warping |

These are twelve different maps, although some share trigonometric building blocks. The two 4D projection families are related geometrically, but Hopf renders linked circle fibres and Clifford renders a rotating torus product.

Sixteen logarithmic FFT regions spanning 30 Hz–16 kHz exert local forces on patches of each manifold. Fast attacks and local onset impulses drive buckling and detached jets. The source is a dense 256×256 particle manifold; detached particles are confined to the three emission layers. A smooth high-energy gate keeps those emissions quiet in restrained passages, and source deformation is capped below the emitted layers. Bass breathes and generates pressure waves; kick attacks deliver a separate fast-decaying whole-form punch; snares make brief fine ripples and luminous seams; mids torque the volume; vocal estimates create broad depth currents; estimated harmonic concentration and pitch-class color alter the woven symmetry and palette. Treble and local frequencies illuminate emitted particles. Harmony and voice are spectral estimates, not separated audio stems. Hosts that supply only three bands retain visible forces through a fallback band mapping. Vocals use the existing estimated vocal signal, not source-separated stems.

Three evolving copies of the mathematical pattern propagate outward from the source through space toward and past the active camera, with birth-phase offsets and fades. These are analytic force fields and emissions, not a numerical fluid simulation. The existing Flux director runs its full push, tight, orbit, crane, snap, and Dutch-angle shot repertoire; these scenes are unlocked 3D volumes. The source and emitted layers share the driven deformation and spectral color field.

The mathematical collection now opts into an expanded cinematic director. Fast/slow energy contrast identifies builds; detected snare attacks cut a montage of macro, Dutch, truck, rack-focus, orbit, and crane shots. An armed build resolves on a strong bass transient into a flythrough or establishing shot; a falling-energy breakdown resets to a landscape wide. Steady sections visit all nine shot types at a calmer pace. Cooldowns prevent repeated drop and breakdown cuts. This is an energy/onset heuristic rather than a semantic song-section classifier. Other Flux collections retain their existing director behavior.

Focus pulls use particle depth to enlarge and soften out-of-focus points while moving the focal plane between emitted layers and the source. Background optics add warm/cool edge leaks, a world-anchored flare with anamorphic streak, and three faint lens ghosts. Their intensity follows an approximately 1.8-second music envelope, and bright foreground geometry masks them so they support rather than obscure the form.

Moving optical fields now cycle and crossfade through six leak families: amber edge washes, blue anamorphic beams, prismatic halos, magenta ribbons, soft jade veils, and golden starbursts. Screen, additive, and soft-light-style tint blends also crossfade. The same projected field is evaluated by the particle shader, applying restrained local displacement and color changes, with stronger displacement on emitted layers than on the source. Slow music energy controls vibrancy; the cycle remains periodic for fixed-camera geometry loop checks.

## Morph behavior

Individual studies repeat their base geometry and emission movement every 24 seconds. Odyssey holds each map for 45% of its segment, then smoothly interpolates particle positions into the next map with cubic easing. The entire geometry journey repeats every 288 seconds. This is a visual homotopy between sampled maps, not a proof that their topology is equivalent. Audio follows the track and the camera director follows its shot history, so the final directed picture does not have a guaranteed 24-second loop. Geometry loop verification fixes the camera and supplies silence.

## Research sources and broader equation bank

Original geometry references and research catalogs:

- [Paul Bourke: supershapes and superformula](https://www.paulbourke.org/geometry/supershape/)
- [Paul Bourke: spherical radial constructions](https://paulbourke.net/geometry/sphericalh/) (the author distinguishes these from true spherical harmonic eigenfunctions)
- [Paul Bourke: fractals and chaotic systems](https://paulbourke.net/fractals/)
- [Dave Pagurek: vertex shader domain warping](https://www.davepagurek.com/content/images/2024/05/Vertex_Shader_Domain_Warping.pdf)
- [Paul Bourke: Clifford attractors](https://paulbourke.net/fractals/clifford/index.html)
- [Paul Bourke: Ikeda map](https://paulbourke.net/fractals/ikeda/)
- [Paul Bourke: Rössler attractor](https://paulbourke.net/fractals/rossler/)
- [Paul Bourke: Mandelbrot](https://paulbourke.org/fractals/mandelbrot/)
- [Paul Bourke: Burning Ship](https://paulbourke.net/fractals/burnship/)
- [Paul Bourke: Mandelbulb](https://paulbourke.org/fractals/bulb/)
- [Paul Bourke: Buddhabrot](https://paulbourke.org/fractals/buddhabrot/index.html)

The following are additional candidates, **not implemented generators**. They broaden the collection beyond parametric surfaces. Chaotic trajectories require integration or bounded iteration; exact visual loops need periodic parameter paths or cached orbit crossfades rather than assuming chaos repeats.

| Candidate | Equation / mechanism | Opportunity |
|---|---|---|
| Lorenz | x'=σ(y−x), y'=x(ρ−z)−y, z'=xy−βz | Double-wing smoke sculpture |
| Rössler | x'=−y−z, y'=x+ay, z'=b+z(x−c) | Coiling vortex ribbon |
| Aizawa | x'=(z−b)x−dy, y'=dx+(z−b)y, z'=c+az−z³/3−(x²+y²)(1+ez)+fzx³ | Torus inside a chaotic cage |
| Thomas | x'=sin y−bx, y'=sin z−by, z'=sin x−bz | Symmetric labyrinth cloud |
| Duffing | x'=y, y'=x−x³−δy+γ cos(ωt) | Oscillating chaotic veil |
| De Jong | xnext=sin(ay)−cos(bx), ynext=sin(cx)−cos(dy) | Delicate orbit lace |
| Clifford attractor | xnext=sin(ay)+c cos(ax), ynext=sin(bx)+d cos(by) | Folded probability silk; distinct from Clifford torus |
| Hopalong | xnext=y−sign(x)√abs(bx−c), ynext=a−x | Discontinuous chaotic filigree |
| Ikeda | θ=.4−6/(1+x²+y²); xnext=1+u(x cosθ−y sinθ), ynext=u(x sinθ+y cosθ) | Curled optical map |
| Hénon | xnext=1−ax²+y, ynext=bx | Ribbon fractal |
| Julia | znext=z²+c | Breathing fractal islands |
| Multibrot | znext=z^p+c | Symmetric fractal temples |
| Burning Ship | znext=(abs(Re z)+i abs(Im z))²+c | Angular fractal architecture |
| Newton basins | znext=z−f(z)/f'(z) | Branching convergence mosaics |
| Buddhabrot | Accumulate escaping Mandelbrot orbit density | Nebular orbit sculpture |
| Mandelbulb | Spherical-power iteration pnext=p^n+c | Volumetric fractal cathedral |
| Gyroid approximation | sin x cos y+sin y cos z+sin z cos x=0 | Infinite porous lattice; nodal approximation to the minimal surface |
| Schwarz P approximation | cos x+cos y+cos z=0 | Periodic cubic caverns |
| Schwarz D approximation | sin x sin y sin z+sin x cos y cos z+cos x sin y cos z+cos x cos y sin z=0 | Diamond labyrinth |
| Catenoid | (cosh v cos u,cosh v sin u,v) | Minimal-surface throat |
| Helicoid | (v cos u,v sin u,cu) | Infinite spiral sheet |
| Dini surface | (a cos u sin v,a sin u sin v,a(cos v+ln tan(v/2))+bu) | Twisted trumpet; bound away from v=0 |
| Lissajous | (sin(at+δ),sin bt,sin ct) | Rational-frequency woven orbits |
| Epicycloid | ((R+r)cos t−r cos((R+r)t/r),(R+r)sin t−r sin((R+r)t/r)) | Cusped rolling-circle mandalas |
| Gray–Scott | u'=Du∇²u−uv²+F(1−u), v'=Dv∇²v+uv²−(F+k)v | Reaction–diffusion coral; stateful simulation |
| Kuramoto | θi'=ωi+(K/N)Σsin(θj−θi) | Synchronizing particle choirs |
| Complex exponential | z=exp(x+iy) | Logarithmic spiral tunnels |
| Quasicrystal interference | I(p)=Σcos(kj·p+h), equally spaced wave-vector directions | Aperiodic fivefold or sevenfold moiré |

This bank contains 40 constructions including the twelve shipped maps. The most promising next step for stronger structural variety is a density-rendered chaotic family, a ray-marched implicit-surface family, and a reaction–diffusion simulation family.

