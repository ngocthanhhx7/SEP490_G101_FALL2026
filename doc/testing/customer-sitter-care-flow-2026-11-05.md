# Customer and Employee Care Flow

## Scope

Customer schedule confirmation retains its original slot and idempotency key after
an uncertain acknowledgement. Navigating to another proposal clears selection and
command state. Owner-scoped reads resolve only the sitter display name. Confirmation
still creates a pending invitation; the sitter must accept after eligibility checks.

The mounted sitter invitation workspace now includes execution controls for accepted
visits. The execution read checks assignment, active sitter status and booking scope;
it exposes state/version, start/end, check-in/out and checklist only. Mutations use
the existing finance-source writers with their time, payment, evidence binding,
checklist, optimistic-version and transactional completion rules.

Check-in and check-out upload separate private JPG/PNG images through the existing
private-image API. A command retry reuses the uploaded image ID; an uncertain upload
reuses its original upload key and bytes. Checklist skipped items require a reason.
Customer booking details show operational state and completion timestamps.

## Acceptance Boundaries

Use isolated MongoDB fixtures for assignment, image upload, checklist, completion,
notifications and customer review. Preserve all production data. Synthetic images,
contracts, labels and provider adapters do not establish actual customer consent,
GPS, receipt delivery or satisfaction. Real payment/provider acceptance remains a
separate gate. Missing historical care/checklist sources require operational review.

Configured verification includes architecture, both lints, affected MongoDB/HTTP and
React tests, frontend build, and browser interaction at desktop/mobile widths.
Record actual results in the PR and local handoff; this plan alone asserts no pass.

## Verification Recorded 2026-11-05

Author checks passed: package architecture, backend/frontend lint, frontend build,
134 backend suites / 1269 tests and 121 frontend suites / 860 tests.
The build retains the existing bundle-size warning.

The scheduling MongoDB suite exercises actual HTTP proposal confirmation and
replay, invitation acceptance, re-encoded private PNG upload through an in-memory
provider, evidence binding, check-in replay, checklist enforcement, checkout and
owner booking progress. It also checks execution auth/owner scope and private
no-store responses. Existing verified-review tests cover completion prerequisites.

Browser checks passed for Customer and Pet Sitter at 1440, 390 and 320 px,
including confirmation, lost check-in acknowledgement, stable-key retry, skipped
checklist reason and checkout. These browser endpoints use synthetic responses;
persistence is established separately by the MongoDB/HTTP tests. Screenshots were
inspected and no horizontal overflow or JavaScript errors were observed.

Regression coverage includes leaving during image upload, changing proposal
identity, incomplete acknowledgements, retained sitter summary after confirmation
and checkout disabled until the server has saved the checklist. No production
booking, evidence, review, financial source or model outcome was created by these
checks. PR review, CI and deployment results are recorded separately when performed.
