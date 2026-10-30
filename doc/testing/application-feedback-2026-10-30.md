# Sitter application feedback

## Scope

The application collects a required Full-time/Part-time preference in the new
frontend and displays it in Admin review. The backend accepts the optional enum
for older clients; legacy records display an explicit missing value. This is an
applicant preference, not an employment contract or a payroll configuration.

Selected identity/supporting images have local previews, enlargement and removal.
Object URLs are revoked on replacement/removal/unmount. Selection does not upload
files. JPG/PNG limits remain 5 MB and 4,000,000 pixels, with immediate readable
dimension errors. Private storage, ownership, CSRF and quotas remain enforced.

The service list limit now allows 30 entries, resolving the mismatch when all
14 currently published services were selected. Work areas remain limited to 10.
Validation responses identify affected fields; the frontend preserves input,
shows the reason and focuses the field after submission controls are enabled.
Uncertain submission retries retain their command key and upload references.

## Verification

- Browser: 1440, 390 and 320 px using synthetic authenticated API responses and
  generated images. Preview enlargement/Escape/removal, 3840 x 2160 pixel error,
  both employment choices, 14 selected services, server field error focus and
  page overflow checks passed. Screenshots inspected locally.
- Frontend architecture boundaries, backend architecture checker, both package
  lint and frontend production build passed. Existing bundle size warning
  remains (main approximately 853 kB, map SDK approximately 768 kB).
- Focused backend coverage includes saved Part-time preference, 14 services,
  invalid enum/31 services, specific image dimension errors and Full-time
  preference retrieved through authenticated Admin application detail.
- Full local suites passed: backend 117 suites / 1,010 tests; frontend 92 suites /
  566 tests. Release/CI results are recorded in the PR after execution.

Browser fixtures do not establish live R2 upload or authenticated production
submission. No real identity documents, applicant records, contracts or outbound
messages were created by these checks. Earlier provider acceptance remains dated
evidence in the deployment runbooks.
