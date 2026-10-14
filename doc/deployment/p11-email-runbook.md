# P11 — SMTP email adapter

WBS-053 / UC-01, UC-02, UC-04, UC-05. User chọn SMTP/provider khác thay Resend ngày 14/10/2026. Adapter dùng cùng delivery service cho OTP và thông báo hệ thống. P06 chịu trách nhiệm sinh/lưu/xác minh OTP, purpose binding, quota và session; P11 không cung cấp route public hoặc tạo mã.

## Cấu hình

Chỉ điền trong backend/.env cục bộ; không commit `.env` hoặc `.env.*`, chỉ `.env.example` chứa placeholders. Không gửi credential qua chat, PR hay log. Không bật debug/protocol logging của SMTP.

| Biến được factory đọc | Giá trị / ý nghĩa |
| --- | --- |
| EMAIL_ENABLED | Mặc định false hoặc unset; bật bằng đúng true |
| SMTP_HOST | Hostname SMTP của provider, không URL chứa credential |
| SMTP_PORT | 465 implicit TLS hoặc 587 bắt buộc STARTTLS |
| SMTP_USER, SMTP_PASSWORD | Credential SMTP do provider cấp, bắt buộc khi enable |
| EMAIL_FROM | Một mailbox thuần, sender đã được provider cho phép |
| EMAIL_TIMEOUT_MS | 100–30000 ms, mặc định10000; deadline mỗi attempt |
| EMAIL_MAX_ATTEMPTS | 1–3, mặc định2; retry delay1000 ms |

Factory validate env khi được gọi; thiếu/sai báo503 EMAIL_CONFIGURATION_INVALID chỉ kèm tên field. Bật nhưng không inject dependency báo503 EMAIL_TRANSPORT_UNAVAILABLE. Disabled trả overrides rỗng, giữ P02 PROVIDER_UNAVAILABLE503. P34 phải gọi factory trước listen và truyền vào createApp; env chưa tự được nối với runtime P02. Không claim startup đã kiểm tra SMTP khi factory chưa được gọi. Chứng chỉ TLS luôn được kiểm tra; cấm tắt rejectUnauthorized. Không hỗ trợ plaintext port25 hoặc OAuth2 trong gói này.

## Proposal tích hợp P34 (chưa áp dụng shared manifest/runtime)

Nodemailer10.1.1 được registry trả về tại thời điểm kiểm tra; integrator đánh giá/audit lại trước khi áp dụng exact manifest và lockfile cùng một commit. P11 không sửa manifest/lockfile hoặc app.js/runtime.js vì ownership P34. Không cài package toàn máy.

```powershell
# Trong backend của nhánh tích hợp P34:
npm install --save-exact nodemailer@10.1.1 --ignore-scripts
npm audit
npm run lint
npm test
```

```js
import nodemailer from 'nodemailer';
import { createEmailPortOverrides } from './services/smtp-email.service.js';

const emailOverrides = createEmailPortOverrides({
  env: process.env,
  createTransport: options => nodemailer.createTransport(options),
  logger: safeEmailLogger
});
// Before listen, compose into createApp({ ..., portOverrides: emailOverrides }).
// P06/P34 must dispatch contactDelivery by channel if adding an SMS adapter.
```

safeEmailLogger do integrator cung cấp chỉ nhận event EMAIL_ATTEMPT, status, code và attempt; không thêm command/error raw vào wrapper. Factory không gọi verify() hoặc gửi email lúc startup. Provider acceptance không chứng minh mailbox delivery.

## Private server command và kết quả

Đây là interface nội bộ đề xuất, không thay DTO/API v1 của P01. P06/P34 xác nhận mapping khi tích hợp. Chỉ service đã kiểm tra quyền được gọi port; không cho client chọn operationId, recipient, kind hoặc purpose qua request tùy ý.

