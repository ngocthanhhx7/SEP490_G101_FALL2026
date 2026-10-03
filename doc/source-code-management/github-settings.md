# GitHub Settings

Repository: [ngocthanhhx7/SEP490_G101_FALL2026](https://github.com/ngocthanhhx7/SEP490_G101_FALL2026). Nhánh mặc định là `main`; thành viên phải chọn base `develop` khi mở PR tính năng.

## Bảo vệ main và develop

Cấu hình bảo vệ cần áp dụng cho cả hai nhánh sau khi tạo baseline:

- Bắt buộc Pull Request và ít nhất một approval độc lập trước khi merge.
- Hủy approval cũ khi thay đổi mã được push thêm; yêu cầu approval cho lần push có thể review gần nhất từ một người khác người push.
- Yêu cầu giải quyết các trao đổi review trước khi merge.
- Áp dụng quy định cho cả quản trị viên.
- Không cho phép force push hoặc xóa nhánh.

Chưa yêu cầu status check cụ thể vì baseline chưa có runtime hoặc pipeline. Khi bổ sung CI, Leader cấu hình các check thật đã chạy thành công thành required checks cho hai nhánh. Không tạo check giả để thay thế lint, build hoặc test.

Đây là cấu hình ở cấp GitHub; chỉ commit tệp Markdown không tự bật branch protection. Kiểm tra trạng thái đang áp dụng tại **Settings → Branches** trước khi thay đổi quyền hoặc quy trình.

## Review và người merge

`.github/CODEOWNERS` chỉ định `@ngocthanhhx7` cho toàn repository để đề nghị Leader review. Không bật bắt buộc code-owner approval chỉ từ Leader, vì PR do Leader tạo vẫn phải được một thành viên khác review.

Quy định nhóm yêu cầu Leader merge cuối cùng. Với repository cá nhân, branch protection cơ bản không giới hạn người push/merge bằng danh sách user như repository thuộc organization. Vì vậy, cấu hình approval bảo đảm có review, còn việc chỉ Leader merge vẫn là quy định vận hành của nhóm. Nếu cần cưỡng chế quyền merge riêng, Leader phải thiết kế quyền/ruleset phù hợp hoặc chuyển sang organization và kiểm tra lại khả năng tài khoản.

Thêm tài khoản GitHub của thành viên làm collaborator khi Leader có thông tin chính xác. Không tự suy đoán username từ họ tên hoặc email trong báo cáo. Approval hợp lệ cần quyền theo cấu hình repository.

## Bootstrap và phát triển tiếp theo

`main` và `develop` bắt đầu tại cùng commit cấu trúc. Baseline được push trực tiếp theo yêu cầu khởi tạo của Leader, trước khi áp dụng bảo vệ nhánh. Không ghi nhận baseline như một PR đã được peer review.

Từ commit tiếp theo, dùng feature/release/hotfix branch và PR. Không bỏ bảo vệ để tránh review; kể cả Leader cũng cần một thành viên khác approve PR của mình.

Tham chiếu: [GitHub protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches) và [branch protection REST API](https://docs.github.com/en/rest/branches/branch-protection#update-branch-protection).
