# AGENTS.md

This repository is currently in a `UI refactor first` phase.

`AGENTS.md` is now the single source of truth for repository workflow. The `docs/` tree is intentionally empty on this branch; do not recreate long-form project docs unless the user explicitly asks for them.

## Branch Mission

The main job on this branch is to improve UI quality without casually rewriting product semantics.

Priorities:
- stronger visual hierarchy
- clearer product narrative
- tighter spacing, typography, and interaction craft
- better desktop/mobile consistency
- fewer generic AI-looking layouts

Non-goals unless explicitly requested:
- new product scope
- schema or API redesign
- AI pipeline redesign
- auth flow changes unrelated to the current UI task

## Project Map

- `app/`: Next.js App Router pages and route handlers
- `components/`: UI and feature components
- `components/drafts/`: draft workspace flows
- `components/tutorial/`: reading, rendering, generation progress
- `components/ui/`: shared primitives
- `lib/services/`: business orchestration
- `lib/repositories/`: DB access
- `lib/tutorial/`: tutorial assembly and payload construction
- `tests/`: node:test coverage for structure and core logic

## Commands

```bash
npm run dev
npm run build
npm test
npm start
```

Notes:
- `npm run dev` is configured for local isolation on this branch.
- Database-backed pages still require `DATABASE_URL`.

## Architecture Guardrails

- Keep the existing app/service/repository split.
- Do not move DB access into pages or view components.
- Preserve tutorial rendering architecture:
  - server assembles patches/highlighting
  - client consumes payload only
- Keep JS/TS mixed where the codebase already mixes them; do not mass-convert files.
- New client-side network calls belong in feature clients/hooks/controllers, not arbitrary JSX files.

## UI Refactor Workflow

Every substantial UI task should follow this loop:

1. Inspect the current page or flow in code and in a running browser.
2. State `must-keep behaviors`, `must-fix UX issues`, and `non-goals` before editing.
3. Choose an explicit visual direction:
   - purpose
   - tone
   - differentiation
   - banned patterns
4. Change one reviewable slice at a time:
   - one page
   - one flow
   - one component family
5. Verify in browser, not just in JSX.
6. End each iteration with one of two calls:
   - `KEEP-AND-ITERATE`
   - `DISCARD-AND-PIVOT`

Do not default to endless polishing on a weak direction.

## UI Scorecard

Use these dimensions when judging a refactor:

- `Design Quality`: hierarchy, composition, spacing, type, color discipline
- `Originality`: distinct point of view; avoids template/UI-kit feel
- `Craft`: responsive behavior, states, edge alignment, transitions, copy precision
- `Functionality`: preserved flows, intact interactions, no regression in usability

If a direction passes functionality but still feels generic, it is not done.

## File Strategy

- `AGENTS.md`: repository policy and working rules
- `CLAUDE.md`: Claude-facing entry point
- `.claude/skills/ui-refactor/SKILL.md`: UI refactor playbook
- `.claude/agents/ui-critic.md`: independent critic rubric

If a rule should persist across tasks, put it in one of those files instead of reviving `docs/`.

## Delivery Rules

When making UI changes:
- preserve routes, data contracts, and permissions unless the task explicitly includes them
- call out risky regressions
- verify desktop and mobile
- prefer removing dead styles/components over layering new ones on top
- keep explanations short and concrete

When reviewing UI changes:
- findings first
- include reproduction steps when possible
- separate direction problems from implementation bugs
