# Physics Simulations

Interactive, browser-based simulations for introductory physics. Each one is a
self-contained folder with its own `index.html` — no build step, no
dependencies, nothing to install.

**Live site:** https://USERNAME.github.io/REPO/

## Simulations

| Topic | Simulation | Folder |
|---|---|---|
| Electricity | Coulomb's Law — Force Vector Explorer | [`coulomb-law/`](coulomb-law/) |
| Electricity | Electric Field Explorer | [`electric-field/`](electric-field/) |
| Electricity | Parallel Plates — Uniform Field | [`parallel-plates/`](parallel-plates/) |

## Adding a new simulation

1. Create a new folder at the repo root, e.g. `projectile-motion/`.
2. Put a self-contained `index.html` inside it (plain HTML/CSS/JS; a CDN
   import is fine, a build step is not — GitHub Pages just serves files).
3. Add one entry to the `SIMS` array at the top of the `<script>` block in
   the root `index.html`, following the existing example.
4. Commit and push. GitHub Pages picks it up automatically — no separate
   deploy step.

## Structure

```
/
├── index.html          landing page listing every simulation
├── README.md
├── coulomb-law/
│   └── index.html
├── electric-field/
│   └── index.html
└── parallel-plates/
    └── index.html
```

## License

MIT. Attribution appreciated but not required.
