# Workflows

This document describes the GitHub Actions workflows and common development procedures for promptopskit.

## GitHub Actions

### CI (`.github/workflows/ci.yml`)

Runs on every push to `main` and on pull requests (ignoring docs/website/markdown changes).
Release bump commits created by the `release:*` scripts are skipped so tagging a version does not run CI twice.

- Tests against the minimum Node 22.18.0 and the latest Node 22, 24, and 26 releases
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

### Dependency updates

Use Node.js 22.18.0 or later (`.nvmrc` records the minimum). Keep `@types/node`
on the Node 22 line so type checking does not accidentally allow APIs unavailable
on the minimum runtime. TypeScript stays on 6.x because tsup's declaration
generation needs the JavaScript compiler API that TypeScript 7 removed.

After updating dependency ranges, regenerate `package-lock.json` with npm and
verify a clean install with `npm ci`. Run `npm run lint`, `npm test`,
`npm run build`, `npx publint`, `npm run attw`, and `npm audit` before release.
Review breaking changes explicitly; pre-1.0 breaking changes use a minor version
bump, such as 0.12 to 0.13.

### Release steps

1. Make sure you're on `main` with a clean working tree.

2. Bump the version:
   ```sh
   npm run release:patch   # bug fixes (0.1.1 → 0.1.2)
   npm run release:minor   # new features (0.1.1 → 0.2.0)
   npm run release:major   # breaking changes (0.1.1 → 1.0.0)
   ```
   This updates `package.json`, creates a `[release]` git commit, and creates a `v*` tag.

3. Push the commit and tag:
   ```sh
   git push --follow-tags
   ```

4. The **Publish** Action triggers automatically, runs all checks, and publishes to npm.

5. Monitor the run at https://github.com/PredictabilityAtScale/promptopskit/actions to confirm it succeeds.

We keep the push outside the `release:*` scripts so the remote-changing step stays explicit and reviewable.

That's it — two commands: `npm run release:*`, `git push --follow-tags`.
