# Genesis Error - Interactive Cosmic Simulator

An interactive stellar evolution and cosmic exploration simulator. Create stars, planets, and black holes, then watch them evolve over billions of years. Dive inside celestial bodies with Explorer Mode, and chat with an AI assistant about the cosmos.

## Features

### Creation System
- **Choose from 15+ presets**: Red dwarfs, Sun-like stars, blue giants, red supergiants, white dwarfs, neutron stars, black holes, Earth-like worlds, gas giants, hot Jupiters, and more
- **Tunable parameters**: Mass, radius, temperature, luminosity, orbital distance, eccentricity, spin, and more — all with interactive sliders
- **Randomize**: Let the universe surprise you with random parameters
- **Fun facts**: Every object comes with educational astronomy tidbits

### Simulation Engine
- **N-body gravity**: Velocity Verlet (leapfrog) integration for accurate, energy-conserving orbital dynamics
- **Stellar evolution**: Stars evolve through main sequence → subgiant → red giant → white dwarf / supernova → neutron star / black hole
- **Planetary physics**: Atmosphere evolution, habitability checks, equilibrium temperatures, even abiogenesis probability
- **Black hole physics**: Schwarzschild radius, Kerr spin, accretion disks, ISCO, Hawking radiation, jet power
- **Collision detection**: Bodies can merge when they get close enough

### Time Control
- **Time arrow**: Scrub from real-time to 1 billion years per second
- **Preset speeds**: Quick-select common time scales
- **Logarithmic slider**: Fine-grained continuous control

### Explorer Mode
- **First-person flight**: Fly through space near any celestial body
- **Interior exploration**: Dive into stars and planets! See the convection zone, radiative zone, and core
- **Real-time data**: Temperature, density, and pressure update as you explore different layers
- **WASD controls**: Intuitive movement with sprint and vertical controls

### Random Cosmic Events
- Solar flares, coronal mass ejections
- Supernovae (for massive stars)
- Asteroid impacts, volcanic eruptions
- Rogue objects, gravitational waves
- Tidal disruption events near black holes
- Toast-style notifications for each event

### AI Assistant
- **Chat interface**: Ask questions about the simulation, astronomy, or get experiment suggestions
- **Context-aware**: The AI knows the current state of your simulation
- **LLM-powered**: Connects to OpenAI-compatible APIs (works offline with built-in responses too)
- **Action commands**: The AI can suggest simulation changes

### Visuals
- **Procedural star surfaces**: GLSL shaders with turbulence, granulation, limb darkening, and flares
- **Black hole rendering**: Event horizon, accretion disk with temperature gradients and Doppler beaming
- **Bloom post-processing**: Stars glow realistically
- **Orbit trails**: See the paths bodies trace through space
- **10,000-star background**: Procedural starfield with color variety

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Electron (Steam-ready) |
| **3D Rendering** | Three.js with custom GLSL shaders |
| **UI Framework** | React 19 |
| **State Management** | Zustand |
| **Post-processing** | Three.js EffectComposer (Unreal Bloom) |
| **AI Integration** | OpenAI-compatible API (configurable) |
| **Build Tool** | Webpack 5 |
| **Physics** | Custom N-body solver (Velocity Verlet) |

## Project Structure

```
Genesis Error/
├── electron/               # Electron main process
│   ├── main.js             # Window management, IPC
│   └── preload.js          # Context bridge
├── src/
│   ├── engine/             # Simulation core
│   │   ├── SimEngine.js    # Master simulation controller
│   │   ├── CelestialBody.js # Base class for all bodies
│   │   ├── Star.js         # Star with evolution
│   │   ├── Planet.js       # Planet with atmosphere & orbit
│   │   ├── BlackHole.js    # Black hole with Kerr physics
│   │   └── GravitySystem.js # N-body gravity solver
│   ├── renderer/           # Three.js visuals
│   │   ├── SceneManager.js  # Scene, camera, post-processing
│   │   └── ExplorerCamera.js # First-person explorer
│   ├── ui/                 # React UI
│   │   ├── App.jsx         # Main app orchestrator
│   │   ├── store.js        # Zustand global state
│   │   └── components/     # UI components
│   │       ├── CreationPanel.jsx    # Object creation
│   │       ├── ParameterSlider.jsx  # Tunable sliders
│   │       ├── TimeControl.jsx      # Time arrow
│   │       ├── InfoPanel.jsx        # Object details
│   │       ├── HUD.jsx             # Heads-up display
│   │       ├── AIChat.jsx          # AI assistant
│   │       └── EventNotification.jsx # Event toasts
│   ├── ai/                 # AI integration
│   │   ├── AIAgent.js      # LLM controller
│   │   └── prompts.js      # System prompts
│   ├── data/               # Game data
│   │   ├── starTypes.js    # Star presets
│   │   ├── planetTypes.js  # Planet presets
│   │   └── events.js       # Random events
│   └── utils/              # Utilities
│       ├── constants.js    # Physical constants
│       ├── math.js         # Math/physics utilities
│       └── helpers.js      # General helpers
├── assets/
│   └── shaders/            # GLSL shaders
│       ├── star.vert/.frag
│       └── blackhole.vert/.frag
├── package.json
├── webpack.config.js
└── README.md
```

## Getting Started

### Prerequisites
- Node.js 18+ (recommended: 20+)
- npm or yarn

### Installation

```bash
# Clone the repository
cd Genesis Error

# Install dependencies
npm install

# Start development server (web mode)
npm run dev

# Or start with Electron
npm run electron-dev
```

### Building for Production

```bash
# Build web assets
npm run build

# Package for desktop (Electron)
npm run package
```

### Steam Integration
The Electron build can be packaged for Steam via Steamworks. The `electron-builder` config in `package.json` produces platform-specific installers.

## Configuration

### AI Assistant
To enable the full AI assistant, set your OpenAI API key:
1. Open the AI chat panel (click the robot icon or press `C`)
2. The AI works offline with built-in responses by default
3. For enhanced responses, configure an API key in the settings

### Controls

| Key | Action |
|-----|--------|
| **Space** | Play / Pause |
| **Click** | Select body |
| **Scroll** | Zoom |
| **Drag** | Orbit camera |
| **C** | Toggle AI Chat |
| **I** | Toggle Info Panel |
| **Esc** | Exit Explorer Mode |

#### Explorer Mode
| Key | Action |
|-----|--------|
| **WASD** | Move |
| **Mouse** | Look around |
| **Space** | Fly up |
| **Shift** | Fly down |
| **Ctrl** | Sprint |

## Roadmap

- [ ] Sound effects and ambient music
- [ ] Procedural planet textures
- [ ] Gravitational lensing (ray-tracing)
- [ ] Multi-star system templates
- [ ] Galaxy-scale simulation
- [ ] Multiplayer (shared universe)
- [ ] Steam Achievements
- [ ] VR support
- [ ] More random events (gamma-ray bursts, magnetar flares)
- [ ] Civilisation emergence on habitable planets

## License

MIT License - See LICENSE file for details.
