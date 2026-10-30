# Selected-Service Booking

## Findings and Changes

The service detail action previously opened `/sign-in?serviceId=...` even for
authenticated users; that query was not consumed. The separate catalogue basket
started empty and did not receive the clicked service. Customer registration
retained the authenticated welcome screen. The new `/booking/:serviceId` route
connects catalogue/detail actions to a selected-service flow; all login roles and
Customer registration return to Home. Verified sitter application remains intact.

The flow collects owned pets, confirmed address, location, units and each visit's
schedule, then displays server quote, system or directed sitter selection,
service policies and final confirmation. Lost confirmation responses retain the
same command body/key. Private drafts are memory-only. The existing combined
service basket, Staff care-plan approval and verified-payment rules are retained.

Directed search calls `/checkout/availability` using a current owned quote. It
filters by public moderation, active employee/status, verified capability,
contract, registered area/shift, leave, occupancy and route evidence. No slot is
reserved; checkout repeats eligibility with employee guards in its transaction,
then invitation and acceptance recheck it. Search is bounded and reports whether
complete. Boarding is not offered for directed selection until Staff splits it.

System selection can request the current explainable ranker for supported home
care at least 24 hours ahead. MATCH owner/expiry/pets/address/versions/schedule
are verified at checkout. Candidate order reaches dispatch after deterministic
eligibility filters. AI does not calculate prices, guarantee a slot or assign.
Specialized/short-notice services retain operational dispatch rather than a fake
AI result. No new pricing, tax, employee or training policy was invented.

HouseBuddy public site and local `FE/src/pages/customer/CreateBookingPage.tsx`
were inspected as navigation references. Its pricing, data and private draft
storage were not copied into PawWorld.

## Verification

Synthetic Mongo integration covers availability, foreign quote, employee newly
occupied before checkout, system checkout, MATCH scope, replay and full employee
invitation/acceptance gates. UI regressions cover system/direct/MATCH checkout,
empty eligibility, uncertain retry, Home login and booking links. Browser checks
at 1440 and 390 pixels exercise all three selections with synthetic adapters.
Final configured checks and release evidence are recorded in the PR.

Final local checks: backend 118 suites / 1,014 tests; frontend 93 suites / 568
tests; architecture, both lint and Vite build passed. The final population
weight/breed adjustment was also rerun in its Mongo integration suite. Browser
SYSTEM/DIRECT/AI at 1440/390 passed with no page errors or horizontal overflow;
desktop/mobile screenshots were inspected. Vite still reports large bundles.

## Production Source Gate

Read-only aggregate audit on EC2 at 2026-10-30 09:14 UTC, before the subsequently
authorized sample population, found zero active pet
sitters, approved public profiles, approved applications, capability profiles,
registered working areas/shifts and signed effective employment contracts.
There was one approved ranking policy and no approved rank model or outcomes.
AUTH/AI/checkout/employee scheduling/dispatch flags were enabled. No personal
records were exported and no operational data was fabricated.

The owner subsequently requested [labelled Hanoi demo data](hanoi-demo-population-2026-10-30.md)
on local and VPS. Demo candidate selection can use those explicit sample
contracts/capabilities/shifts; it is not real employee onboarding or live service
acceptance. They have no login contacts, payment or verified outcome history.

A user can submit a booking request for Staff to arrange, but no real
sitter can currently be recommended or assigned until authorized onboarding,
contract, capability, public moderation and shift/area registration are complete.
Passing fixture tests does not prove payment delivery, real assignment,
completion, GPS or verified satisfaction in production. Training readiness and
feature retention/export/correction decisions remain outside this release.
