# Hợp đồng lao động và lập phiếu lương — kiểm tra ngày 05/11/2026

## Điền sẵn hồ sơ vào hợp đồng

Hồ sơ nộp mới giữ ngày sinh/số giấy tờ dưới dạng mã hóa AES-GCM theo cơ chế khóa có sẵn. API hợp đồng riêng cho Admin điền sẵn tên, ngày sinh, số giấy tờ và liên hệ từ hồ sơ ứng viên; tên người đại diện cùng liên hệ đã xác minh lấy từ đúng tài khoản Admin đang đăng nhập. Liên hệ của ứng viên không bị thay bằng liên hệ Admin. Tên pháp nhân, mã đăng ký, địa chỉ pháp lý, chức danh và thẩm quyền ký không được suy đoán từ tài khoản cá nhân.

Bản nháp đã lưu có ưu tiên trên gợi ý hồ sơ; thay đổi tự nhập không bị ghi đè khi dữ liệu tải lại. Admin kiểm tra/sửa rồi mới lưu/chốt, gợi ý không tạo chữ ký hoặc cập nhật bản hợp đồng đã ký. Không đưa thông tin này vào danh sách hồ sơ, email, status OTP hoặc browser storage.

Hồ sơ lịch sử chỉ có mã HMAC để đối chiếu và kết quả đủ tuổi không thể khôi phục số giấy tờ/ngày sinh bằng cách giải mã mã băm. Các ô chưa có nguồn được để trống kèm hướng dẫn đối chiếu giấy tờ. Chỉ khi chính chủ gửi lại đúng request gốc đã được kiểm tra fingerprint, hệ thống mới có thể lưu bổ sung giá trị gốc; không backfill đại trà hoặc bịa thông tin.


## Điều chỉnh theo xác nhận ngày 05/11/2026

User xác nhận full time tối thiểu **40 giờ/tuần**, part time tối thiểu **20 giờ/tuần**; đây là thỏa thuận của dự án, không phải mức tối thiểu do luật ấn định. Mẫu mới `PWC-VN-LABOUR-2026-11-05-v2` bỏ lịch thứ/giờ cố định; pet sitter đăng ký lịch cụ thể ở màn Lịch làm việc sau khi ký và được duyệt. Lưu hợp đồng không tạo đăng ký lịch. Khung giờ rảnh không phải công thực tế; số giờ tối thiểu là cam kết theo hợp đồng. Các kiểm tra điều phối về giờ thông thường, ca đã nhận, nghỉ và yêu cầu thỏa thuận làm thêm vẫn giữ nguyên. Bản v1 đã chốt/ký giữ nguyên nội dung, không tự chuyển mẫu hoặc thay hash.

Phiếu tự động cho hợp đồng mới hỗ trợ tháng đầy đủ: lương cơ bản/phụ cấp đủ tháng, ca hoàn tất chỉ tính hoa hồng. Không cần lịch cố định hoặc đăng ký rảnh để trả đủ lương cơ bản. Không suy ra nghỉ không lương khi ít ca/chưa đăng ký. Mẫu số quy đổi 52/12 chỉ dùng tỷ lệ đủ tháng bằng 1, không dùng định giá một giờ nghỉ. Kỳ lẻ hoặc ngoại lệ nghỉ không lương yêu cầu bảng công đã xác minh ở đối soát nâng cao; không tự phân bổ ngày làm việc giả. Thuế/bảo hiểm/làm thêm vẫn cần dữ liệu xác minh như trước. Policy v3 giữ các mức tiền đã duyệt.

Các đoạn mô tả lịch cố định dưới đây là bằng chứng bản phát hành v1, chỉ còn áp dụng với hợp đồng lịch sử có lịch đã ký; điều chỉnh trên có ưu tiên cho hợp đồng v2.


Luồng tuyển mới: thẩm định → phỏng vấn → soạn hợp đồng → chốt bản in → hai bên ký giấy → Admin đối chiếu, ghi ngày ký và nơi lưu bản gốc → quyết định duyệt. Chỉ khi duyệt thành công, giao dịch mới cấp quyền Pet Sitter và tạo EmploymentContract từ đúng bản đã ký; thất bại phải rollback cả quyền lẫn hợp đồng. Bản in có số hợp đồng, mã nhân viên, phiên bản và checksum do hệ thống sinh. Không điền lại các mã đó. Không suy ra đã ký từ thao tác in; xác minh là xác nhận có trách nhiệm của Admin sau khi đối chiếu bản giấy, chưa phải chữ ký số hoặc xác thực chữ ký của cơ quan chứng thực.

