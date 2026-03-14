# 🚀 How to Run StarSim

## ✅ Quick Start (Easiest Method)

### Option 1: One-Click Setup (Recommended)
```bash
# Run this once to set everything up
.\Setup-StarSim.bat
```
This will:
- ✅ Check all dependencies
- ✅ Install missing components
- ✅ Build both web and exe versions
- ✅ Launch StarSim automatically

### Option 2: Manual Setup
```bash
# 1. Install dependencies (run once)
npm install

# 2. Build both versions
npm run build:all

# 3. Launch StarSim
npm run serve:web
# OR
.\dist-electron\StarSim.cmd
```

## 🎯 Available Launchers

After setup, you can run StarSim using any of these methods:

### Desktop App Launchers:
- `dist-electron\StarSim.cmd` ⭐ **(Recommended)**
- `dist-electron\StarSim.bat`
- `dist-electron\StarSim.exe` ⚠️ **(May show compatibility warnings)**

### Web Version:
```bash
npm run serve:web
```
Opens at: http://localhost:8080

### Development Mode:
```bash
npm run electron-dev
```

## 🔧 Troubleshooting

### If launcher doesn't work:
```bash
# Run diagnostic tool
npm run diagnose
```

### If you see dependency errors:
```bash
# Reinstall everything
npm install
npm run setup
```

### If Electron doesn't launch:
The launcher will automatically fall back to opening the web version in your browser.

## 📋 System Requirements

- ✅ **Node.js** (v16 or higher)
- ✅ **NPM** (comes with Node.js)
- ✅ **Windows** (for exe launchers)
- ✅ **PowerShell** (for script execution)

## 🎮 Features Available

Once running, StarSim includes:
- 🌌 **3D Cosmic Visualization**
- 💾 **Save/Load System** (10 slots)
- 🤖 **AI Assistant**
- ➕ **Object Creation** (stars, planets, black holes)
- 📊 **Info Panels**
- 🎮 **Camera Controls**

## 🔄 Version Synchronization

The system automatically ensures:
- ✅ Web and exe versions are always synchronized
- ✅ Both versions have identical features
- ✅ Save files work across both versions

---

**🎉 Enjoy exploring the cosmos with StarSim!**