# Đối chiếu Rover và HouseBuddy — P49-A

**Trạng thái:** đã chuẩn bị phần rà soát nguồn; AGY teamwork và Exa chưa chạy. Tài liệu ghi lại các quan sát có nguồn và giữ rõ các yêu cầu còn mở. Đây là đầu vào nghiên cứu, không phải hợp đồng PWC đã duyệt hay bằng chứng PWC đã triển khai luồng này.

**Ngày rà soát:** 14/10/2026, Asia/Ho_Chi_Minh.

## Phạm vi và phương pháp

- Đọc nội dung bài viết Rover Help Center qua Zendesk article API công khai của Rover. HTTP trực tiếp đến năm trang HTML chuẩn trả 403 trong môi trường này; các endpoint API chính thức trả 200 cùng tiêu đề, nội dung và thời điểm cập nhật. Ghi cả trang chuẩn lẫn endpoint đã truy cập ở bảng bên dưới.
- Đọc tĩnh các tệp mã/cấu hình được chọn trong D:\WW\HouseBuddy. Một ghi chú audit cục bộ có sẵn chỉ được dùng để tìm đường dẫn; các nhận định dưới đây đã được đối chiếu lại với những đoạn source được dẫn. Thư mục không có Git metadata nên không ghi được commit nguồn. Chỉ đọc mã ứng dụng/cấu hình và bộ sinh dữ liệu huấn luyện; không đọc tệp môi trường, credential, log, dữ liệu khách hàng, dependency, build output hoặc model nhị phân.
- Kiểm tra checkout Paw World Care để tìm luồng booking và care evidence hiện có. frontend/src và backend/src chỉ có tệp giữ chỗ; chưa có runtime hay luồng PWC để xác minh.
- Không chạy ứng dụng, model, database hoặc service nào. Không chạy build/test HouseBuddy.

### Các bước nghiên cứu chưa đạt

- Không có Exa/9Router search tool hoặc endpoint 9Router được cấu hình trong phiên này. ID các bài Rover lấy từ tài liệu P49 được cung cấp; nội dung sau đó được mở qua API bài viết công khai chính thức của Rover.
- Không chạy AGY /teamwork-preview. AGY CLI 1.3.5 có liệt kê Gemini 3.8 Flash High nhưng không liệt kê model custom chatgpt đang dùng trong phiên. Không dispatch subagent qua model khác; chưa xác minh có subagent AGY nào được giao việc và không gán nhận định nào dưới đây cho AGY.
- PR #3, dependency P00, vẫn mở lúc chuẩn bị báo cáo. Hãy xem kết quả là bàn giao nghiên cứu cho đến khi P00 được tích hợp và Project Leader xác nhận baseline yêu cầu liên quan.

## Quan sát nguồn Rover

