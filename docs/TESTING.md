# Backend Testing

## Commands

| Command | Purpose |
|---------|---------|
| `npx yarn@1.22.22 test` | **CI gate** — full suite (unit + integration), whole-app coverage ≥ **60%** |
| `npx yarn@1.22.22 test:unit` | Unit only (`*.test.ts`, no Mongo); whole-app gate ≥ **60%** lines/statements |
| `npx yarn@1.22.22 test:integration` | Integration only (`*.integration.test.ts`); whole-app gate ≥ **50%** |
| `npx yarn@1.22.22 test:all` | Same as `test` (alias of `jest.all.config.ts`) |

## Coverage scope

Every config measures the **whole application**, not selected modules:

- `src/**/*.ts`
- Excludes: tests, `__tests__`, `generated/`, top-level `types/`, `server.ts`, `testUtils/`, and per-feature `types.ts` (type-only modules)

| Layer | Command | Threshold (whole app) | Typical measured % |
|-------|---------|----------------------|-------------------|
| Combined (CI) | `test` | **60%** statements/lines/functions, **50%** branches | ~82% |
| Unit alone | `test:unit` | **60%** statements/lines, **50%** branches | ~62% |
| Integration alone | `test:integration` | **50%** / **45%** branches | ~68% |

## Test types

**Unit** — `*.test.ts`. No `setupMemoryMongo()`. Mock at module boundaries (queries, not `src/models/` in integration style). Focus on pure logic, validation, mappers, and handler flows with mocked persistence.

**Integration** — `*.integration.test.ts`. Must call `setupMemoryMongo()`. Real Mongoose models, HTTP + DB proof where applicable.

## Integration rules

- Do not `jest.mock()` anything under `src/models/` in integration tests.
- Do not use `controllerMarker` or mocked controllers in route integration tests.
- Use `jest.spyOn(Model, 'method')` only for forced persistence failures.
- Prefer real `User`, `Session`, and `UserAuth` rows; use `createSession()` for authenticated HTTP.
- Per feature: success + DB proof, rejection with no DB change, and edge cases when warranted.
- Remove duplicate unit/integration coverage for the same behavior at the same level.

## Utilities

`src/testUtils/db`: `setupMemoryMongo()`, factories (`createUser`, `createClub`, `createTournament`, …).

`requestJson()` from `src/testUtils/integrationTestUtils` for Express route tests via `buildJsonApp()`.
