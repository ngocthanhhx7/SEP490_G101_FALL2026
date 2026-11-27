# Nghiệm thu giao diện chi tiết dịch vụ · 26/11/2026

## Phạm vi và môi trường

Đối chiếu tài liệu đánh giá và ảnh đính kèm với mã nguồn, phản hồi công khai và giao diện thực tế. Baseline là EC2 `977b6eca`, nhánh `main`, slot blue, cổng 3000. HTTPS `/ready`, `/health` và readiness nội bộ đều trả 200. Nhánh tích hợp và checkout chính cùng ở `bfc34303`. Các lần CI đã kiểm trên hai SHA đều thành công. PR mở duy nhất tại lần kiểm là #379, bản nháp test-only. Bản ứng viên ở `feature/service-detail-ux` lấy từ `origin/develop`.

Chromium mở 14 trang đang công bố trên VPS ở 390 và 1440 px trước khi chỉnh. Ứng viên chạy từ build local và cùng các phản hồi công khai đã lưu cho từng dịch vụ. Kiểm thử tình huống khác dùng dữ liệu tổng hợp, không phát sinh đơn/thanh toán production. Quy tắc bỏ breadcrumb trên mọi viewport áp dụng theo yêu cầu cập nhật của chủ dự án.

## Findings đã xác nhận

| Phát hiện | Nguyên nhân | Thay đổi và bằng chứng |
| --- | --- | --- |
| Nút trong bảng giá đi thẳng đến đăng nhập khi luồng tại cửa hàng đang tắt. | Bảng giá tạo URL riêng, bỏ qua `bookingActions`. | Hero và cuối trang tái sử dụng cùng hành động đã lọc. Bốn dịch vụ chỉ tại cửa hàng chuyển sang liên hệ. Kiểm thêm cấu hình bật với hai đường đặt Cắt móng độc lập. |
| Người đọc phải mở tab mới thấy phần chuẩn bị. | Phạm vi và chuẩn bị dùng nút đổi nội dung có trạng thái. | Phạm vi, chuẩn bị và giới hạn hiển thị liền mạch. Nhóm an toàn ưu tiên điều khoản công bố với dịch vụ có giới hạn chuyên môn. |
| Tên mục, thông tin giá và chính sách cạnh tranh với CTA. | Chữ viết tay dùng cho tiêu đề chức năng, giá lặp trong thẻ và văn bản chính sách, không có nhãn giá cơ bản. | Dùng Nunito, phân cấp giá cơ bản/giá cuối cùng, tách phần giá khỏi báo cáo quy trình. Lối tắt khu vực nằm cùng cụm đặt lịch khi phù hợp. |
| Nội dung chung có thể bị đọc như tỷ lệ combo áp dụng hiện tại. | Giá cơ bản và quote có nguồn riêng, trong khi chính sách khởi tạo và FAQ cũ chứa số và công thức nhúng sẵn. | Nhận diện đúng mẫu khởi tạo cũ, giữ điều khoản an toàn, phiên bản, hiệu lực và các đoạn viết riêng. Các số phụ phí và ưu đãi cụ thể đến từ báo giá. FAQ đi dạo và đưa đến lịch thú y vẫn dùng nguyên nội dung đã công bố. |
| Workflow và quy trình đặt lịch khó phân biệt. | Hai bố cục theo trình tự nhưng thiếu phân cấp và giải thích theo hành động thực tế. | Checklist chăm sóc dùng các bước công khai của workflow đã phát hành, giữ thứ tự theo giai đoạn, điều kiện áp dụng và link nguồn. Stepper đặt lịch giải thích luồng tại nhà/cơ sở hoặc tại cửa hàng. |
| Khu vực và chiều dài tài liệu khiến người dùng phải cuộn nhiều. | Khu vực để cuối trang, nhiều thẻ lồng nhau và khoảng cách lớn. | Ở 390 px, chiều cao 14 trang giảm từ 5.123–5.602 px xuống 2.692–4.118 px. Điều hướng mobile và CTA cuối trang hoạt động với vùng an toàn mô phỏng 34 px. |
| Hình lỗi thiếu trạng thái thay thế. | Trang cũ render trực tiếp hình cố định chiều cao. | Khung 4:3 nhất quán và placeholder cho mã dịch vụ chưa có ảnh hoặc khi ảnh tải lỗi. Cả 14 ảnh hiện hành giải mã được trong Chromium. |

