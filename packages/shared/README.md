# @capabble/shared

Single source of truth for data and code used by more than one app.

| Export | Used by |
|---|---|
| `@capabble/shared/tenantFeatureCatalog.json` | `client` (import), `server` (synced copy) |

## Frontend apps (npm workspaces)

`client`, `admin`, `schol` and `capabble-landing` are npm workspaces, so they can
add `"@capabble/shared": "*"` to their dependencies and import from it directly.

## Server

`server` is deployed on its own to EC2 (`cd server && npm ci`), so it is **not** a
workspace and cannot import from `packages/`. Instead, shared files are copied
into it:

```bash
npm run sync:shared    # copy packages/shared -> server/src/constants
npm run check:shared   # fail if the server copy has drifted (runs in npm run lint)
```

Always edit the file here, never the copy under `server/src/constants/`.
