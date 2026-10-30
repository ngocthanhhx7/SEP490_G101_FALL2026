# Service Card Refresh

Owner requested distinct service photographs, improved cards and catalogue filters,
Home compatibility, local synchronization and deployment to VPS on 30 October 2026.

## Changes

- Fixed Home's Figma-directory assumption: slicing the full service photograph URL
  produced broken paths when images lived under `/assets/services/`.
- Home and catalogue now share `PublicServiceCards` and `service-cards.css`.
  Photographs have a stable 16:10 ratio; cards show category, species, description,
  location/duration, server price and the existing detail action.
- Removed duplicated description/scope text from list cards. Full scope remains
  on the detail page. Compact filters retain search, species, category and location;
  visitors can reset filters and sort by base price or Vietnamese name.
- All thirteen demo codes have distinct images. Five additional Commons photographs
  and licenses are recorded beside the assets; Pinterest returned a login prompt.
  Focal positions preserve the sleeping cat and the dog receiving massage.
- Home features published home care, walking and bathing, falling back to other
  published entries when needed. Unavailable/loading/error behavior is preserved.

## Evidence

- Frontend lint: passed. Frontend tests: 89 suites / 552 tests passed.
- Architecture checker: passed. Frontend production build: passed; the existing
  main/Vietmap chunk-size warnings remain.
- Playwright at 1440, 768, 390 and 320 px: thirteen service cards and thirteen
  distinct decoded photographs; three decoded Home photographs; category/location
  filtering, reset, ascending price sort and detail navigation passed. No page
  errors or horizontal overflow on the inspected routes.
- Screenshots inspected locally: catalogue and Home service section, desktop/mobile.
- `git diff --check`: passed. Production acceptance is recorded after deployment;
  these checks do not assert payment or GPS acceptance.

The local checkout was synchronized to reviewed release sources while preserving
the owner's uncommitted branding, env example and Drawio backup. The approved
development-only catalogue provisioning command populated thirteen local services.
Secrets, local server logs, screenshots and credentials are not release sources.
