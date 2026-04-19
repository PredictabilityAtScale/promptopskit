# Publishing promptopskit

## The Only Two Commands You Need

```powershell
npm version patch      # or minor or major
git push --follow-tags
# done. go get a coffee.
```

That's it. The GitHub Action does the rest — lint, test, build, publish to npm via **Trusted Publishing** (OIDC). No tokens, no OTP, no manual publish.

---

## Wait, Which Version Bump Do I Use?

| Command             | When to use it                                      | Example          |
|----------------------|-----------------------------------------------------|------------------|
| `npm version patch` | Bug fixes, typos, small tweaks                      | 0.0.1 → 0.0.2   |
| `npm version minor` | New features that don't break existing usage        | 0.0.2 → 0.1.0   |
| `npm version major` | Breaking changes (renamed exports, removed options) | 0.1.0 → 1.0.0   |

## What Happens Behind the Scenes

1. `npm version patch` bumps the version in `package.json` and creates a git commit + tag (`v0.0.2`)
2. `git push --follow-tags` pushes the commit and tag to GitHub
3. The `v*` tag triggers the **Publish** workflow (`.github/workflows/publish.yml`)
4. The workflow runs lint → test → build → publint → attw → `npm publish`
5. npm authenticates via **OIDC Trusted Publishing** — no secrets needed
6. Provenance attestation is generated automatically
7. The package appears on npm

## How Trusted Publishing Works

Instead of storing an npm token as a GitHub secret, the publish workflow uses GitHub Actions OIDC to prove its identity to npm. npm verifies the request came from:

- **Org/user:** `PredictabilityAtScale`
- **Repo:** `promptopskit`
- **Workflow:** `publish.yml`

This is configured in npm's package settings under **Trusted Publishers**. No long-lived tokens to rotate or leak.

## Pre-flight Checklist

Before running the commands:

- [ ] You're on the `main` branch
- [ ] All your changes are committed (`git status` shows clean)
- [ ] Tests pass locally (`npm test`)

## Troubleshooting

### "Git working directory not clean"

You have uncommitted changes. Commit them first:

```powershell
git add -A
git commit -m "describe what you changed"
```

Then try `npm version patch` again.

### Publish workflow didn't trigger

Go to `github.com/PredictabilityAtScale/promptopskit/actions` and check if you see the **Publish** workflow. If not, delete and re-push the tag:

```powershell
git tag -d v0.0.X
git push origin :refs/tags/v0.0.X
git tag v0.0.X
git push origin v0.0.X
```

(Replace `v0.0.X` with your actual version.)

### Publish workflow failed with auth error

1. Go to [npmjs.com](https://www.npmjs.com) → package settings for `promptopskit` → **Trusted Publishers**
2. Verify the trusted publisher is configured with:
   - **Organization/user:** `PredictabilityAtScale`
   - **Repository:** `promptopskit`
   - **Workflow filename:** `publish.yml`
3. Re-run the failed workflow from the Actions page

### The workflow file must be on main BEFORE tagging

If you add or change the publish workflow and tag in the same push, GitHub may not pick up the workflow. Always push the workflow change to `main` first, then create the tag.

## Do NOT

- Run `npm publish` manually from your laptop
- Skip tests before publishing (the `prepublishOnly` script blocks you anyway)
- Push to npm and then realise you forgot to commit something
