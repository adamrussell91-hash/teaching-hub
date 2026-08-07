# Security

> **Note:** Full security architecture is defined in the product specs. This stub captures the first-slice security requirements from [`docs/superpowers/specs/2026-08-07-teaching-hub-first-slice-design.md`](../superpowers/specs/2026-08-07-teaching-hub-first-slice-design.md) until a dedicated security spec is authored.

## First-slice security requirements

- Secrets only on Netlify: `TEACHING_HUB_PASSPHRASE_HASH`, `SESSION_SECRET`, later `ANTHROPIC_API_KEY`.
- Pages artifact contains no tokens or passphrase verifier.
- Teacher API requires valid session; student published-read endpoints are public but return published data only.
- Rich text sanitised; no arbitrary script execution in student render.

## Related failure modes (first slice)

- Expired or missing teacher session: re-prompt auth; student routes remain public.
- Missing published lesson: clear student 404 or empty state (no draft leakage).
