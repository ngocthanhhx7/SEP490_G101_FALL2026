# Package responsibilities

The team's frontend/backend package diagrams describe ownership and dependency direction. They do not require deleting useful modules or moving component-specific CSS into a global stylesheet. These rules apply to every agent and contributor; see [AGENTS.md](../../AGENTS.md) and [review rules](code-review-process.md).

| Package | Responsibility | Dependency constraints |
| --- | --- | --- |
| frontend/app | Bootstrap and providers | Compose routes/providers; no page-owned shared styles |
| frontend/routes | Route manifests and guards | Compose pages/layouts |
| frontend/layouts | Shared shells | Components, hooks, contexts, services; no pages |
| frontend/pages | Route-level presentation | Use components/hooks/services; no exported route manifests |
| frontend/components | Reusable UI and composites | No pages, layouts or route manifests |
| frontend/services | HTTP transport and DTO adaptation | No React pages/components/contexts |
| frontend/hooks, contexts | State and effects | No pages/layouts/route manifests |
| frontend/utils, constants | Pure helpers and values | No upper presentation layers |
| frontend/styles | Shared styles | Component-specific styles can remain co-located |
| backend/routes | Middleware ordering, controller wiring | Composition factories may construct services/models; no queries/domain calculations |
| backend/controllers | HTTP input/output and status mapping | Services, validators, utils/constants; no model queries |
| backend/services | Domain decisions and persistence orchestration | Models/config/validators/utils/constants; no routes/controllers/middlewares |
| backend/models | Schema, indexes, collection identity | No services or HTTP layers |
| backend/validators | Pure DTO validation | Utils/constants only |
| backend/config | Validated settings and composition | `provider-ports.js` explicitly composes provider services |
| backend/jobs | Bounded scheduled orchestration | Services/models/config/utils/constants |
| backend/utils, constants | Low-level reusable primitives | No upper layers |

Composition roots (`app.js`, `runtime.js`, `routes/*runtime*`, `routes/auth.module.js`) wire dependencies; that exception does not permit services to depend on HTTP layers. The architecture checker validates static JS/JSX import edges and AST route handlers. Runtime behavior is established separately by tests.

## Pricing and recommendations

`backend/src/services/pricing/` owns approved, versioned deterministic price calculation. Money remains integer VND; percentages use integer basis points and explicitly approved rounding. AI cannot set price, fees, tax, earning or transfers. Unresolved legal/business policies remain disabled instead of guessing a tax rate.

`backend/src/services/sitter-matching/` owns advisory candidate scoring, schedule feasibility and bounded route-matrix lookup. It can read shared pet/service context but does not load pricing models or policies. A recommendation is not an invitation, assignment or booking. The existing authoritative invitation/assignment commands must recheck eligibility, expiry and occupancy before writing.

Public APIs are `/api/v1/pricing/quotes`, `/api/v1/pet-care/*` and `/api/v1/ai/recommendations`. `AI_ENABLED` controls matching only. Quote and matching snapshots have separate kind/owner/expiry checks. Renamed Mongoose model names retain existing collection names; never silently create an empty replacement collection or delete old data.

Python training tools live under `backend/scripts/ai/`, outside runtime source. Grouped temporal splitting does not itself prove feature availability at prediction time. Record point-in-time provenance before using real training data; never report fixture metrics as production evidence.

## Checks and releases

Run `npm run check:architecture` in backend, both packages' lint/tests, and frontend build. Add focused regressions for moved behavior. CI repeats architecture checks. A passing architecture check cannot prove all domain logic is correct.

Assigned identities are task-specific: read the current work assignment and verify the authenticated account before each mutation. Check all PR commits when selecting an independent reviewer; an account contributing to the reviewed change cannot be its sole independent reviewer. Do not turn a historical refactor's Thành/Nhật assignment into the default for all work. Feature PRs target develop; production releases target main through reviewed PRs. Hotfixes originate at main and return to develop through a synchronization PR. Never bypass branch protection or invent an approval. Keep production `.env`, keys and persistent MongoDB volumes outside Git and release archives.
