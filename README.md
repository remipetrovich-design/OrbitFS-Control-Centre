# OrbitFS Release Control

Stage 1 of the OrbitFS release pipeline.

The Dev Panel prepares release candidates for two separate systems:

- **Base Deployment:** `V1-vercel-base` / `base-release` for bare Base deployments and major Base releases.
- **Update Release:** `V1-vercel-engine` / `UPDATE_RELEASE` for ongoing Engine/addon releases and supported incremental changes to installed OrbitFS Base systems.

The Dev Panel handles source inspection, change detection, release metadata, changelog generation/review, GitHub workflow dispatch, live run monitoring, and the License Master handoff. It does **not** publish customer releases.

## Pipeline

**Base Deployment**

`V1-vercel-base` → Dev Panel → Custom License Manager → V2_Billing_Store Admin → Customer Portal Base Deployer

**Update Release**

`V1-vercel-engine` → Dev Panel → Custom License Manager → V2_Billing_Store Admin → Customer Portal Frontend Updater

The existing Base Deployer remains the deployment mechanism for new installations and major Base releases. The Frontend Updater is the ongoing customer update mechanism.

## Configuration

The production API boundary is:

`https://incendiarynetworks.cc/api/v1`

License Master remains the validation/approval authority after Stage 1.

## Development

Use `npm install` then `npm run dev` for local development.

## Private ChatGPT / Codex MCP

Dev Panel also hosts the owner-only private developer MCP at:

`https://dev.incendiarynetworks.cc/devmcp`

It is an interface into the existing Dev Panel and authoritative OrbitFS services, not a second control plane.

- ChatGPT/Codex can open the embedded Dev Panel with `show_dev`.
- `prepare base|engine|both` uses the source repositories' existing guarded release-branch workflows.
- Customer licence commands accept email/customer identity and read authoritative licence/runtime data from Custom License Manager.
- V2 Billing Store is used only when customer/account linkage, installation context, or customer deployer execution is required.
- UI buttons and chat commands use the same MCP tools.

See `docs/DEV_MCP.md` for the tool contract.