Nhận định từ ảnh đính kèm về tỷ lệ chuyển đổi và phản ứng người dùng vẫn là giả thuyết. Ảnh chăm sóc sau phẫu thuật còn có nền tối và bố cục chật. Đây là ảnh minh họa hiện có đã được ghi nguồn.

## Nguồn dữ liệu

- `GET /api/v1/services?workflowFor=<id>` cung cấp danh mục đang công bố, giá cơ bản theo đơn vị và điều khoản hiệu lực. Catalog ghép phiên bản dịch vụ và chính sách hiện hành với giá có hiệu lực từ price provider. Chỉ service được chọn mới có bước workflow công khai từ bản đã phát hành.
- `POST /api/v1/pricing/basket-quotes` và báo giá grooming xử lý điều kiện, phụ phí và ưu đãi trong luồng phù hợp. Catalog hiện trả một giá cơ bản mỗi dịch vụ. Đã kiểm nhiều đơn vị giá giữa các dịch vụ và báo giá gồm nhiều thành phần. Giá hoặc tier công khai theo biến thể chưa có trong hợp đồng này.
- Khu vực công khai hỗ trợ tra cứu. Kiểm tra địa chỉ, lịch, chính sách và giá của một đơn diễn ra trong booking hiện có.
- Thay đổi chỉ nằm ở lớp trình bày. Backend, hợp đồng API và MongoDB tiếp tục dùng các nguồn đang có. Hai hướng dẫn MongoDB được đối chiếu khi đọc các nguồn và đường truy vấn hiện hữu. Không cần thêm collection vì trang tiêu thụ các trường đã xuất bản.

## Kết quả theo dịch vụ

Mỗi dòng qua đủ 9 chiều rộng, hiển thị tiêu đề, đúng ảnh, checklist và nhánh CTA theo trạng thái nguồn.

| Dịch vụ | Đơn vị giá cơ bản | Bước chăm sóc | FAQ | Hành động hiện hành |
| --- | --- | ---: | ---: | --- |
| Cắt móng | lần | 5 | 0 | Đặt tại nhà, cửa hàng đóng đặt trực tuyến |
| Cắt tỉa lông | lần | 6 | 0 | Liên hệ |
| Chải lông, gỡ rối | lần | 5 | 0 | Liên hệ |
| Chăm sóc sau phẫu thuật | lần | 6 | 0 | Đặt dịch vụ, giới hạn an toàn và khu vực |
| Chăm sóc tại gia | lần | 6 | 0 | Đặt dịch vụ và khu vực |
| Dắt chó đi dạo | 30 phút | 6 | 2 | Đặt dịch vụ và khu vực |
| Đưa đón thú cưng | km | 6 | 0 | Đặt dịch vụ và khu vực |
| Đưa thú cưng đến lịch hẹn thú y | lượt | 8 | 2 | Đặt dịch vụ, giới hạn an toàn và khu vực |
| Huấn luyện hành vi cơ bản | tiếng | 5 | 0 | Đặt dịch vụ và khu vực |
| Kiểm tra sức khỏe cơ bản | lần | 5 | 0 | Đặt tại cơ sở, giới hạn an toàn |
| Massage thư giãn | lần | 5 | 0 | Đặt dịch vụ, lưu ý và khu vực |
| Nhà nghỉ thú cưng | ngày | 8 | 0 | Đặt tại cơ sở |
| Tắm và vệ sinh thú cưng | lần | 5 | 0 | Liên hệ |
| Vệ sinh tai/mắt | lần | 5 | 0 | Liên hệ và lưu ý |

## Responsive, chức năng và bằng chứng

