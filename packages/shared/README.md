# @capabble/shared

Single source of truth for data and code used by more than one app.

| Export | Used by |
|---|---|
| `@capabble/shared/tenantFeatureCatalog.json` | `client` (import), `server` (synced copy) |
| `@capabble/shared/permissionCatalog.json` | `client` (import), `server` (synced copy) |
| `@capabble/shared/designTokens.json` | `mobile` (import through Metro) |
| `@capabble/shared/roadPath` | `client`, `mobile`: live transport maps (vehicle on the road, distance to a stop) |
| `@capabble/shared/vehicleArt` | `client`, `mobile`: top-down vehicle pictures for the live maps |

`designTokens.json` is a copy of `project/tokens.json` from the Capabble design system
artifact (claude.ai/artifact/LyYegFLHJxi1rNpnkaqHjH). Update it whenever the design
system's tokens change, together with `client/src/styles/capabble/tokens.css`.

## Frontend apps (npm workspaces)

`client`, `admin`, `schol` and `capabble-landing` are npm workspaces, so they can
add `"@capabble/shared": "*"` to their dependencies and import from it directly.

## Mobile

`mobile` is not a workspace (it runs React 19, the web apps run React 18). Its Metro
config watches `packages/shared` and maps `@capabble/shared/*` to `packages/shared/src/*`,
so it imports these files directly, with no copy.

## Server

`server` is deployed on its own to EC2 (`cd server && npm ci`), so it is **not** a
workspace and cannot import from `packages/`. Instead, shared files are copied
into it:

```bash
npm run sync:shared    # copy packages/shared -> server/src/constants
npm run check:shared   # fail if the server copy has drifted (runs in npm run lint)
```

Always edit the file here, never the copy under `server/src/constants/`.