| Bài viết chính thức | Nội dung đã xác minh | Cập nhật gần nhất |
| --- | --- | --- |
| [Gửi yêu cầu đặt dịch vụ](https://support.rover.com/hc/en-us/articles/360058671352-How-do-I-send-a-booking-request-to-a-pet-care-provider) · [API bài viết](https://support.rover.com/hc/api/v2/articles/360058671352.json) | Yêu cầu chưa được xem là booking cho đến khi cả chủ nuôi và sitter chấp nhận. Yêu cầu ghi ngày/giờ và thú cưng được chọn; một số dịch vụ hỗ trợ yêu cầu lặp lại. Có thể hủy/lưu trữ yêu cầu đang chờ. | 13/10/2026 |
| [Sửa dịch vụ đã đặt](https://support.rover.com/hc/en-us/articles/115005120443-How-do-I-modify-a-booked-service) · [API bài viết](https://support.rover.com/hc/api/v2/articles/115005120443.json) | Chủ nuôi nhắn sitter; nếu sitter đáp ứng được, sitter cập nhật booking. Chủ nuôi chấp nhận hoặc từ chối thay đổi trong 72 giờ. Nếu từ chối, dịch vụ hiện tại vẫn được đặt. Đổi loại dịch vụ cần hủy rồi đặt lại. | 14/10/2026 |
| [Rover Cards](https://support.rover.com/hc/en-us/articles/211573246-What-are-Rover-Cards-and-how-do-I-send-them) · [API bài viết](https://support.rover.com/hc/api/v2/articles/211573246.json) | Card có thể gồm ít nhất một ảnh, ghi chú tùy chọn, tuyến đường/khoảng cách và cập nhật đi vệ sinh, ăn hoặc uống. Sitter bắt đầu card lúc dịch vụ bắt đầu, ghi cập nhật, dừng, xem lại rồi gửi. Rover nói card cần thiết để xử lý thanh toán sau dịch vụ lặp lại; card không phải yêu cầu phổ quát cho mọi booking. | 14/10/2026 |
| [Bản đồ đi dạo chó](https://support.rover.com/hc/en-us/articles/211587446-How-does-the-dog-walking-map-feature-work) · [API bài viết](https://support.rover.com/hc/api/v2/articles/211587446.json) | Tuyến được tạo từ dữ liệu lưu trên thiết bị trong lúc walk đang chạy và được gửi trong Rover Card sau khi sitter bấm Stop. Rover nói rõ đây không phải live tracking; quyền xem chỉ dành cho người dắt, chủ nuôi và Rover. | 22/09/2026 |
| [Meet & Greet](https://support.rover.com/hc/en-us/articles/202838464-What-are-the-best-practices-for-Meet-Greets) · [API bài viết](https://support.rover.com/hc/api/v2/articles/202838464.json) | Rover khuyến nghị trao đổi về hành vi quan sát được, thú cưng/trẻ em khác trong nhà, hướng dẫn chăm sóc, lịch ăn/vận động, thời gian ở một mình, kỳ vọng dịch vụ và kế hoạch liên lạc. Đây là best practice cho dịch vụ Rover, không phải yêu cầu pháp lý hay sản phẩm phổ quát. | 14/10/2026 |

Các quan sát này mô tả sản phẩm Rover tại thời điểm đọc. Chúng không quyết định điều kiện thanh toán, phí hủy, deadline, thu thập vị trí hay yêu cầu meet-and-greet cho PWC.

## Quan sát mã HouseBuddy

| Mẫu đã thấy | Bằng chứng trong mã | Ý nghĩa với PWC |
| --- | --- | --- |
| Tạo booking gọi dispatch ngay | BE/src/controllers/booking.controller.js đặt trạng thái booking mới thành PENDING trừ khi holdDispatchUntilPaid là true, sau đó gọi startDispatchLoop bất đồng bộ (750–855). BE/src/services/dispatch.service.js tìm ứng viên và gửi offer khi booking còn PENDING (88–180). | Không dùng lại thứ tự này cho sitter do Customer chỉ định. Quy tắc PWC được cung cấp là xem availability → đề xuất giờ → chờ Customer xác nhận → gửi offer cho sitter đã chọn. Customer xác nhận không có nghĩa sitter đã nhận hoặc visit đã được phân công. |
| Tách điều kiện đủ tư cách và xếp hạng | dispatch.service.js lọc tự đặt, lịch làm, job đang hoạt động, trùng giờ và buffer 30 phút trước khi chấm điểm (317–389). Các truy vấn lọc chạy trong vòng lặp từng helper. | Giữ điều kiện cứng trước xếp hạng. Khi làm PWC, gom/giới hạn truy vấn; điểm số không được vượt qua eligibility hoặc tự chốt lịch. |
| Có fallback xác định được | scoreWorkersWithAI dùng điểm cục bộ trong thời gian cooldown và sau lỗi gọi AI (391–460). | Tính năng ranking sau này cần fallback rõ ràng, kiểm thử được; việc tìm sitter không nên phụ thuộc provider scoring còn hoạt động. |
| Nhãn huấn luyện là dữ liệu tổng hợp | BE/ai/ai_service/ai_domestic_helper/train.py sinh feature và nhãn từ heuristic_score cộng nhiễu, sau đó thêm các mẫu neo được chọn thủ công (61–105). | Các metric của model không chứng minh chất lượng trên kết quả chăm sóc thật. Không lấy trọng số/điểm này làm chuẩn PWC. |
| Chính sách hủy khác PWC | booking.controller.js cho phép Customer hủy trong 10 phút sau khi tạo, khi chưa có helper, hoặc trước dịch vụ ít nhất 6 giờ (2043–2072). Sitter chỉ tự hủy khi còn ít nhất 2 giờ; gần giờ hơn thì gửi Staff xử lý (2534–2715). | Cutoff PWC được cung cấp là ít nhất 1 giờ cho cả Customer và Sitter; dưới cutoff Staff xử lý ngoại lệ. Không sao chép mốc 6 giờ/2 giờ của HouseBuddy. |
| Cấu hình một web app cài đặt được | FE/vite.config.ts dùng VitePWA với manifest standalone và auto-update (3–35); FE/src/main.tsx đăng ký service worker ngay (7–10). | Đây chỉ là mẫu cấu hình tĩnh. Nó không chứng minh build, cài đặt, offline hoặc cache an toàn. PWC cần quyết định ranh giới offline riêng và tránh để dữ liệu thú cưng/ghi chú vào nhà lộ qua cache công khai. |

Đây là kiểm tra mã chỉ đọc. Không chạy ứng dụng, AI service, model, database hoặc PWA HouseBuddy.

## Đối chiếu với PWC

| Chủ đề | Quy tắc PWC được cung cấp cho công việc này | Kết quả và hướng xử lý |
| --- | --- | --- |
| Sitter do Customer chỉ định | Với sitter được Customer chọn, kiểm tra availability, đề xuất giờ, chờ Customer xác nhận rồi mới gửi offer. Luồng auto-ranking thông thường không cần xác nhận từng ứng viên. | Rover có mô hình hai bên chấp nhận ở cấp booking request. HouseBuddy gửi offer sau khi tạo booking. Giữ luồng directed riêng của PWC và tách trạng thái xác nhận đề xuất, phản hồi offer, thanh toán và assignment. |
| Đổi lịch | Đổi lịch là thao tác khác với hủy; cutoff hủy 1 giờ không tự đặt mọi hạn reschedule. | Mẫu Rover hữu ích ở chỗ hiển thị thay đổi đề xuất và yêu cầu phản hồi; booking hiện tại vẫn giữ nếu thay đổi bị từ chối. PWC cần tự quyết định expiry, actor, giữ slot và trạng thái sau từ chối. Không sao chép 72 giờ của Rover. |
| Bằng chứng visit | PWC yêu cầu ảnh check-in/check-out; checklist phải hoàn thành hoặc bỏ qua kèm lý do. Không tự tạo checkout giả. | Rover Cards là gợi ý giao tiếp, không phải hợp đồng thanh toán hay bằng chứng hiện diện cho PWC. Giới hạn evidence theo booking/visit/pet liên quan; phân biệt đang chờ với đã được server xác nhận; chốt quyền riêng tư, retention, retry và lịch sử sửa trước khi triển khai. |
| Vị trí | Nghiên cứu này không xác nhận yêu cầu live-location của PWC. | Rover nói rõ bản đồ tuyến đã ghi không phải live tracking. Không gọi tuyến, timestamp hay ảnh là GPS trực tiếp. Tính năng vị trí sau này cần quyết định mục đích, consent, quyền truy cập, thời hạn lưu và trạng thái lỗi. |
| Thông tin pet | PWC chưa yêu cầu Meet & Greet của Rover thành điều kiện bắt buộc để đặt dịch vụ. | Bài viết gợi ý chủ đề cho intake tùy chọn: hành vi, bối cảnh hộ gia đình, thói quen, thời gian ở một mình, hướng dẫn chăm sóc và cách liên lạc. Phân biệt “chưa cung cấp/chưa biết” với “không có vấn đề”; tránh kết luận y tế. |
| Thanh toán và hủy | Booking nhiều visit phải trả trước; booking một visit có thể trả sau. Customer và Sitter gửi yêu cầu hủy ít nhất 1 giờ trước visit. Hủy booking nhiều visit đã trả trước mà không reschedule giữ lại 30% phần bị hủy; booking một visit hủy miễn phí nếu đáp ứng cutoff đã chốt. | Rover Cards và chính sách HouseBuddy không phải quy tắc PWC. Cách phân bổ/làm tròn phí, lỗi provider, thời điểm hoàn tiền và phương án khi không có sitter vẫn cần hợp đồng PWC; không suy ra từ đối thủ. |
| Xếp hạng | Quy tắc PWC yêu cầu kiểm tra đủ điều kiện trước offer; baseline được cung cấp phân biệt Customer-directed với auto-ranking thông thường. | HouseBuddy cho thấy fallback nhưng nhãn tổng hợp và truy vấn từng helper không phải thiết kế đã xác thực cho PWC. Trước khi code cần chốt eligibility, đầu vào xếp hạng có thể giải thích, giới hạn truy vấn và hành vi khi ranking lỗi; assignment vẫn phải theo offer/accept của PWC. |

## Quyết định còn mở và bàn giao

1. Với sitter do Customer chỉ định, quyết định kết quả khi Customer từ chối hoặc không xác nhận giờ, và có chuyển sang auto-ranking hay không.
2. Định nghĩa expiry của đổi lịch, ai được đề xuất, có giữ slot hay không, và trạng thái sau từ chối/hết hạn. Không lấy 72 giờ của Rover làm mặc định.
3. Chốt trường dữ liệu care evidence, quyền xem từng tệp, quyền truy cập media riêng tư, thời hạn lưu/xóa, retry/idempotency và cách Staff xử lý ảnh/checkout bắt buộc bị thiếu.
4. Quyết định PWC có thu thập vị trí hay không. Bài viết Rover chứng minh map walk của Rover không phải live tracking; không phải căn cứ để PWC thu vị trí.
5. P51/P01 cần chốt hợp đồng thanh toán, hủy, hoàn tiền và API trước khi triển khai. Các đầu vào PWC hiện tại còn mở cách phân bổ/làm tròn và một số tình huống provider/no-sitter.
6. Scaffold PWC chưa có code booking/care evidence nên chưa thể xác minh luồng sản phẩm, ranh giới quyền API, trạng thái lỗi/rỗng, retry hoặc race. Những kiểm tra đó thuộc giai đoạn implementation sau khi hợp đồng và runtime sẵn sàng.

### Trạng thái bàn giao

- **Nguồn đã mở:** 5 endpoint bài viết Rover chính thức; ghi tiêu đề và ngày cập nhật phía trên.
- **HouseBuddy:** đã đọc tĩnh một số tệp source/config; không chạy runtime hoặc test.
- **AGY:** chưa chạy; chưa xác minh subagent dispatch.
- **Exa:** chưa chạy; search service không khả dụng.
- **Dependency P00:** PR #3 còn mở tại thời điểm bàn giao.
- **Bước tiếp theo:** sau khi P00 được tích hợp, Project Leader xác nhận baseline PWC và hoàn tất các gate AGY/Exa trước khi đánh dấu P49-A đã xác minh hoặc dùng đề xuất này làm hợp đồng triển khai.
