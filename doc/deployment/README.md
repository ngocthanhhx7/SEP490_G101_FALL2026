# Deployment và vận hành

- [EC2 environment](ec2-environment-guide.md): SSH, Nano, cách điền từng biến và nạp lại cấu hình.
- [MongoDB từ máy cá nhân](mongodb-access.md): Compass qua SSH tunnel và phân biệt dữ liệu dev/production.
- [Ngừng hosting cũ](retire-legacy-hosting.md): ngắt auto-deploy và kiểm tra ngoài Git.
- [P35 staging runbook](p35-staging-runbook.md): EC2 frontend/backend, Cloudflare DNS/proxy, private R2,
  Mongo local replica set hoặc remote TLS, HTTPS/session, environment, private upload và payOS gates.
- [P35 verification](p35-verification.md): bằng chứng bắt buộc và trạng thái thực.
- [P35 recovery](p35-recovery.md): health/readiness, job, backup/restore, log và rollback.
- [P35 handoff](p35-handoff.md): phạm vi, contributor và việc còn thiếu.
- [P02 backend](p02-backend-runbook.md), [P11 email](p11-email-runbook.md),
  [P12 SMS](p12-sms-runbook.md): hướng dẫn nền và provider.

Tài liệu hoặc cấu hình mẫu không phải bằng chứng đã deploy. Không đặt secrets,
dump, ảnh giấy tờ, địa chỉ nhà hoặc log phiên đăng nhập vào repository.
