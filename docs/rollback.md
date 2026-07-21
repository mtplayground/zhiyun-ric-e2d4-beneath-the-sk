# Versioning and Rollback Procedure

The `v1.0` release is the stable backup point for the deployed Beneath the Skin
static dashboard. It is anchored in two ways:

- Annotated tag: `v1.0`
- Backup branch: `backup/v1.0`

The tag message is `V1.0 stable backup`. The backup branch is a secondary anchor
for repository hosts and tools that surface branches more prominently than tags.

## Verify the release anchors

Fetch tags and the backup branch before starting recovery work:

```bash
git fetch origin main --tags
git fetch origin backup/v1.0:refs/remotes/origin/backup/v1.0

git show --no-patch --decorate v1.0
git log --oneline --decorate -1 origin/backup/v1.0
```

Both refs should point at the intended stable release commit. Prefer the
annotated `v1.0` tag as the source of truth; use `backup/v1.0` as a redundant
reference if a workflow cannot consume tags directly.

## Recommended safe restore path

Use a pull request from a branch created at `v1.0`. This keeps shared history
intact, gives reviewers a normal diff, and lets CI/build checks run before the
restore reaches `main`.

```bash
git fetch origin main --tags
git checkout -b restore/v1.0 v1.0

# Optional: inspect the restored release locally before opening the PR.
npm ci
npm run build:static

# Push the restore branch and open a PR into main.
git push -u origin restore/v1.0
gh pr create \
  --repo mtplayground/zhiyun-ric-e2d4-beneath-the-sk \
  --base main \
  --head restore/v1.0 \
  --title "Restore main from v1.0" \
  --body "Restores main to the v1.0 stable backup."
```

After the PR is reviewed, merge it with the repository's normal merge strategy.
If follow-up fixes are required, commit them on `restore/v1.0` before merging so
`main` remains reviewable and auditable.

## Verify a restored checkout builds cleanly

Before merging the restore PR, verify the restored branch locally:

```bash
npm ci
npm run test
npm run build:static
```

For a browser smoke test, serve the static production build:

```bash
npm run preview:static
```

Open `http://localhost:8080/` and confirm:

- The Beneath the Skin dashboard renders with styling applied.
- The 3D viewport loads or shows a clear asset diagnostic.
- Preset selectors, keyboard mode, sliders, live readout, and deformation curve
  remain synchronized.

## Last-resort hard reset

A hard reset of `main` followed by a force-push rewrites shared history. Use it
only when the repository owner explicitly approves it and the pull-request based
restore path cannot recover the project safely.

```bash
git fetch origin main --tags
git checkout main
git reset --hard v1.0
npm ci
npm run test
npm run build:static

# Last resort only: rewrites origin/main history.
git push --force-with-lease origin main
```

Prefer `--force-with-lease` over `--force` so Git refuses to overwrite remote
work that was pushed after your last fetch.
