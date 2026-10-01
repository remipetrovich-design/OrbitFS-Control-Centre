# OrbitFS Dev MCP

Private developer MCP for OrbitFS Dev Control.

## Endpoint

`https://dev.incendiarynetworks.cc/devmcp`

The endpoint is hosted by Dev Panel and is separate from the normal Dev Control REST API.

## Ownership

This MCP is for the OrbitFS owner/developer only.

Primary systems:

1. `V1-vercel-base`
   - Base release source
   - `base-release` preparation
   - Base release operations

2. `V1-vercel-engine`
   - Engine/updater source
   - `UPDATE_RELEASE` preparation
   - Update release operations

Secondary systems:

3. Custom License Manager
4. V2 Billing Store

## Current MCP foundation

Current tools:

- `dev_control_status`
- `release_overview`
- `prepare_release_source`
- `recent_dev_jobs`
- `service_action`
- `license_manager_view`
- `license_control`
- `authority_lockdown`

The first Base/Engine mutation uses the existing guarded source-promotion workflows. It validates current `main` before moving `base-release` or `UPDATE_RELEASE`; it does not silently publish a customer release.

## Controls

MCP settings are independent from Dev Control settings and live in `dev_mcp_settings`.

They control:

- MCP enabled
- read-only mode
- mutations allowed
- critical confirmations
- Base tools
- Engine/updater tools
- License Manager tools
- Billing Store tools
- authority controls
- audit logging

The Dev Control emergency kill switch still overrides MCP mutations.

## Authentication

The initial development endpoint accepts `Authorization: Bearer <DEV_MCP_TOKEN>`.

The secret is never returned by the Dev Panel UI.

This bearer mode is a development/testing boundary for direct MCP clients such as controlled API/Codex sessions. For a normal authenticated ChatGPT plugin connection, the next auth stage is OAuth 2.1 / PKCE (or a Secure MCP Tunnel for private development). Do not make the endpoint anonymous merely to connect ChatGPT.

## Security

The MCP is intentionally powerful, but it remains structured:

- no generic shell
- no arbitrary SQL
- no arbitrary URL proxy
- no secret reader
- every mutation goes through Dev Control or an authoritative service API
- critical actions retain explicit confirmation
- authority state remains owned by Custom License Manager
- release/update execution follows the existing Base/Engine workflows

## UI

Dev Panel navigation:

- Networking
  - Dev Control
  - MCP Controls

Dev Control contains API settings and target access only.

MCP Controls contains MCP enablement and exposure settings only.

Deployment/release buttons remain in their existing Base Releases, Update Releases and Operations pages rather than being duplicated.
