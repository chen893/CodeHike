# Codebase Structure

## Current Layout

- `app/` — Next.js routes and route handlers. Only owns request/response shaping and page composition.
- `components/drafts/` — draft feature clients, hooks, and split workspace subviews.
- `components/tutorial/` — tutorial reader/rendering helpers, remote loaders, and generation progress protocol handling.
- `components/ui/` — shared presentational primitives.
- `lib/services/` — query/command orchestration consumed by `app/*`.
- `lib/tutorial/` — tutorial assembly, payload construction, patch validation, and registry-backed sample content.
- `lib/repositories/` / `lib/db/` — persistence layer.
- `lib/types/` / `lib/utils/` — app-facing DTOs and generic helpers.

Legacy files such as `lib/tutorial-assembler.js` remain only as compatibility shims. New code should import `lib/tutorial/*` directly.

## Target Layering

### `app/`

- Owns routing, metadata, request/response translation, and choosing which feature/component tree to render.
- May import `components/*`, `lib/services/*`, and route-safe helpers such as `next/*`.
- Must not import `lib/repositories/*`, `lib/db/*`, `lib/tutorial/*`, or other render-pipeline internals directly.
- Server records returned to client components should be serialized through app-facing DTO helpers such as `lib/utils/client-data.ts`.

### `components/`

- Owns UI rendering and local interaction state.
- Feature containers may coordinate hooks and child components, but request URLs and response parsing should live in feature client modules such as `components/drafts/draft-client.ts`.
- Hooks/controllers own async state transitions, retries, and request-order invalidation. View files should not call `fetch()` directly.
- Shared primitives stay in `components/ui/*`.

### `lib/services/`

- Owns use-case orchestration.
- This is the main boundary consumed by `app/*`.
- Services may compose repositories, schemas, AI modules, tutorial render helpers, and domain utilities.

### `lib/repositories/`

- Owns persistence only.
- No UI concerns, no route shaping, no request parsing.

### `lib/tutorial/`

- Owns tutorial assembly, payload construction, and registry-backed content loading.
- These are internal pipeline modules and should be wrapped by services before reaching `app/*`.

### `lib/ai/`

- Owns prompt construction and AI orchestration only.

### `lib/schemas/` and `lib/types/`

- `schemas`: validation and domain structure constraints.
- `types`: DTOs or shared app-facing types that are not themselves validation schemas.

### `lib/utils*`

- Generic helpers only.
- Domain-specific helpers should live closer to their owning service or domain module.

## Import Rules

- `app/*` -> `components/*`, `lib/services/*`
- `components/*` -> `components/*`, `lib/types/*`, `lib/schemas/*`, feature-safe helpers
- `lib/services/*` -> `lib/repositories/*`, `lib/tutorial/*`, `lib/ai/*`, `lib/schemas/*`, `lib/utils/*`, `lib/types/*`
- `lib/repositories/*` -> `lib/db/*`, shared types/schemas

## Verification

- `npm run build` verifies the route graph and type boundaries.
- `npm test` guards the `app -> service` import rule plus request-version and patch-chain helper behavior.
