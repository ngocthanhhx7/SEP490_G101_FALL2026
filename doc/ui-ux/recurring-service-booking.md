# Đặt dịch vụ cố định theo tuần hoặc tháng

## Phạm vi

Phiên bản đầu áp dụng cho đặt dịch vụ tại nhà có nhiều buổi. Khách đặt một đợt hữu hạn, xem ngày và giá trước khi xác nhận. Gia hạn, thu tiền tự động và cam kết cùng một sitter cho cả chuỗi là những quyết định nghiệp vụ riêng. Grooming có tồn chỗ theo từng slot của cửa hàng, cần nghiệm thu giữ chỗ trước khi mở lịch lặp cho dịch vụ đó.

## Luồng khách hàng

1. Trong bước chọn lịch, cho chọn Một lần, Hằng tuần hoặc Hằng tháng. Với tuần, chọn một hay nhiều thứ và giờ cố định. Với tháng, chọn ngày trong tháng và giờ. Dùng giờ Việt Nam xuyên suốt.
2. Chọn ngày bắt đầu và kết thúc bằng số buổi hoặc ngày cuối. Hiển thị ngay những buổi phát sinh trên lưới, kèm danh sách ngày giờ để dùng trên điện thoại. Áp dụng giới hạn 60 buổi của luồng đặt hiện tại. Yêu cầu rút ngắn đợt nếu vượt giới hạn.
3. Với ngày 29–31 không tồn tại trong tháng, đề xuất bỏ qua tháng đó và hiển thị tháng bị bỏ qua trước khi khách xác nhận. Nếu chọn số buổi, đếm những ngày thực sự tồn tại. Cho phép bỏ hoặc đổi một buổi trong bản xem trước. Không cho xác nhận hai buổi trùng nhau.
4. Chuyển danh sách buổi cuối cùng cho luồng báo giá hiện có. Chỉ ra buổi nào vi phạm mốc đặt trước 2 giờ, thiếu điều kiện hoặc bị xung đột và cho sửa riêng buổi đó. Hiển thị tổng tiền từ báo giá backend và số buổi được báo giá. Khách xác nhận lại sau khi lịch hoặc giá thay đổi.

## Các bước triển khai và nghiệm thu

| Bước | Thay đổi | Tiêu chí đạt |
| --- | --- | --- |
| 1. Sinh ngày và xem trước | Hàm thuần cho tuần/tháng và bộ chọn lặp trên lịch booking | Các ngày giống nhau trên desktop và điện thoại. Kiểm thử qua năm mới, tháng 2 năm nhuận, ngày 31, giới hạn 60 và mốc 2 giờ. |
| 2. Báo giá và tạo đơn | Gửi các buổi cụ thể qua hợp đồng booking nhiều buổi. Kiểm tra quyền sở hữu thú cưng, thời lượng, điều kiện và phiên bản báo giá ở máy chủ. | Báo giá và đơn đã tạo khớp từng buổi. Gửi lại sau lỗi mạng bằng cùng khóa idempotency chỉ tạo một đơn. Kiểm thử hai khách cùng chọn giờ và trạng thái khi một buổi hết chỗ. |
| 3. Điều phối và sau đặt | Kiểm tra khu vực, hợp đồng, kỹ năng và ca trống của sitter theo từng buổi khi mời và khi nhận. Trước mắt dùng thao tác đổi/hủy từng buổi hiện hành. | Khách thấy đủ các buổi trong đơn. Sitter chỉ nhận ca đủ điều kiện. Hủy một buổi giữ đúng trạng thái và tiền của các buổi còn lại theo chính sách hiện hành. |
| 4. Nghiệm thu và phát hành | Kiểm thử tài khoản khách, sitter và staff trên cùng một đơn rồi review PR, CI và triển khai theo quy trình. | Đối chiếu được từ ngày hiển thị, danh sách gửi đi, báo giá, đơn đến ca điều phối. Chạy trường hợp retry và lỗi một phần trước khi mở trên production. |

## Dữ liệu và xử lý lỗi

Phiên bản này dùng đơn và các buổi hiện có trong bookings và visits. Quy tắc lặp chỉ sinh danh sách ngày trước khi đặt. Các màn khách và staff tiếp tục truy xuất theo đơn hoặc buổi hiện có. Trước triển khai, đối chiếu giới hạn payload và kiểm tra truy vấn với đơn 60 buổi, đo thời gian và số bản ghi đã quét trước khi đề xuất index. Chỉ xem lại nhu cầu lưu quy tắc lặp riêng khi có yêu cầu gia hạn hoặc sửa toàn bộ các buổi tương lai.

Trên màn đặt dịch vụ tại nhà, chọn **Tạo lịch lặp theo tuần hoặc tháng** để mở bản nháp. **Dùng lịch này** thay các buổi đang chọn bằng danh sách xem trước. Khách có thể chọn từng buổi để đổi giờ hoặc bỏ buổi trước khi lấy báo giá. Với tháng thiếu ngày, bản xem trước liệt kê các tháng bị bỏ qua. Đơn chỉ được tạo sau khi khách xác nhận báo giá và điều kiện dịch vụ. Nếu máy chủ từ chối do xung đột lịch, khách có thể quay lại chỉnh rồi báo giá lại.
