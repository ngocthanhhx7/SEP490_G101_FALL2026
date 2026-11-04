# Dispatch recovery evidence — 4 November 2026

Fresh read-only production audit found one POSTPAY/UNPAID, APPROVED,
DISPATCH_PENDING booking and one overdue SCHEDULED visit with no offers.
The visit used CITY_HANOI. Historical replay at booking creation, without
commercial routing, found one registered city-wide candidate rejected for missing
service capability. This is not a live eligibility result or a provider test.
District-only registrations cannot establish whole-city coverage.

The release adds aggregate failure reasons, bounded alternative-time candidate
previews, and Staff proposals for system bookings. A proposal can refine a home
area within its original city, retaining the saved pin. Only owning-customer
confirmation changes operational time/area and creates an invitation. Price,
checkout snapshots, requested-sitter constraints and acceptance checks remain.

Validation so far: isolated Mongo integration scheduling suite 21 tests passed;
full backend 121 suites / 1065 tests and frontend 100 suites / 655 tests passed; architecture, backend/frontend lint
and frontend build passed. Six synthetic browser cases (STAFF/ADMIN at
1440/390/320 px) exercise rejection reasons, area refinement, preview,
unknown acknowledgement and same-key retry. Mobile screenshot inspected.
Independent review/release checks are recorded on the final PR.

Browser API responses are synthetic. No real booking, proposal, acceptance,
payment, notification or outcome was created for verification. Existing overdue
customer work requires a real customer-approved alternative; deployment does not
fabricate that consent. A trained AI model and real customer/sitter acceptance
are separate operational gates.

The initial full backend run failed in two pre-existing fixture suites because
catalog provisioning used wall-clock time while checkout used fixed dates.
Those fixtures now provision with their test clocks; the subsequent full run
passed. The first focused UI run used an exact required-field label matcher;
the corrected accessible-label query and full rerun passed. Existing Vite bundle
size warning remains. Empty AI advice now explains returned quality/schedule/
routing exclusions and retains explicit system fallback without a fake MATCH.

A final recovery regression exercises a second eligible employee after customer
confirmation. Without pinning the consented nominee, the worker created two
offers instead of one. Confirmation now records that nominee as the operational
requested sitter, preserving the original checkout snapshot. The regression is
behavioral: it checks persisted offers after the worker runs, not just a field.
