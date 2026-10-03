# Code Review Process

## Independent Validation

Mỗi PR cần ít nhất **một thành viên có quyền review phù hợp, khác tác giả**, approve trước khi merge. PR do Leader tạo cũng cần người khác approve. Không tự xác nhận approval thay cho người review.

Tác giả mở PR đúng nhánh, liên kết issue và điền mẫu PR. Reviewer đọc diff, xem bằng chứng kiểm thử, kiểm tra hành vi bị ảnh hưởng và yêu cầu sửa khi cần. Nếu thay đổi sau approval ảnh hưởng nội dung review, reviewer đánh giá lại phiên bản mới.

## Review Criteria

- Tên tệp, hàm, biến và vị trí mã nguồn theo [coding conventions](coding-conventions.md).
- Cấu trúc, style và commit rõ ràng; thay đổi nằm trong phạm vi issue.
- Luồng nghiệp vụ, kiểm tra đầu vào, phân quyền và xử lý lỗi đáp ứng yêu cầu.
- Unit/integration test phù hợp chạy thành công khi có thay đổi mã; ghi lệnh và kết quả thực tế.
- Thay đổi giao diện có bằng chứng kiểm tra các trạng thái chính và kích thước màn hình liên quan.
- Tài liệu, hợp đồng API và cấu hình mẫu được cập nhật khi hành vi thay đổi.

Với PR chỉ thay đổi tài liệu/cấu trúc, ghi rõ unit/integration test không áp dụng và kiểm tra đường dẫn, liên kết, whitespace. Khi repository chưa có runtime, không ghi test pass nếu chưa có test để chạy.

## Final Approval

**Nguyễn Ngọc Thành, Project Leader, thực hiện merge cuối cùng** sau khi có approval độc lập và các kiểm tra phù hợp đạt yêu cầu. Tác giả và thành viên khác không tự merge PR. Leader kiểm tra base branch, trạng thái review và các trao đổi còn mở trước khi merge.

`CODEOWNERS` giúp GitHub đề nghị Leader review. Nó không tự cấp approval và không bảo đảm chỉ Leader có thể bấm merge; quyền và quy định này được giải thích trong [GitHub settings](github-settings.md).

## Issue Tracking

Vấn đề hiệu năng hoặc bảo mật phát hiện trong review phải được giải quyết trước khi merge. Ghi nhận vấn đề, người xử lý và bằng chứng kiểm tra; đóng trao đổi sau khi reviewer xác nhận đã xử lý. Không đưa secret hoặc thông tin giúp khai thác một lỗi đang tồn tại lên issue công khai; báo qua kênh riêng của nhóm và chỉ ghi thông tin đã lược bỏ chi tiết nhạy cảm.

Lỗi không liên quan trực tiếp vẫn cần được ghi nhận để Leader đánh giá ảnh hưởng. Không dùng một issue chưa xử lý để thay thế việc sửa lỗi hiệu năng/bảo mật đang chặn PR.
