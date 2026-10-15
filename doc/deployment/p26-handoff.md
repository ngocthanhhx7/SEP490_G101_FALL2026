# Bàn giao P26 — Hướng dẫn chăm sóc và bàn giao

## Phạm vi

| WBS | UC | Phạm vi đã triển khai | Owner theo kế hoạch | Reviewer được giao |
| --- | --- | --- | --- | --- |
| WBS-035 | UC-50 / Confirm Care Instructions | Versioned care-instruction service, two-hour server cutoff, Customer history screen, Sitter acknowledgement API | Phạm Thành Chung | Đoàn Tiến Đạt |
| WBS-036 | UC-51 / Confirm Handover | Replacement handover transaction boundary, acknowledgement/version gate, Customer confirmation screen | Nguyễn Ngọc Thành | Phạm Thành Chung |

Nguồn đã đối chiếu: P01 API/permission contract v1, P01 domain/data contracts v1, P00 source crosswalk and decisions, `doc/implementation-prompts/p26.md`, `care-evidence-and-pet-profile.md` và `session-handoff-template.md`.

## Quyết định đã áp dụng

- Customer chỉ sửa được snapshot của visit mình sở hữu khi server còn ít nhất 2 giờ trước `startAt`; đúng mốc 2 giờ được phép.
- Mỗi lần lưu tạo phiên bản và history mới. Các trường dị ứng/yêu cầu quan trọng làm phiên bản mới yêu cầu Sitter xác nhận lại; không ghi đè âm thầm.
- Sitter phải là actor của assignment/offer và xác nhận đúng phiên bản hướng dẫn. Access notes chỉ được trả trong khoảng `[startAt - 60 phút, endAt)` và sau handover bắt buộc.
- Handover chỉ được ghi trong transaction sau khi replacement assignment hợp lệ và replacement đã acknowledge phiên bản hướng dẫn hiện tại. Kết quả ghi `accessGranted` chỉ đến từ persistence adapter.
- Idempotency, CAS, audit/outbox và revoke access là trách nhiệm repository adapter; service không dùng mutex trong process và không coi fixture là tích hợp.

## Tệp

- `backend/src/services/care/care-instructions.service.js`
- `backend/src/services/care/handover.service.js`
- `backend/src/services/care/README.md`
- `backend/tests/unit/care-instructions.service.test.js`
- `backend/tests/unit/handover.service.test.js`
- `frontend/src/services/care-instructions-api.js`
- `frontend/src/services/handover-api.js`
- `frontend/src/pages/customer/VisitCareInstructionsPage.jsx`
- `frontend/src/pages/customer/VisitHandoverPage.jsx`
- `frontend/src/pages/customer/visit-care-instructions.css`
- `frontend/src/pages/sitter/SitterVisitCarePage.jsx`
- component README updates under `frontend/src/pages/customer/` and `frontend/src/pages/sitter/`

P34 chưa được sửa: route registration, module registry, manifests/lockfiles và runtime wiring vẫn thuộc integrator. P01 chưa được sửa: Visit/Assignment schema, DTO và persistence adapter.

## Kiểm tra thực tế

- Backend ESLint trên hai service P26: PASS.
- Frontend ESLint trên API/page P26: PASS.
- Backend unit: care-instructions 6 tests PASS and handover 4 tests PASS; targeted ESLint PASS.
- Frontend targeted Jest: care API/customer page 2 suites/4 tests PASS and handover/sitter pages 2 suites/2 tests PASS; targeted ESLint PASS; Vite build PASS.
- Cases đã kiểm tra: đúng/sai cutoff 2 giờ, version conflict, history, expired session, cross-customer denial, offer replacement đọc/xác nhận trước handover, access window trước/sau, current-version acknowledgement, idempotency conflict/replay, replacement chưa acknowledge, stale visit, malformed response, 202 pending, persistence thiếu phải fail-closed và UI forbidden/error/empty/loading.
- Chưa chạy integration Mongo/HTTP thật hoặc provider/private-media check: chưa có P01/P34 repository wiring và provider contract. Trạng thái phần tích hợp: `INTEGRATION_PENDING`.

## UI và dependency mở

UI dùng P04 controls/tokens, responsive breakpoint cho viewport hẹp và focus-visible; chưa có Figma frame P26 nên trạng thái `PROVISIONAL`. API adapters dùng same-origin client nhưng chưa mount route.

P34 cần đăng ký route cho Customer care/handover và Sitter care, cung cấp session/CSRF wiring, Visit repository và adapter trả DTO đúng các field trên. P01/P34 cần chốt tên DTO/route cuối, repository transaction, replacement assignment lookup, private-media capability và cách revoke access khi checkout/reassignment.

## Git handoff

WBS-035 đã merge qua PR #56 (`d25df15`). WBS-036 dùng branch/PR riêng với author/committer/push account của Thành, reviewer độc lập là Chung và Thành merge sau các gate thật. Không coi tài liệu hoặc unit doubles là approval hay merge.
