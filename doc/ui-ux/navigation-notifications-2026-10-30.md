# Navigation And In-App Notifications

## Navigation

Admin uses Work, Personnel and Profiles, Finance, System, and Personal groups.
Staff uses Work, Personnel and Profiles, and Personal groups. Pet Sitter uses
Work, Finance, My Profiles, and Personal groups. Groups are visible headings,
not extra navigation screens. Only existing authorized routes are included.
Personal contact/security settings are distinguished from system configuration.
Customer retains its separately reviewed account layout.
Admin retains Admin navigation when entering shared Staff work routes.

The operational header removes the workspace label. Every account trigger omits
the decorative chevron while preserving its accessible expanded state and menu.

### Tiêu đề và đường quay lại

- Không dùng breadcrumb hiển thị (ví dụ: “Trang chủ / Chính sách / Tên chính sách”) trên bất kỳ trang nào, kể cả trang công khai, màn quản trị, web mobile và PWA. Tiêu đề chính cho biết màn hiện tại; thanh điều hướng chính cho biết nhóm đang mở.
- Mỗi màn có tối đa một nút Back để quay về màn cha. Khi khung mobile đã có Back, không lặp lại trong nội dung. Trên web, ghi nhãn theo đích đến như “Tất cả chính sách” hoặc “Tài khoản”. Nút lùi trong quy trình nhiều bước, nút đóng dialog và mục lục vẫn có nhiệm vụ riêng.
- Mỗi menu chỉ có một mục cho mỗi đích. Đánh dấu mục hiện tại bằng trạng thái chọn; không thêm lượt vào lịch sử khi bấm lại. Nếu màn chỉ là bí danh, chuyển sang URL chính bằng `replace`. Đích Back phải tồn tại, đúng quyền, không quay lại chính màn hoặc màn sẽ chuyển ngược về nó. Giữ tham số có ý nghĩa như bộ lọc lịch và trang danh sách đơn khi quay lại.
- Khi review, mở link trực tiếp và tải lại, thử Back trên giao diện và trình duyệt, thử khi khách chưa đăng nhập và khi đăng nhập sai vai trò. Kiểm tra 320 px, 390 px và desktop. Đối chiếu `AppRoutes.jsx`, guard và `mobile-route-metadata.js` khi đổi route hoặc Back.

## Notifications

One session-scoped provider reads the existing `/api/v1/notifications` feed with
the latest 5 items and authoritative unread total. Polling runs every 30 seconds
while the document is visible, and immediately on visibility/read-receipt events.
This is in-app polling, not WebSocket, browser push or email delivery.

The bell opens a preview on mouse/pen hover, click/touch, or keyboard ArrowDown.
Pointer transfer to the portal has a short closing grace period. Escape restores
trigger focus; outside pointer, leaving the preview and route changes dismiss it.
Preview provides loading, empty, unavailable/retry, dates, unread dots and a full
inbox link. Opening the preview alone never marks items read. Following an item
uses its existing internal destination and requests an owner-scoped receipt with
CSRF and a stable retry key. Failed acknowledgements do not clear server counts.

After the initial history baseline, newly discovered unread IDs at/after the latest
known timestamp generate a top-right notification card. A same-count replacement
still announces. Multiple arrivals in a poll are summarized on the newest card;
the inbox remains authoritative when more than 5 arrive between polls. Toasts close
after 8 seconds, pause on hover/focus, and have a close button and polite announcement.
They survive route changes, and private state clears on session/account/role changes.

## Verification

Focused React tests cover all 4 roles, hover/touch/keyboard/dismissal, initial-history
suppression, same-count arrival, duplicate suppression, empty/read-only feed, error
retry, CSRF receipt and logout clearing. Layout tests cover operational grouping and
header/avatar removal. Wrong-role finance routes still reject access without calling
financial APIs; a shared authenticated notification request is now expected.

Browser checks use explicitly synthetic sessions and notification responses against
the real built application; they do not establish authenticated production delivery.
No real notification, OTP, financial or employee mutation is generated for testing.

Author checks: architecture, backend/frontend lint and frontend build passed;
full frontend 96 suites / 608 tests and backend notification service 5 tests passed.
Final focused notification preview tests (12) also passed after the timer assertion
was tightened. Playwright passed all 12 role/viewport combinations at 1440/390/320,
including actual polling-timer advancement, same-count arrival, duplicate suppression,
receipt CSRF and viewport bounds. Screenshots were inspected. Existing large bundle
warnings remain; no dependency changes were made. Final CI/review/deployment results
are recorded separately after those steps occur.
