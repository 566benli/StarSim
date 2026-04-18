# MESA Reference & Our Physics

Genesis Error keeps its own physics module for real-time simulation while drawing conceptual inspiration from **MESA** (Modules for Experiments in Stellar Astrophysics).

## What We Keep (Our Essence)

- **Simplified mass–luminosity–radius–temperature relations** – power laws suitable for real-time evolution
- **Phase-based evolution** – main sequence → subgiant → red giant → remnant, with duration scaling
- **N-body gravity** – full gravitational dynamics, no simplification
- **Orbital mechanics** – vis-viva, eccentricity, inclination

## MESA vs Our Relations

| Relation | Our model | MESA / observations |
|----------|-----------|---------------------|
| L(M) | Power laws by mass regime | Detailed opacity, nuclear networks |
| T(M) | Stefan–Boltzmann L ∝ R²T⁴ | Non-gray atmospheres |
| R(M) | M^0.8 (low), M^0.57 (high) | Convection, mixing length |
| Lifetime | t ∝ M/L | Full stellar evolution tracks |

Our relations are **qualitatively correct** and suitable for interactive simulation. MESA provides numerically converged tracks for research.

## HR Diagram

The HR diagram in Genesis Error uses our `mainSequenceLuminosity` and `mainSequenceTemperature` to draw the reference main sequence. Individual stars are plotted at their evolved (T, L). This matches our simulation physics.

## References

- [MESA](http://mesa.sourceforge.net/) – stellar evolution code
- Paxton et al., ApJS 192, 3 (2011) – MESA I
