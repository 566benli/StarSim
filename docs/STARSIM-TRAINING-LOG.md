# Genesis Error Training Log — Essential Rules to Remember

> **Keep this document in mind for every Genesis Error development session.**

---

## Rule #1: Always Coordinate Online and Offline Versions

**Online version** = Web build served at http://localhost:8080  
**Offline version** = Electron exe (GenesisError.exe) in `dist-electron/`

### Checklist before any release or testing:
- [ ] Run `npm run build:all` after ANY code change
- [ ] Verify web version: `npm run serve:web` → opens at 8080
- [ ] Verify exe version: Run `dist-electron\GenesisError.exe` or `dist-electron\win-unpacked\GenesisError.exe`
- [ ] Both must show the same features and behavior

---

## Rule #2: Build Commands

| Command | Use When |
|--------|----------|
| `npm run build:all` | After code changes — rebuilds BOTH web + exe |
| `npm run build` | Web only (quick iteration) |
| `npm run package` | Create installer (runs build:all first) |
| `npm run check-sync` | Verify web and exe are in sync |

---

## Rule #3: Exe Launch Paths

- **Primary exe (real Electron build):** `dist-electron\win-unpacked\GenesisError.exe`
- **Placeholder/copy:** `dist-electron\GenesisError.exe` (runs launcher script)
- **Launcher (dev):** `Launch-GenesisError.bat` or `build\Genesis Error-Final-Launcher.ps1`

---

## Rule #4: What Breaks Without Sync

- Exe shows old UI, web shows new → **User confusion**
- Save format differs between versions → **Data loss**
- Different bugs in each → **Unreliable testing**

---

## Rule #5: Pre-Commit / Pre-Push Checklist

1. Code changed? → `npm run build:all`
2. Sync check: `npm run check-sync`
3. Quick test: Run exe and web, compare

---

## Rule #6: Troubleshooting Exe Not Opening

1. **"Electron not found"** → Run `npm install`
2. **"Web build not found"** → Run `npm run build` or `npm run build:all`
3. **White/blank window** → Check `dist\index.html` exists; rebuild
4. **Placeholder exe (batch)** → Double-click `GenesisError.cmd` or `Run-GenesisError.bat`, NOT GenesisError.exe (placeholder .exe is a batch file and fails when double-clicked)
5. **"Cannot read properties of undefined (reading 'whenReady')"** → `ELECTRON_RUN_AS_NODE` is set! In CMD/PowerShell run: `set ELECTRON_RUN_AS_NODE=` before launching. Or use `Run-GenesisError.bat` which clears it automatically.

---

## Rule #7: File Layout (Do Not Break)

```
dist/           ← Web build (index.html, bundle.js)
dist-electron/  ← Exe output
  win-unpacked/GenesisError.exe  ← Real packaged exe
  GenesisError.exe               ← Copy or placeholder
electron/       ← Main process (main.js loads dist/)
src/            ← Source (webpack builds to dist/)
```

---

*Last updated: project cleanup and exe launch fixes*
