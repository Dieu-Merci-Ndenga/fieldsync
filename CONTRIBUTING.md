# Contributing to FieldSync

Thank you for your interest in contributing to FieldSync.

FieldSync is an offline-first inspection app built with React Native (Expo), SQLite, NestJS and PostgreSQL. Its primary goals are **no data loss**, **no silent overwrites** and **recoverable synchronisation**.

## Ways to Contribute

- Bug reports and reproducible sync failures.
- Conflict-resolution and concurrency edge cases.
- Security reviews.
- Unit, end-to-end and failure-recovery tests.
- Documentation improvements and focused pull requests.

## Reporting Issues

Check for an existing report first, then include:

- Expected and actual behavior.
- Steps to reproduce (ideally the sequence of offline/online transitions and which user edited what).
- Relevant logs or test output.
- Environment: Node, Expo SDK, platform and OS versions.

Remove secrets, tokens and personal data from logs and examples.

## Development and Testing

1. Fork the repository and create a focused branch.
2. Install and start services:

   ```bash
   npm install
   npm install --prefix backend && npm install --prefix mobile
   docker compose up -d db
   ```

3. Add or update tests for your change.
4. Run the checks:

   ```bash
   npm run lint
   npm run format:check
   npm run build
   npm run test:e2e      # backend unit + API e2e on real PostgreSQL
   npm test --prefix mobile
   ```

5. Open a pull request describing the change, motivation, tests performed and trade-offs. If a check cannot be run, say why.

## Pull Request Guidelines

- Keep changes focused and easy to review.
- Preserve existing behavior unless the change explicitly requires otherwise.
- Include regression tests for bug fixes (the sync engine has an in-memory store and fake server in `mobile/src/core/engine.test.ts`).
- Document architectural changes and reliability trade-offs in the README.
- Never introduce secrets, credentials or unrelated changes.

For significant architectural changes (for example the merge strategy or wire protocol), open an issue first.

## Invariants to protect

- An edit is persisted locally **before** any network call.
- Every operation has a stable UUID and replaying it is idempotent.
- A conflicting edit is never applied silently; the user decides.
- The server's merge logic (`backend/src/sync/merge.ts`) is shared with the mobile tests, keep it dependency-free.

## Security

Do not disclose exploitable vulnerabilities in public issues. See [SECURITY.md](SECURITY.md).

## License

By contributing you agree that your contribution is distributed under the MIT License of this project.
