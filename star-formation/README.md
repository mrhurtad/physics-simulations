# Protostar Formation: From Molecular Cloud to Protoplanetary Disk

An interactive PH1600 — Introduction to Astronomy laboratory for Michigan
Technological University. All instructional content is in English. Planet
formation is intentionally outside this version.

## Run locally

From the repository root:

```sh
python3 -m http.server 8000
```

Open http://localhost:8000/star-formation/ in a modern browser. To reproduce the
GitHub Pages prefix, serve the parent of the `physics-simulations` directory and
open `/physics-simulations/star-formation/` instead. HTTP is required for ES modules
and the module Web Worker; opening `index.html` as `file://` will not work.

No build, backend, npm install, remote fonts, rendering library, or CDN is required.
All runtime assets use relative URLs. GitHub Pages serves `.mjs` as JavaScript.
The homepage registers the simulator in its existing `SIMS` array, with English
and Spanish listing text. No other simulation is changed.

## Classroom use

1. Choose a preset or set mass, effective gravity, temperature, and angular velocity.
2. Press Play. Use 0.5×, 1×, 2×, or 5× playback; 1× targets 2 kyr per real second.
3. Compare experiments at equal **physical** times (100 kyr is a useful checkpoint).
4. Use the fixed Cloud view to observe contraction; Core ×4 and Disk ×10 reveal
   smaller structures. Auto zoom follows the remaining gas; always read its AU scale.
5. Drag the view to rotate it in 3D, or choose inclined, top-down, or edge-on views
   (edge-on shows the flattening disk best). Double-click resets the camera. *Orbit
   camera* slowly circles the cloud for projection in class. The small x–y–z triad
   keeps orientation; z is the initial spin axis. Space bar plays/pauses.
   Vectors show velocity multiplied by 1.5 kyr at the current camera scale. Trails
   contain recent computed positions, not extrapolated paths.
6. Use *Record observation* to fill the observation notebook, and download the
   observations and the physical time series as CSV before leaving the tab.
   The class activity is distributed separately and is not part of this page.

Changing a physical slider or preset initializes a new paused experiment with
identical deterministic positions. Reset does the same while retaining controls,
visual preferences, playback speed, and the observation notebook. Visual settings
never enter the solver. Pause freezes physics. Runs stop at 250 kyr.

## Numerical model

This is a deliberately coarse **three-dimensional SPH-inspired isothermal gas
model with one central sink**, not a research-grade hydrodynamics/MHD solver.
There are no scripted trajectories, stage timers, prescribed disk shapes, or
forced orbital velocities. All presets use exactly the same equations.

### Units and initial state

Internal units are 1 solar mass, 1,000 AU, and 1 kyr. Constants are converted from
SI in `model.mjs`:

- `G ≈ 0.039478` in (1,000 AU)³ M☉⁻¹ kyr⁻²; the slider multiplies G in every
  gravitational acceleration, binding check, and Jeans diagnostic.
- Density unit: about `5.94 × 10⁻¹³ kg m⁻³`.
- Angular momentum unit: `M☉ (1,000 AU)² / kyr`, converted to kg m²/s on screen.
- Molecular sound speed: `c_s = sqrt(k_B T / (2.33 m_H))`.
- Fixed cloud radius: **5,000 AU**. Mass range: **0.5–4 M☉**; temperature: **8–50 K**;
  gravity multiplier: **0.25–2**; angular velocity: **0–0.025 kyr⁻¹**.
- 512 equal-mass gas elements sample `M(<r) ∝ r²`, corresponding to `rho ∝ 1/r`.
  The finite innermost sampling radius and kernel regularize the central density.
  Deterministic quasi-uniform directions and antipodal partners give exactly zero
  initial bulk position/momentum with small sampling perturbations. Changing a
  physical slider does not change sampling or radius. Velocities are initialized
  as `v = omega × r` about the z axis. There is no initial random velocity jitter.

### Gravity

Each unordered pair is evaluated once, with equal and opposite forces:

```
a_i = -G_eff Σ_j m_j (r_i - r_j) / (|r_i-r_j|² + epsilon²)^(3/2)
```

Plummer softening is **60 AU**. Gas–gas and gas–sink interactions use the same
softening and include reaction forces; the sink can move. Direct pair summation
is O(N²), practical for 512 elements, with no spatial boundary or particle deletion.

