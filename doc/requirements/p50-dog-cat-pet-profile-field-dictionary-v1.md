# P50-A — Từ điển trường intake hồ sơ chó/mèo v1.0

- **Ngày nghiên cứu:** 14/10/2026 (Asia/Saigon)
- **Trạng thái:** Đề xuất yêu cầu/dữ liệu để P01 và P15 chốt; chưa phải schema, DTO, Figma hay chức năng đã triển khai.
- **Phạm vi:** EXT-27, liên quan UC-13–15 và WBS-014/015.

## 1. Kết luận

- Tạo hồ sơ pet chỉ cần **tên** và **loài**. Ảnh, giống, tuổi, cân nặng, sức khỏe và vaccine không phải điều kiện đăng ký.
- Thu thập dần theo dịch vụ: lúc booking chỉ hỏi thông tin cần cho dịch vụ và pet đã chọn; không dùng form sức khỏe dài làm điều kiện chung.
- Phân biệt **unknown**, **not provided**, **not applicable** và **needs confirmation**. Trường trống không có nghĩa “không dị ứng”, “không uống thuốc” hoặc “an toàn”.
- Vaccine là hồ sơ Customer tự khai/đính kèm và tùy chọn. Không suy ra lịch vaccine, tính hợp lệ, điều kiện dịch vụ hay quy định Việt Nam từ nguồn thú y nước ngoài.
- Customer sửa hồ sơ gốc. Sitter chỉ đọc hướng dẫn cần thiết của visit được giao và ghi quan sát vào nhật ký visit, không sửa hồ sơ gốc.
- Sửa hồ sơ không làm đổi snapshot booking đã xác nhận. P01/P15/P34 cần chốt quyền, retention và schema trước khi tích hợp.

## 2. Cơ sở và trạng thái bằng chứng

