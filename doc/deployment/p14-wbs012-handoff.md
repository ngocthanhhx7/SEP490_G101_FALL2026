# P14 WBS-012 Customer profile

- PR #17; feature/wbs-012-customer-profile → develop.
- Owner/author: Đoàn Tiến Đạt; assigned reviewer: Đặng Văn Hải; final merger: Nguyễn Ngọc Thành.
- `/account/profile` is registered under the Customer role guard and linked from Customer navigation and account overview.
- `/api/v1/me/profile` is mounted in the default authenticated runtime. GET returns only the current Customer profile and masked verified contact channels. PATCH uses the same session crypto/CSRF contract, accepts displayName + expectedVersion only, and applies compare-and-set concurrency control. Responses are private/no-store.
- No change to verified contact values, account role or ownership is permitted through this endpoint. Contact changes belong to account settings and OTP verification.
- Runtime integration tests exercise real signed session cookies against an isolated MongoDB replica set, including ownership, role denial, CSRF, stale writes and locked/revoked access. The actual App route test exercises the page/API composition; existing service/UI tests cover normalization, racing updates and UI states.
- The UI uses P04 shared controls; no final Figma acceptance or production deployment is claimed. GitHub PR #17 is authoritative for final head, reviews and merge. Local checks are distinct from GitHub CI.
