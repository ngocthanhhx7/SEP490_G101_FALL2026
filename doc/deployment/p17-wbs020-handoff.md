# P17 — WBS-020 Service Price Configuration

| Trường | Giá trị |
| --- | --- |
| Trạng thái | `INTEGRATION_PENDING` |
| Branch/worktree | `feature/wbs-020-service-price-configuration` / `D:\WW\SEP490_G101_FALL2026-p17-wbs020` |
| Base | `origin/develop` tại `28bcf3d30ed1d31e693c11d7b5e65b2f4e412b5f` |
| Owner/author được giao | Đặng Văn Hải |
| Reviewer được giao | Nguyễn Hữu Anh Nhật |
| Người merge được giao | Nguyễn Ngọc Thành |

## Phạm vi

Thêm phiên bản giá bất biến theo effective time, chỉ nhận số nguyên VND không âm, ghi rõ `unitLabel`, không tự làm tròn, kiểm tra optimistic version và ghi audit actor. Staff có thể đọc lịch sử; chỉ Admin thay đổi. `getActivePrice(serviceId, at)` chỉ trả giá đã có hiệu lực tại thời điểm truy vấn.

Module export từ `backend/src/routes/service-price.routes.js`, nhận `serviceExists` qua port; không sửa route registry chung.

## Tệp chính

- `backend/src/models/service-price-version.model.js`, `service-price-audit.model.js`
- `backend/src/services/service-price.service.js`
- `backend/src/routes/service-price.routes.js`
- `backend/tests/unit/service-price.service.test.js`, `backend/tests/integration/service-price.test.js`
- `frontend/src/pages/admin/AdminServicePricesPage.jsx`, CSS và integration test

## Kiểm tra

- Backend: `npm test -- --selectProjects unit integration --runTestsByPath tests/unit/service-price.service.test.js tests/integration/service-price.test.js` — 2 suites, 9 tests passed. Bao gồm giá âm/lẻ, ngày lịch không hợp lệ, RBAC, effective time, audit và race.
- Backend: `npm run lint` — passed.
- Frontend: `npm test -- --runTestsByPath tests/integration/AdminServicePricesPage.test.jsx` — 1 suite, 2 tests passed.
- Frontend: `npm run lint` — passed.
- Frontend: `npm run build` — passed.
- Mongo integration test dùng `serviceExists` stub; chưa nối với service catalog P17 hoặc booking runtime.

## UI và dependency mở

**Figma:** `PROVISIONAL`; chưa có frame được đối chiếu. Chưa kiểm tra thủ công viewport 360px, touch hoặc trình duyệt.

P34 cần đăng ký module và nối `serviceExists` với service catalog. P34/booking cần dùng `getActivePrice()` khi tạo booking rồi giữ snapshot giá cũ. Chưa có kiểm tra thanh toán thật; không thuộc gói này. Migration/index rollout production chưa chạy.

## Git và bàn giao

Thay đổi đang là working tree chưa commit. Chưa xác minh GitHub account của owner, chưa commit/push/mở PR; reviewer, approval và merge chưa diễn ra. Không có author/committer/push account thực tế để báo cáo.

**Bước tiếp theo:** P34 composition và xác minh nối service catalog/booking; đối chiếu UI với Figma khi frame sẵn sàng.