### Density, pressure, and dissipation

A normalized 3D cubic spline estimates density:

```
rho_i = Σ_j m_j W(|r_i-r_j|, h_i)
W = [1/(pi h³)] × {1 - 1.5q² + 0.75q³,  0 ≤ q < 1
                   0.25(2-q)³,          1 ≤ q < 2
                   0,                  q ≥ 2},  q = r/h
P_i = c_s² rho_i
```

Smoothing lengths relax by 20% per step toward `1.2 (m/rho)^(1/3)` (roughly
58 neighbours in a uniform medium), with an **80–5,000 AU** allowed interval.
They start at 1,200 AU. The conservative symmetric pressure acceleration is:

```
a_i,pressure = -Σ_j m_j [c_s² grad W_ij(h_i)/rho_i
                       + c_s² grad W_ij(h_j)/rho_j
                       + Pi_ij (grad W_ij(h_i)+grad W_ij(h_j))/2]
```

For approaching pairs only, Monaghan artificial viscosity uses
`mu_ij = h_bar (v_ij·r_ij)/(r_ij² + 0.01 h_bar²)` and
`Pi_ij = (-c_s mu_ij + 2 mu_ij²)/rho_bar`. This dissipates converging motions and
allows gas to settle without imposing a flattening force. Dissipated heat is
assumed radiated immediately under the isothermal closure. Forces remain along
pair separations, preserving vector angular momentum. Adaptive `grad-h`
corrections are omitted; this is an explicit approximation. Energy is not
conserved or claimed to be conserved, since the gas cools isothermally and sinks
remove unresolved internal degrees of freedom.

### Integration and playback

Kick–drift–kick integration recomputes density and forces after the drift.
Velocity-dependent viscosity is evaluated using the intermediate velocity, so
this is not an exact time-reversible Hamiltonian integrator. The time step is:

```
dt ≤ min(0.2 kyr,
         0.16 sqrt(epsilon / |a_i|),
         0.16 h_i / (c_s + |v_i|))
```

For a sink, the last constraint uses epsilon instead of h. This conservative
absolute-speed limit also restricts fast converging pairs. Playback speed changes
how many substeps are requested per real second, never G, velocities, or the
allowed numerical time step. Physics runs in a Web Worker. A bounded work queue
and 12 ms work batches keep the main UI responsive; on slow devices the requested
wall-time rate can slow down. Snapshot delivery is approximately 10 Hz; rendering
has its own animation loop. Switching tabs cannot cause one enormous time step.

### Formation and accretion of a sink

A single central sink can form only from at least eight gas elements inside
**160 AU** of the center when all checks pass:

1. Aperture density exceeds the resolution-linked Jeans threshold
   `rho_threshold = pi c_s² / (4 G_eff r_sink²)`.
2. The aperture mass exceeds its Jeans mass
   `M_J = pi^(5/2) c_s³ / (6 G_eff^(3/2) sqrt(rho))`.
3. `Σ m r·v < 0`, so the central region is contracting.
4. `E_kinetic + (3/2) M c_s² + E_gravity < 0`, using pairwise softened potential
   energy within that region. Rotational kinetic energy is included.
5. No sampled core location has potential more than 2% deeper than the origin.
   This tolerance allows particle sampling noise around the central potential
   minimum. Only central formation is supported; off-center fragments are not sinks.

The accepted core is replaced with a sink at its center of mass, carrying its
mass, linear momentum, and unresolved internal angular momentum (spin). Subsequent
accretion requires a gas element within 160 AU, moving inward relative to the sink,
bound including thermal support, and with `j² < G_eff M_sink r_sink`. High angular
momentum gas therefore remains outside the sink. Every transfer updates sink
position, velocity, and spin, retaining the complete mass and angular momentum
budgets. There is no time condition in the formation or accretion logic.

This coarse sink stands for unresolved collapse and a protostar; it does **not**
resolve the physical birth of a stellar surface or first core. Its luminous marker
scales schematically with sink mass and is not a luminosity/temperature calculation.
Sustained hydrogen fusion is not modeled.

### Measured quantities and stage diagnostics

- R90: radius about the initial center enclosing 90% of the **remaining gas**.
  It can increase as inner gas accretes even if outer gas has not expanded.
