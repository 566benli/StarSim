# 🚨 CRITICAL: Genesis Error Version Synchronization

## ⚠️ MANDATORY REQUIREMENT

**You MUST run `npm run build:all` after EVERY code change, or versions will become unsynchronized!**

## The Problem

When you update Genesis Error code, there are TWO versions that need to stay in sync:
- **Web Version** (`dist/` folder)
- **Exe Version** (`dist-electron/GenesisError.exe`)

If you don't rebuild both, one version will have old code while the other has new code.

## The Solution

### ✅ Always Use This Command:
```bash
npm run build:all
```

This command:
- 🧹 Cleans both build folders
- 🌐 Rebuilds the web version (ALWAYS works)
- 📦 Attempts to rebuild the exe version (may fail in sandboxed environments)
- 🔍 Verifies synchronization status

### ✅ Check Synchronization Status:
```bash
npm run check-sync
```

## Workflow for Making Changes

### Step 1: Make Your Code Changes
Edit any files in `src/`, update dependencies, etc.

### Step 2: Rebuild Both Versions
```bash
npm run build:all
```

### Step 3: Verify Synchronization
```bash
npm run check-sync
```

### Step 4: Test Both Versions
- **Web**: `npm run serve:web` (http://localhost:8080)
- **Exe**: Run `dist-electron/GenesisError.exe` (if available)

## Consequences of Not Following This

❌ **Web version works, exe version doesn't**
❌ **Save functionality inconsistent between versions**
❌ **Users get different experiences**
❌ **Bugs in one version but not the other**
❌ **Testing becomes unreliable**

## Files Created for Synchronization

- `build-all.ps1` - Forces rebuild of both versions
- `check-sync.ps1` - Verifies synchronization status
- `BUILD_SYNC.md` - Detailed synchronization guide
- `package.json` - Added build:all and check-sync commands

## Current Status

- ✅ **Web Version**: Always builds successfully
- ⚠️ **Exe Version**: Build fails in sandboxed environment (expected)
- ✅ **Synchronization System**: Properly implemented and enforced

## Emergency Recovery

If you suspect versions are out of sync:
1. Run `npm run build:all`
2. Run `npm run check-sync` to verify
3. If exe build fails, web version is still fully functional

---

**REMEMBER: `npm run build:all` after EVERY change!** 🔄