# Đối chiếu ghi chú test và kế hoạch sửa

Nguồn tham khảo: [sheet test của nhóm](https://docs.google.com/spreadsheets/d/18lrWYpCg1pLldK1X_f50yUJ_jVLzrGjHWs6kxvcm8EE/edit?gid=0).
Ngày đối chiếu: 06/11/2026, Asia/Saigon. Baseline remote main `57842d3`, develop
`3aa79e1`; production xác nhận main `57842d3`, `/ready` 200 trước khi sửa.
Sheet là báo cáo/tham chiếu, không tự thay thế các quyết định nghiệp vụ đã duyệt.
Không sửa status trong sheet hoặc coi ô `Done` là bằng chứng mới của phiên này.

Phân công theo yêu cầu: Hải thực hiện, Đạt review độc lập, Thành merge sau CI và
approval. Mỗi đợt đi qua feature từ develop, PR review, release PR vào main,
backup/restore, rollout có rollback và kiểm tra sau triển khai.

## Kết luận từng ghi chú

| UC | Kết luận ở mã/bản đang chạy | Công việc và tiêu chí hoàn tất |
| --- | --- | --- |
| 01 đăng ký | Mã hiện tại đã phân biệt 409 liên hệ trùng sau OTP đúng; sai OTP vẫn phải là sai OTP. Cần thông báo rõ hơn | Đợt 1: test đúng/sai mã trên liên hệ có sẵn; không tạo account/session thứ hai; giữ kín tồn tại tài khoản trước xác minh |
| 02 đăng nhập | Thiếu bằng chứng test khóa tài khoản của nhóm; mã cũ từ chối khóa nhưng phản hồi chung | Đợt 1: test khóa 4 role hiện hỗ trợ; 403 riêng sau OTP đúng, không session, challenge không replay. Sale Staff chưa là role trong schema, không tuyên bố đã test role này |
| 04 mất kênh duy nhất | Là tình huống mất quyền truy cập email/điện thoại duy nhất để nhận OTP, không phải xóa kênh trên UI | Đợt 1 bổ sung hướng dẫn liên hệ hỗ trợ; không mở endpoint khôi phục bỏ qua kiểm tra danh tính |
| 09 khu vực/chính sách | Production `/service-areas` 404; policy catalog chỉ có terms/privacy | Đợt 1 bổ sung public API từ vùng vận hành hiện có. Đợt 2 đối chiếu nội dung hủy/hoàn/trách nhiệm, chỉ xuất bản bản đã duyệt; không tự đặt mức phí/bồi thường |
| 10 nhiều role | UI/backend có flow Admin đổi membership; sheet nói không đổi role, xung đột với chức năng đã triển khai trước | Đợt 2 đối chiếu quyết định hiện hành, lập ma trận từng role và quyền thực tế. Không xóa membership hay hạ quyền dữ liệu thật từ nhận xét này |
| 11 tên/hạng | PATCH tên trả 200 và lưu ngay; thông báo gây hiểu nhầm. Chưa có tier Member/Silver/Gold trong profile DTO | Đợt 1 sửa thông báo và refresh session. Đợt 2 cần nguồn hạng/mức giảm đã chốt; không gán hạng/discount giả |
| 12 địa chỉ | Bản đồ cho phép xoay/nghiêng; runtime archive chưa chặn visit đang dùng. Ngoài vùng hiện bị validator từ chối | Đợt 1 khóa map 2D, chặn archive đang dùng. Đợt 2 thêm trạng thái ngoài vùng, lưu nhưng không checkout; test snapshot địa chỉ và race update/booking |
| 13 danh sách pet | Màn runtime dùng nhãn Ẩn; archive chưa chặn buổi chưa xong | Đợt 1 dùng nhãn Xóa, backend archive giữ lịch sử và chặn active visit. Test rollback/version/idempotency |
| 14 thêm pet | Ảnh đã có trong bản hiện tại; KNOWN/value đã là validator. Không đủ bằng chứng runtime invitation/vaccine cho ghi chú này | Đợt 2 kiểm thử ảnh và từng tình trạng qua UI/API, giữ trạng thái UNKNOWN riêng với free text. Không bỏ validation chỉ vì đề nghị dùng text |
| 15 sửa pet | Avatar hiện có; snapshot chăm sóc được lưu lúc checkout | Đợt 2 kiểm tra thay ảnh, owner guard và sửa hồ sơ không thay snapshot buổi đã nhận; consent cập nhật dùng flow hiện hành |
| 16 hồ sơ sitter | Mặt trước/sau CCCD và chân dung đã có; đủ 18 tuổi đã có lỗi riêng. Upload đang báo bằng tên file | Đợt 1 lỗi chỉ rõ loại giấy tờ ở client/preview/server rejection; giữ giới hạn JPG/PNG 5 MB, 4 MP. Không coi upload fixture là CCCD thật hợp lệ |
| 25 booking | Trùng pet trong cùng booking đã chặn; giữa hai booking chưa kiểm tra | Đợt 1 kiểm tra toàn bộ lịch đã lưu trong transaction và race khác quote/dịch vụ. Đợt 2 đối chiếu nhãn bước xác nhận và giải thích từng dòng phụ phí theo backend; không sửa giá đã lưu |
| 48 xử lý sự cố | Có module/pages xuất riêng, chưa thấy được nối trong route tree hiện hành | Đợt 2 tích hợp list/detail/resolve có session, quyền Staff/Admin, Case repository, private evidence và audit; test chuyển trạng thái/notification/ẩn ghi chú nội bộ |
| 49, 51 thanh toán/hoàn | Sheet bị chặn bởi đăng ký sitter, không chứng minh lỗi payment/refund | Đợt 3 tạo fixture xuyên suốt cách ly với hợp đồng/assignment hợp lệ; test callback chữ ký, idempotency, late payment và refund. Không dùng fixture làm bằng chứng thanh toán thật |
| 52, 53 khiếu nại | Cùng blocker sitter; có mã module nhưng chưa đủ acceptance luồng | Đợt 2 nối route cần thiết và test owner/Staff/Admin, deadline, hold và audited decision. Đợt 3 chạy xuyên suốt sau care completion |
| 54 dashboard Admin | Dashboard hiện chủ yếu đọc tổng hợp booking; thiếu acceptance sự cố/khiếu nại | Đợt 2 thêm projection đúng nguồn và link tới danh sách, quyền đọc/empty/error, không hardcode số đếm |
| 56 chi tiết sản phẩm | Public UI vẫn hiển thị mã nội bộ | Đợt 1 bỏ mã trên chi tiết công khai; giữ code ở Admin, đơn hàng và audit |
| 57 sản phẩm | Upload đã được triển khai; new product hidden là trạng thái an toàn hiện hành. Modal còn mở sau lưu | Đợt 1 đóng modal sau server xác nhận; lỗi giữ form. Đợt 2 retest upload/lưu/publish qua edit, không tự công khai sản phẩm mới hoặc bỏ guard |
| 58 spa trùng booking | Dùng chung engine checkout chưa tự nó là lỗi; thiếu flow nhận/trả pet ở shop | Đợt 3 thiết kế cùng booking aggregate, tách trải nghiệm spa và lifecycle nhận/groom/trả/thu tiền; không tạo booking song song trùng dữ liệu |
| 59, 60 nhận/trả pet | Chưa test vì không có sitter; không thể ghi Done | Đợt 3 fixture hợp đồng/kỹ năng/ca và appointment, check-in evidence, consent phụ phí, phân công, trạng thái làm, trả thú/thu tiền |
| 61 chọn dòng giỏ | Giỏ hiện checkout toàn bộ dòng | Đợt 2 thêm chọn từng dòng/chọn tất cả, tổng tiền chỉ dòng chọn; backend nhận danh sách chọn, snapshot giá/hold/stock trong transaction, giữ dòng chưa mua; test tab/race/thiếu hàng/idempotency |
| 95 điều chỉnh tồn | Sheet ghi Code not done; cần xác minh cả API và UI | Đợt 3 ledger điều chỉnh Admin-only, reason bắt buộc, version/stock nonnegative, audit; không sửa đè lịch sử phiếu nhập |

## Thứ tự thực hiện và gate

1. **Đợt 1 — lỗi đã xác nhận, đang thực hiện trong PR này.** Chuẩn hóa auth error
   envelope, parser 415, Retry-After, frontend HTTP/domain feedback; public vùng;
   pet-time overlap; archive dependency; tên hồ sơ, ảnh giấy tờ, 2D và modal.
   Chạy Mongo replica set cách ly, lint/architecture, toàn bộ tests, build, review
   diff cuối, browser desktop/mobile. Release chỉ sau CI/Đạt approve/Thành merge.
2. **Đợt 2 — integration và dữ liệu sản phẩm.** Tách PR cho incident/complaint/dashboard,
   giỏ chọn dòng, địa chỉ ngoài vùng, policy publication, account/tier verification.
   Dùng session/CSRF thật trong database cách ly; có test unauthorized/forbidden,
   foreign owner, stale version, invalid input, conflict, provider failure và mất
   acknowledgement. Chỉ chốt nguồn nội dung/mức giảm còn thiếu, không hỏi lại
   prepay 15 phút hay FT 40 giờ/PT 20 giờ đã được phê duyệt.
3. **Đợt 3 — nghiệm thu xuyên suốt và phần spa/tồn.** Chuẩn bị synthetic employee
   đủ hợp đồng/kỹ năng/ca; chạy booking → assignment → care → complaint/refund,
   spa → nhận/trả và stock ledger. Tách kết quả tự động khỏi acceptance provider
   thật; không tạo lịch, thanh toán, chữ ký hoặc giấy tờ thật chỉ để đổi màu sheet.

Chính sách trong sheet còn nêu pay-after-care, hạn thanh toán 48 giờ và ca cố định;
các mục đó không tự ghi đè quyết định mới hơn về prepay, 15 phút và tự đăng ký ca.
Hủy/hoàn/trách nhiệm, tier và Sale Staff cần nguồn/đặc tả rõ trước khi công khai
hoặc thay mô hình quyền/tiền. Không coi toàn bộ backlog là đã sửa trong đợt 1.

## Bằng chứng kiểm tra

Regression được lưu cùng mã: `http.test.js`, `auth.routes.test.js`,
`otp-auth.test.js`, `customer-registration.test.js`, `booking-checkout.test.js`,
`customer-care-runtime.test.js`; frontend transport/status/SignIn/Registration/
profile/map/product management tests. Các fixture dùng database Mongo tạm,
provider stub và thông tin tổng hợp. Kết quả lệnh, CI, reviewer và triển khai cụ
thể phải được ghi ở PR; tài liệu này không tự khẳng định gate chưa chạy đã pass.

Xem [ma trận lỗi API](../api/http-errors.md) để thống nhất 400/401/403/404/409/
413/415/422/429/500/502/503/504/505. Không phải tất cả các status đều do Express
phát; client phải vẫn phân biệt được lỗi HTML từ proxy.
