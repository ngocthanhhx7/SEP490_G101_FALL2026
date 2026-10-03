# Source Code Management

Quy tắc quản lý source code của Paw World Care, nhóm SEP490_G101_FALL2026. Người phụ trách tích hợp và merge cuối cùng: **Nguyễn Ngọc Thành — Project Leader** ([@ngocthanhhx7](https://github.com/ngocthanhhx7)).

Phiên bản 1.0, ngày 03/10/2026. Quy định triển khai từ mục 5.2 của Report 2 và yêu cầu khởi tạo repository của Leader.

## 5.2.1 Branching Strategy

Dự án sử dụng Gitflow. `main` chứa phiên bản ổn định dùng cho production; `develop` tích hợp các tính năng sau Sprint; `feature/*` dành cho công việc cụ thể và mở PR vào `develop`; `hotfix/*` dành cho lỗi production cần xử lý ngay.

Xem [chi tiết chiến lược nhánh](branching-strategy.md), bao gồm nhánh `release/*` khi chuẩn bị phát hành và cách đồng bộ hotfix.

## 5.2.2 Commit Conventions

Commit dùng `<type>: <short description>`. Các loại chính: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`.

Ví dụ: `feat: add pet profile`. Chỉ dùng **một dấu hai chấm** sau type. Cách ghi `feat::` trong danh sách của tài liệu tham chiếu được chuẩn hóa về cú pháp Conventional Commits.

Xem [quy ước commit](commit-conventions.md).

## 5.2.3 Code Review Process

Mỗi PR phải được ít nhất một thành viên khác tác giả review và approve. Review kiểm tra naming, style, commit và kết quả unit/integration test áp dụng. Leader thực hiện merge cuối cùng vào `develop` hoặc `main`. Vấn đề hiệu năng hoặc bảo mật được phát hiện phải được xử lý trước khi merge.

Xem [quy trình review](code-review-process.md).

## Hướng dẫn bổ sung

- [Quy ước code và cấu trúc](coding-conventions.md)
- [Cấu hình GitHub và phân biệt quy định với cơ chế tự động](github-settings.md)
- [Hướng dẫn đóng góp](../../CONTRIBUTING.md)

Commit khởi tạo chỉ chứa cấu trúc, tài liệu và template; được đưa trực tiếp lên hai nhánh theo yêu cầu thiết lập repository mới. Đây không phải một PR đã được review. Mọi thay đổi sau baseline tuân thủ quy trình ở trên.
