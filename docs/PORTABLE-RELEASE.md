# Genesis Error Portable Release Workflow

Send one zip. After unzip, the other person can run the desktop app and read the essential source. Dependencies, git history, and the duplicate Electron folder are not included.

## What to send

- `releases/GenesisError-Portable-latest.zip`

That archive is the file to share. A versioned copy with the same contents is written beside it: `releases/GenesisError-Portable-<BUILD_ID>.zip`.

## Package contents

- `Start-GenesisError.bat` launches the app
- `START-HERE.txt` explains the layout
- `app/` desktop executable and the Electron runtime it needs
- `web/` synchronized web build
- `source/` essential code: `src/`, `electron/`, `assets/`, `docs/`, `build/`, `scripts/`, `package.json`, `package-lock.json`, `webpack.config.js`
- `release-manifest.json` build metadata

Left out on purpose: `node_modules/`, `.git/`, `dist-electron/win-unpacked/` (a second copy of the app), server secrets, and previous release archives.

To rebuild, unzip, install Node.js, then from `source/` run `npm install` and `npm run build:all`.

## How it is produced

`npm run build:all` installs dependencies, rebuilds the web app and the desktop exe, checks that their build IDs match, then refreshes this zip.

If those builds already exist and only the archive needs to be regenerated:

```bash
npm run portable:pack
```

The packager writes the zip and deletes its temporary folder. Older runs also left an unpacked folder of about 1 GB next to each zip; those folders are not required once the zip exists.
