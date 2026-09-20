# Capabble School Intelligence

PostgreSQL-backed intelligence subsystem for canonical school identity and source-derived public data.

## Architecture

- **Canonical identity**: `schools.id` (UUID) is the only primary key. UDISE, CBSE affiliation, state school code, and KYS `schoolId` live in `school_identifiers`.
- **Operational separation**: Capabble tenant operational data remains in MongoDB. Intelligence data lives in PostgreSQL (`capabble_school_intel`).
- **Provenance-first**: Every fetch is stored in `source_records.raw_payload` before normalization.
- **Resumable jobs**: `collection_runs` tracks cursor, counts, and status. Idempotency keys skip already-fetched endpoints.
- **Future tenant bridge**: `capabble_tenants.school_id` references `schools.id` (one-to-one).

## KYS API (verified live)

| Endpoint | Base path | Params |
|----------|-----------|--------|
| report-card | `/web-app/api/school/report-card` | `schoolId`, `yearId` |
| profile | `/web-app/api/school/profile` | `schoolId`, `yearId` |
| facility | `/web-app/api/school/facility` | `schoolId`, `yearId` |
| getSocialData | `/web-app/api/getSocialData` | `flag`, `schoolId`, `yearId` |

**Important**: `getSocialData` is NOT under `/school/`. No authentication required as of 2026-03-08.

**Year discovery**: Probe `report-card` with candidate `yearId` values; use `yearDesc` from response as authoritative academic year.

**Enrollment source**: `getSocialData flag=1` → `schEnrollmentYearDataTotal.finalTotal`. RTE from `flag=5`. Age distribution from `flag=3`.

## Setup

```bash
cd school-intelligence
python -m venv .venv
.venv\Scripts\activate
pip install -e ".[dev]"
copy .env.example .env
```

Create database:

```sql
CREATE DATABASE capabble_school_intel;
```

Migrate:

```bash
school-intel migrate
```

## CLI

```bash
# Golden school — live KYS collection
school-intel collect-school --udise 06140404094 --kys-school-id 1519942 --state-school-code 25299
school-intel collect-school --udise 06140404094 --kys-school-id 1519942 --verbose

# Single year (accepts 2020-21 or yearId 7)
school-intel collect-year --udise 06140404094 --year 2020-21 --kys-school-id 1519942

school-intel validate-school --school-id <uuid>
school-intel show-school --school-id <uuid>
```

## Tests

Offline golden tests (no network):

```bash
python -m pytest tests/test_himalyan_golden.py -q
```

Live KYS contract tests (network, no DB):

```bash
python -m pytest -m live tests/test_live_kys_contract.py -q
```

Live end-to-end pipeline (network + PostgreSQL):

```bash
set SCHOOL_INTEL_TEST_DATABASE_URL=postgresql+psycopg://postgres:postgres@127.0.0.1:5432/capabble_school_intel_test
python -m pytest -m live tests/test_live_himalyan.py -q
```

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SCHOOL_INTEL_DATABASE_URL` | local postgres | Intelligence DB (SQLAlchemy URL; `postgresql+psycopg://…`) |
| `SCHOOL_INTEL_CLOUD_DATABASE_URL` | (none) | Neon/cloud URL for dump/restore sync — never commit real credentials |
| `SCHOL_DEV_USERNAME` | `capabble` | Shared team login username for SCHOL UI |
| `SCHOL_DEV_PASSWORD` | (empty) | When set, API requires Bearer auth (team login enabled) |
| `SCHOL_DEV_TOKEN_SECRET` | derived | Optional HMAC secret for session tokens |
| `KYS_REQUEST_DELAY_SECONDS` | 1.0 | Delay between KYS requests |
| `KYS_MAX_RETRIES` | 3 | Retry count for transient failures |
| `KYS_TIMEOUT_SECONDS` | 30 | HTTP timeout |

## SCHOL team login

Set `SCHOL_DEV_PASSWORD` in `school-intelligence/.env`. Start with `npm run dev:schol` from the repo root, open the SCHOL UI, and sign in at `/login` with `SCHOL_DEV_USERNAME` / `SCHOL_DEV_PASSWORD`.

When the password is unset, the API stays open (local bootstrap). Setup routes are protected once the password is configured.

## Sync Postgres between machines (via Neon)

1. On the machine with the source data, set `SCHOOL_INTEL_CLOUD_DATABASE_URL` to your Neon URL (`sslmode=require`). Prefer Neon’s **direct** (non-pooler) host if restore fails on the pooler endpoint.
2. Push local → cloud (destroys cloud data):

```bash
npm run school-intel:db:push-cloud -- --yes
```

3. On the other machine, set the same cloud URL and either point `SCHOOL_INTEL_DATABASE_URL` at Neon, or pull into local Postgres:

```bash
npm run school-intel:db:pull-cloud -- --yes
```

Requires `pg_dump`, `pg_restore`, and `psql` on PATH. Do not commit `.env`.

## Phase 2 scope

- Live KYS HTTP collection for golden school (Himalyan Public School, Rohtak)
- Raw → parse → normalize → validate pipeline
- Resumable per-endpoint collection via idempotency keys
- Flag=3 non-reconciling validation preserved

## Phase 3 scope (SARAS + identity)

- Live SARAS directory collection (state-wise, resumable)
- Raw HTML stored in `source_records` before parsing
- Normalized `saras_school_records` linked to canonical `schools.id`
- Six-level `SchoolIdentityService` with `match_candidates` for uncertain matches
- Himalyan: UDISE + state code + KYS → one `schools.id` (not in SARAS — State Board school)

### SARAS CLI

```bash
school-intel migrate   # applies 0002_saras_match_candidates
school-intel saras-test
school-intel saras-collect --limit 100
school-intel saras-collect --resume
school-intel saras-show --affiliation 1030029
school-intel match-school --udise 06140404094
school-intel match-review
```

### SARAS live behavior (verified)

- Directory: POST `/saras/AffiliatedList/ListOfSchdirReport` with CSRF tokens
- Search mode: `State_wise` with numeric `State` ID (e.g. `5` = HARYANA)
- Keyword: `Keyword_wise` + `InstName_orAddress` (not `Keyword` — that returns full dump)
- Detail: GET `/saras/AffiliatedList/AfflicationDetails/{affiliationNumber}`
- No authentication; CSRF `__RequestVerificationToken` required on POST

Not in scope: full 33k directory auto-run, KYS mass collection, Mongo tenant bridge, prospect scoring.
