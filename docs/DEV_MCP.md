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

The UI supports inline, fullscreen and PiP display modes. UI buttons call the same MCP tools that are available through normal chat commands. Fullscreen includes prepare, service deployment, customer licence, customer update, release and live-job controls; PiP follows an active workflow.

Typical use:

- `@Dev show dev`
- `@Dev prepare both`
- `@Dev check person@example.com license`
- `@Dev suspend person@example.com`
- `@Dev show Engine status`
- `@Dev quick deploy License Manager`

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

Normal deploy requires a successful Full Scan for the exact current main commit. Quick Deploy is the explicit bypass path already provided by the service workflow. Billing Store Quick Deploy can also target an explicit branch because its existing workflow supports that input. Cancel/retry operate on an explicit GitHub workflow run ID.

### `release`
Reads and controls authoritative License Manager releases. Supports list/get/manifest/validation/source/build/failures/compare and lifecycle controls such as approve, reject, publish, withdraw, archive, restore, promote and rollback.

### `update`
Resolves the customer/install, reads the authoritative update from License Manager, calculates the component plan, and uses the Billing Store customer deployer for apply/retry/rollback.

### `license`
Reads a customer licence by email, customer number, account ID or licence ID. Billing Store is used to resolve customer linkage when necessary. License Manager supplies the authoritative licence, components, activations/runtime state, pulse and audit history.

### `license_change`
Owner-only licence mutation. Actions include suspend, unsuspend/restore, revoke, rotate, component changes, installation unlock, runtime revalidation and customer licence linking.

Normal customer licence actions do not add an extra Dev MCP confirmation step.

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

Scopes:

- `dev.read`
- `dev.write`
- `authority.write`

The MCP remains structured: no generic shell, arbitrary SQL, arbitrary URL proxy, or secret reader.
