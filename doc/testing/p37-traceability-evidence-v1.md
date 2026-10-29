# P37-C — Truy vết kiểm thử và bằng chứng v1.0

**Ngày kiểm tra:** 15/10/2026 (Asia/Saigon)
**Workspace:** `feature/p36-a-system-security-performance-and-mobile-qa`, HEAD `9dfe6ed`, có thay đổi chưa commit.
**Ý nghĩa:** kết quả dưới đây là kiểm tra cục bộ thật; không phải bằng chứng provider, staging, UAT hoặc production.

## Checks đã chạy

| Phần | Lệnh | Kết quả |
| --- | --- | --- |
| Backend | `npm run lint` | PASS |
| Backend | `npm test -- --runInBand` | PASS — 48 suites, 472 tests |
| Frontend | `npm run lint` | PASS |
| Frontend | `npm test -- --runInBand` | PASS — 52 suites, 378 tests |

Backend Jest có cảnh báo VM Modules của Node; không có suite thất bại. Các test dùng MongoDB memory server, adapter và dữ liệu tổng hợp. Frontend test dùng jsdom/adapter; không gọi backend thật. Chưa chạy provider delivery, load test 200 users, device/PWA test, Figma review hoặc full end-to-end.

## Truy vết theo nhóm UC/WBS

| Nhóm | UC/WBS | Bằng chứng code | Bằng chứng test | Gate chưa đóng |
| --- | --- | --- | --- | --- |
| Identity | UC-01…05 / WBS 1–5, 70 | auth, OTP, contact-change, session | auth, registration và integration suites | SMTP/eSMS, OTP UI/CSRF reload |
| Public/catalog/policy | UC-06…09 / WBS 8–11 | public pages, policy route/module, catalog adapters | public home/service/policy suites | approved content và runtime catalog wiring |
| Accounts/profile/address | UC-10…12 / WBS 6, 7, 12, 13 | user admin, customer profile, address export | admin/profile/address suites | address module registration |
| Pet | UC-13…15 / WBS 14, 15 | pet services/adapters/pages | pet API/page suites | full care fields, snapshot và route |
| Applicant | UC-16…19/N01 / WBS 16–18 | application and scoped status modules | application/status/review suites | private media, runtime registration |
| Services/availability | UC-24…26, 33–34 / WBS 19–23 | service, price, settings, availability/day-off services | service/price/settings/availability suites | runtime registration and policy consumer |
| Booking/dispatch | UC-27…32, 35–45/N03–04 | booking read/change, board, dispatch, proposal exports | booking/board/dispatch/proposal suites | booking persistence, offer/assignment wiring |
| Care | UC-50…55 / WBS 35–39 | instructions, handover, evidence, checklist, report | care API/service/page suites | private storage and module registration |
| Incident | UC-56…58 / WBS 40–42 | incident service/router | incident tests where present | hold/billing and runtime registration |
| Payment/refund | UC-59…61 / WBS 43–47, 64–65 | payOS verifier, reminder job, refund boundary | provider/refund/job/unpaid suites | booking ledger/provider and real callback |
| Review/complaint | UC-62…64/N07–08 / WBS 48–50 | review and complaint modules/pages | review/complaint route/service/page suites | sitter direction/moderation and registration |
| Notification/dashboard | UC-30, 39, 46, 65–66 / WBS 51, 54, 67–69 | role shell only | layout tests | data queries, notification center and routes |
| PWA/NFR | EXT-09, 10, 21, 23 / WBS-N11–13 | shell, manifest, worker, online/install hooks | component/adapter tests | physical device, offline and performance measurement |

## Negative, race and deadline coverage

The current suites cover several injected-service rejection and idempotency cases. The following acceptance cases remain required before the related group can be called `VERIFIED`:

- `QA-01/02`: wrong OTP purpose/contact, lockout boundaries, ownership and role escalation.
- `QA-07/08/09`: stale directed proposal, duplicate confirmation, two concurrent accept/assignment attempts and offer deadline at the exact boundary.
- `QA-10/11`: check-in 30-minute boundary, mandatory check-in/out photos, Staff-close reason, cancel at 60:01/60:00/59:59 using server clock.
- `QA-12/13/15`: invalid or duplicate payOS callback, browser return not Paid, no double refund/retention, refund versus payout race.
- `QA-16/17`: Monday/Sunday Vietnam settlement key, one request per week, complaint seven-day/one-open/one-objection and restricted sitter projection.
- `QA-20`: provider outage, offline pending UI, forbidden/empty/error/loading states, no private data in public PWA cache, 360px and keyboard/touch checks.

These cases are a test plan, not a claim that the checks already passed. Do not lower assertions or replace provider integration with a fixture to close a gate.

## Evidence and traceability rules

Each future evidence record must include work item, branch/head, exact command, date/time in Vietnam, synthetic fixture identity, result, and remaining gate. A test owner or peer review is not a GitHub approval. `LOCAL_TESTED`, `VERIFIED`, `PR_OPEN` and `MERGED` remain separate milestones.
