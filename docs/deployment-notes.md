# Sprite deployment notes

Issue #154 deployment record. The publisher should run the clean install, static build,
`bash scripts/capture-deploy-url.sh`, and `node scripts/verify-deployed-ui.mjs` from
the tip of `main` after this change is committed.

- Deployed commit: pending publisher deployment
- Live URL: pending `scripts/capture-deploy-url.sh`
- Verification: pending; the verifier checks `/release.json`, the footer build hash,
  and the T lip geometry thresholds used by the test suite.
