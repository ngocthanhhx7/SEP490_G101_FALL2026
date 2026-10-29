# Quản lý MongoDB trên VPS từ Windows

Production dùng database `paw_world_care` trên EC2, MongoDB chỉ bind
`127.0.0.1:27017`, replica set `rs0`. Không mở cổng 27017 trong Security Group.
Mongo local `paw_world_care_dev` ở cổng 27018 là nguồn dữ liệu độc lập.

## Kết nối MongoDB Compass qua SSH

Mở PowerShell và giữ cửa sổ chạy:

```powershell
ssh -i "$env:USERPROFILE\.ssh\pawworldcare-ec2.pem" -N -L 127.0.0.1:27019:127.0.0.1:27017 ec2-user@ec2-54-79-81-209.ap-southeast-2.compute.amazonaws.com
```

Trong cửa sổ PowerShell khác, đăng nhập và mở file cấu hình:

```powershell
ssh -i "$env:USERPROFILE\.ssh\pawworldcare-ec2.pem" ec2-user@ec2-54-79-81-209.ap-southeast-2.compute.amazonaws.com
```

```bash
sudo nano /opt/pawworldcare/shared/.env
```

Tìm `MONGO_URI` bằng Ctrl+W. Trong Compass → Add new connection, dùng username và
mật khẩu URL-encoded trong URI đó, thay host thành `127.0.0.1:27019`:

```text
mongodb://pwcapp:<URL_ENCODED_PASSWORD>@127.0.0.1:27019/paw_world_care?authSource=paw_world_care&directConnection=true
```

Không copy dấu nháy ngoài URI. Không đưa URI thật vào Git, ảnh màn hình hoặc chat.
`directConnection=true` giữ Compass dùng tunnel, tránh dò hostname replica set
chỉ truy cập được trên VPS. Đóng PowerShell tunnel để ngắt kết nối.
Không thêm `replicaSet=rs0` vào URI Compass này: UI Compass trên máy người dùng
đang từ chối kết hợp đó. Server vẫn là replica set rs0; không đổi cấu hình Mongo.
Nếu `ECONNREFUSED 127.0.0.1:27019`, tunnel chưa nghe ở cổng này. Chạy lại lệnh SSH
và giữ PowerShell mở; không sửa firewall Mongo hoặc mở 27017 ra Internet.

Đây là dữ liệu production thật. Sửa/xóa trong Compass tác động trực tiếp lên VPS;
tunnel không tự biến tài khoản `pwcapp` thành read-only. Nếu cần quyền chỉ xem,
provision một tài khoản Mongo role `read` riêng, không đổi role app đang chạy.

## Dùng dữ liệu để phát triển local

Không thay `MONGO_URI` của ứng dụng local thành kết nối production. Nếu cần bản
sao, export bằng `mongodump` qua tunnel rồi restore vào database dev riêng sau
khi xử lý thông tin cá nhân. Compass Export JSON/CSV chỉ thích hợp xem/di chuyển
từng collection, không thay thế bản backup giữ kiểu BSON và indexes.

Không restore dump thật vào dev còn đang nối SMTP/SMS/payments/jobs thật: dữ liệu
phải loại thông tin liên hệ/địa chỉ/ghi chú riêng, sessions/OTP và các lệnh/outbox
có thể phát sinh tác động. Dùng synthetic fixtures cho kiểm thử. Thao tác copy
data production chưa được thực hiện trong vòng cấu hình này.

Đọc thêm [environment](ec2-environment-guide.md) và [recovery](p35-recovery.md).
