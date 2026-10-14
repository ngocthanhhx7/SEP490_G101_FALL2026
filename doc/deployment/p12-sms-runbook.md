# P12 — eSMS OTP adapter runbook

Ngày kiểm tra nguồn: 14/10/2026. WBS-066 / UC-01, UC-02, UC-04, UC-05. Adapter gửi OTP do P06 tạo; P06 vẫn sở hữu sinh mã, purpose binding, xác minh, quota, khóa và session. P12 không thêm route hoặc tự xác minh mã.

## Chọn nhà cung cấp và giá

Chọn **eSMS** làm lựa chọn ưu tiên chi phí cho OTP SMS nội địa Việt Nam. P12 dùng API customer-care SMS thông thường với template OTP, nên P06 giữ toàn bộ vòng đời OTP; không cần chuyển xác minh sang một sản phẩm managed verification. API eSMS hỗ trợ `RequestId` chống trùng trong 24 giờ và chế độ Sandbox.

Chưa có đủ bảng giá công khai để kết luận eSMS là rẻ nhất tuyệt đối. Giá có thể phụ thuộc nhà mạng nhận, Brandname/customer-care route, số segment mỗi tin, sản lượng, số dư nạp trước và điều kiện hợp đồng. Trước khi nạp tiền/ký hợp đồng, xin eSMS báo giá bằng văn bản cho OTP CSKH đến Viettel, VinaPhone, MobiFone, Vietnamobile và các mạng khác nhóm cần hỗ trợ; yêu cầu tách giá một segment, segment Unicode, phí khởi tạo/Brandname/template và mức nạp tối thiểu. Nội dung SMS P12 dùng ASCII/GSM-7 để hướng tới một segment.

Mốc so sánh: Twilio Verify công bố phí nền **$0.05 cho mỗi lần xác minh thành công, cộng cước kênh**. Đây không phải báo giá tương đương theo từng nhà mạng Việt Nam, nhưng cho thấy managed verification có thêm phí sản phẩm ngoài SMS. eSMS được chọn làm phương án nội địa cost-first; quyết định đơn giá cuối vẫn chờ báo giá và thử nghiệm chất lượng gửi.

## Đăng ký và chuẩn bị dịch vụ

