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

## Cách viết nhận xét review

Áp dụng cho mọi agent và thành viên khi viết review PR, comment theo dòng hoặc bàn giao kết quả review. Mặc định viết tiếng Việt tự nhiên, rõ ràng như trao đổi với đồng đội; giữ nguyên tên hàm, mã lỗi và thuật ngữ cần thiết. Nếu người dùng yêu cầu ngôn ngữ khác thì theo yêu cầu đó.

- Đi thẳng vào lỗi hoặc kết luận. Với lỗi, nêu tình huống xảy ra, hành vi hiện tại, ảnh hưởng và hướng sửa cụ thể; gắn đúng file/dòng. Không chỉ viết "cần tối ưu" hoặc "có vấn đề bảo mật" mà thiếu bằng chứng.
- Với approval, nói ngắn gọn phần đã kiểm tra và điều kiện còn ảnh hưởng đến việc merge. PR nhỏ thường chỉ cần vài câu; PR phức tạp có thể chia mục để dễ đọc. Không ép mọi review vào một khuôn dài giống nhau.
- Chỉ giữ bằng chứng giúp tác giả hoặc Leader ra quyết định. Tóm tắt kiểm thử liên quan; dẫn link log/báo cáo cho số liệu chi tiết. Phân biệt kiểm tra reviewer vừa chạy với kết quả do tác giả cung cấp.
- Không chép lại toàn bộ mô tả PR, lịch sử sửa lỗi, danh sách mọi suite/test hoặc checklist chung. SHA đầy đủ và danh tính tài khoản đã có trong metadata không cần lặp trong nội dung, trừ khi phải phân biệt nhiều phiên bản.
- Tránh mở đầu kiểu "Codex-assisted independent review under the assigned account", lặp "exact head/scoped approval", lời khen chung chung và các đoạn miễn trừ dài. Phần chưa kiểm tra chỉ cần nêu một lần, cụ thể và có liên quan đến quyết định.
- Viết đủ khoảng trắng: "14 integration tests", không phải "integration14tests". Đọc lại để bỏ câu dịch máy, câu lặp ý và thuật ngữ không giúp người đọc hiểu vấn đề.
- Chỉ ghi thao tác và kết quả đã thực hiện; không bịa kết quả hoặc approval. Không thêm lời mở đầu hay chữ ký khuôn mẫu về công cụ hoặc phương thức review.

Ví dụ nhận xét cần sửa:

> Cần giữ timeout đến khi đọc xong body. Hiện timer bị xóa ngay khi nhận header, nên tải ảnh bị treo vẫn có thể chờ vô hạn. Mình đã tái hiện với timeout 5 ms nhưng request vẫn thành công sau 69 ms. Đề nghị bổ sung test cho body chậm và hủy request sau khi nhận header.

Ví dụ approval, chỉ dùng khi đã thực hiện đúng các kiểm tra được nêu:

> Phần kiểm tra quyền sở hữu và retry cùng key đã ổn. Chạy lại các test upload, đọc ảnh khác chủ và mất phản hồi đều đạt. Có thể merge phần adapter; giữ R2 tắt trên production đến khi kiểm tra bucket thật xong.

## Final Approval

**Nguyễn Ngọc Thành, Project Leader, thực hiện merge cuối cùng** sau khi có approval độc lập và các kiểm tra phù hợp đạt yêu cầu. Tác giả và thành viên khác không tự merge PR. Leader kiểm tra base branch, trạng thái review và các trao đổi còn mở trước khi merge.

`CODEOWNERS` giúp GitHub đề nghị Leader review. Nó không tự cấp approval và không bảo đảm chỉ Leader có thể bấm merge; quyền và quy định này được giải thích trong [GitHub settings](github-settings.md).

## Issue Tracking

Vấn đề hiệu năng hoặc bảo mật phát hiện trong review phải được giải quyết trước khi merge. Ghi nhận vấn đề, người xử lý và bằng chứng kiểm tra; đóng trao đổi sau khi reviewer xác nhận đã xử lý. Không đưa secret hoặc thông tin giúp khai thác một lỗi đang tồn tại lên issue công khai; báo qua kênh riêng của nhóm và chỉ ghi thông tin đã lược bỏ chi tiết nhạy cảm.

Lỗi không liên quan trực tiếp vẫn cần được ghi nhận để Leader đánh giá ảnh hưởng. Không dùng một issue chưa xử lý để thay thế việc sửa lỗi hiệu năng/bảo mật đang chặn PR.