- 320, 360, 390, 414, 768 px dùng hero một cột, stepper dọc và thanh điều hướng ứng dụng. 1024, 1280, 1440, 1920 px dùng hero hai cột và footer website. 126/126 lượt render có ảnh giải mã được, không tràn ngang, không có lỗi JavaScript được ghi nhận và không có breadcrumb. Kiểm tra chiều rộng của tiêu đề, link và summary cùng các giới hạn ngang của viewport.
- 10/10 kịch bản Chromium qua. Gồm Quay lại, tab và focus bàn phím, Enter/Space mở đóng checklist, FAQ, anchor chi tiết giá và link sâu tới chính sách, tra cứu khu vực, sang đăng nhập, safe area mô phỏng, tải/lỗi/thử lại, danh mục tắt, dịch vụ không tồn tại, 24 bước, dữ liệu thiếu, ảnh lỗi, ảnh chưa có, tên và mô tả dài. Khách đã đăng nhập bằng phản hồi phiên thử nghiệm đi từ CTA cuối trang đến màn rà soát báo giá hai buổi có phụ phí, combo và ưu đãi hạng. Đã kiểm đường dẫn grooming với cờ bật trong dữ liệu thử.
- Bằng chứng ảnh toàn trang từng cặp ở 390 × 844 và 1440 × 960. Các nhóm minh họa là chăm sóc tại gia, sau phẫu thuật, massage, cắt tỉa tại cửa hàng và đưa thú cưng đến lịch thú y. Tệp cục bộ nằm trong `.codex/service-detail-20261126/` ở checkout chính, theo mẫu `before-<mã dịch vụ>-<rộng>.png` và `final-<mã dịch vụ>-<rộng>.png`. Kết quả từng lượt lưu trong `before.json`, `final.json` và `interactions.json`. Ảnh `safe-area-final-390.png` và `customer-quote-review-1440.png` minh họa tương tác.
- Frontend Jest đạt 223 bộ / 1.957 test. Lượt chạy tập trung trên phiên bản cuối đạt 25 test cho trang chi tiết, link grooming và khung mobile. Backend đạt 40 test cho giá, grooming và catalog. Lint frontend, kiểm kiến trúc, build và rà whitespace đạt. Kiểm thêm Home hiện 3 thẻ ảnh và danh mục phân trang 12 + 2 thẻ ảnh, tất cả giải mã được.
- Chưa xác minh trên Safari/iOS cài thật, thanh điều hướng thiết bị thật, xác nhận đơn hay thanh toán production. Cờ đặt tại cửa hàng đang tắt trên VPS. Các dịch vụ không có FAQ riêng chỉ hiện giải thích giá trong mục giá. Ảnh có nguồn của dự án được giữ lại. Build cảnh báo một số gói JavaScript vượt 500 kB sau khi rút gọn.

## Tệp thay đổi

- [ServiceDetailsPage.jsx](../../frontend/src/pages/public/ServiceDetailsPage.jsx) tổ chức nội dung, dùng cùng hai cụm CTA, xử lý dữ liệu thiếu và anchor.
- [ServiceCareWorkflow.jsx](../../frontend/src/pages/public/ServiceCareWorkflow.jsx) giai đoạn, checklist và trình bày chương trình chăm sóc.
- [service-detail.css](../../frontend/src/pages/public/service-detail.css) stylesheet riêng. [service-catalog.css](../../frontend/src/pages/public/service-catalog.css) còn quy tắc danh mục và điều hướng chung.
- [service-visuals.js](../../frontend/src/pages/public/service-visuals.js) cho phép trang chi tiết dùng placeholder có chủ đích.
- [PublicServicePages.test.jsx](../../frontend/tests/integration/PublicServicePages.test.jsx) và [ShopGroomingEntryPoints.test.jsx](../../frontend/tests/integration/ShopGroomingEntryPoints.test.jsx) kiểm tra giá, điều khoản, điều hướng và cờ đặt lịch. [README public pages](../../frontend/src/pages/public/README.md) ghi trách nhiệm của template.
- Skill dự án cài local ghi quy tắc bỏ breadcrumb riêng cho `/services/:serviceId`.

## Điểm UX/UI

Chấm theo cùng các tiêu chí trên trang đã render. Đây là điểm rà soát chuyên gia, chưa có khảo sát hay số liệu chuyển đổi.

| Tiêu chí | Trọng số | Trước | Sau | Bằng chứng |
| --- | ---: | ---: | ---: | --- |
| Phân cấp và khả năng đọc | 25% | 6,5 | 9,2 | Nunito, phạm vi và chuẩn bị mở sẵn, mobile giảm chiều dài cuộn |
| Quyết định đặt lịch và giá | 25% | 6,0 | 9,3 | CTA thống nhất, phân biệt giá và tra khu vực gần CTA |
| Nội dung, workflow và an toàn | 20% | 6,5 | 9,1 | Checklist theo dịch vụ, điều khoản được ưu tiên, phần chính sách gọn |
| Responsive và tương tác | 20% | 7,0 | 9,1 | Ma trận và kịch bản Chromium, safe area mô phỏng |
| Hình ảnh và nhận diện | 10% | 6,0 | 7,8 | Tỷ lệ ổn định, fallback rõ ràng, chất lượng ảnh nguồn còn giới hạn |
| **Tổng làm tròn** | **100%** | **6,4** | **9,0** | **Điểm cho giao diện Chromium và phạm vi kiểm chứng đã nêu** |
