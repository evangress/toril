# TODO

Longer-term tasks that aren't blocking the current milestone.

## Windows code signing — Azure Trusted Signing (long-term)

The released installers are **unsigned**, so Windows SmartScreen warns "Windows
protected your PC" on first run (documented in the README; users click *More info
→ Run anyway*). Plan is to adopt **Azure Trusted Signing** (~$10/month) to remove
this.

What it takes when we pick it up:

- Set up an Azure Trusted Signing account + certificate profile (requires identity
  validation — confirm eligibility for the individual vs. organization path; the
  org path historically needs 3+ years of verifiable business history).
- Add `bundle.windows.signCommand` to `src-tauri/tauri.conf.json` pointing at
  `trusted-signing-cli`.
- Add `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` / `AZURE_TENANT_ID` as GitHub Actions
  secrets and have the Windows job in `.github/workflows/release.yml` install
  `trusted-signing-cli` and sign during the build.
- Once signed, soften/remove the SmartScreen note in `README.md` and the landing
  page (`docs/index.html`).

Note: Azure Trusted Signing (OV-class) builds SmartScreen reputation over
downloads/time — it does not bypass the warning instantly the way an EV cert does.
