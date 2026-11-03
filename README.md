# FieldSync — Offline-First Operations App

Mobile app for technicians who inspect equipment or sites where connectivity is unreliable. Inspections, checklists and photos are saved **locally first**, then synchronised without losing data or silently overwriting a colleague's work.

```
mobile/   Expo (React Native + TypeScript), SQLite (expo-sqlite)
backend/  NestJS + TypeORM + PostgreSQL
docker-compose.yml   PostgreSQL + API
```

## Run

```bash
docker compose up -d --build        # API on :3000, Postgres on :5432
cd mobile && npm install && npx expo start
```
Set the server URL in the app's *Settings* (Android emulator: `http://10.0.2.2:3000`, real device: your machine's LAN IP) or use `EXPO_PUBLIC_API_URL`. Use a different *User* on a second device/emulator to demo conflicts. A *Simulate offline* switch is available in Settings.

## Tests

```bash
cd backend && npm test                                   # merge unit tests
docker compose up -d db
cd backend && DATABASE_URL=postgres://fieldsync:fieldsync@localhost:5432/fieldsync npm test   # + API e2e on real Postgres
cd mobile && npm test                                    # sync engine (offline, resume, conflicts)
```

## How it works

| Requirement | Implementation |
|---|---|
| Offline create/edit (inspections, checklists, notes, photos) | Every edit is written to SQLite (`inspections` + `outbox`) before any network call. |
| Persistence across restarts | SQLite on device; the outbox and photo queue survive app kills. |
| Sync queue with resume | Ordered outbox of field-level patches. Each op has a UUID; the server stores processed op ids, so replays after a dropped connection are idempotent. Network failures stop the run and are retried (on reconnect, every 15 s, or "Sync now"). Photos upload via idempotent `PUT /photos/:id`. |
| Conflict detection | Each inspection has a server `version`; an op carries the `baseVersion` it was made on. The server does a **field-level 3-way merge** (`backend/src/sync/merge.ts`): disjoint edits auto-merge, edits to the same field by another user are reported as conflicts (the same value is accepted). Checklist items and photos are separate fields (`item:<id>`, `photo:<id>`), so adding items concurrently never conflicts. |
| Resolution | The UI shows *mine vs theirs* per field: **Keep mine** (replays the op with `force`) or **Keep theirs** (drops it). Nothing is overwritten silently. |
| History, indicators, errors | Append-only `change_log` (`GET /inspections/:id/history`, shows author, version, auto-merged flag); per-record state `synced / pending / conflict`; global banner (offline / syncing / error / pending count); per-op `lastError`. |

## API

- `POST /sync/push` (`x-user-id` header) `{ ops: [{ opId, inspectionId, baseVersion, patch, force? }] }` → per-op `applied | conflict | error`
- `GET /sync/pull?cursor=` → inspections changed since cursor (change-log id)
- `PUT /photos/:id?inspectionId=` raw `image/jpeg|png`, `GET /photos/:id`
- `GET /inspections/:id/history`

## Known limitations (demo scope)

- Auth is a plain `x-user-id` header; use real auth (JWT) in production.
- `synchronize: true` replaces migrations; deletions of inspections are not implemented.
- Conflict resolution is per operation, not per field.