1. Tạo tài khoản tại [eSMS đăng ký](https://account.esms.vn/Account/SignUp), dùng email/số điện thoại của nhóm hoặc pháp nhân dự án và bật bảo vệ tài khoản. Form hiện yêu cầu số điện thoại, họ tên, email, mật khẩu và khu vực.
2. Liên hệ bộ phận kinh doanh/hỗ trợ eSMS để xin báo giá OTP CSKH nội địa theo bảng segment/nhà mạng ở trên. Hỏi rõ giấy tờ pháp nhân/ủy quyền cần nộp, phí đăng ký, SLA hỗ trợ và thời gian kích hoạt. P12 không gửi giấy tờ thay nhóm.
3. Đăng ký **Brandname** trước khi gửi tin production. Chốt đúng sender name sẽ xuất hiện ở máy khách. eSMS yêu cầu Brandname đăng ký trước.
4. Đăng ký template SMS CSKH/OTP cho các nhà mạng; eSMS trả `146` nếu template CSKH sai/chưa được cấu hình. Chỉ thay phần mã OTP động trong mẫu đã được duyệt; không tự ý đổi mục đích hoặc thêm nội dung marketing.
5. Sau khi tài khoản, Brandname, template và bảng giá đã hoạt động, lấy `ApiKey` và `SecretKey` trong dashboard/kênh bảo mật eSMS; cấu hình allowlist IP nếu eSMS yêu cầu (`140` là IP chưa được allowlist). Nạp số dư theo điều khoản provider.
6. Dùng `ESMS_SANDBOX=true` để kiểm tra request validation. Sandbox không gửi tin tới thuê bao và không chứng minh được SMS delivery. Chỉ chuyển `false` sau khi owner cho phép gửi một OTP tổng hợp tới số thử nghiệm được nhóm kiểm soát, có consent và đã đăng ký theo provider.
7. Lưu credentials trong `backend/.env` cục bộ (đã ignore) hoặc secret manager của môi trường deploy. Không commit, ghi log, gửi qua chat hoặc đưa vào `.env.example`.

## Cấu hình backend

Factory `createSmsPortOverrides` chưa được nối vào startup/runtime; P34 phải gọi factory trước khi listen và ghép P11/P12 thành một `contactDelivery` duy nhất. P06 dùng kênh liên hệ `EMAIL`/`PHONE`; integrator phải chuyển `PHONE` thành `SMS` khi gọi adapter này và giữ `EMAIL` cho P11. Không ghi đè adapter này bằng object spread; provider tắt hoặc thiếu phải giữ trạng thái fail-closed của P02.

| Biến môi trường | Ý nghĩa |
| --- | --- |
| `SMS_ENABLED` | Mặc định tắt; chỉ đúng `true` mới bật adapter |
| `ESMS_API_KEY` | API Key từ eSMS; secret, không ghi log |
| `ESMS_SECRET_KEY` | Secret Key từ eSMS; secret, không ghi log |
| `ESMS_BRANDNAME` | Brandname CSKH đã được eSMS/nhà mạng duyệt, tối đa 11 ký tự |
| `SMS_TIMEOUT_MS` | Deadline 100–30000 ms; mặc định 10000 |
| `ESMS_SANDBOX` | `true` gửi request sandbox không phát SMS; mặc định `false` |

Khi tắt, factory trả `{}` để giữ provider fail-closed của P02. Khi bật nhưng thiếu/sai env, factory báo `503 SMS_CONFIGURATION_INVALID`, chỉ nêu tên field. Credential bị provider từ chối (`101`) trả `CONFIGURATION_EXPIRED`; Brandname/template/IP/price-list chưa sẵn sàng trả `CONFIGURATION_INVALID`. Không đổi sang nhà cung cấp khác tự động.

## Hợp đồng nội bộ, timeout và trạng thái

Adapter SMS nhận command server-only `{ channel: 'SMS', kind: 'OTP', to, operationId, purpose, code, expiresAt }`. P06 gửi `channel: 'PHONE'` cho số điện thoại, vì đây là loại liên hệ trong contract; P34 phải map `PHONE` thành `SMS` trước khi gọi adapter. `operationId` UUID do server sinh và phải ổn định khi caller reconcile cùng operation. Adapter chuẩn hóa số di động Việt Nam thành E.164 `+84…`, gửi API digits-only `84…`; không chấp nhận quốc gia khác. Nội dung ASCII gồm mã, purpose, hạn 5 phút và cảnh báo không chia sẻ mã.

`RequestId` truyền `operationId`; eSMS ghi tài liệu rằng giá trị này chặn request trùng trong 24 giờ. Adapter coalesce các lời gọi đồng thời cùng payload trong process. Payload khác nhưng reuse id trả `OPERATION_CONFLICT`. Mỗi lần thử chỉ gửi một HTTP request. Timeout/mất kết nối sau khi bắt đầu request trả `TIMEOUT` hoặc `PROVIDER_ERROR`, `uncertain=true`, không retry tự động; caller phải giữ trạng thái pending/uncertain và dùng lại cùng operation ID khi reconcile, không phát sinh OTP/send mới chỉ vì chưa nhận response.

| Kết quả | Nghĩa vụ cho caller |
| --- | --- |
| `ACCEPTED / ESMS_ACCEPTED` | eSMS nhận request; **không** đồng nghĩa nhà mạng đã giao tới điện thoại |
| `FAILED / SANDBOX_VALIDATED` | Sandbox xác nhận payload hợp lệ nhưng không phát SMS; không mở session/đánh dấu OTP đã gửi |
| `INVALID_PHONE` | Input không hợp lệ hoặc eSMS xác nhận định dạng số sai |
| `CONFIGURATION_EXPIRED` | eSMS báo API key/secret không đúng hoặc đã bị thu hồi; xử lý cấu hình, không retry |
| `CONFIGURATION_INVALID` | Chưa có bảng giá, Brandname/template/IP/route chưa sẵn sàng; xử lý cấu hình |
| `RATE_LIMITED` | HTTP 429 hoặc TPS vượt hạn mức; không lặp ngay; caller theo quota/backoff |
| `PROVIDER_REJECTED` / `ACCOUNT_BALANCE_LOW` | Provider từ chối rõ ràng; xử lý nguyên nhân trước operation mới |
| `OPERATION_UNKNOWN`, `TIMEOUT`, `PROVIDER_ERROR` | Kết quả chưa rõ; `uncertain=true`, không gửi OTP thay thế tự động. Mã provider chưa biết cũng được xử lý như kết quả chưa rõ. |

SMSID/raw response không trả về caller. Logger chỉ nhận event/status/code; tuyệt đối không log OTP, số điện thoại, credentials, request body hoặc lỗi raw. Không truyền `CallbackUrl` ở P12; delivery status callback/reconciliation là phần tích hợp sau. eSMS ghi rõ `CodeResult=100` chỉ là đã nhận request vào hệ thống, không phải đã giao tới thuê bao.

## Kiểm chứng và gate

Các unit tests dùng fake `fetch`; không gọi mạng/eSMS. Chúng kiểm tra E.164, template ASCII, leading-zero OTP, input âm, expiry, config, provider rejection, throttling, timeout, operation conflict/idempotency và log không chứa OTP/số/secret. Test fake chỉ chứng minh adapter tạo đúng request; không chứng minh SMS được gửi hay nhận.

**INTEGRATION_PENDING:** chưa có tài khoản/credentials eSMS, báo giá, Brandname/template được duyệt, provider allowlist hoặc sandbox test; P06 chưa gọi contract từ flow OTP và P34 chưa wire cả email/SMS vào runtime. Chưa gửi SMS thật. Sau khi tích hợp, xác minh một số synthetic do nhóm kiểm soát; ghi timestamp/status/code. Nếu cần tra SMSID trong dashboard provider thì giữ trong kênh vận hành giới hạn quyền, không ghi số/OTP/credential vào handoff công khai.

## Nguồn nhà cung cấp

- [eSMS đăng ký tài khoản](https://account.esms.vn/Account/SignUp)
- [eSMS API gửi OTP/customer-care](https://developers.esms.vn/en/esms-api/send-sms-api/send-otp-customer-care-message) — POST JSON, Brandname đăng ký trước, template CSKH, Sandbox, `RequestId` tối đa 50 ký tự và chống trùng 24 giờ.
- [eSMS mã lỗi](https://developers.esms.vn/en/esms-api/table-of-error-codes) — `100` chỉ xác nhận nhận request; `101` credential; `102` price list; `103` balance; `104` Brandname; `108` format số; `124` RequestId trùng; `140` IP; `146` template; `160` TPS.
- [Twilio Verify pricing](https://www.twilio.com/en-us/verify/pricing) — $0.05 mỗi successful verification cộng cước kênh, làm mốc so sánh managed verification.

Giá được kiểm tra/nghiên cứu ngày 14/10/2026; cần báo giá trực tiếp để chốt tổng chi phí tại thời điểm nhóm ký dịch vụ.