- Central gas density: remaining gas mass inside the 160 AU aperture divided by
  its spherical volume; excludes the sink. It can be zero due to finite sampling
  initially, or fall after accretion. Peak smoothed gas density is also shown.
- Jeans indicator: compare 90% of remaining gas mass with M_J evaluated at its
  mean density within R90. This uniform-medium thermal diagnostic excludes the
  sink and does not encode rotation, nonuniform density, or boundary conditions.
- Total angular momentum: magnitude of the full gas+sink orbital vector plus
  sink spin. The vector, not merely its magnitude, is tested for conservation.
- Disk candidate elements: outside the sink aperture, `|z|/R < 0.35`, radial speed
  less than 0.6 of azimuthal speed, bound in a softened enclosed-mass approximation,
  and centrifugal/gravitational acceleration ratio between 0.45 and 1.6.
  Enclosed mass is used **only for this diagnostic**; forces use full pair gravity.
  Disk mass sums these elements; outer radius is their largest cylindrical radius.
  This selection is approximate and can include rotating envelope material.
- The centrifugal-radius display uses the remaining gas mass-weighted mean
  `|j_z|`, squared and divided by `G_eff M_sink`. It is a characteristic estimate,
  not an exact disk edge. The usual Keplerian limit is explained in the page.
- Stage 1: initial/support-dominated gas. Stage 2: contracting second moment and
  R90 below 92% of initial R90. Stage 3: peak gas density above 0.15 internal units
  (about `8.9 × 10⁻¹⁴ kg/m³`). Stage 4: an existing sink. Stage 5: an existing sink
  and disk candidate mass above 4% of initial mass. Stages are instantaneous
  descriptive diagnostics; they can recede and need not all be visited.
- Graph: measured sink mass versus physical time, sampled about every kyr.
  CSV additionally includes central aperture density and R90. No sink is explicitly
  indicated before formation. Gas and sink masses are independently displayed.

## Limitations and reliable interpretation

This model illustrates competing forces and qualitative trends, not quantitative
predictions for a particular observed core. At 512 elements, sink timing, disk
edges, viscosity-driven transport, and accretion rates are resolution dependent.
A few hundred AU cannot be treated as well-resolved stellar/inner-disk structure.
The sink accretion prescription removes everything in an accepted core at creation.
This and adaptive smoothing can affect the subsequent inner pressure profile.

Dispersed gas reaching the maximum smoothing length is flagged, as are disk
candidates containing fewer than 32 elements. High rotation warns about omitted
fragmentation. A nonfinite state or an excessively small step stops evolution with
an error rather than silently clipping velocities or inventing a result. Particles
outside the camera remain in the force calculation and mass budget.

Not included: radiative transfer, opacity changes/first-core thermodynamics,
magnetic fields, turbulent driving, external confining pressure, jets/outflows,
multiple sinks, detailed stellar evolution, or planet formation. Expansion of
warm clouds is expected for these isolated, unconfined initial conditions.
Numerical viscosity can spread a disk too rapidly; compare early evolution near
100 kyr and treat late-time disk sizes as qualitative. A thermally unstable label
alone is never proof that a star will form.

## Validation

A current Node.js runtime is sufficient; no npm packages are needed:

```sh
node star-formation/validate.mjs
node star-formation/validate.mjs --extremes --json
```

The second command also runs all 16 corners of the four-control parameter space
through 250 kyr, extends all five presets to 250 kyr, and writes
`star-formation/validation-results.json`. Baseline runs compare at 25 kyr
checkpoints. Changing checkpoint partitions can change the final small step and
particle-scale details; the Web Worker uses a fixed substep policy independent of
playback speed. Exact repeat runs with the same policy are deterministic.

Measured baseline results at 100 kyr (512 gas elements):

| Experiment | Sink formation (kyr) | Sink mass (M☉) | Disk candidate mass (M☉) |
|---|---:|---:|---:|
| Standard: 2 M☉, G, 10 K, 0.008 kyr⁻¹ | 32.86 | 1.773 | 0.227 |
| Weak gravity: 0.25 G | none | 0 | 0 |
| High temperature: 50 K | none | 0 | 0 |
| Rapid rotation: 0.018 kyr⁻¹ | 35.70 | 1.031 | 0.711 |
| Low rotation: 0.001 kyr⁻¹ | 32.51 | 1.992 | 0.008 |
| Strong gravity: 2 G | 19.16 | 1.945 | 0.055 |
| Low mass: 0.5 M☉ | none | 0 | 0 |

