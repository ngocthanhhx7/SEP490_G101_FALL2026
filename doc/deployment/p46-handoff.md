# P46 applicant tracking integration

- Work item: WBS-N01 / UC-N01; PR #30, feature/wbs-n01-applicant-status-and-scoped-verification → develop.
- Owner/author: Đặng Văn Hải; reviewer: Nguyễn Hữu Anh Nhật; final merger: Nguyễn Ngọc Thành.
- Leader explicitly approved EXT-25/APPLICANT-ACCESS on 14/10/2026: secret application receipt code + OTP to the submitted contact; no applicant account. Five-minute expiry, 60-second resend, five sends per rolling hour per application, five wrong attempts lock for 15 minutes.

## Implemented integration

- Public route `/sitter/application-status` is registered in the actual App router and remains reachable while session resolution is pending.
- POST `/api/v1/application-status/challenges` and `/verify` are mounted when authentication is configured. Secrets never appear in URLs or persistent browser storage.
- Submission receipt includes a keyed pseudorandom 256-bit code; only its keyed digest is stored and indexed. Replaying the same validated submission restores the same receipt and safely adds a digest to a legacy record that lacks one. No anonymous migration or public recovery endpoint exists.
- APPLICATION_STATUS OTP uses the existing MongoDB transaction kernel with application+contact+purpose binding, atomic one-time consumption, server expiry, throttling and lockout. It cannot create a user, Contact or auth session.
- Unknown code returns the same response fields; no contact delivery is attempted. Failed delivery invalidates the challenge and keeps the generic response.
- Admin can transition UNDER_REVIEW → INTERVIEW via `/applications/:applicationId/interview` with session, role, CSRF, expected version, idempotency and transactional audit. Decisions still retain the existing P16 policy.
- Status reads expose state, submitted date, rejection reason, reapplication date and eligibility only. Private document access remains Admin-only.

## Verification and deployment limits

Runtime tests use Express and an isolated MongoDB replica set, with synthetic accepted/failed delivery ports: ownership (including same contact on two applications), unknown-code shape, cooldown, send quota, lockout, exact expiry, resend invalidation, replay, concurrent send/consume, rejection deadline, no session/account and INTERVIEW. Frontend checks include the actual public App route and the guest POST adapter.

These tests do not claim a real email/SMS reached an inbox. Production requires configured contact delivery, database indexes, and P16 private document storage/module deployment. Do not expose submission without the existing privateMedia contract. Existing records without a receipt require controlled recovery or replay of the original validated idempotent submission; an ObjectId never becomes a tracking credential. Rotating lookup secrets requires a coordinated receipt migration. No Figma final acceptance is claimed.

Use GitHub PR #30 as the source of truth for current head, review and merge state. No GitHub CI checks are claimed if none exist; local checks are reported separately in the review.
