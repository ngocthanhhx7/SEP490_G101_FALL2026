# Backend

REST API Node.js/Express của Paw World Care, dùng MongoDB và Mongoose.

## Runtime và dependencies

- Node.js `>=22`, ES modules, npm; lockfile được lưu cùng `package.json`.
- Express 5 và Mongoose 8.
- Zod kiểm tra cấu hình môi trường và dữ liệu đầu vào; Zod cũng kiểm tra email.
- `libphonenumber-js` chuẩn hóa số điện thoại Việt Nam sang E.164.
- `mongodb-memory-server` cung cấp MongoDB replica set một node cho integration test.

## Chạy local

```powershell
cd backend
npm ci
Copy-Item .env.example .env
docker compose up -d
npm run dev
```

Compose khởi chạy MongoDB 7 với replica set `rs0` một node. Backend mặc định kết nối tới `mongodb://127.0.0.1:27017/paw_world_care?replicaSet=rs0`; tiến trình chỉ bắt đầu lắng nghe sau khi kết nối và xác nhận MongoDB có replica set. Kiểm tra liveness tại `http://localhost:3000/health/live`.

Không commit `.env`. Chỉnh các ngưỡng UC-01 trong `.env` theo định dạng ví dụ; cấu hình được kiểm tra khi khởi động và tiến trình dừng với lỗi rõ ràng nếu thiếu/không hợp lệ.

`TRUST_PROXY=loopback` dùng cho local. Khi deploy sau reverse proxy, đặt `TRUST_PROXY` thành số hop hoặc CIDR của proxy thực sự tin cậy. Không bật `true` nếu ứng dụng có thể nhận request trực tiếp từ Internet; giá trị này ảnh hưởng trực tiếp đến `req.ip` và rate limit.

## Xác thực Customer

`POST /api/v1/auth/login/request-otp` nhận `{ "contactType": "email" | "phone", "contact": "..." }`. API luôn trả `202` với thông báo trung tính; OTP chỉ được gửi tới contact đã xác minh của Customer `ACTIVE`. `POST /api/v1/auth/login/verify-otp` nhận cùng contact và `otp`; khi xác minh thành công, trả bearer session token. Gửi token trong `Authorization: Bearer <token>` cho endpoint cần đăng nhập. `POST /api/v1/auth/login/logout` thu hồi session hiện tại. OTP sống theo `OTP_TTL`, tối đa `MAX_WRONG_OTP` lần nhập sai, quota contact dùng `CONTACT_QUOTA` và `RESEND_COOLDOWN`; giới hạn IP riêng có thể cấu hình bằng `LOGIN_REQUEST_IP_LIMIT` và `LOGIN_VERIFY_IP_LIMIT`. Session hết hạn theo `LOGIN_SESSION_TTL` (mặc định 30 ngày). Mock provider chỉ lưu OTP trong bộ nhớ ở development/test, không ghi OTP vào log.

Để gửi thật, đặt `OTP_EMAIL_PROVIDER=gmail` và/hoặc `OTP_SMS_PROVIDER=esms` trong `.env`. Gmail cần `GMAIL_USER` và `GMAIL_APP_PASSWORD`; dùng App Password sau khi bật 2-Step Verification, không dùng mật khẩu Gmail chính. eSMS cần `ESMS_API_KEY`, `ESMS_SECRET_KEY`, `ESMS_BRANDNAME` và `ESMS_CONTENT_TEMPLATE`; Brandname và đúng nội dung template phải được eSMS/nhà mạng đăng ký trước. `ESMS_SANDBOX=1` chỉ xác thực tích hợp, không giao SMS; đặt `0` để gửi SMS thật và có thể phát sinh phí. Không đưa credentials vào Git, log hoặc chat. Nếu chưa chọn provider thật, hai selector mặc định là `mock`.

Integration test nên gọi `startMongoMemoryReplicaSet()` từ `tests/helpers/mongodb-memory.js`; helper khởi tạo replica set WiredTiger một node để hỗ trợ transaction. Lần chạy đầu có thể cần tải MongoDB binary.

## Trách nhiệm thư mục

