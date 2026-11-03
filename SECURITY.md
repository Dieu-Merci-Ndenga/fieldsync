# Security Policy

## Supported Versions

Security fixes are prioritized for the latest version on the `main` branch. Older versions are not guaranteed support.

## Reporting a Vulnerability

Please report vulnerabilities responsibly. **Do not open a public issue for an exploitable vulnerability.**

Use GitHub's private vulnerability reporting for this repository (Security → Report a vulnerability), or contact the maintainer privately. Include:

- A description of the issue and its impact.
- Steps or a minimal proof of concept to reproduce it safely.
- Affected component (`backend/` or `mobile/`) and version/commit.

Do not include real credentials or personal data. You can expect an acknowledgement within a few days.

## Scope

In scope: the NestJS API, the sync protocol, the Docker setup and the mobile client. Out of scope: vulnerabilities in third-party dependencies without a demonstrated impact on FieldSync, and the documented limitations below.

## Security Model

- **API access:** all routes except `/health` require `Authorization: Bearer <API_TOKEN>` when `API_TOKEN` is set. It is **mandatory** in production: the API refuses to start without it, or with the development database URL.
- **Identity:** the user is identified by the `x-user-id` header (validated, 1-64 safe characters). This is attribution for history and conflicts, **not** authentication. A real deployment must put per-user auth (for example JWT) in front of it.
- **Input validation:** operation ids and inspection ids must be UUIDs; field names are restricted to a safe pattern (`__proto__` is rejected); at most 100 operations per request and 64 KB per patch.
- **Photos:** only `image/jpeg` and `image/png`, magic bytes verified, 15 MB limit, stored under server-generated UUID file names (no client-controlled paths).
- **Headers:** `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` and `Cache-Control: no-store` are set; `X-Powered-By` is removed. CORS is disabled unless `CORS_ORIGIN` is set.
- **Container:** the API image runs as a non-root user and exposes a health check.
- **Client settings:** the API token is stored in the platform secure store on native builds. The web build uses `localStorage`, which any script on that origin can read; it is for development only.
- **Data at rest on the device:** the local SQLite database is not encrypted. Do not store secrets in inspections. Use a secure store and device encryption for sensitive deployments.
- **Transport:** serve the API over HTTPS in production.

## CORS

CORS is disabled unless `CORS_ORIGIN` is set. The compose file defaults it to `*` for the local browser demo only; set explicit origins (comma-separated) for any shared deployment.

## Known Limitations

The shared bearer token, device data not being encrypted, and soft-deleted data never being purged are documented design limits, see the README's _Limitations_ section.
