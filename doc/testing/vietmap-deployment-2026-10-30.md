# Vietmap And Deployment Storage Verification

Date: 2026-10-30. Checkout: `feature/demo-service-catalog`.

## Final Integrated Checks

After merging reviewed #63/#64/#65 into the catalog branch: backend 114 suites /
979 tests passed, backend lint/architecture and production dependency audit passed.
Frontend 87 suites / 533 tests, lint and build passed; initial JS 687.81 kB plus
lazy Vietmap SDK 768.47 kB (bundle warnings remain). Python AI tooling passed 13
tests; deployment tooling passed 6 synthetic tests. These checks do not deploy VPS.

Final browser follow-up loaded sprite JSON and PNG with HTTP 200 on both 1440px
and 390px, addressing the SDK's absolute sprite URL requirement. Customer pin
selection, explicit confirmation reset, persistence and visible save acknowledgement
after setup reload passed at both widths, with no overflow/page errors. Freshness
tests also verify automatic removal after ninety seconds without a poll response.
VPS Tilemap key presence was confirmed without exposing its value.

## Embedded Map Follow-up

Live Tilemap street-style request returned HTTP 200 with the separately configured
key. Playwright at 1440px and 390px rendered real street tiles/fonts through the
authenticated proxy: 20 resource responses returned HTTP 200. Screenshots were
inspected; cropped screenshot pixels contained 1,874/1,036 distinct sampled colors.
WebGL direct readback was blank after compositing, so screenshot pixels were used.
Both viewports changed the pin on click without horizontal overflow.
Authenticated customer forms saved the selected coordinates into the isolated
MongoDB fixture at both widths. Moving a confirmed pin cleared confirmation;
neither viewport produced a page error. No production address was created.

The latest combined run before dependency synchronization passed backend 113
suites/977 tests and frontend 87 suites/530 tests. Frontend build passed with
687.27 kB initial JS and a lazy 768.47 kB Vietmap SDK chunk; size warnings remain.
Production dependency audit reports zero vulnerabilities. SDK installation reports
five low-severity development dependency findings, which are not runtime packages.

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
| Backend full suite after integrating reviewed #91 | 112 suites, 965 tests passed |
| Frontend full suite after integrating reviewed #91 | 86 suites, 527 tests passed |
| Backend provider suites after default changed to Vietmap | 2 suites, 13 tests passed |
| Backend and frontend lint | Passed |
| Package architecture | Passed |
| Frontend production build | Passed; 684.49 kB JavaScript bundle warning |
| Diff whitespace | Passed |
| Python AI/data tooling | 13 tests passed |
| Python deployment tooling | 6 tests passed; synthetic activation only |
| Backend production dependency audit | No vulnerabilities reported |

The initial 109-suite backend and 85-suite frontend run preceded the #91 merge.
After merging reviewed develop `88756f4`, one full run hit the unintended Jest
five-second default during Mongo startup and a child-process runtime check. It
was stopped and not counted as a pass. Project-specific setup now applies the
intended 10-second unit and 180-second integration deadlines. The two affected
integration suites then passed all 27 tests, and a fresh full run passed with
the counts above, including the final Vietmap search default. No runtime timeout
or domain assertion was relaxed.

The local private `.env` now explicitly selects Vietmap for both search and
routing, with no credentials changed. The VPS environment/release was not changed.
Existing authenticated desktop/mobile GPS
simulation evidence remains in the payroll/catalog integration report. These
checks do not verify real-device GPS, the facility pin, the VPS provider or
production data/index compatibility. Production activation still requires the
reviewed release, backup and successful provisioning against its own environment.
