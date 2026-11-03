# FieldSync

**Offline-first inspection app for unreliable networks.**

FieldSync lets technicians create inspections, checklists and photo reports with no connectivity, keeps them durably on the device, and synchronises them later without losing data or silently overwriting a colleague's changes.

[![CI](https://github.com/Dieu-Merci-Ndenga/fieldsync/actions/workflows/ci.yml/badge.svg)](https://github.com/Dieu-Merci-Ndenga/fieldsync/actions/workflows/ci.yml)

## Why FieldSync Exists

A typical mobile app assumes the network is available. On site (basements, plants, rural areas) it is not: requests drop mid-flight, apps are killed, and two people edit the same record while both are offline.

FieldSync is designed around **local-first writes**, **idempotent operations** and **explicit conflict resolution**. Exactly-once delivery cannot be guaranteed over an unreliable network, so every operation carries a UUID and the server makes replays harmless.

## Core Capabilities

- Create and edit inspections, checklists, notes and photos fully offline.
- Persistent local storage (SQLite) that survives restarts and app kills.
- Ordered sync queue (outbox) with automatic resume after network interruption.
- Idempotent push: replaying an operation never duplicates its effect.
- Field-level three-way merge: edits to different fields merge automatically.
- Conflict detection when two users change the same field, with _keep mine / keep theirs_ resolution.
- Append-only change history (author, version, auto-merged flag).
- Sync indicators: per-record `synced / pending / conflict`, global offline/syncing/error banner.
- Idempotent photo upload with content validation.
- Fail-fast production configuration, input validation, security headers.

## Architecture

```text
 Mobile (Expo / React Native)                     Server
┌──────────────────────────────┐        ┌───────────────────────────┐
│ UI ─► SyncEngine ─► SQLite   │  HTTPS │ NestJS API                │
│        │   inspections       │◄──────►│  POST /sync/push          │
│        │   outbox (ops)      │        │  GET  /sync/pull          │
│        │   photos queue      │        │  PUT  /photos/:id         │
│        └─ retry / resume     │        │  GET  /inspections/:id/…  │
└──────────────────────────────┘        └────────────┬──────────────┘
                                                      │ transaction + row lock
                                                      ▼
                                   PostgreSQL: inspections, change_log,
                                               processed_ops, photos
```

### Project Stack

| Technology          | Role                                              |
| ------------------- | ------------------------------------------------- |
| TypeScript          | Shared language across app and API                |
| React Native (Expo) | Mobile client                                     |
| SQLite              | Durable on-device store and outbox                |
| NestJS              | HTTP API, guards, dependency injection            |
| PostgreSQL          | Source of truth, history and idempotency ledger   |
| Docker              | Reproducible PostgreSQL + API                     |
| GitHub Actions      | CI: build, tests on real PostgreSQL, lint, Docker |

```text
backend/    NestJS API (src/sync/merge.ts holds the merge algorithm)
mobile/     Expo app (src/core = sync engine, src/db = SQLite store)
demo/       Scripted reproduction of offline replay, auto-merge and conflict
```

## How Synchronisation Works

1. **Write locally.** Every edit appends an operation `{opId, inspectionId, baseVersion, patch}` to the SQLite outbox _before_ any network call and updates the local view.
2. **Push.** The engine sends pending operations in order. The server locks the inspection row, merges inside a transaction, appends to `change_log` and records the `opId` in `processed_ops`.
3. **Merge.** If `baseVersion` is current the patch is applied. Otherwise the server compares the patch with changes made by _other_ users since `baseVersion`: disjoint fields auto-merge, identical values are accepted, differing values become a **conflict**.
4. **Resolve.** Conflicting operations are parked (not applied) and the UI shows _mine vs theirs_. **Keep mine** replays the operation with `force`; **Keep theirs** discards it.
5. **Resume.** Network errors abort the run and mark the app offline; the same operations are retried on reconnect, every 15 s, or on _Sync now_. Lost responses are safe because of `processed_ops`.
6. **Pull.** The device fetches inspections changed since its cursor, re-applies its still-pending operations on top, and shows server values for conflicting fields.

Checklist items and photos are stored as separate fields (`item:<id>`, `photo:<id>`), so adding items concurrently never conflicts.

## API

All routes except `/health` need `Authorization: Bearer <API_TOKEN>` when configured (mandatory in production). Mutating routes need `x-user-id`.

### Push operations

```http
POST /sync/push
{ "ops": [{ "opId": "<uuid>", "inspectionId": "<uuid>", "baseVersion": 1,
            "patch": { "notes": "valve leaking" }, "force": false }] }
```

Returns one result per op:

```json
[{ "opId": "…", "status": "applied", "version": 3, "merged": true }]
[{ "opId": "…", "status": "conflict", "serverVersion": 3,
   "conflicts": [{ "field": "notes", "mine": "a", "theirs": "b" }] }]
```

### Other routes

- `GET /sync/pull?cursor=` → `{ cursor, more, inspections[] }` changed since the change-log cursor.
- `GET /inspections/:id/history` → ordered change log.
- `PUT /photos/:id?inspectionId=` raw `image/jpeg|png` (idempotent), `GET /photos/:id`.
- `GET /health`.

## Security

See [SECURITY.md](SECURITY.md) for the full model. In short: bearer token (required in production), validated identifiers and field names, size limits, verified photo content, security headers, non-root container, fail-fast production config.

## Local Development

Requirements: Node.js 22, npm and Docker.

```bash
docker compose up -d --build      # API :3000 (token: dev-token-change-me), Postgres :5432
cd mobile && npm install && npx expo start
```

See [.env.example](.env.example) for all configuration. In the app's _Settings_ set the server URL (Android emulator `http://10.0.2.2:3000`, real device: your LAN IP), the API token, and a user name. Use a different user on a second device to produce conflicts. _Simulate offline_ forces offline mode for demos.

### Scripted demonstration

```bash
./demo/conflict-demo.sh
```

Shows creation, idempotent replay, auto-merge of different fields, a conflict on the same field, and the history.

## Tests and Build

```bash
npm install && npm install --prefix backend && npm install --prefix mobile
docker compose up -d db
npm run lint
npm run format:check
npm run build
npm run test:e2e              # backend unit + API e2e against real PostgreSQL
npm test --prefix mobile      # sync engine: offline, resume, lost response, conflicts
```

Backend e2e tests are skipped when `DATABASE_URL` is unset; `npm run test:e2e` sets the local default. The mobile tests run the real merge algorithm inside an in-process fake server.

## Limitations

FieldSync is a reference implementation, not a complete field-service platform.

- **Identity is not authentication:** one shared `API_TOKEN` plus an `x-user-id` label. No users, roles or per-user permissions.
- **Per-operation resolution:** a conflict is resolved for the whole operation, not field by field.
- **Keep mine overwrites:** it replaces the server's value for the conflicting fields (the history keeps the overwritten change).
- **No deletes:** inspections cannot be deleted or archived.
- **Text fields merge as whole values:** no character-level merge of notes.
- **Schema management:** TypeORM `synchronize: true` instead of migrations.
- **Photos:** stored on the API's local volume; no thumbnails, compression pipeline or object storage. Pulled inspections show remote photos only while online.
- **No background sync:** sync runs while the app is open.
- **Device data is not encrypted** at rest.
- **Not load tested.** The mobile UI layer and SQLite store have no automated tests and the app has not been run on a physical device.

## Changelog

### Unreleased

- **Sync:** outbox, idempotent push, field-level three-way merge, conflict resolution, change history, cursor-based pull.
- **Mobile:** SQLite persistence, photo capture and queued upload, sync indicators, offline simulation.
- **Security:** bearer `API_TOKEN` (required in production), request validation, photo content checks, security headers, non-root container.
- **Tooling:** CI with PostgreSQL service, oxlint, Prettier, demo script, contribution and security policies.

## Contributing and License

See [CONTRIBUTING.md](CONTRIBUTING.md). Released under the [MIT License](LICENSE).