The weak and warm presets remain without sinks through 250 kyr. Low rotation's
2-element disk candidate is explicitly unresolved; it is not evidence for a
resolved disk. The rapid case's outer candidate radius at 100 kyr is about
4,948 AU, versus 2,110 AU for standard and 630 AU for the unresolved low-rotation
candidate. These are model diagnostics, not calibrated astronomical predictions.

Tests verify normalized density kernel and SI conversion; cold collapse;
temperature, gravity, mass, and rotation effects; physical sink criteria;
post-formation accretion; deterministic sampling/evolution; finite states; mass
conservation to 1e-11 M☉; and full vector angular momentum and linear momentum
conservation to 1e-10 internal units, including transfers to sink spin. Halving the
maximum step to 0.1 kyr gives formation at 32.40 kyr and the same 1.773 M☉ sink mass
at 100 kyr (formation-time change about 1.4%). This is a time-step sensitivity
check, not a claim of spatial convergence.

Browser validation performed with headless Chrome at the real
`/physics-simulations/star-formation/` prefix: module/worker load, Play/Pause/Reset,
playback speed selection, physical sliders/presets, both visual toggles, camera
and zoom settings, CSV export, observation capture, 1500/768/390 px layouts, and
English/Spanish homepage navigation. No uncaught browser errors were observed.
The separately tested renderer has no access to the solver object: changing
visual settings cannot apply a force or mutate the physical state.

## Rendering (visual only)

The renderer never sends anything to the solver. Visual settings cannot apply a force.

- **Smooth motion:** the worker delivers computed states about 10 times per second.
  Frames between two states draw straight-line interpolations of positions, density
  and smoothing length, so every drawn position lies between two solver outputs
  (typically 1–5 time steps apart). The display therefore runs about one snapshot
  (~0.1 s wall time) behind the solver. Gas accreted during an interval is drawn
  moving to the sink and fading out over that interval.
- **3D view:** pinhole perspective about the cloud centre; the scale bar is exact in
  the plane through the centre facing the camera. Background stars sit at infinity
  and turn with the camera. Elements are depth-sorted: each draws a translucent dust
  layer that dims what lies behind it, then additive emission. Each element is also
  drawn as three faint sub-sprites placed inside its own smoothing kernel (fixed
  offsets in units of h) so the volume reads as continuous; they carry no mass.
- **Lighting:** after a sink forms, gas is tinted warm in proportion to
  `M_sink / r²` (distance to the sink), a schematic illumination cue, not radiative
  transfer. The protostar glow brightens briefly when the sink gains mass, and a
  ring marks the moment of sink formation; both follow measured events.
- **Jets (illustration):** optional bipolar jets are drawn along the sink's computed
  spin vector, with brightness tied to the measured 5 kyr accretion rate. Outflows
  are not part of the physics, and the canvas says so whenever jets are shown.
- **Performance:** glows use pre-rendered sprites. If frames get slow, the
  sub-sprites are dropped automatically; append `?hq` to the URL to keep them.
- **Accretion rate** in Live measurements is (sink mass now − sink mass ~5 kyr ago)
  / elapsed time, from the recorded history, in M☉/yr.

## Files

- `index.html`, `style.css`: accessible controls, readouts, observation notebook,
  scientific explanations, and responsive layout.
- `model.mjs`: pure numerical model, constants, and preset definitions.
- `worker.mjs`: time scheduling and physical-state snapshots.
- `app.mjs`: Canvas rendering, controls, graphs, and CSV notebook/export.
- `validate.mjs`, `validation-results.json`: reproducible tests and measured results.

## References

- [NASA / Webb — Exploring Star and Planet Formation](https://science.nasa.gov/asset/webb/exploring-star-and-planet-formation/): visual inspiration; no video is embedded.
- [Cossins, Smoothed Particle Hydrodynamics (2010)](https://arxiv.org/abs/1007.1245): kernel, pressure, and viscosity background.
- [FLASH documentation: sink particles](https://flash.rochester.edu/site/flashcode/user_support/flash_ug_devel/node139.html): resolution-linked Jeans density and bound/converging/unstable sink checks, citing Federrath et al. (2010). This simulator implements a simplified independent method; it does not use the FLASH solver or claim its resolution criteria are achieved.
