# Private Dev MCP

Owner-only ChatGPT/Codex interface for the existing Dev Panel.

## Endpoint

`https://dev.incendiarynetworks.cc/devmcp`

There is no separate Dev Control REST API. The MCP calls Dev Panel server logic directly and uses the existing authoritative systems.

## Architecture

```
ChatGPT / Codex
       |
       v
Private Dev MCP (/devmcp)
       |
       v
Dev Panel server logic
  |-- GitHub: V1-vercel-base
  |-- GitHub: V1-vercel-engine
  |-- Custom License Manager
  `-- V2 Billing Store when customer/account/deployer context is needed
```

Custom License Manager remains authoritative for licences, runtime authority, releases, update eligibility and deployer/updater authorization.

V2 Billing Store is used for customer/email resolution, customer-to-licence bindings, installation context and customer deployer execution where required. Dev Panel does not copy customer or licence authority into its own database.

## ChatGPT UI

The `show_dev` tool returns `ui://dev-panel/v1.html` as an MCP App resource.

The UI supports inline, fullscreen and PiP display modes. Chat/model access is intentionally read-only. State-changing MCP tools are app-only and are invoked from explicit owner controls inside the embedded Dev Panel UI. Fullscreen includes prepare, service deployment, customer licence, customer update, release and live-job controls; PiP follows an active workflow. Opening the UI does not authorize a mutation, and mutation buttons require an additional confirmation before execution.

Typical use:

- `@Dev show dev`
- `@Dev prepare both` → stages Prepare Both in the Dev UI; nothing runs until the owner presses the UI control and confirms.
- `@Dev deploy billing_store` → stages the Billing Store deployment controls; nothing runs automatically.
- `@Dev release base` → opens/stages the relevant release controls without executing a lifecycle change.
- `@Dev check person@example.com license`
- `@Dev show Engine status`
- `@Dev show workflow logs`

## Tools

### `show_dev`
Opens the ChatGPT Dev Panel interface.

### `status`
Reads Base, Engine, License Manager, Billing Store or customer state.

### `prepare`
Targets: `base`, `engine`, `both`.

For each selected source repository it:

1. compares current `main` with the release branch;
2. reports outstanding commits/files;
3. dispatches the repository's existing `sync-release-branch.yml` workflow;
4. lets that workflow run the repository checks;
5. moves `base-release` or `UPDATE_RELEASE` only after validation passes.

It does not publish or deploy a customer release.

### `deploy`
Targets: `license_manager`, `billing_store`.

Actions: `status`, `scan`, `deploy`, `quick_deploy`, `redeploy`, `cancel`, `retry`.

Normal deploy requires a successful Full Scan for the exact current main commit. Quick Deploy is the explicit bypass path already provided by the service workflow. Service deployments and Quick Deploy always target `main`. Cancel/retry operate on an explicit GitHub workflow run ID.

### `release`
Reads and controls authoritative License Manager releases. Supports list/get/manifest/validation/source/build/failures/compare and lifecycle controls such as approve, reject, publish, withdraw, archive, restore, promote and rollback.

### `update`
Resolves the customer/install, reads the authoritative update from License Manager, calculates the component plan, and uses the Billing Store customer deployer for apply/retry/rollback.

### `license`
Reads a customer licence by email, customer number, account ID or licence ID. Billing Store is used to resolve customer linkage when necessary. License Manager supplies the authoritative licence, components, activations/runtime state, pulse and audit history.

### `license_change`
Owner-only licence mutation. Actions include suspend, unsuspend/restore, revoke, rotate, component changes, installation unlock, runtime revalidation and customer licence linking.

Customer licence mutations are app-only and require explicit confirmation in the embedded Dev Panel UI.

### `diagnose`
Combined Base/Engine/License Manager/Billing Store diagnostic snapshot, optionally including a customer.

### `logs`
Reads GitHub Actions workflow/job/step state for Base, Engine, License Manager or Billing Store.

## Customer lookup by email

The preferred operator identity is the customer's email, for example:

`@Dev check person@example.com license`

Resolution is:

```
email
  -> Billing Store customer/account
  -> customer number + bindings/installations
  -> License Manager licence(s)
  -> authoritative runtime/release/update state
```

If a licence is not linked, `license_change action=link` can auto-link a single unambiguous License Manager match or link a supplied licence ID.

## Authentication

OAuth 2.1 + PKCE is owner-only and backed by the Dev Panel Owner account.

Client registration:

- CIMD is supported and preferred for current ChatGPT connections.
- DCR remains available as a compatibility fallback and can be disabled independently.
- CIMD client IDs are fetched only from the configured trusted host allowlist.
- PKCE S256, owner-only authentication and MCP resource binding are fixed security requirements, not bypass switches.
- Refresh-token issuance can be disabled from MCP Controls.
- Registered/cached clients and active sessions can be inspected or revoked from MCP Controls.

Scopes:

- `dev.read`
- `dev.write`
- `authority.write`

## MCP Controls

The Dev Panel MCP Controls page now manages:

- master enable/read-only/write gates;
- Base, Engine, License Manager and Billing Store exposure;
- every top-level MCP tool independently;
- granular write permissions for prepare, service deploys, Quick Deploy, workflow control, releases, customer updates and licence changes;
- embedded ChatGPT UI availability, fullscreen and PiP;
- CIMD, DCR and refresh-token policy;
- OAuth client/session visibility and revocation.

These settings only gate the single private `/devmcp` path. They do not create local licence, release or deployment authority.

The MCP remains structured: no generic shell, arbitrary SQL, arbitrary URL proxy, or secret reader.


## Control boundary

The MCP is deliberately split by caller surface:

- Model/chat-visible tools are read-only: `show_dev`, `status`, `license`, `diagnose`, and `logs`.
- Mutation-capable tools such as `prepare`, `deploy`, `release`, `release_build`, `update`, `license_change`, and `lockdown` are app-only.
- Opening the Dev Panel, asking to inspect/fix code, or asking for a plan does not grant mutation authority.
- A state-changing UI action requires an explicit owner click plus confirmation.
- Custom License Manager and V2 Billing Store production deploy workflows are manual-only. Dev Panel is the only project permitted to deploy automatically from a push to `main`.


## Explicit invocation rule

Dev mutation commands are opt-in, not inferred.

- Ordinary language such as `deploy this`, `prepare it`, `sync the branches`, `fix this`, or `release this` is not a Dev MCP mutation request.
- Normal repository edits, branch work and code fixes use the normal GitHub integration.
- Explicit `@Dev ...` requests may only stage a matching intent in the embedded Dev UI.
- Staging records `executed: false`; it does not call a mutation tool.
- The owner must still press the matching Dev UI button and accept the confirmation before any state-changing tool is called.
- Mutation tools remain app-only and are not model-visible.
- ChatGPT app permissions are configured to ask before Dev writes as an independent safety layer.
