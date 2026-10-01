# OrbitFS Dev Control API

OrbitFS Dev Control is the independent owner-only developer control plane hosted by Dev Panel.

It is **not** the License Manager API. Dev Control owns its own settings, jobs, audit state and action policy. License Manager remains the authoritative external service for licences, release authority, installation authority, updater/deployer authorization and emergency authority lockdown.

## Base path

`/api/dev-control/v1`

## Authentication

Dev Control accepts either:

- the existing signed Dev Panel **Owner** session token; or
- `DEV_CONTROL_API_TOKEN` when a dedicated machine client is configured later.

Non-owner panel sessions are rejected.

## Dev Control-owned state

Stored in separate tables:

- `dev_control_settings`
- `dev_control_jobs`
- `dev_control_audit`

These tables do not replace License Manager authority tables.

### Dev Control switches

- API enabled
- read-only mode
- Quick Deploy enabled
- Production Deploy enabled
- restart gate
- rollback gate
- updater controls enabled
- licence controls enabled
- Billing Store controls enabled
- critical confirmation required
- post-deploy health check
- automatic rollback on failed verification
- secret redaction
- audit logging
- emergency Dev Control kill switch
- allowed service targets

## API endpoints

### Core

- `GET /health`
- `GET /capabilities`
- `GET|PATCH /settings`
- `GET /systems`
- `POST /actions`
- `GET /diagnostics`

### Jobs and live console

- `GET /jobs`
- `GET /job?job_id=<uuid>`
- `POST /job` with `cancel` or `retry`
- `GET /audit`

GitHub workflow runs remain the external execution identity for deployment/build jobs. Dev Control stores the OrbitFS job record and exposes the workflow jobs/steps as structured console data.

### Service deployment actions

Supported targets:

- `license_manager`
- `billing_store`

Supported actions:

- `prepare_latest_source` — dispatches the target Full Scan; no production deployment.
- `quick_deploy` — explicit fast deployment workflow.
- `production_deploy` — requires an exact successful Full Scan for the current commit.
- `redeploy` — re-runs the validated production workflow for the current commit.

A service restart command is **not** faked by redeploy. Restart remains gated off until a real supported restart mechanism is available.

Rollback remains gated until a verified target-specific implementation exists.

### License Manager bridge

- `GET|POST /license-manager`
- `GET|PATCH /authority-control`
- `GET|POST /lockdown`
- `GET /updater`
- `GET|POST /deployer`
- `GET|POST /releases`
- `GET|POST /release-channels`
- `POST /installation-lifecycle`

All authority mutations are still executed by License Manager APIs. Dev Control does not directly edit License Manager authority rows.

## Emergency License Manager lockdown

Global emergency lockdown is owned by License Manager, not Dev Control.

When active, License Manager middleware blocks normal customer/runtime/admin/integration/deployer/updater traffic.

Only the following License Manager routes remain available:

- `/api/v1/lockdown/status`
- `/api/v1/lockdown/recover`

Normal customer installations receive `AUTHORITY_LOCKDOWN`; this must be treated as a global authority lock, not as licence expiry/revocation.

Unlock uses a separate recovery credential:

- License Manager: `AUTHORITY_LOCKDOWN_RECOVERY_TOKEN`
- Dev Panel: `LICENSE_MANAGER_LOCKDOWN_RECOVERY_TOKEN`

The values must match and must remain separate from normal API/admin credentials.

## Runtime credentials

Existing required configuration remains:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_SESSION_SECRET`
- `LICENSE_MASTER_URL`
- `LICENSE_MASTER_API_TOKEN`
- `ORBITFS_RELEASE_DISPATCH_TOKEN`

Dev Control additions:

- `DEV_CONTROL_ENABLED`
- `DEV_CONTROL_API_TOKEN` — optional until a machine/MCP client is connected
- `LICENSE_MASTER_CONTROL_API_TOKEN` — optional; falls back to `LICENSE_MASTER_API_TOKEN`
- `LICENSE_MANAGER_LOCKDOWN_RECOVERY_TOKEN` — required before using lockdown recovery

## Security rules

- Owner-only.
- No arbitrary shell command endpoint.
- No arbitrary SQL endpoint.
- No generic URL proxy.
- No secret-reader endpoint.
- Secret values are never returned by Dev Control.
- State-changing actions are independently gated by Dev Control settings.
- Production actions require explicit confirmation when configured.
- Dev Control audit and License Manager audit both record authority mutations.
- License Manager remains authoritative for technical licence/release/update decisions.
- Dev Control emergency kill switch and License Manager global emergency lockdown are separate controls.

## Deployment rule

Dev Control source changes do not authorize bypassing manual service release/deploy flows.

The Dev Panel API may be live while newer License Manager bridge endpoints remain pending the normal License Manager production deployment. Do not treat source/build success as proof that an undeployed License Manager route is available in production.
