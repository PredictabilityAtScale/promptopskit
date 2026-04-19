# PromptOpsKit Marketing Audit and Website Plan

## Scope

This audit reviews the current repository messaging (especially `README.md`), identifies conversion and clarity gaps for a developer audience, and proposes a standalone marketing site in `website/`.

## Current repo strengths

1. **Strong technical depth**: README explains architecture, provider support, overrides, composition, and API details.
2. **Real implementation credibility**: examples and CLI coverage signal production intent.
3. **Clear open-source positioning**: MIT license and explicit no-lock-in approach are present.

## Problems observed

### 1) README is optimized for existing users, not first-time evaluators

- The README has extensive details and many sections before a concise value hierarchy is established.
- New visitors must parse a lot of implementation material before understanding the product's outcome for teams.

**Solution in marketing site**
- Lead with a short developer value proposition.
- Add an immediate “why adopt” section with three concrete outcomes.
- Keep quick-start command block near the hero.

### 2) Value differentiation exists but is not tightly packaged for decision makers

- Differentiators such as “request-body-only adapters”, “overrides precedence”, and “pre-compile for production” are present but spread across sections.

**Solution in marketing site**
- Consolidate differentiators into scannable feature cards.
- Prioritize claims tied to operational outcomes: portability, release safety, and prompt governance.

### 3) The repo currently lacks a purpose-built landing experience

- There is no standalone page designed for top-of-funnel traffic from npm/GitHub/social links.
- No short narrative path from problem → capability → proof → CTA.

**Solution in marketing site**
- Add a static, framework-free landing page under `website/`.
- Keep this independent from library docs and package build/publish flow.

### 4) Design style in many AI-tool landers can feel generic

- Common patterns include heavy gradients, oversized “chip” labels, and highly rounded cards/buttons, which can reduce trust for technical audiences expecting precision and seriousness.

**Solution in marketing site**
- Flat background, restrained color system, low-radius corners, clear typographic hierarchy, and direct technical copy.

## Reference review (developer-focused OSS/product pages)

The proposed layout and copy structure were informed by public pages such as:

- LangChain product page patterns (clear value prop + adoption outcomes + CTA).
- LangGraph/LangChain ecosystem positioning (choose abstraction level for different teams).
- Supabase developer homepage structure (modular capability sections and clear open-source framing).
- Temporal messaging style (developer reliability + production outcomes).

## Information architecture for the new standalone website

1. **Hero**: one-sentence positioning + install/docs CTAs.
2. **Why adopt**: three outcome-focused cards.
3. **Features**: engineering workflow capabilities in compact lists.
4. **Quick start**: real commands and code snippet.
5. **Open source close**: governance and repository CTA.

## Packaging and distribution considerations

- The site lives in `website/` and does not affect runtime library code.
- npm package remains unaffected because publish `files` includes only `dist/`.
- This setup supports future deployment to any static host without changing package outputs.

## Next iteration recommendations

1. Add social proof (logos or usage metrics) once available.
2. Add “Architecture” section with one diagram for include/override/render pipeline.
3. Add benchmarks for parse/compile/validate latency.
4. Add docs deep-links per audience (library user vs platform engineer vs AI infra team).
