# Bộ dữ liệu và phòng thử AI local

Ngày 24/10/2026. Đây là sandbox tổng hợp để quan sát module AI thực xử lý; không phải dữ liệu khách, đánh giá hay sitter thật.

## Mở và khởi động lại

Trang demo: **http://127.0.0.1:3011/**. Máy chủ chỉ bind loopback, không dùng localhost thay cho 127.0.0.1 vì có kiểm tra Host/Origin.

```powershell
cd D:\WW\SEP490_G101_FALL2026\backend
.\scripts\start-local-mongo.ps1
node scripts/demo-ai.js --apply
```

MongoDB URI: `mongodb://127.0.0.1:27018/?replicaSet=pwc-local`, database **paw_world_care_ai_demo**. Không sửa .env của ứng dụng chính; không dùng database paw_world_care_dev. Server tạo secrets tạm trong bộ nhớ, không in ra; khởi động lại tạo secrets khác và cập nhật Contact demo, do đó cần đăng nhập lại. Node_ENV production từ chối; không tự gọi script ở startup production. Không có command xóa toàn database.

Để dừng demo: Ctrl+C trong terminal chạy script. Nếu tiến trình đang được chạy nền bởi Codex, chỉ dừng PID đúng script demo, không dừng MongoDB hoặc backend3000. Ngày lịch tự chọn ba ngày sau thời điểm khởi động; chạy lại script khi lịch cũ quá hạn. IDs demo ổn định, seed lại cập nhật đúng fixtures, không nhân bản số lượng. Seed lại cũng khôi phục fixture về cấu hình chuẩn, nên thay đổi Admin trong sandbox có thể được đặt lại.

## Tài khoản và dữ liệu có sẵn

Tổng **16 accounts**, **6 pet**, **7 địa chỉ**, **11 hồ sơ sitter đã duyệt**, **11 trạng thái sitter**, **11 profile năng lực**, **2 block lịch**, cùng lịch sử outcome tổng hợp cho cả3 dịch vụ. Mỗi khách có chó Poodle6kg và mèo Anh4kg, hai địa chỉ tại khu vực DEMO-HN/DEMO-TWO; An có thêm một địa chỉ phòng khám tổng hợp. Có3 dịch vụ,24 breeds,5 traits và pricing/ranking policies.

| Account/email demo | Vai trò | Dùng để |
| --- | --- | --- |
| customer-an@pwc-demo.example | CUSTOMER | Chạy sáu tình huống chuẩn |
| customer-binh@pwc-demo.example | CUSTOMER | Kiểm tra quyền sở hữu khác An |
| customer-chi@pwc-demo.example | CUSTOMER | Pet/địa chỉ riêng, dữ liệu lịch sử tổng hợp |
| admin@pwc-demo.example | ADMIN | Phiên Admin thật để test API Admin trong sandbox |
| staff@pwc-demo.example | STAFF | Kiểm tra giới hạn quyền |
| sitter-lan@pwc-demo.example | PET_SITTER | Nhiều kinh nghiệm, quen chó của An |
| sitter-minh@pwc-demo.example | PET_SITTER | Kinh nghiệm tốt, vùng DEMO-TWO |
| sitter-ha@pwc-demo.example | PET_SITTER | Nhiều lượt, review4 sao |
| sitter-nam@pwc-demo.example | PET_SITTER | Ít kinh nghiệm hơn |
| sitter-linh@pwc-demo.example | PET_SITTER | Nhận nhiều dịch vụ |
| sitter-phuc@pwc-demo.example | PET_SITTER | Điểm xuất phát xa hơn |
| sitter-trang@pwc-demo.example | PET_SITTER | Trùng10:00–10:30; sau đó rảnh |
| sitter-duc@pwc-demo.example | PET_SITTER | User vẫn ACTIVE nhưng SitterStatus SUSPENDED, bị loại matching |
| sitter-mai@pwc-demo.example | PET_SITTER | Chỉ nhận mèo |
| sitter-khoa@pwc-demo.example | PET_SITTER | Có lịch09:00–09:15 gần nhà khách |
| sitter-huy@pwc-demo.example | PET_SITTER | Có6 lỗi đã đối soát tổng hợp |

Không có mật khẩu. Nút **Đăng nhập qua OTP demo** gọi `/api/v1/otp-challenges`, đọc OTP từ hộp thư local demo, rồi gọi `/api/v1/sessions`. Không dùng OTP cố định, không bỏ xác thực/CSRF ở runtime. OTP/chống spam vẫn theo cấu hình chuẩn; đổi lại cùng account quá nhanh có thể cần đợi60 giây. Email `.example` không gửi ra ngoài. Hộp thư local cố ý xem được trong sandbox, không được đưa `/demo/inbox` vào server thật.

User.synthetic=false là yêu cầu kỹ thuật của session/candidate gate hiện tại để test đăng nhập đầy đủ; mọi User ở đây có fixtureKey ai-demo:* và tên [DEMO], chỉ nằm trong database được guard theo tên+loopback. Đây không phải người dùng thật hoặc training data thật.

