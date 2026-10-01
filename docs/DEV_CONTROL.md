# OrbitFS Dev Control

OrbitFS Dev Control is the owner-only developer control plane for ChatGPT/MCP and Dev Panel operations.

## Boundary

Dev Control is deliberately separate from the Custom License Manager API.

- **License Manager** remains technical authority for licences, entitlements, installation authority, release identity, update eligibility, suspension/revocation and runtime policy.
- **Dev Control** owns developer operations such as deployer/updater orchestration, job state, live consoles, diagnostics and future ChatGPT/MCP commands.
- Dev Control may call protected License Manager endpoints with scoped credentials, but it must never duplicate or bypass licensing authority.

## Initial API

Base path:

`/api/dev-control/v1`

Current endpoint:

- `GET /health` — owner-authenticated foundation/capability status.

The browser currently authenticates this endpoint with the existing signed Dev Panel owner session. MCP-specific authorization will be added separately rather than reusing License Manager API keys.

## Initial modules

- Deployer
- Updater
- Job/event engine
- Licensing bridge

The first implementation is intentionally foundation-only. Existing Quick Deploy and GitHub live-console operations remain in the current Operations workspace until their handlers are moved behind this API.

## Security rules

- Owner-only.
- No arbitrary shell command endpoint.
- No arbitrary SQL endpoint.
- No secret values returned to UI or MCP.
- No direct database mutation of License Manager authority state.
- Production deploy/update actions require explicit guarded endpoints when added.
- Every future state-changing action must produce an auditable job record.
