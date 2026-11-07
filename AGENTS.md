# Development and deployment workflow

- Customer production branch: `codex/autonomy125`. GitHub `main` currently does
  not contain the customer-local API/auth changes and must not replace it.
- Make changes locally, validate, commit and push. Dokploy builds and deploys
  the checkout. Never patch application code or build release images manually
  on a server over SSH; use SSH for read-only diagnosis.
- Store schema migrations in `sql/`. Committing a migration does not execute it
  and does not authorize applying it to production.
- Preserve customer-local API/auth settings and the same-origin browser flow.
- Keep `.env`, credentials, license/signing keys and private data outside Git.
- Before discarding local changes, verify that they are in a remote branch or
  a checked local backup. Preserve ignored environments and dependencies.
