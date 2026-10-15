# P29 — Incident handoff

P29 / WBS-040, WBS-041, WBS-042:
Người chịu trách nhiệm code theo WBS: Đoàn Tiến Đạt
Người viết integration test theo WBS: Đặng Văn Hải
Contributor thực tế và author được chỉ định: phiên này chuẩn bị implementation trong vùng P29; author/committer/push account cần được xác minh trước khi commit
Git work-item / branch owner được giao: `feature/wbs-040-report-incident`, `feature/wbs-041-incident-list`, `feature/wbs-042-incident-details-and-resolution` theo mapping; hiện diff được giữ chung để rà soát, chưa tạo PR
Reviewer được giao: Đặng Văn Hải
Người merge được giao: Nguyễn Ngọc Thành
Trạng thái: IMPLEMENTED / INTEGRATION_PENDING

## Nguồn và hợp đồng

- P29 (`doc/implementation-prompts/p29.md`), P01 API permission contract và Case state contract đã được đối chiếu.
- Case state: `OPEN → UNDER_REVIEW → RESOLVED → CLOSED`; Customer/Sitter chỉ nhận safe projection, Staff/Admin mới nhận ghi chú vận hành; Admin mới được đóng case hoặc gửi financial decision.
- Incident gắn với visit; report dùng server time, evidence là private media reference, CAS và idempotency. Báo cáo không tự đóng visit, không chẩn đoán, không tự tính/giải ngân tiền.
- Thời gian hiển thị UI dùng `Asia/Ho_Chi_Minh`. Chưa có Figma frame P29; UI là `PROVISIONAL`.

## Phạm vi đã hoàn thành

- WBS-040: `createIncidentService.report` và `POST /incidents`; kiểm tra actor/visit scope, trạng thái visit, urgency/severity, evidence refs, audit/outbox, replay/conflict.
- WBS-041: `list`/`GET /incidents` với bộ lọc state/severity/urgency/visit và projection theo quyền.
- WBS-042: `detail`/`GET /cases/:id`, resolution CAS/idempotency qua `POST /cases/:id/resolutions` (có alias incident route), Staff triage và Admin final close.
- Frontend adapter `incident-api.js`, các trang báo cáo, danh sách, chi tiết/xử lý và re-export theo vùng customer/sitter/staff.

## Tệp

- `backend/src/services/incidents/incident.service.js`
- `backend/src/services/incidents/README.md`
- `backend/src/services/incidents.service.js`
- `backend/src/routes/incident.routes.js`
- `backend/src/routes/incidents.routes.js`
- `frontend/src/services/incident-api.js`
- `frontend/src/pages/incidents/{IncidentReportPage,IncidentListPage,IncidentDetailsPage}.jsx`
- `frontend/src/pages/incidents/incidents.css`, `frontend/src/pages/incidents/README.md`
- Re-export pages under `frontend/src/pages/customer`, `frontend/src/pages/sitter`, `frontend/src/pages/staff`
- `backend/src/app.js` và frontend `AppRoutes` chưa sửa: P34 sở hữu route/runtime registration.

## Kiểm tra thực tế

- `npx eslint` trên toàn bộ tệp backend/frontend P29: PASS.
- `node --check` trên các module JavaScript backend/API: PASS.
- Smoke service với repository transaction double: report, Staff `UNDER_REVIEW`, Admin `RESOLVED`/`CLOSED`: PASS (local synthetic adapter only).
- Chưa chạy Jest/build/browser/provider/real MongoDB; repository, private-media provider, notifications, session wiring và route registration chưa được P34 tích hợp. Fixture/smoke không chứng minh tích hợp thật.

## Dependency mở

P01/P34 cần map repository Case/Visit và transaction/CAS/idempotency ports, private-media capability, operational scope, notification delivery, financial hold/reconciliation, mount `incidentModule` và đăng ký React routes. P51/P32 quyết định hold/refund/earning; P29 chỉ ghi gate `PENDING_REVIEW` cho emergency/critical.
