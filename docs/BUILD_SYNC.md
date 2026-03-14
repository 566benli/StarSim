# StarSim Build Synchronization Guide

## ⚠️ CRITICAL NOTICE
**ALWAYS run `npm run build:all` after ANY code changes!** This ensures both web and exe versions stay perfectly synchronized. Failure to do this will result in version mismatches and inconsistent behavior.

## Overview
This guide ensures that both the Electron executable (.exe) and web versions of StarSim remain synchronized when making modifications.

## 🔄 Synchronization Requirements

### When to Rebuild
- **EVERY TIME** you modify any source code
- **EVERY TIME** you update dependencies
- **EVERY TIME** you change configuration
- **EVERY TIME** you add/remove features

### How to Rebuild
```bash
npm run build:all
```

### Consequences of Not Synchronizing
- ❌ Web version shows new features, exe version doesn't
- ❌ Exe version has bugs that web version fixed
- ❌ Inconsistent save functionality between versions
- ❌ Users get different experiences
- ❌ Testing becomes unreliable

### Checking Synchronization
```bash
npm run check-sync
```

This command will tell you if your versions are synchronized or if you need to rebuild.

## Build Commands

### Quick Sync Build
```bash
npm run build:all
```
This PowerShell script ensures both exe and web versions are built together and stay in sync.

### Individual Builds
```bash
# Build web version only (quick dev)
npm run build

# Build installer (always runs build:all first for fresh exe)
npm run package

# Build unpacked executable (for testing)
npm run package:dir
```

## Development Workflow

### When Making Changes:
1. **Always run the sync build**: `npm run build:all`
2. **This ensures both versions are updated simultaneously**
3. **Test both versions** to confirm they work identically

### Version Locations:
- **Web Version**: `dist/index.html` (serve with `npm run serve:web`)
- **Exe Version**: `dist-electron/StarSim.exe` (run directly)
- **Unpacked Exe**: `dist-electron/win-unpacked/StarSim.exe`

## Testing Both Versions

### Web Version Testing:
```bash
npm run serve:web
# Opens at http://localhost:8080
```

### Electron Version Testing:
```bash
npm run electron
# Or run dist-electron/StarSim.exe directly
```

### Development Mode:
```bash
npm run electron-dev
# Runs both webpack dev server and electron with hot reload
```

## Key Features Verified in Both Versions

### ✅ Main Screen
- Proper application window with cosmic theme
- Custom titlebar (frameless window)
- Loading screen with StarSim branding

### ✅ Save Functionality
- Save button (💾) in the UI
- 10 save slots available
- Save/load dialog with proper functionality
- Persistent save data in user data folder

### ✅ UI Components
- Creation panel for adding celestial bodies
- Time controls (play/pause/reset)
- View controls and camera movement
- Info panel with simulation details

## Troubleshooting

### Exe Build Issues:
If `electron-builder` fails with permission errors:
1. The web version will still work perfectly
2. Use the existing exe if available
3. Run `npm run package:dir` for unpacked version

### Port Configuration:
- Webpack dev server: `port 9000`
- Electron main process expects: `port 9000`
- Web server: `port 8080`

### Build Verification:
Both versions should have identical:
- UI layout and functionality
- Save/load behavior
- Simulation features
- Visual appearance

## File Structure
```
StarSim/
├── src/                    # Source code
├── dist/                   # Built web version
├── dist-electron/          # Built Electron executables
│   ├── StarSim.exe        # Portable executable
│   └── win-unpacked/      # Unpacked executable folder
├── build-all.ps1          # Sync build script
└── package.json           # Build configurations
```