# Vietmap And Deployment Storage Verification

Date: 2026-10-30. Checkout: `feature/demo-service-catalog`.

## Provider Selection

The owner selected Vietmap for address search, selected-place coordinates and
route matrices. Both provider variables in `backend/.env.example` now select
`vietmap`. Google is an optional explicit adapter, with no automatic fallback;
its server key and Cloud Billing are not required for this configuration. Goong
runtime branches, credentials and UI provider labels have been removed.

Live local Vietmap requests previously passed Search v4 (five suggestions),
Place v4 (one selected reference) and Matrix v4 (four elements with valid ETA).
Only public Hanoi sample locations were used. No additional paid requests were
made for the selection change. Google returned `REQUEST_DENIED` associated with
Billing before the owner selected Vietmap. No successful Google integration is
claimed. Matrix currently uses car travel without live traffic.

## Deployment Storage

`scripts/deployment/ensure-indexes.js` now calls additive storage provisioning
after registering the runtime models. It creates registered collections/indexes,
provisions enabled raw finance and scheduling storage, and checks payroll/source/
scheduling storage. It inserts no business fixtures and never drops indexes.

An isolated MongoDB 8.0.34 replica set, with automatic collection/index creation
disabled, verifies four cases: repeated provisioning preserves existing records;
disabled raw modules remain absent; obsolete payroll indexes stop deployment and
remain present; conflicting finance indexes stop deployment without losing data.
The repeated run also verifies source-event uniqueness and the location TTL index.

## Actual Checks

| Check | Result |
| --- | --- |
| Backend full suite | 109 suites, 956 tests passed |
| Frontend full suite | 85 suites, 526 tests passed |
| Backend provider suites after default changed to Vietmap | 2 suites, 13 tests passed |
| Backend and frontend lint | Passed |
| Package architecture | Passed |
| Frontend production build | Passed; 684.49 kB JavaScript bundle warning |
| Diff whitespace | Passed |

The full suite ran before the final search-default edit; the two affected
provider suites were rerun afterward. Existing authenticated desktop/mobile GPS
simulation evidence remains in the payroll/catalog integration report. These
checks do not verify real-device GPS, the facility pin, the VPS provider or
production data/index compatibility. Production activation still requires the
reviewed release, backup and successful provisioning against its own environment.
