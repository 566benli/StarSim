# Stellar Reference Data

StarSim keeps its **own physics module** (`Star.js`, `math.js`) for real-time evolution. We augment visualization with reference data from published stellar evolution.

## Data Sources

| Use | Source | Notes |
|-----|--------|------|
| **HR diagram reference curves** | Hurley et al. (2000), Mamajek table | Analytical formulae; no MESA required |
| **Main sequence L(M), T(M)** | SSE (Single Star Evolution) fits | Hurley+2000, ~5% accuracy vs detailed models |
| **Red giant / WD tracks** | Schematic evolutionary paths | Illustrative for HR diagram regions |

## Our Physics vs Reference

- **Simulation**: `math.js` power laws (`mainSequenceLuminosity`, etc.) – fast, real-time
- **HR diagram**: `stellarReference.js` – Hurley-style tables for accurate placement
- **Evolution logic**: `Star.js` – our own phase transitions and timescales

All essences of stellar physics (mass–luminosity, Stefan–Boltzmann, lifetimes) are preserved; reference data enhances the HR diagram only.

## References

- Hurley, Pols & Tout (2000), MNRAS 315, 543 – analytical stellar evolution formulae
- Mamajek – empirical main sequence (solar neighborhood)
- SSE code: https://astronomy.swin.edu.au/~jhurley/stellar.html
