# P01-A — Walkthrough, kiểm chứng và bàn giao v1

Ngày14/10/2026, Asia/Ho_Chi_Minh. User chuyển P01 author/owner từ Hải sang Nguyễn Ngọc Thành và giao thực hiện. Author/committer/push/PR account Thành (ngocthanhhx7), reviewer được giao Nguyễn Hữu Anh Nhật (anhnhat432), merger Thành; không self-approve. WBS cross-cut/EXT, không gán lại contributor của các WBS module. Git mapping cục bộ đã cập nhật, không stage/push prompts/auth config.

Branch feature/p01-a-domain-api-and-permission-contracts; checkout D:/WW/SEP490_G101_FALL2026-p01-a; base origin/develop0ada91cb04a46f89c9bd7ad6cdf3ed324573a931. API xác minh P00#3/P49#4/P50#5/P51#6 đều merged; không tạo PR trùng. Checkout chính vẫn có README sửa trước phiên, giữ nguyên.

## Deliverables và nguồn

- [ADR runtime](p01-runtime-adr-v1.md): baseline Node/npm/React/Vite/Express/Mongoose, Mongo transaction topology, ESM/JSX và provider/auth boundary.
- [Domain](p01-domain-contract-v1.md):17 aggregates, allowed transitions, events/notices, race/owners/open decisions.
- [API/permissions](../api/p01-api-permission-contract-v1.md): DTO allowlists, actor/action/resource/context, route catalogue, error/idempotency/envelope.
- [Registry JSON](../api/p01-contract-registry-v1.json) và [common JSON Schema](../api/p01-common.schema.json): states/DTOs, money/time/field values/minimum commands. Không là OpenAPI hoặc endpoint đã triển khai.
- [Data contract](../database/p01-data-contract-v1.md): logical collections, constraints/index plan, snapshot/provenance, unit-of-work/occupancy guard.
- README architecture/api/database giới thiệu contracts; bỏ architecture .gitkeep khi có real content được stage. Không đổi frontend/backend/global router/manifest/lockfile.

Đã dùng các bản P00/P49/P50/P51 đã tracked, đọc bộ prompt P01/master/delta/roles/revised-plan/source-register/scope/execution/session/FIN/brand. Không đọc lại Drive/HouseBuddy/nguồn thú y, không sửa báo cáo gốc. Runtime sources chính thức và npm metadata đã kiểm tra, link/giới hạn ở ADR. Exa trả free-tier rate limit, fallback web đọc nguồn chính thức; không sửa permissions, không giả Exa đã fetch thành công.

## Walkthrough từng luồng

Đây là review thiết kế, **NOT_RUN_RUNTIME**. Mọi case chạy ứng dụng/DB/provider còn INTEGRATION_PENDING; hợp đồng tiền/consent/config chưa chốt vẫn explicit gate.

| ID | Flow / success design | Negative, race, gate |
| --- | --- | --- |
| WT-01 | Single postpay: owned pets/address → quote+snapshot → Booking DISPATCH_PENDING → offer → assigned → care evidence → Completed → postpay Bill ISSUED → verified payment | Không Customer-directed confirm trên auto-ranking; cutoff hủy60min miễn phí khi chưa thu; no false Paid từ browser; due48h dưới hold FIN-07 còn mở |
| WT-02 | Multi prepay: confirmed quote/proposal → AWAITING_PAYMENT → verified correct receipt → intent PAID → DISPATCH_PENDING → accepted assignment | Paid không Assigned; missing FIN-01-TIME/02-ALLOC chặn collection thật; duplicate/late callback receipt reconcile, không revive cancelled booking |
| WT-03 | No sitter/withdrawal: release assignment, needsAction/Staff alternatives → Customer chọn lịch/sitter hoặc refund phần chưa cung cấp không giữ30% | Sitter withdrawal không cancel whole booking; cause/timeout/fallback FIN-06/DIRECTED-TIMEOUT còn mở, không auto choose slot/penalty |
| WT-04 | Reschedule: Customer chọn affected visits/newSlots → ChangeRequest → allowed approval → recheck slots → atomic APPLIED + allocation swap | Old schedule valid đến Applied; FIN-04 request12h/newslot24h/expiry6h/approver chưa chốt, không coi hủy1h là đổi1h; accept/cancel cùng guards |
| WT-05 | Partial cancellation: own future visit set, cutoff/server recheck, actual-paid basis → retained30%/refundDue phần hủy, giữ phần còn lại | Completed/StaffClosed không self-cancel; rounding/discount FIN-02 gate; retry không charge/refund lần hai, mixed invalid set không silent subset |
| WT-06 | Incident/complaint: involved actor opens case → Staff review → Admin money decision → resolved/closed + authorized notice | Case không tự complete visit/pay earning; privateStaffNotes không lộ sitter/customer; hold amounts/eligibility FIN-07, Sitter create complaint chưa duyệt |
| WT-07 | Weekly payout: eligible available earning → unique request-week VN → atomic reservation → Admin approve → manual transfer evidence → Paid | Rejected/withdrawn dùng quota; weekly new key không reserve earning cũ2lần; refund/payout lock chung; rate/evidence/post-paid adjustment FIN-07 và FIN-08 sửa/rút chưa chốt |

## Acceptance catalogue cho gói có runtime

