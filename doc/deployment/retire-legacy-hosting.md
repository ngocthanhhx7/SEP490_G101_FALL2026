# Ngừng triển khai trên hosting cũ

Mục tiêu hiện tại là EC2 cho cả frontend/backend, MongoDB replica set local,
Cloudflare DNS/proxy HTTPS và private R2. Source không cần cấu hình triển khai
Render/Vercel. Ngừng auto-deploy ngoài tài khoản vẫn là thao tác riêng: sửa
README hoặc đổi DNS không tự ngắt tích hợp GitHub của nhà cung cấp.

## Vercel

Trong đúng project Paw World Care, vào **Settings → Git → Connected Git
Repository → Disconnect**. Kiểm tra không còn project Paw World Care khác
được kết nối với repository. Nếu quản lý GitHub App, giới hạn quyền truy cập
để bỏ riêng repository này; không gỡ ứng dụng toàn tài khoản làm ảnh hưởng dự án khác.
Không hạ yêu cầu branch protection để che một check deployment cũ.

## Render

Trong từng service Paw World Care, vào Settings và đặt **Auto-Deploy → Off**.
Kiểm tra dashboard xác nhận đã tắt. Tắt auto-deploy không dừng service đang chạy
hoặc chi phí; nếu cần ngừng hẳn, xử lý theo khả năng suspend của service và
kiểm tra hóa đơn. Trước khi xóa service/database, xuất dữ liệu và lưu những gì cần
giữ; không xóa dữ liệu chỉ vì đã chuyển DNS.

## Kiểm tra sau chuyển

- EC2 phục vụ root/www/api, HTTPS Cloudflare Full (strict), health/ready đạt.
- Lần push tiếp theo không tạo deployment mới trên hosting cũ. Check lịch sử
  trên PR vẫn có thể còn; đó không phải bằng chứng auto-deploy đang bật.
- Giữ secrets ngoài Git; thu hồi credential hosting cũ sau khi kiểm tra không còn
  dịch vụ cần dùng. Không thu hồi nhầm SMTP/R2/Mongo đang sử dụng trên EC2.

Trạng thái: chưa có bằng chứng thao tác Disconnect/Auto-Deploy Off trên dashboard
trong vòng kiểm tra này. Không báo hoàn tất việc ngắt tích hợp chỉ từ thay đổi source.

Nguồn: [Vercel Git settings](https://vercel.com/docs/project-configuration/git-settings),
[Render deploys](https://render.com/docs/deploys).
