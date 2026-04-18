# Creature image packs

Genesis Error can compose creature portraits from **layered PNG/SVG parts** plus a `manifest.json`. Until you add a pack with `variants`, the game uses a **deterministic procedural canvas** (same species id always yields the same portrait).

## Directory layout

Place each pack in its own folder (for future loading from `assets/creature-packs/<packId>/`):

```
<packId>/
  manifest.json
  images/
    base_cryo_01.png
    accent_meso_02.png
    ...
```

## `manifest.json` schema (v1)

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Pack id (e.g. `my_pack_v1`). |
| `version` | number | Schema version; use `1`. |
| `layers` | array | Ordered layers. Each: `{ "id": "base" }` (optional `description`). |
| `variants` | array | Image variants. Each variant: |

Variant object:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique variant id. |
| `layerId` | string | Must match a `layers[].id`. |
| `file` | string | Path relative to pack root, e.g. `images/base_cryo_01.png`. |
| `tags` | string[] | Tags used for scoring (`cryo`, `meso`, `baro`, `aquatic`, `flyer`, `intelligent`, …). |
| `anchor` | `{x:number,y:number}` optional | Normalized pivot 0–1 for stacking. |

The runtime `CreatureComposer` scores variants from species traits and planet temperature; highest score wins per layer. Empty `variants` keeps procedural fallback only.

## Bundled default

[`src/data/defaultCreaturePack.json`](../../src/data/defaultCreaturePack.json) ships with the app (empty `variants`) so builds work offline with no extra assets.

## Optional offline AI pipeline

You can run an external tool to generate tagged `variants` and commit the updated `manifest.json` plus image files—no live API is required in the shipped game.