Mẫu gồm thông tin pháp nhân/người có thẩm quyền ký, nhân thân người lao động, công việc/phạm vi địa điểm, thời hạn, lương gross/phụ cấp, hình thức và ngày trả, lịch và nghỉ, nâng lương, bảo hộ, bảo hiểm, đào tạo, quyền/nghĩa vụ và chấm dứt. Tên pháp nhân, MST/đăng ký, thẩm quyền ký, địa chỉ, căn cước, ngày và mức lương do Admin xác minh từ hồ sơ thực tế; không dùng dữ liệu demo để ký. Trường ngày ký trên bản in phải khớp ngày thực tế khi xác minh. Bản chốt không chỉnh trực tiếp: tạo phiên bản mới và ký lại nếu nội dung/ngày thay đổi. Không áp dụng mẫu phổ thông này cho người nước ngoài, người chưa thành niên hoặc điều kiện lao động đặc thù chưa được rà soát riêng. Nội dung tự nhập vẫn phải được bên sử dụng lao động kiểm tra trước khi ký, mẫu không chứng nhận mọi thỏa thuận tự nhập đều hợp pháp.

## Đối chiếu nguồn pháp luật

- [Bộ luật Lao động 45/2019/QH14, Cổng văn bản Chính phủ](https://vanban.chinhphu.vn/?docid=198540&pageid=27160): nội dung hợp đồng, giao kết trước khi làm việc, lao động không trọn thời gian; thời hạn xác định tối đa 36 tháng; bảng kê mỗi lần trả lương; giới hạn giờ và quyền nghỉ. Không dùng tên gọi cộng tác viên để né quan hệ lao động.
- [Thông tư 10/2020/TT-BLĐTBXH, bản trên cổng cơ quan nhà nước](https://quydautuphattrien.ninhbinh.gov.vn/public/userfiles/hoatdong/VP/10_2020.pdf): chi tiết nhận diện hai bên, phạm vi công việc/địa điểm và các nhóm điều khoản. Những nội dung này được chia thành các trường bắt buộc thay vì một mã tham chiếu hợp đồng rời rạc.
- [Nghị định 293/2025/NĐ-CP, hiệu lực 01/01/2026](https://vanban.chinhphu.vn/?docid=215832&pageid=27160): mức tối thiểu vùng và cơ sở đối chiếu tháng/giờ. Số giấy tờ còn được đối chiếu HMAC với đúng hồ sơ ứng tuyển, không đổi người trong hợp đồng. Bản mới chặn mức dưới ngưỡng được cấu hình cho năm 2026; Admin phải chọn vùng theo địa bàn thực tế. Không khẳng định thương hiệu Paw World tự có một địa chỉ pháp lý hay vùng lương.
- [BHXH Việt Nam: mở rộng đối tượng từ Luật BHXH 2024](https://baohiemxahoi.gov.vn/tintuc/Pages/linh-vuc-bao-hiem-xa-hoi.aspx?CateID=168&ItemID=24483&OtItem=date): làm không trọn thời gian không mặc nhiên được miễn nghĩa vụ bảo hiểm. Phải đối chiếu đối tượng và căn cứ đóng.
- [Cổng Chính phủ: cách tính thuế tiền lương, VBHN112/2026](https://xaydungchinhsach.chinhphu.vn/cach-tinh-thue-thu-nhap-ca-nhan-tu-tien-luong-tien-cong-119260623094516526.htm): quy tắc phụ thuộc cư trú, thu nhập chịu thuế, khoản giảm trừ và thời điểm chi trả. Không dùng biểu/giảm trừ cũ một cách mặc định cho năm 2026, cũng không suy ra thuế bằng 0 chỉ từ lương cơ bản.

## Phiếu lương

Màn mặc định chọn nhân viên bằng tên/mã đọc từ hệ thống. Bộ lập nháp lấy lịch đã ký để tính tổng phút công chuẩn trong tháng và kỳ, trừ đúng phần nghỉ không lương Admin đã đối chiếu; lấy lương/phụ cấp từ contract và hoa hồng từ PayrollServiceCredit của ca hoàn tất. Không lấy số giờ chăm sóc khách làm tổng giờ đi làm, không tự cắt lương khi công ty chưa bố trí ca. Phụ cấp cố định được phân bổ cùng tỷ lệ công. Mã phiếu/nhân viên, phiên bản, kết quả cộng/trừ và nguồn không nhập thủ công.

Hiện chưa có bảng công/nghỉ/làm thêm đã được chốt hoặc hồ sơ cư trú, người phụ thuộc và đăng ký đóng bảo hiểm đầy đủ trên hệ thống. Vì vậy không thể tự kết luận số công thực tế, thuế, BHXH/BHYT/BHTN hay tiền làm ban đêm chỉ từ GPS, lịch đăng ký hoặc hợp đồng. Admin xác nhận công và nhập các ngoại lệ có căn cứ; số 0 phải có hồ sơ đối chiếu, không tự được coi là đã hoàn tất nghĩa vụ. Bản nháp và phiếu không thực hiện chuyển khoản hoặc kê khai thay cơ quan thuế/BHXH. Giao diện nêu rõ các giới hạn này.

Nháp tự động chưa chốt KPI hoặc đối trừ ứng khi thiếu mục tiêu, đánh giá và thỏa thuận. Màn đối soát nâng cao được giữ cho các hồ sơ công/KPI/thuế/khấu trừ đã chốt riêng; không dùng để bỏ qua kiểm tra nguồn. Lập phiếu không đồng nghĩa duyệt hoặc đã trả. Các bước chờ duyệt → duyệt → ghi nhận thanh toán với tham chiếu ngân hàng tiếp tục tách biệt. Giới hạn tổng khoản khấu trừ khác do bên sử dụng lao động áp dụng là 30% phần lương sau bảo hiểm bắt buộc và thuế; đây không phải quyền tự tạo một khoản phạt. Đối trừ ứng được giữ riêng theo thỏa thuận. Từ chối hủy phiếu và giải phóng nguồn; phiếu đã trả chỉ điều chỉnh bằng quy trình đối soát. Bản in phiếu hiển thị khoản thu nhập/khấu trừ và trạng thái thực tế.

Khi lưu từ nháp, server đọc lại contract/ca và kiểm tra source hash trong transaction; nguồn đổi thì yêu cầu xem lại. Mất phản hồi giữ body/key cũ để đối soát, không tạo phiếu mới. Khóa idempotency và chiếm nguồn hiện hành ngăn trùng kỳ/hoa hồng/ứng. Hợp đồng lịch sử không có lịch làm việc vẫn được giữ nhưng không gán một tuần công tưởng tượng; cần đối chiếu/bổ sung bằng hợp đồng mới hoặc hồ sơ công riêng.

## Phân quyền và dữ liệu

Toàn bộ thông tin định danh, địa chỉ, điều khoản hợp đồng được mã hóa AES-GCM bằng cơ chế khóa hiện có, không ghi vào log hoặc localStorage. Chỉ API Admin có no-store mới trả bản giải mã để soạn/in/đối chiếu; dữ liệu nhạy cảm không đi vào email thông báo tuyển dụng. EmploymentContract chỉ nhận dữ liệu lương/lịch cần thiết. Mỗi lần sửa tạo bản bất biến mới; bản ký/đã kích hoạt không bị thay nội dung. Không backfill trạng thái đã ký hoặc hồ sơ nhân viên cũ.

Kiểm thử sử dụng MongoDB replica set và giấy tờ, chữ ký xác nhận, công, chứng từ tổng hợp tách biệt. Không tạo hợp đồng, ký thay, trả lương hoặc gửi email tuyển dụng thật trên production để chứng minh chức năng.

## Contract validation and printing follow-up 05/11/2026

Source audit found generic combined validation errors masked the failing fields,
preventing an Admin from correcting a draft and reaching the print step. Drafts
can now be printed with a prominent draft watermark; only ISSUE fixes the signing
version, SIGN records separately verified paper signatures, and approval activates
that exact signed revision. Error responses include safe field names/reason codes,
not entered private values; UI retains inputs and identifies each correction.

The existing Vietnamese labour-contract template covers the ten principal groups
in Article 21 of the Labour Code and Article 3 of Circular 10/2020/TT-BLDTBXH.
Checked official source on 05/11/2026:
https://vbpl.vn/TW/Pages/vbpq-toanvan.aspx?ItemID=146696&Keyword=
This does not certify the truth of legal-entity information, signing authority,
self-entered clauses or actual signatures. No real contract was signed or approved
for test purposes. Business 40/20-hour commitments and historical signed wording
are preserved.

### Feedback visibility follow-up

A browser audit on the previous build found the validation summary was 3,375–4,288
pixels above the viewport after submitting at the bottom of the contract form.
The editor now focuses the summary/status after command acknowledgement; error
links focus the corresponding control without changing route hash or input data.
This is presentation only: signature checks, idempotency and document contents
remain unchanged.