| ID | Yêu cầu kiểm chứng chưa chạy |
| --- | --- |
| QA-01 | OTP sai purpose/contact, expiry5min, resend60s,5codes/hour,5failures/15min; concurrent verify chỉ1session/contact link; locked account revoke ngay |
| QA-02 | Customer sửa role/owner/state/amount/authEpoch hoặc đọc resource khác bị deny; Staff không approve refund/payroll, Admin vẫn qua policy/context |
| QA-03 | Applicant Guest submit không User, tracking ID alone denied;2approve chỉ1provision; reapply29d23h59m denied và30d boundary allowed |
| QA-04 | Pet minimum name/species; unknown khác false, file không professionally_verified; species fields/readiness/vaccine không auto gate; idempotent create |
| QA-05 | Master profile/address/policy update không sửa consented snapshots; archive giữ history; sitter không sửa master |
| QA-06 | Assigned sitter notes trước start-60min deny, đúng mốc allow, checkout deny; replacement chưa handover deny; revocation/download replay auth |
| QA-07 | Directed confirmation/payment/offer/assignment đều riêng; auto-ranking không cần Customer confirm từng candidate; stale proposal no dispatch |
| QA-08 |2accept cùng visit hoặc overlapping visits cùng sitter, manual assign/availability update đồng thời: chỉ1valid assignment; spanning midnight/travel buffers lấy mọi guards |
| QA-09 | Offer deadline2h/30min, exactly deadline expired; server recheck tại commit, TTL cleanup không quyết định eligibility |
| QA-10 | Check-in start-30min boundary, care instructions>=2h, mandatory in/out photos, skipped checklist reason; StaffClosed reason không fake Completed/bill/earning |
| QA-11 | Cancel60:01/60:00 allow,59:59 deny, client clock giả; ongoing/completed không self-cancel; partial/all/repeated cancel conserve allocations |
| QA-12 | Payment signature/ref/amount/currency sai, callback cũ/late/duplicate/provider outage; browser return không Paid; retry/read operation uncertain |
| QA-13 | Multi refund/retention và single postpay không double billing, rounding100.001VND chưa policy thì DECISION_REQUIRED |
| QA-14 | Reschedule1–12h/newslot24h/expiry6h phải FIN-04 gate; rejected/expired giữ lịch cũ; slot swap + allocation rollback chung |
| QA-15 | Refund approve/record lặp, payout/refund tranh cùng earning; unknown transfer không release/retry mù; Paid needs evidence |
| QA-16 | Request-week Sunday/Monday/new year VN, earning-week khác request-week; rejected/withdrawn vẫn quota, active reservation xuyên tuần |
| QA-17 | Complaint Customer7days/one-open/one-objection; involved sitter read safe projection, unrelated history denied; extension Sitter policy chưa duyệt |
| QA-18 | JSON Schema unknown keys, malformed ObjectId/date/time/money unsafe integer/value status; formats asserted và domain constraints ngoài schema |
| QA-19 | Idempotency same payload replay authorized, different payload409, pending202, transaction retry outbox/ledger không duplicate; notification consumer dedup |
| QA-20 | Provider email/SMS/payOS/media outage và offline UI pending không fake ack; errors/empty/forbidden, no public private cache; future UI360px/keyboard/touch |

## Ví dụ lịch và kiểm tra thật

UTC2026-10-13T17:00:00Z là VN14/10/2026 00:00; UTC2026-10-18T16:59:59Z là Sunday18/10 23:59:59 key2026-10-12; UTC2026-10-18T17:00:00Z là Monday19/10 00:00 key2026-10-19. VN31/12/2026 và01/01/2027 cùng requestWeekKey2026-12-28. Date-only vaccine/birth không convert theo timestamp.

Audit cục bộ node .codex/p01-check.cjs → PASS_CONTRACT_DOCUMENT_AUDIT:10files (8Markdown+2JSON),31relative links,8bảng,17entity/state/DTO coverage,20QA/7WT IDs,9FIN và8domain gates; UTF-8/LF/whitespace, JSON parse/reference resolution, command allowlists không owner/state write và calendar examples đạt. Đây không là test DB/auth/races. git diff --check và staged --check/list trước commit. Unit/integration/build/CI N/A, repository chưa có manifest/lockfile/runtime/workflow. npm metadata engine ranges thỏa Node24.21, chưa installed compatibility.

## Trạng thái, gate và Git

DOCUMENT_CONTRACT_READY_WITH_OPEN_DECISIONS; runtime/provider INTEGRATION_PENDING, monetary implementation BLOCKED_BY_DECISION theo9FIN groups;8domain/config gates ở registry. UI_NOT_IN_SCOPE; Figma NOT_INSPECTED, assets không sửa. Contract schema/DTO v1 là đầu vào foundation, không tuyên bố whole product VERIFIED hoặc Drive đã cập nhật.

P02/P03 có thể dùng ADR khởi tạo runtime; P06/P15/P18/P19/P21/P25/P31/P32/P41 tiêu thụ contracts theo dependency riêng. P04 tokens, P34 wiring, P37 source sync giữ ownership. Config/decisions/provider thiếu do Leader/domain owners chốt trước flow liên quan; không thêm gate giả để chặn phần độc lập.

Commit nội dung ac7a0d747d9d18fe34d55a2a5d4197064699ee3a có author/committer Thành, push/creator ngocthanhhx7, [PR #7](https://github.com/ngocthanhhx7/SEP490_G101_FALL2026/pull/7) base develop. Rà soát bổ sung EligibilityGuard cho recurring availability/suspension cạnh tranh assignment trên ngày chưa có guard, Booking CLOSED cho mixed/staff-closed outcomes và một objection trước final Admin decision. Bản sửa là commit tiếp theo, không rewrite lịch sử.

Tại cập nhật nội dung bàn giao: PR_OPEN, chưa approval/merge. Branch protection thực tế required1approval, dismiss stale, last-push approval độc lập, conversations resolved và enforce admins; required CI checks chưa cấu hình. Nhật review content head cuối qua verified session, Thành merge sau approval/protection/checks/conversations/dependencies; Git review/merge history và bàn giao cuối phiên ghi mốc thật. Không direct push develop hoặc bypass branch protection.