## Thao tác xem thuật toán

1. Mở trang, chọn **CUSTOMER — Khách An**, nhấn đăng nhập.
2. Nhấn **Tính giá30 phút**: giá80000đ nếu pricing seed chưa sửa.
3. Nhấn **Test phí đơn trên5 triệu**:60phút×32 lượt=5120000đ, phí2%=102400đ, tổng5222400đ.
4. Chọn **Nhiều sitter**, nhấn Đề xuất: Top5, xem từng đóng góp điểm; Lan có ưu tiên quen pet, Đức bị ngưng, Trang trùng lịch, Mai không nhận chó.
5. Chọn **Chỉ2 sitter**: returned2, shortfall3, INSUFFICIENT_ELIGIBLE_SITTERS; không giả thêm người.
6. Chọn **Đổi sang mèo**: Mai xuất hiện, ưu tiên quen chó của Lan không còn; có thể thấy Khoa lên trên.
7. Chọn **14:00**: Trang hết trùng, được xét lại; điểm/tải lịch thay đổi.
   Hai tình huống bổ sung: **Dắt chó đi dạo** dùng lịch sử đúng dịch vụ; **Thú y** kiểm tra clinic, giờ hẹn10:45, slot10:00–12:00, chờ30 phút và đưa về. Báo giá thú y150000đ/lượt; test phí bậc dùng40 lượt=6000000đ +2%=6120000đ, không phải32 lượt của hai dịch vụ theo thời lượng.
8. Chọn Khách Bình rồi đăng nhập, thử báo giá yêu cầu chuẩn của An:404 vì pet không thuộc Bình. Nhấn **Báo giá pet của tôi** để gọi GET owned pets rồi báo giá cho chó thuộc chính Bình; tương tự với Chi.
9. Chọn sitter/Admin/Staff rồi đăng nhập, nhấn Xem phiên/quyền: API trả đúng roles. Gọi quote/match của Customer bằng vai trò khác bị403.
10. Xem bảng JSON để copy body/các ID. Chỉ cần F12 Network nếu muốn theo dõi request thật; không copy cookie/CSRF ra chat.

Đây là phòng thử AI độc lập, không phải toàn bộ dashboard Customer/Sitter/Admin đã xây xong. Không tạo Booking/Offer/Payment thật; block lịch và outcome là đầu vào mô phỏng cho AI. Có thể dùng cookie của demo trên cùng origin để gọi API bằng DevTools. Đừng dùng account ở đây để đăng nhập backend3000/database khác.

## Routing được mô phỏng rõ ràng

Demo inject provider tính ETA tổng hợp có kiểm soát, không gọi OSRM/public Internet và không có live traffic. Source cache DEMO_SIMULATED_NOT_OSRM; HTTP header X-PWC-Demo-Routing=SIMULATED_NOT_OSRM. Wrapper demo gắn routingSource=DEMO_SIMULATED_NOT_OSRM và meta.demoFixture=true vào response; không sửa module production. Điểm chỉ minh họa thuật toán với fixture ETA, không chứng minh khả năng đến nhà đúng giờ thực tế.

Nếu cần kiểm thử vận hành thật: dùng ứng dụng chính với OSRM trusted, địa chỉ đã xác nhận, sitter đã duyệt và lịch thật; không chuyển fixture rating sang database thật hoặc dùng để train model production.

## Source và kiểm tra

- backend/scripts/demo-ai.js: runner tường minh, port3011, secrets bộ nhớ, không đổi .env.
- backend/scripts/demo-ai/fixtures.js: deterministic fixture IDs, guard database, mô phỏng routing.
- backend/scripts/demo-ai/server.js: wrapper local, static UI, inbox demo; reuse createApp + auth + AiService thật.
- frontend/demo-ai/: HTML/CSS/JS chỉ được server demo serve, không import vào bundle ứng dụng chính.
- backend/tests/integration/demo-ai.test.js: Mongo replica riêng, kiểm tra rerun, OTP/session, quote/tier, đủ5/thiếu3, species/time changes, ownership/roles, Host/Origin guards.

```powershell
cd D:\WW\SEP490_G101_FALL2026\backend
npm test -- --runTestsByPath tests/integration/demo-ai.test.js
```

Giới hạn: chưa có UI quản trị đầy đủ để sửa mọi profile; bảng demo là bản manifest khi seed, không tự refresh thay đổi Admin ngoài trang. Matching API vẫn đọc database thật của sandbox. AI ranking chỉ là đề xuất, chưa gửi lời mời hay gán công việc.

Kiểm tra ngày24/10/2026: backend lint đạt, 5 integration tests demo đạt trên replica set cách ly; frontend demo lint và3 DOM tests đạt (login/CSRF/render điểm/error/escape HTML). CLI chạy trùng cổng từ chối trước khi seed để không thay secrets của phiên đang chạy. Live HTTP đã kiểm tra OTP/session, quote và các tình huống matching; công cụ browser automation bị tắt trong Work settings nên không ghi nhận kiểm tra trực quan bằng browser tự động.
