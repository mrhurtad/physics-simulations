# Stellar Evolution Explorer

An interactive, browser-based simulator for teaching how stars evolve, from the main sequence to their final fate. It shows a star's track on the Hertzsprung–Russell (H–R) diagram, animates the star next to the Sun, and lists every stage of its life.

It was built for introductory astronomy courses and is inspired by [Star in a Box](https://www.starinabox.net).

## Features

- **Eight initial masses:** 0.5, 1, 2, 5, 10, 20, 30, and 40 M☉. These cover low-mass, intermediate-mass, and high-mass stars, including two that end as neutron stars (10 and 20 M☉) and two that end as black holes (30 and 40 M☉).
- **H–R diagram** with isoradius lines, the main-sequence band, a color strip by temperature, and the track drawn in stage colors as the star evolves.
- **Star view:** the star's size and color compared with the Sun, including the planetary nebula, the supernova, and the neutron star or black hole remnant.
- **Live readouts:** age, luminosity, surface temperature, radius, mass, and color.
- **Inside the star:** an animated cutaway that shows the internal structure at each stage — the hydrogen-fusing core, the inert or degenerate helium core, the hydrogen- and helium-fusing shells, the carbon–oxygen core, the runaway helium flash, the exposed core of a planetary nebula, the white dwarf, and the "onion" shells and iron core of a massive star before it explodes. Fusing layers glow.
- **Stage labels on the H–R diagram** mark where each stage begins (they can be turned off).
- **Stages table** that fills in as the star evolves: each stage appears when the star reaches it, with its start age, and its duration is shown once the stage is over. Click a row to jump back to it.
- **Controls:** play and pause (or the space bar), speed, a timeline scrubber, and click-to-jump on the H–R diagram.
- **Show all tracks** to compare masses on one diagram.
- **Download data (CSV)** for the current star, for use in labs and spreadsheets.

## Using it

Open `index.html` in any modern browser. There is nothing to install and no internet connection is needed.

This simulation is part of the [physics-simulations](../) collection and is served by GitHub Pages at `stellar-evolution/`.

## About the models

The evolutionary tracks are **simplified, schematic models built for teaching**. They are keyframes based on standard stellar-evolution results for solar metallicity and are interpolated smoothly; they are not the output of a stellar-structure code. Ages, luminosities, and temperatures are approximate, and some phases (for example, the blue loop or mass-loss rates) vary considerably between real models.

Other simplifications:

- Radius is computed from the Stefan–Boltzmann law, R/R☉ = √(L/L☉) / (T/5772 K)².
- The cutaway is not to scale: the cores and shells are enlarged so that they are visible.
- The star view uses a compressed size scale (r ∝ R^0.28) so that supergiants and white dwarfs fit on the same screen. The radius readout always shows the true value.
- The animation speed follows the stages, not real time, so that brief phases such as the helium flash or the planetary nebula are visible. The age readout and the stages table always show the real ages.

## License

Released under the MIT License. You are free to use and adapt it for teaching.
