# Workflows

This document describes the GitHub Actions workflows and common development procedures for promptopskit.

## GitHub Actions

### CI (`.github/workflows/ci.yml`)

Runs on every push to `main` and on pull requests (ignoring docs/website/markdown changes).

- Tests against Node 20 and 22
- Steps: `npm ci` → `lint` → `test` → `build` → `publint` → `attw`

### Publish (`.github/workflows/publish.yml`)

Runs automatically when a tag matching `v*` is pushed.

- Steps: `npm ci` → `lint` → `test` → `build` → `publint` → `attw` → `npm publish --access public`
- Publishes to npm using the repository's `NODE_AUTH_TOKEN` secret

**Do not run `npm publish` locally.** The Action handles it.

### Deploy Website (`.github/workflows/website.yml`)

Runs when `website/` or `docs/` files change on `main`, or via manual dispatch.

- Copies `docs/*.md` into `website/docs/`
- Syncs the `website/` directory to S3
- Invalidates the CloudFront cache

## Publishing a New Version

1. Make sure you're on `main` with a clean working tree.

2. Bump the version:
   ```sh
   npm version patch   # bug fixes (0.1.1 → 0.1.2)
   npm version minor   # new features (0.1.1 → 0.2.0)
   npm version major   # breaking changes (0.1.1 → 1.0.0)
   ```
   This updates `package.json`, creates a git commit, and creates a `v*` tag.

3. Push the commit and tag:
   ```sh
   git push && git push --tags
   ```

4. The **Publish** Action triggers automatically, runs all checks, and publishes to npm.

5. Monitor the run at https://github.com/PredictabilityAtScale/promptopskit/actions to confirm it succeeds.

That's it — three commands: `npm version`, `git push`, `git push --tags`.
