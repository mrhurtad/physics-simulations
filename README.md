# Physics Simulations

Interactive, browser-based simulations for introductory physics and astronomy (Michigan Technological University). Each simulation is a self-contained folder with its own `index.html`: no build step, no dependencies, nothing to install.

**Live site:** https://mrhurtad.github.io/physics-simulations/

## Simulations

| Topic | Simulation | Open it |
|---|---|---|
| Electricity | Coulomb's Law — Force Vector Explorer | [live](https://mrhurtad.github.io/physics-simulations/coulomb-law/) · [`coulomb-law/`](coulomb-law/) |
| Electricity | Electric Field Explorer | [live](https://mrhurtad.github.io/physics-simulations/electric-field/) · [`electric-field/`](electric-field/) |
| Electricity | Parallel Plates — Uniform Field | [live](https://mrhurtad.github.io/physics-simulations/parallel-plates/) · [`parallel-plates/`](parallel-plates/) |
| Electricity | Electric Current & Ohm's Law Explorer | [live](https://mrhurtad.github.io/physics-simulations/electric-current/) · [`electric-current/`](electric-current/) |
| Electricity | Circuit Builder | *coming soon* |
| Magnetism | Electromagnetic Induction Explorer | [live](https://mrhurtad.github.io/physics-simulations/electromagnetic-induction/) · [`electromagnetic-induction/`](electromagnetic-induction/) |
| Astronomy | Protostar Formation | [live](https://mrhurtad.github.io/physics-simulations/star-formation/) · [`star-formation/`](star-formation/) |
| Astronomy | Stellar Evolution Explorer | [live](https://mrhurtad.github.io/physics-simulations/stellar-evolution/) · [`stellar-evolution/`](stellar-evolution/) |

The landing page groups the simulations by topic and can be switched between English and Spanish.

## Adding a new simulation

1. Create a new folder at the repo root, for example `projectile-motion/`.
2. Put a self-contained `index.html` inside it (plain HTML/CSS/JS; a CDN import is fine, a build step is not, because GitHub Pages only serves files).
3. Add a link back to the landing page at the top of the simulation: `<a href="../">← Physics Simulations</a>`.
4. Add one entry to the `SIMS` array in the root `index.html`, following the existing examples. To announce a simulation before it is ready, add `soon: true`: the card is shown as "Coming soon" and is not a link.
5. Add a row to the table above.
6. Commit and push. GitHub Pages publishes the change automatically within a minute or two.

## Structure

```
/
├── index.html                  landing page, grouped by topic (EN / ES)
├── 404.html                    friendly "page not found" page
├── .nojekyll                   serve files as they are (no Jekyll processing)
├── README.md
├── coulomb-law/
├── electric-field/
├── parallel-plates/
├── electric-current/
├── electromagnetic-induction/
├── star-formation/             multi-file simulation (ES modules + web worker)
└── stellar-evolution/
```

## License

MIT. Attribution appreciated but not required.