- contactDelivery.send: `{ channel: 'EMAIL', kind: 'OTP', to, operationId, purpose, code, expiresAt }`. operationId UUID do server tạo; purpose REGISTER/LOGIN/CONTACT_CHANGE; code string6 chữ số giữ leading zero; expiresAt ISO UTC trong (now, now+5phút]. P06 giữ liên kết mã–liên hệ–purpose và quota resend60giây/5mãgiờ/lock15phút theo P01.
- notificationDelivery.send: `{ channel: 'EMAIL', kind: 'SYSTEM', to, operationId, title, message }`. title1–120ký tự không control/header injection, message1–4000ký tự, escape HTML. Không nhận attachment/URL/html tự do, CC/BCC hoặc danh sách recipient. Nội dung phải do module nghiệp vụ đã kiểm tra quyền tạo.
- to/from chỉ một mailbox thuần với local part≤64 và tổng≤254ký tự; không display name hoặc nhiều địa chỉ. Validation cố ý hạn chế ASCII; các mailbox quốc tế cần hợp đồng mở rộng. Không lower-case local part hoặc chuẩn hóa Gmail dots.
- Mọi kết quả chứa status ACCEPTED/FAILED, code an toàn, retryable, uncertain, attempts. ACCEPTED/SMTP_ACCEPTED nghĩa SMTP xác nhận nhận recipient/message, không phải DELIVERED. Không trả raw response, messageId, địa chỉ hoặc mã.

| Code FAILED | Retry / hành động caller |
| --- | --- |
| INVALID_REQUEST, EXPIRED, OPERATION_CONFLICT | Không retry; sửa command hoặc bắt đầu flow OTP hợp lệ mới |
| AUTHENTICATION_FAILED, INVALID_ADDRESS | Không retry; cấu hình/provider hoặc địa chỉ cần xử lý |
| THROTTLED | SMTP4xx explicit rejection; tự retry trong giới hạn, sau đó caller queue/backoff có kiểm soát |
| PROVIDER_UNAVAILABLE | Lỗi kết nối trước DATA có thể retry; lỗi sleep trả false |
| TIMEOUT | Không tự retry; uncertain=true nếu không biết stage hoặc đã DATA |
| PROVIDER_ERROR | Không tự retry; uncertain=true khi không biết provider đã nhận hay chưa |

Thư giữ nguyên recipient/template/expiry/Message-ID qua các attempt. Deadline tổng caller tối đa attempts×timeout+(attempts−1)×delay, chưa bao gồm scheduler overhead. Timeout đóng transport best effort; connection còn sống có thể kết thúc muộn. Adapter xử lý promise muộn, nhưng không khẳng định email không được gửi. Kiểm tra expiry trước mỗi attempt; không gửi lại OTP hết hạn sau wait. Hộp thư có thể nhận email sau expiry, P06 vẫn phải từ chối mã hết hạn.

Các command đồng thời cùng operationId/payload chia sẻ một promise; khác payload bị OPERATION_CONFLICT. Đây chỉ là chống gửi đồng thời trong process. Sau settlement/restart hoặc giữa nhiều process, không có durable dedup. SMTP Message-ID không đảm bảo idempotency. P06/P33 cần outbox/lease và trạng thái ACCEPTED/UNCERTAIN, không tự resend khi uncertain, không đổi mã hoặc key để thử lại cùng logical delivery. Sau khi hết bounded retries, retryable là gợi ý cho caller, không phải lệnh retry vô hạn.

## Kiểm tra thật và gate

Unit suite inject createTransport/createAttempt; không import provider thật, không DNS/SMTP/HTTP. Kiểm tra template, input âm, safe errors/logs, retry, expiry, deadline và race. Integration Mongo của P02 dùng database cô lập; không chứng minh SMTP/Atlas.

INTEGRATION_PENDING: P34 dependency/wiring; P06 OTP mapping/auth/quota/outbox; account SMTP, sender verification và sandbox recipient. Khi đã có cấu hình, gửi đúng một thư synthetic được provider cho phép từ luồng riêng, ghi chỉ timestamp/status/code/attempts. Không dùng dữ liệu khách hàng; không in OTP/address/credential. Muốn xác nhận DELIVERED cần evidence từ sandbox/inbox của provider; SMTP_ACCEPTED chưa đủ. Chưa thực hiện sandbox send trong P11 này.

Nguồn chính thức: [SMTP options](https://nodemailer.com/smtp), [message configuration](https://nodemailer.com/message), [error reference](https://nodemailer.com/errors). Implementation dùng TLS bắt buộc, timeout, tắt debug/logging và quyền đọc file/URL theo transport docs; không chuyển qua HTTP provider.
