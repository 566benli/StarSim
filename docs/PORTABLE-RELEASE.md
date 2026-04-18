# Genesis Error Portable Release Workflow

This project now auto-generates a portable package that you can send directly to other users.

## What to send

- `releases/GenesisError-Portable-latest.zip` (stable latest package)
- Optional versioned archive: `releases/GenesisError-Portable-<BUILD_ID>.zip`

## Guaranteed sync behavior

`npm run build:all` now performs all of the following in order:

1. installs dependencies
2. rebuilds web (`dist/`)
3. rebuilds desktop executable (`dist-electron/`)
4. verifies sync (`npm run check-sync`)
5. creates a fresh portable package in `releases/`

That means **every code change + build:all run updates portable artifacts in sync**.

## Manual packaging command

If you already built and only want to regenerate package archives:

```bash
npm run portable:pack
```

## Package contents

Each package contains:

- `app/` portable desktop executable and runtime files
- `web/` synchronized web build
- `Start-GenesisError.bat` quick launcher
- `release-manifest.json` build metadata
- `docs/PORTABLE-README.txt` usage notes