| Đường dẫn | Nội dung |
| --- | --- |
| `src/config/` | Đọc và kiểm tra cấu hình môi trường; cấu hình database và dịch vụ ngoài |
| `src/routes/` | Khai báo endpoint, middleware và controller tương ứng |
| `src/controllers/` | Đọc request, gọi service, trả response |
| `src/services/` | Quy tắc nghiệp vụ: lịch chăm sóc, phân công, thanh toán, xử lý sự cố |
| `src/models/` | Mongoose schemas, models và indexes |
| `src/middlewares/` | Xác thực, phân quyền, xử lý lỗi và middleware dùng chung |
| `src/validators/` | Kiểm tra dữ liệu đầu vào cho body, params, query |
| `src/constants/` | Vai trò, trạng thái và hằng số nghiệp vụ |
| `src/utils/` | Hàm hỗ trợ độc lập |
| `src/jobs/` | Công việc định kỳ hoặc xử lý nền khi được triển khai |
| `scripts/seeds/` | Dữ liệu mẫu tổng hợp cho môi trường phát triển/kiểm thử |
| `scripts/migrations/` | Thay đổi dữ liệu/schema/index có kiểm soát và hướng dẫn chạy |
| `tests/unit/` | Test service và utility |
| `tests/integration/` | Test API và tương tác database/dịch vụ ngoài |
| `tests/fixtures/` | Dữ liệu kiểm thử tổng hợp |

Luồng thông thường: `route → middleware/validator → controller → service → model`.

Controller giữ mỏng; service chịu trách nhiệm nghiệp vụ. Không đặt toàn bộ thao tác MongoDB và logic phân công/thanh toán trong route. Mỗi endpoint phải kiểm tra quyền ở backend, kể cả khi frontend đã ẩn chức năng.

Các lệnh hiện có: `npm start`, `npm run dev`, và `npm test` (Node.js test runner). Đã có 10 unit tests cho tiện ích và 44 integration tests theo acceptance criteria UC-01 trên MongoDB replica set với mock OTP provider. Môi trường production cần seed role CUSTOMER và cấu hình provider email/SMS thực tế trước khi nhận request. Chưa có cấu hình VNPay hay dịch vụ ngoài trong baseline này.

Xem [quy ước code](../doc/source-code-management/coding-conventions.md).


## Pet Sitter applications

The application flow is served at `/api/v1/pet-sitter/applications`. Submit the multipart form with `fullName`, `email`, `phone`, `age`, `gender`, `location`, `experience`, one or more `acceptedSpecies` values (`DOG`/`CAT`), `bio`, and the 12-digit `nationalId`; attach `portrait`, `nationalIdFront`, `nationalIdBack`, and optional `certificates`. The API sends an email OTP before returning an opaque application token. Send the token in the Authorization bearer header to `POST /verify-otp` and `POST /resend-otp`. Successful verification changes the application to `SUBMITTED_FOR_REVIEW`; it does not create an active sitter account. The `pet_sitters` profile collection is created with its indexes at local dev/test startup and stays empty until a reviewer approves an application. The `roles` collection is seeded with both `CUSTOMER` and `PET_SITTER`; role existence does not mean an applicant has been approved.

Files are checked by their content signature and encrypted with AES-256-GCM under the private, ignored `backend/storage/pet-sitter-applications` directory. The national ID number is also encrypted in MongoDB. Development derives a separate storage key from `OTP_HMAC_SECRET`; production must set `PET_SITTER_PII_ENCRYPTION_KEY` to a unique 32-byte hex key. Generate one with PowerShell: `[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))`. Keep this key backed up securely; changing it without re-encrypting existing data makes stored documents unreadable. Only authorized reviewers should be granted access when a review workflow is added.

Configure `OTP_EMAIL_PROVIDER=gmail` and Gmail credentials to deliver real application codes. The mock provider is for development/test only and does not send messages. Pet Sitter submit, resend, and verify routes have separate configurable IP limits in `.env`.


In MongoDB Compass, connect to `localhost:27017` and open the `paw_world_care` database named in `MONGODB_URI` (not another database such as `DatabaseName`). Restart `npm run dev`, then refresh the database list to see the empty `pet_sitters` collection and the `PET_SITTER` role document.
