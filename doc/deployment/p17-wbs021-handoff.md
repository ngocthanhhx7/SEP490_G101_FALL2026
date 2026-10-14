# P17 — WBS-021 System Settings

| Trường | Giá trị |
| --- | --- |
| Trạng thái | `PR_OPEN`; P34 integration pending |
| PR | [#19](https://github.com/ngocthanhhx7/SEP490_G101_FALL2026/pull/19), open → `develop` |
| Branch/worktree | `feature/wbs-021-system-settings` / `D:\WW\SEP490_G101_FALL2026-p17-wbs021` |
| Base | `origin/develop` tại `28bcf3d30ed1d31e693c11d7b5e65b2f4e412b5f` |
| Owner/author được giao | Nguyễn Ngọc Thành |
| Reviewer được giao | Phạm Thành Chung |
| Người merge được giao | Nguyễn Ngọc Thành |

## Phạm vi

Thêm system setting `SERVICE_CATALOG_VISIBLE`, mặc định tắt, lưu phiên bản theo effective time và audit actor. Staff có thể xem; chỉ Admin thay đổi. Contract tiền hiển thị VND, đơn vị nhỏ nhất 1 VND, từ chối số lẻ và không tự làm tròn.

Module export từ `backend/src/routes/system-settings.routes.js`. `catalogSettings.isEnabledAt(at)` là port để catalog kiểm tra trước khi hiển thị/nhận booking. Không sửa route registry chung.

## Tệp chính

- `backend/src/models/system-setting-version.model.js`, `system-setting-audit.model.js`
- `backend/src/services/system-settings.service.js`
- `backend/src/routes/system-settings.routes.js`
- `backend/tests/unit/system-settings.service.test.js`, `backend/tests/integration/system-settings.test.js`
- `frontend/src/pages/admin/AdminSystemSettingsPage.jsx`, CSS và integration test

## Kiểm tra

- Backend: `npm test -- --selectProjects unit integration --runTestsByPath tests/unit/system-settings.service.test.js tests/integration/system-settings.test.js` — 2 suites, 9 tests passed. Bao gồm fail-closed mặc định, RBAC, ngày lịch không hợp lệ, effective time, audit và race.
- Backend: `npm run lint` — passed.
- Frontend: `npm test -- --runTestsByPath tests/integration/AdminSystemSettingsPage.test.jsx` — 1 suite, 2 tests passed.
- Frontend: `npm run lint` — passed.
- Frontend: `npm run build` — passed.
- MongoDB replica set test xác minh module riêng; chưa xác minh P34 composition hoặc public catalog/booking runtime.

## UI và dependency mở

**Figma:** `PROVISIONAL`; chưa có frame được đối chiếu. Chưa kiểm tra thủ công viewport 360px, touch hoặc trình duyệt.

P34 cần đăng ký module và chuyển `catalogSettings.isEnabledAt` cho catalog. Route Admin cần được thêm vào React router. Migration/index rollout production chưa chạy.

## Git và bàn giao

Commit `83986130e310b4b651ae5b57fff6dd188182dec9` dùng author/committer Nguyễn Ngọc Thành; push và PR creator là `ngocthanhhx7`. Reviewer Phạm Thành Chung đã được yêu cầu; approval đang chờ. Chưa merge.

**Bước tiếp theo:** P34 composition và kiểm tra visibility xuyên suốt catalog/booking; đối chiếu UI với Figma khi frame sẵn sàng.
