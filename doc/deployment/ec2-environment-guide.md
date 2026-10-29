# Cấu hình môi trường trên EC2

Frontend và backend chạy trên EC2; Cloudflare quản lý DNS/proxy HTTPS. File thật
ở `/opt/pawworldcare/shared/.env`, ngoài thư mục release, chỉ root đọc/ghi.
Không chép toàn bộ `.env.example` đè lên file này vì sẽ mất khóa và mật khẩu đang dùng.

## Mở và sửa file

Trong PowerShell trên máy Windows:

```powershell
ssh -i "$env:USERPROFILE\.ssh\pawworldcare-ec2.pem" ec2-user@ec2-54-79-81-209.ap-southeast-2.compute.amazonaws.com
```

Sau khi vào EC2:

```bash
sudo nano /opt/pawworldcare/shared/.env
```

Trong Nano, dùng mũi tên đến dòng cần sửa; Home/End đến đầu/cuối dòng.
Ctrl+W tìm tên biến rồi Enter. Sửa giá trị bên phải dấu `=`; không thêm dòng trùng tên.
Dán vào terminal bằng Ctrl+Shift+V hoặc chuột phải tùy ứng dụng.
Ctrl+O, Enter để lưu; Ctrl+X để thoát.

File được Docker đọc bằng `--env-file`: mỗi dòng `TEN_BIEN=gia_tri`, không thêm
`export`, không bọc giá trị trong dấu nháy. Không gửi ảnh màn hình chứa secrets.
Giữ nguyên `MONGO_URI`, `MONGO_DB`, các khóa OTP/session/contact đang có.

## Điền các dòng đang trống

| Biến | Giá trị cần điền |
| --- | --- |
| `CONTACT_INBOX_EMAIL` | Email thật nhóm kiểm soát để nhận form liên hệ. Không cần giống SMTP sender, nhưng phải nhận thư được. Để trống nếu chưa chọn inbox. |
| `AI_ENABLED` | Giữ `false` đến khi release có module gợi ý sitter được review và kiểm thử. Backend vẫn tự tính giá; bật AI không chuyển việc tính tiền sang AI. |
| `AI_ROUTING_URL` | URL dịch vụ OSRM tin cậy đã triển khai, theo hợp đồng backend. Đây không phải domain frontend, R2 hay API key AI. Chưa có dịch vụ thì để trống; không tự điền public demo. |
| `R2_ENABLED` | Giữ `false` khi mới điền credentials; chỉ bật sau các gate trong runbook R2. |
| `R2_ACCOUNT_ID` | Account ID Cloudflare hiển thị ở R2 Overview, 32 ký tự hex; không phải Zone ID của domain. |
| `R2_BUCKET` | Tên chính xác của bucket đã tạo, ví dụ `pwc-private-production`. |
| `R2_ACCESS_KEY_ID` | Access Key ID trong kết quả tạo R2 API token, không phải chuỗi API Token. |
| `R2_SECRET_ACCESS_KEY` | Secret Access Key đi kèm, chỉ hiển thị lúc tạo; chỉ dán trực tiếp trên VPS. |
| `R2_MAX_IMAGES_PER_USER` | `20` để dùng giới hạn mặc định. |
| `R2_PUBLIC_BASE_URL` | Adapter private mới không dùng biến này. Có thể để trống; không bật public URL để điền vào đây. |
| `EMAIL_TIMEOUT_MS` | Giữ `10000` (10 giây). |
| `EMAIL_MAX_ATTEMPTS` | Giữ `2`. |
| `ESMS_OTP_TEMPLATE` | `Ma xac nhan cua ban la {code}` nếu đúng mẫu tài khoản đã được duyệt. Backend thay `{code}` bằng OTP; không điền mã thật vào `.env`. |
| `ESMS_SANDBOX` | `true` để kiểm tra không phát SMS; `false` là có thể gửi thật khi adapter được bật. |
| `SMS_ENABLED` | Giữ `false` trong production đến khi xử lý xong lần gửi thất bại và release template mới được review. |

`CONTACT_INBOX_EMAIL` còn cần `EMAIL_ENABLED=true` và SMTP hợp lệ. Chỉ điền
địa chỉ nhận không tự kích hoạt SMTP. Không đổi `EMAIL_FROM` sang địa chỉ chưa
được nhà cung cấp cho phép gửi.

## Lấy thông tin R2 trên Cloudflare

