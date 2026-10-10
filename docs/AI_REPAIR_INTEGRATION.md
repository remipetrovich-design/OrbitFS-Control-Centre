# AI Repair Centre — Control Centre Integration

The AI Repair Centre workspace is available through the existing **Operate → AI Repair Centre** navigation, using the established Control Centre sign-in. Only owner sessions can access repair API data/actions. The global source profile is read from the authoritative fallback License Manager switch; the page does not create or change any profile state.

## Immediately usable without a repair service

- Read failed GitHub runs from the active profile's Base, Shared Engine and Dev Panel worker repositories.
- Inspect failed jobs, failed steps, and the error log.
- Copy a repair report to ChatGPT or Claude without any OpenRouter requests.
- Filter by Base/Engine and search incident history when the repair service is connected.

The existing GitHub environment variables `ORBITFS_RELEASE_DISPATCH_TOKEN` (Main read access) and `ORBITFS_FALLBACK_GITHUB_TOKEN` (Fallback read access) are used by the server for **read-only** GitHub API queries. The existing release dispatch policy is unchanged.

## Free GitHub Actions source check

The **Run GitHub source checks** action dispatches the manual `validate-source.yml` workflow in `remipetrovich-design/AI-Repair-Centre`. Set `AI_REPAIR_WORKER_GITHUB_TOKEN` on the Control Centre deployment: a token authorised to manually dispatch Actions in the AI Repair Centre repository. Configure `MAIN_REPAIR_READ_TOKEN` and `FALLBACK_REPAIR_READ_TOKEN` as GitHub Actions secrets in AI Repair Centre (source contents read access). The workflow verifies the exact pinned source commit, installs locked dependencies and runs Base/Engine checks. It is **source validation, not application of a proposed patch**. It does not deploy or publish.

The workflow is manual-only and is subject to GitHub Actions quotas for private repositories. No worker runs automatically as a result of the new UI.

## Full repair backend connection

When a securely hosted repair backend exists, configure `AI_REPAIR_SERVICE_URL` and `AI_REPAIR_SERVICE_TOKEN` as **server-side** Control Centre environment variables. Do not expose them with a `VITE_` prefix. Incident history, local diagnosis, OpenRouter proposals (automatic for new failures when the repair backend is configured) and isolated patch validation then use the authenticated repair service. When absent, UI explicitly marks those actions unavailable; it does not simulate repair success.

The current AI Repair Centre Node service requires persistent storage and Docker and is not automatically hosted by the Vercel Dev Panel. Further work is required to implement GitHub Actions-based **patch** validation and release recovery.

## Release authority

The AI Repair Centre cannot independently modify Base or Engine repositories, approve releases, bypass License Manager, deploy Vercel or publish customer updates. License Manager owns technical release state and deployment authorisation. Billing final review/publication is **always manual**. Existing Control Centre auto-deployment from `main` is preserved.

## Verification

All changes were committed on the existing `main` branches. The page and API have not yet been verified with a production build, a live Main/Fallback account, or a successful GitHub Actions worker run. GitHub returned no commit status checks for the latest commits.

## Automatic free AI policy

The backend can automatically run **one free-model OpenRouter analysis for each distinct recent failure signature** while the repair service is running, with persisted deduplication across reruns, a five-per-day maximum and a one-minute cooldown. It compares diagnostic class, source path, TypeScript/error code and normalised error text. Similar failures reuse an earlier diagnosis without a new model request. Only source diagnostics are cached for reuse; cross-commit patches are not applied. The operator may disable background calls with `REPAIR_AUTO_AI=false` on the backend. Missing OpenRouter credentials or persistent storage prevents automatic calls. The inline Base/Update **Fix** panel provides zero-cost deterministic advice even when no backend is connected.

This does not automatically run in Vercel simply because the UI is present. A durable repair worker remains a prerequisite for background model calls; don't show the service as connected until verified.
