# P17 — WBS-019 Service Management

| Trường | Giá trị |
| --- | --- |
| Trạng thái | `PR_OPEN`; P34 integration pending |
| PR | [#21](https://github.com/ngocthanhhx7/SEP490_G101_FALL2026/pull/21), open → `develop` |
| Branch/worktree | `feature/wbs-019-service-management` / `D:\WW\SEP490_G101_FALL2026-p17-wbs019` |
| Base | `origin/develop` tại `28bcf3d30ed1d31e693c11d7b5e65b2f4e412b5f` |
| Owner/author được giao | Nguyễn Ngọc Thành |
| Reviewer được giao | Phạm Thành Chung |
| Người merge được giao | Nguyễn Ngọc Thành |

## Phạm vi

Thêm service catalog theo phiên bản hiệu lực: thông tin dịch vụ, chính sách, audit, Admin write, Staff read, public catalog và `bookableSnapshot()` bất biến để booking có thể sao chép. Catalog loại dịch vụ không ACTIVE, thiếu chính sách đã xuất bản, thiếu giá hoặc bị ẩn khỏi danh mục. Snapshot mới không ghi ngược vào booking đã tạo.

Route module được export từ `backend/src/routes/service-catalog.routes.js`; branch này không sửa app factory/route registry theo quyền sở hữu tích hợp của P34. Giá và visibility được nhận qua provider ports.

## Tệp chính

- `backend/src/models/service*.model.js`, `service-policy-version.model.js`, `service-audit.model.js`
- `backend/src/services/service-catalog.service.js`
- `backend/src/routes/service-catalog.routes.js`
- `backend/tests/integration/service-catalog.test.js`
- `frontend/src/pages/admin/AdminServicesPage.jsx` và CSS/test; `frontend/src/pages/admin/README.md`
- `backend/README.md`

## Kiểm tra

- Backend: `npm test -- --selectProjects integration --runTestsByPath tests/integration/service-catalog.test.js` — 1 suite, 3 tests passed. Bao gồm role gates, ngày lịch không hợp lệ, public catalog, snapshot giá/chính sách theo effective time và cập nhật đồng thời.
- Backend: `npm run lint` — passed.
- Frontend: `npm test -- --runTestsByPath tests/integration/AdminServicesPage.test.jsx` — 1 suite, 5 tests passed.
- Frontend: `npm run lint` — passed.
- Frontend: `npm run build` — passed.
- Integration test dùng MongoDB replica set riêng; price provider và catalog settings là test doubles. Chưa xác minh P34 composition hoặc booking runtime.

## UI và dependency mở

**Figma:** `PROVISIONAL`; chưa có frame được đối chiếu. Chưa kiểm tra thủ công viewport 360px, touch hoặc trình duyệt.

P34 cần đăng ký module, cung cấp price/catalog-settings ports và thêm React route. Booking cần gọi `bookableSnapshot()` rồi lưu service, policy và price snapshot trong booking document. Migration/index rollout production chưa chạy.

## Git và bàn giao

Commit `e762522b0a44cdee6f2aef144b5ba2fa1f98ee1e` dùng author/committer Nguyễn Ngọc Thành; push và PR creator là `ngocthanhhx7`. Reviewer Phạm Thành Chung đã được yêu cầu; approval đang chờ. Chưa merge.

**Bước tiếp theo:** P34 composition và kiểm chứng catalog/booking cùng provider thật; đối chiếu UI với Figma khi frame sẵn sàng.