1. Vào **Storage & databases → R2 → Overview → Create bucket**.
   Chọn tên riêng cho môi trường; Automatic/Asia Pacific và Standard phù hợp
   cấu hình hiện tại. Không chọn jurisdiction riêng vì adapter đang dùng endpoint mặc định.
2. Giữ **Public Development URL (r2.dev)** tắt và chưa thêm Custom Domain.
   Cấu hình hiện tại phục vụ ảnh qua backend có kiểm tra owner, không phát URL public.
3. Quay lại Overview, tìm **Account Details → API Tokens → Manage**.
   Chọn Create Account API token hoặc Create User API token theo quyền tài khoản.
4. Chọn **Object Read & Write → Apply to specific buckets only**, chọn đúng
   bucket này rồi tạo token. Không cấp quyền quản trị toàn tài khoản.
5. Sao chép **Access Key ID**, **Secret Access Key** vào hai biến tương ứng
   trong Nano. Lưu secret trong kho mật khẩu riêng; Cloudflare không cho xem lại.
6. Lấy Account ID ở Overview và điền tên bucket. Không đưa token vào frontend/VITE.
7. Lưu file, giữ `R2_ENABLED=false`. Điền đủ cấu hình chưa phải bằng chứng
   PUT/GET, quyền riêng tư hoặc bộ nhớ đã đạt yêu cầu.

Nguồn Cloudflare kiểm tra ngày 29/10/2026:
[S3 setup](https://developers.cloudflare.com/r2/get-started/s3/),
[API credentials](https://developers.cloudflare.com/r2/api/tokens/),
[public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/).

## Áp dụng cấu hình sau khi sửa

Docker restart đơn thuần không nạp lại `--env-file`. Quy trình hiện tại tạo
container ứng viên từ SHA đã review, kiểm tra readiness rồi chuyển proxy.
Chỉ chạy khi các giá trị phù hợp source của release đang chạy:

```bash
PWC_RELEASE_SHA=$(cat /opt/pawworldcare/current/REVISION)
sudo python3 "/opt/pawworldcare/releases/$PWC_RELEASE_SHA/backend/scripts/deployment/activate-release.py" "$PWC_RELEASE_SHA"
curl --fail --silent --show-error https://api.pawworldvn.shop/health
curl --fail --silent --show-error https://api.pawworldvn.shop/ready
```

Không chạy bước này chỉ để bật R2/SMS của mã đang chờ review: release cũ chưa
chắc hỗ trợ các biến mới. Không thay mã production bằng worktree chưa commit.
Nếu activation lỗi, giữ bằng chứng lỗi đã loại secrets và kiểm tra trạng thái
release/proxy trước khi thử lại. Không xóa Mongo volume hoặc chạy bootstrap lại
để sửa một lỗi provider.

## Trạng thái thử SMS ngày 29/10/2026

Một lần gửi thật đã được người dùng cho phép: eSMS nhận request với mã `100`,
nhưng truy vấn delivery và dashboard xác nhận **1 thất bại, 0 thành công, phí 0**.
Chi tiết nhà mạng trả về Itel; chưa có mã nguyên nhân của nhà mạng. Không kết
luận sai template hoặc số điện thoại từ dữ liệu này. Không gửi lại tự động.
Nhờ hỗ trợ eSMS tra SMSID/thời điểm/Brandname và route Itel trong kênh riêng;
receipt nằm ngoài repository, không ghi OTP hoặc số nhận vào tài liệu công khai.

Lần thử tiếp theo, với số nhận khác do người dùng chỉ định, đã có delivery thành
công qua Viettel (1 thành công, 0 thất bại, 820 VND) và người dùng xác nhận nhận
được OTP. Không suy ra route Itel đã được sửa từ kết quả này. Không gửi thêm tin.

R2 đã qua smoke test trực tiếp từ EC2: PUT 200, GET 200 với SHA256 khớp và
`private, no-store`; DELETE ảnh thử 204. Request S3 không có key trả 400, nên
không dùng riêng kết quả đó để chứng minh mọi cấu hình public access đã tắt.
Nguyên nhân 403 trước đã hết sau khi người dùng chỉnh token/IP filtering. Đây
là kiểm tra provider bằng request ký S3; chưa phải end-to-end API/UI của release mới.

Đọc tiếp [R2 acceptance](aws/r2-private-media.md), [SMS](p12-sms-runbook.md)
và [production](ec2-production.md). UI upload, attachment evidence và retention
vẫn cần công việc riêng; credentials đầy đủ không tự bổ sung những tính năng đó.
