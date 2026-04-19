# Publishing promptopskit

## The Only Three Commands You Need

```powershell
npm version patch      # or minor or major
git push --follow-tags
# done. go get a coffee.
```

That's it. The GitHub Action does the rest — lint, test, build, publish to npm with provenance.

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
4. The workflow runs lint → test → build → publint → attw → `npm publish --provenance`
5. The package appears on npm

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

### Publish workflow failed

1. Check the Actions log for the error
2. If it says `NPM_TOKEN` is missing, add it: **Repo Settings → Secrets and variables → Actions → New repository secret** → Name: `NPM_TOKEN`, Value: your npm token
3. Re-run the failed workflow from the Actions page

### I need a new npm token

1. Go to [npmjs.com](https://www.npmjs.com) → avatar → **Access Tokens**
2. **Generate New Token** → **Granular Access Token**
3. Name: `promptopskit-publish`, Packages: **Read and write**, Scope: `promptopskit` only
4. Copy the token and add it as the `NPM_TOKEN` secret in GitHub (see above)

## Do NOT

- Run `npm publish` manually from your laptop
- Skip tests before publishing (the `prepublishOnly` script blocks you anyway)
- Push to npm and then realise you forgot to commit something