P00 đã merge vào develop (#3). Các tài liệu P00 trong repository là bản phân tích có version; SRS/workbook trên Drive chưa được cập nhật bởi P50. P00 xác định pet của Customer có thể có vaccine chưa biết, nhiều pet, hồ sơ riêng tư và snapshot hướng dẫn; không từ chối pet vì vaccine chưa biết nếu chưa có rule được duyệt. P15 quản lý danh sách/hồ sơ pet; P01 quản lý schema/DTO/quyền; P04 quản lý component/token; P34 quản lý tích hợp.

Đã rà soát repository trên develop: chưa có mã nguồn pet profile trong frontend/backend; baseline hiện có cấu trúc, tài liệu và tài nguyên tĩnh. Tài liệu này chuẩn bị yêu cầu cho gói sau, không khẳng định có luồng chạy hay dữ liệu hồ sơ hiện hữu.

### Nguồn thú y đã kiểm tra

Tra cứu công khai ngày 14/10/2026 bằng NCBI PubMed E-utilities; đã đọc metadata và abstract PubMed, chưa xác minh toàn văn trả phí. Nguồn dưới đây hỗ trợ thiết kế trường dữ liệu; không thay thế quyết định nghiệp vụ PWC, khám thú y hoặc quy định Việt Nam.

| ID | Nguồn và nội dung được dùng | Giới hạn áp dụng |
| --- | --- | --- |
| V1 | Cline et al., *2021 AAHA Nutrition and Weight Management Guidelines for Dogs and Cats*, 2021. [PubMed 34228790](https://pubmed.ncbi.nlm.nih.gov/34228790/), DOI 10.5326/JAAHA-MS-7232. Abstract mô tả nutritional assessment gồm body-condition và muscle-condition score; khuyến nghị dinh dưỡng được cá thể hóa. | PWC có thể lưu cân nặng/khẩu phần nếu hữu ích, nhưng không yêu cầu Customer tự chấm thể trạng hay nhận khuyến nghị dinh dưỡng. |
| V2 | World Small Animal Veterinary Association Nutritional Assessment Guidelines Task Force, *2011 Nutritional Assessment Guidelines*, 2011. [PubMed 22616443](https://pubmed.ncbi.nlm.nih.gov/22616443/). Abstract nêu tuổi, khẩu phần, thay đổi khẩu vị, thể trạng/cơ và bệnh lý là thông tin liên quan sàng lọc dinh dưỡng. | Không đặt khẩu phần hoặc kết luận tình trạng sức khỏe trong PWC. |
| V3 | Ellis et al., *2022 AAHA Canine Vaccination Guidelines (2024 Update)*, 2024. [PubMed 39480742](https://pubmed.ncbi.nlm.nih.gov/39480742/), DOI 10.5326/JAAHA-MS-7468. Abstract nêu khuyến nghị dựa vào yếu tố nguy cơ của từng bệnh nhân. | Không phải quy định Việt Nam hay chính sách PWC. |
| V4 | Stone et al., *2020 AAHA/AAFP Feline Vaccination Guidelines*, 2020. [PubMed 32845224](https://pubmed.ncbi.nlm.nih.gov/32845224/), DOI 10.1177/1098612X20941784. Abstract mô tả đánh giá cá thể theo giai đoạn sống, lối sống, nguồn gốc, môi trường và nguy cơ. | Không chuyển lịch/tiêu chuẩn vùng thành điều kiện booking Việt Nam. |
| V5 | Rodan et al., *2022 AAFP/ISFM Cat Friendly Veterinary Interaction Guidelines: Approach and Handling Techniques*, 2022. [PubMed 36259500](https://pubmed.ncbi.nlm.nih.gov/36259500/), DOI 10.1177/1098612X221128760. Hỗ trợ điều chỉnh cách tiếp cận theo trạng thái của từng mèo. | Hướng dẫn tương tác tại cơ sở thú y; PWC không khám hay thực hiện trị liệu hành vi. |
| V6 | Hammerle et al., *2015 AAHA Canine and Feline Behavior Management Guidelines*, 2015. [PubMed 26191821](https://pubmed.ncbi.nlm.nih.gov/26191821/), DOI 10.5326/JAAHA-MS-6527. Hỗ trợ hỏi nhu cầu hành vi/cách tiếp cận bằng ngôn ngữ quan sát. | Nguồn cũ hơn V5; không sao chép tiêu chí khám hoặc chẩn đoán. |

## 3. Trạng thái và nguồn gốc dữ liệu

Trạng thái giá trị tách khỏi nguồn/độ xác thực:

| Trạng thái | Ý nghĩa |
| --- | --- |
| known | Có giá trị hiện hành; vẫn lưu người cung cấp và ngày cập nhật. |
| unknown | Customer nói không biết. |
| not_provided | Customer chưa trả lời hoặc bỏ qua. |
| not_applicable | Không áp dụng theo loài/dịch vụ; thường ẩn trường thay vì hỏi. |
| needs_confirmation | Thông tin cũ, mâu thuẫn hoặc cần xác nhận lại cho visit. |

Nguồn gốc có thể là customer_reported, document_attached hoặc professionally_verified. Tự khai/đính kèm không đồng nghĩa verified. Chỉ dùng professionally_verified nếu có người đủ thẩm quyền, nguồn xác nhận, thời điểm và audit trail; PWC chưa có workflow đó. Trường sức khỏe phải ghi “Customer cung cấp”, không biến thành chẩn đoán hay khuyến nghị.

## 4. Từ điển trường đề xuất

Tên khóa là khái niệm để thảo luận, không phải schema. Khóa pet/owner là metadata hệ thống, không phải dữ liệu Customer nhập. “Bắt buộc theo dịch vụ” chỉ bật khi P01/P15 duyệt yêu cầu cụ thể.

| Trường | Kiểu / loài | Điều kiện và giá trị thiếu | Nguồn / căn cứ | Riêng tư, người sửa và nhóm UI |
| --- | --- | --- | --- | --- |
| **name** — tên pet | Text, chó/mèo | Bắt buộc tạo hồ sơ; không unknown. | Customer nhập; nhận diện hồ sơ P15. | Customer chủ hồ sơ sửa; Sitter chỉ thấy pet được chọn trong visit. **Thông tin cơ bản**. |
| **species** — loài | Enum chó/mèo | Bắt buộc; không suy đoán từ tên/ảnh. | Customer chọn; scope PWC/P15. | Customer sửa; đổi loài phải kiểm tra lại trường phụ thuộc loài. **Thông tin cơ bản**. |
| **owner_ref** — chủ sở hữu hồ sơ | Tham chiếu Customer account, metadata hệ thống | Bắt buộc trong dữ liệu; hệ thống gán từ phiên Customer đã xác thực, không nhận từ form/request body. | Nguồn là authenticated account; liên kết owner–pets theo P15. | Customer chỉ đọc/sửa pet của mình; không cho sửa owner_ref. Chia sẻ nhiều chủ/transfer cần quyết định quyền riêng. **Hệ thống, không hiện trên form**. |
| **pet_id** — mã hồ sơ nội bộ | ID hệ thống | Bắt buộc trong dữ liệu; tự tạo, không nhập tay. | Không dùng số giấy tờ con người làm ID pet. | Hệ thống tạo; dùng cùng owner_ref để kiểm tra object-level authorization mỗi lần đọc/sửa. **Hệ thống, không hiện trên form**. |
| **photo** — ảnh nhận diện | Tham chiếu media riêng tư | Tùy chọn; not_provided hợp lệ; lỗi upload phải hiển thị. | Customer tải lên. | Customer sửa; Sitter được giao xem ảnh pet đó. Không public URL. **Thông tin cơ bản**. |
| **breed** — giống | Text hoặc danh mục do P01 chốt | Tùy chọn; unknown/not_provided hợp lệ; không áp hạn chế dịch vụ theo giống. | Customer tự khai, không xác minh. | Customer sửa; chỉ người có quyền xem hồ sơ/visit. **Thông tin cơ bản**. |
| **approximate_age** — tuổi ước tính | Số + đơn vị, cờ ước tính | Tùy chọn; unknown hợp lệ; không buộc ngày sinh chính xác. | Customer tự khai; V1/V2 cho thấy tuổi liên quan đánh giá dinh dưỡng thú y. | Customer sửa; không hiển thị như tuổi đã xác minh. **Thông tin cơ bản**. |
| **identifying_marks** — màu/dấu nhận diện | Text ngắn | Tùy chọn; được bỏ trống. | Customer tự khai. | Customer sửa; Sitter chỉ thấy pet được giao. **Thông tin cơ bản**. |
| **weight_kg** — cân nặng gần nhất | Số thập phân kg, ngày đo, nguồn | Tùy chọn; chỉ yêu cầu nếu thao tác cụ thể cần và đã duyệt; unknown hợp lệ; số dương, không có ngưỡng “bình thường”. | Customer khai/ghi nguồn; V1/V2 là căn cứ chuyên môn cho cân nặng trong đánh giá, không phải chẩn đoán PWC. | Customer sửa; ghi người nhập/ngày đo; chỉ chia sẻ khi cần. **Sức khỏe tùy chọn**. |
| **handling_preferences** — cách tiếp cận/điều cần tránh | Text hoặc tag quan sát, chó/mèo | Tùy chọn; cần xác nhận nếu visit cần tiếp xúc gần; unknown hợp lệ. | Customer cung cấp; V5/V6 hỗ trợ điều chỉnh theo cá thể. Không dùng nhãn chẩn đoán. | Customer sửa; Sitter đọc snapshot visit, không sửa hồ sơ. **Chăm sóc & hành vi**. |
| **feeding_instructions** — thức ăn/cách cho ăn | Loại, lượng + đơn vị, thời điểm, chó/mèo | Chỉ bắt buộc khi dịch vụ có cho ăn; unknown/not_provided phải hỏi lại trước khi giao việc cho ăn; không tự điền khẩu phần. | Customer cung cấp; V1/V2 yêu cầu đánh giá chuyên môn cho tư vấn dinh dưỡng. | Customer sửa; xác nhận snapshot trước visit. Không dùng để tư vấn chế độ ăn. **Chăm sóc hằng ngày**. |
| **water_instructions** — nước uống | Text ngắn/lựa chọn và ghi chú | Chỉ yêu cầu khi dịch vụ có thao tác liên quan; unknown không có nghĩa “không cần”. | Customer cung cấp; đối chiếu care instruction P26. | Customer sửa; Sitter nhận theo visit. **Chăm sóc hằng ngày**. |
| **dog_walk_instructions** — dắt chó | Dây dắt/harness, tín hiệu, giới hạn; chỉ chó | Chỉ cho dịch vụ dắt chó; không hiện với mèo; unknown cần được xác nhận trước khi dắt. | Customer cung cấp; nghiệp vụ dịch vụ PWC. | Customer sửa; Sitter được giao nhận snapshot. **Chó — đi dạo**. |
| **dog_toileting_cues** — tín hiệu vệ sinh | Text ngắn, chỉ chó | Theo dịch vụ/nhu cầu; unknown hợp lệ nếu không phụ thuộc. | Customer cung cấp; care routine PWC. | Customer sửa; chỉ Sitter cần cho visit xem. **Chó — thói quen**. |
| **cat_litter_instructions** — khay cát | Vị trí/cách chăm, chỉ mèo | Chỉ khi dịch vụ có dọn khay; not_applicable với chó. | Customer cung cấp; nghiệp vụ chăm mèo PWC. | Customer sửa; Sitter được giao chỉ thấy phần cần thiết. **Mèo — khay cát**. |
| **cat_carrier_and_approach** — lồng/cách tiếp cận | Text ngắn, chỉ mèo | Chỉ khi dịch vụ cần carrier/vận chuyển; ngoài dịch vụ thì not_applicable; unknown không tự biến thành đồng ý. | Customer cung cấp; V5 hỗ trợ tiếp cận theo cá thể. | Customer sửa; Sitter được giao đọc theo visit. **Mèo — vận chuyển**. |
| **customer_reported_health_notes** — dị ứng/bệnh/lưu ý sức khỏe | Text hoặc danh sách, chó/mèo | Không bắt buộc đăng ký; chỉ hỏi khi Customer muốn chia sẻ hoặc dịch vụ cần; unknown/not_provided riêng biệt. | Customer cung cấp; V1/V2 chỉ hỗ trợ nhận diện liên quan dinh dưỡng, không trao quyền chẩn đoán cho PWC. | Nhạy cảm; Customer sửa; Sitter được giao xem phần cần thiết; Staff/Admin theo vụ việc. **Sức khỏe riêng tư**. |
| **medication_instructions** — hướng dẫn thuốc do Customer cung cấp | Tên/liều/giờ theo nguồn cung cấp, chó/mèo | Không phải yêu cầu hồ sơ; chỉ dùng nếu PWC duyệt dịch vụ hỗ trợ thuốc và P01/P26 chốt cách làm. Unknown không phải chỉ dẫn đủ dùng; không tự đề xuất liều. | Customer cung cấp bản hướng dẫn; cần nguồn/xác nhận phù hợp trước thao tác. | Nhạy cảm; Customer sửa; Sitter chỉ xem nếu tác vụ được duyệt và được giao. **Sức khỏe riêng tư**. |
| **vaccination_records** — hồ sơ vaccine | Danh sách, ngày nếu biết, nguồn, tham chiếu file riêng tư | Hoàn toàn tùy chọn; không chặn hồ sơ/booking. Phân biệt unknown, not_provided, customer_reported, document_attached và professionally_verified; không tính hạn/đạt điều kiện. | Customer khai/đính kèm; V3/V4 cho thấy quyết định cá thể hóa, không phải luật Việt Nam. | Nhạy cảm; Customer sửa; Sitter/Staff/Admin chỉ khi cần cho booking/case. Verified cần workflow và actor đủ thẩm quyền. **Vaccine riêng tư**. |
| **emergency_contact** — liên hệ dự phòng | Tên, quan hệ, số điện thoại của người khác | Không bắt buộc tạo pet; chỉ hỏi nếu quy trình dịch vụ được duyệt yêu cầu; không thu giấy tờ tùy thân. | Customer cung cấp; nhu cầu vận hành còn cần PWC chốt. | Dữ liệu bên thứ ba; Customer sửa/xác nhận quyền cung cấp; chỉ người xử lý tình huống xem. **Liên hệ riêng tư**. |
| **veterinary_contact** — cơ sở thú y do Customer chọn | Tên/điện thoại/địa chỉ tùy chọn | Tùy chọn; không hứa PWC sẽ liên hệ hoặc đưa pet đi. | Customer cung cấp; không phải mặc định đối tác/provider PWC. | Customer sửa; chỉ người xử lý visit/case có quyền xem. **Liên hệ riêng tư**. |
| **visit_care_snapshot** — snapshot hướng dẫn | Bản ghi phiên bản theo booking, visit và pet | Bắt buộc khi visit có pet và thao tác chăm sóc đã được Customer xác nhận; trường bên trong tùy dịch vụ. | Giữ unknown/not_provided; lưu giá trị Customer xác nhận tại booking/visit, không đồng bộ ngược từ profile. | Mọi thay đổi có version/actor/thời điểm; Customer xác nhận, Sitter được giao chỉ đọc trường cần thiết. Sửa theo P01/P26, không sửa hồ sơ gốc. **Booking — rà soát chăm sóc**. |
| **field_provenance** — nguồn/lần cập nhật | Metadata: source, updatedAt, updatedBy, status, file reference | Audit cần có cho trường sức khỏe, vaccine và snapshot; schema do P01 chốt. | Customer entry, file đính kèm hoặc quy trình xác minh có audit. Thiếu nguồn thì không hiển thị verified. | Sitter không sửa metadata hồ sơ; ghi nguồn/thời gian mỗi lần cập nhật. **Dùng xuyên suốt**. |

Không thu số microchip, CCCD/hộ chiếu của chủ, giấy tờ tùy thân của người liên hệ hoặc hồ sơ y tế con người mặc định. Microchip chưa cần cho booking/chăm sóc; chỉ xem xét nếu có use case khôi phục pet và quyết định riêng về quyền, lưu trữ, hiển thị.

## 5. Nhập dữ liệu theo từng bước

1. **Tạo hồ sơ tối thiểu:** Customer nhập tên và chọn chó/mèo; lưu được ngay. Không bắt ảnh, giống, tuổi, cân nặng, sức khỏe, vaccine hay giấy tờ.
2. **Bổ sung nhận diện:** ảnh, giống, tuổi ước tính, dấu nhận dạng và cân nặng là tùy chọn; cho phép unknown/not_provided.
3. **Bổ sung chăm sóc theo loài:** chỉ hiện field áp dụng; không hỏi tất cả tại một thời điểm.
4. **Thông tin riêng tư:** sức khỏe/vaccine/liên hệ chỉ nhập nếu Customer muốn hoặc tác vụ đã chốt cần. File phải lưu riêng tư.
5. **Khi booking:** Customer chọn pet và dịch vụ; chỉ hỏi hướng dẫn liên quan. Trước xác nhận, cho Customer xem lại và đánh dấu needs_confirmation nếu cũ/không rõ.
6. **Snapshot theo pet/visit:** lưu hướng dẫn Customer xác nhận cho booking đó. Sửa hồ sơ chỉ áp dụng cho booking sau; sửa snapshot đã xác nhận phải theo luồng thay đổi P01/P26.
7. **Sitter thực hiện:** chỉ nhận pet và hướng dẫn thuộc visit được giao. Ghi quan sát vào nhật ký visit, không sửa hồ sơ gốc hoặc xem pet khác.

## 6. Validation và quyền riêng tư

- Chỉ hỗ trợ chó/mèo theo scope hiện tại; trường theo loài được ẩn hoặc đánh dấu không áp dụng. Không gắn hạn chế theo breed.
- Tên phải có giá trị. Cân nặng nếu có phải dương, có kg/ngày/nguồn; không đặt ngưỡng y tế. Tuổi có thể ước tính hoặc unknown, không bắt ngày sinh.
- Tài liệu vaccine không đồng nghĩa xác minh; không tự nhắc lịch, tuyên bố đủ vaccine, chẩn đoán hoặc từ chối booking.
- Nếu tác vụ phụ thuộc dữ liệu unknown, yêu cầu Customer xác nhận đúng trường đó; không đổi unknown thành “không có vấn đề”.
- Customer chủ hồ sơ sửa. API lấy owner_ref từ phiên đã xác thực, không tin owner ID do client gửi, và kiểm tra object-level authorization mỗi lần đọc/sửa. Sitter không sửa hồ sơ; Staff/Admin không sửa thay Customer nếu chưa có correction flow và audit. Sitter ghi vào visit record.
- Customer xem hồ sơ của mình. Sitter không được tìm/xem pet ngoài booking được giao; chỉ nhận trường cần cho visit. Staff/Admin truy cập theo vụ việc và quyền P01.
- Home-access notes là trường P14 riêng biệt; PWC giới hạn chúng cho sitter được giao từ 1 giờ trước visit đến check-out. Thời gian mở trường sức khỏe/hướng dẫn khác chưa chốt; P01 phải quy định, không tự nới cửa sổ.
- Ảnh/tệp phải ở storage riêng tư; kiểm tra quyền ở API/serializer, không chỉ ẩn UI. Không đưa sức khỏe/home-access vào public/PWA cache.
- Không yêu cầu CCCD/hộ chiếu hay giấy tờ tùy thân của Customer/người liên hệ để tạo hồ sơ pet. Chỉ thu số liên hệ dự phòng nếu có nhu cầu dịch vụ và quyền xử lý rõ.

## 7. Tiêu chí nghiệm thu cho P01/P15 (chưa chạy)

Các trường hợp dưới đây là acceptance criteria để gói có code kiểm tra sau này; không phải kết quả test của P50. Repository hiện chưa có pet profile/API để thực thi chúng.

| Case | Kết quả cần kiểm tra |
| --- | --- |
| Hồ sơ tối thiểu | Tạo được hồ sơ với tên + loài; không đòi ảnh, giống, tuổi, cân nặng, sức khỏe, vaccine hoặc giấy tờ. |
| Trường theo loài | Hồ sơ chó không hiện khay cát/carrier của mèo; hồ sơ mèo không hiện dắt chó. Trường không áp dụng không gửi như false. |
| Trạng thái chưa biết | unknown, not_provided, not_applicable và needs_confirmation được giữ riêng; thiếu giá trị không thành “không có vấn đề”. |
| Vaccine | Không có hồ sơ hoặc hồ sơ unknown vẫn tạo được pet/booking nếu chưa có policy PWC được duyệt; file đính kèm không hiện verified. |
| Quyền sở hữu | Customer A không list/read/update/archive pet của Customer B qua ID; API không tin owner_ref từ body/query và kiểm tra quyền tại mỗi thao tác. |
| Snapshot | Sửa hồ sơ sau booking không đổi snapshot đã xác nhận; booking nhiều pet giữ đúng snapshot theo pet/visit. |
| File riêng tư | Pet ảnh/tài liệu chỉ truy cập được theo quyền; sitter không được giao bị từ chối; upload lỗi hiện trạng thái lỗi, retry không tạo bản ghi trùng. |
| Empty/error | Danh sách rỗng có hướng dẫn tạo pet; not found/forbidden không lộ hồ sơ người khác; lỗi lưu/upload cho phép retry và giữ dữ liệu đã nhập. |
| Gửi lặp | Double-click/retry cùng một yêu cầu tạo pet không tạo bản sao; P01 chốt cơ chế idempotency, không dùng tên pet làm khóa duy nhất. |
| Thời gian | Ngày sinh ước tính/ngày vaccine/ngày cân là ngày lịch; timestamp server lưu chuẩn và hiển thị theo Asia/Ho_Chi_Minh. Không dùng giờ thiết bị làm thời điểm xác nhận. |
| Ranh giới y tế | Không có vaccine gate, liều thuốc gợi ý, chẩn đoán hoặc nhãn thể trạng tự động. Unknown cần xác nhận chỉ khi tác vụ đã duyệt thực sự phụ thuộc trường đó. |

## 8. Bàn giao cho gói tiếp theo

| Owner | Cần chốt trước implementation |
| --- | --- |
| P01 | Schema/DTO, trạng thái, quan hệ owner–pet, object-level authorization, quyền Staff/Admin, nguồn/xác minh, audit và snapshot. |
| P15 | Field bắt buộc theo dịch vụ, cập nhật hồ sơ, unknown/stale prompt, chọn nhiều pet, snapshot và lỗi upload. |
| P26 | Customer xác nhận hướng dẫn, mốc khóa sửa, có hay không dịch vụ hỗ trợ thuốc. |
| P04 | Token/component, responsive/keyboard. P50 chỉ đề xuất nhóm UI; chưa có Figma để xác nhận. |
| P34 | Tích hợp route/provider/private upload và kiểm tra contract; P50 không sửa shared code. |
| Product/Privacy owner | Retention/xóa media, xử lý contact bên thứ ba và workflow xác minh vaccine. Chưa có quyết định; file đính kèm không phải verified. |

**Trạng thái bàn giao:** P50-A hoàn thành phần nghiên cứu/tài liệu; implementation và Figma chưa bắt đầu. Dependency trực tiếp P00 đã merge (#3). P15 vẫn phụ thuộc P14/P04 và contract P01. Nếu dùng fixture trước khi API/provider sẵn sàng, ghi INTEGRATION_PENDING. Không suy ra code/test/runtime từ tài liệu này.
