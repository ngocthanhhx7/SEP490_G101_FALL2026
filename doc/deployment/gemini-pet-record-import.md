# Đọc sổ thú cưng bằng Gemini

Chức năng tùy chọn, mặc định tắt. Model theo thứ tự GEMINI_PET_RECORD_MODEL → GEMINI_MODEL → mặc định gemini-3.1-flash-lite. Cấu hình local của chủ dự án hiện chọn gemini-3.5-flash-lite, dự phòng3.1; cả hai đã GET metadata200, có generateContent/countTokens. GEMINI_FALLBACK_MODEL được giữ nguyên nhưng bản đầu không tự đổi model khi lỗi/quota để tránh lặp chi phí và thay hành vi âm thầm. Không dùng tài khoản đăng nhập Antigravity/Gemini web thay cho Gemini API key. Hạn mức phụ thuộc project/API tier thực tế; ảnh dashboard không chứng minh key đã hoạt động.

## Cấu hình sau khi có key

Tạo key trong Google AI Studio cho project được phép sử dụng. Không gửi key vào chat, Git, frontend hoặc ảnh chụp màn hình. Đọc điều khoản xử lý dữ liệu và chọn project/tier phù hợp trước khi dùng sổ khách hàng thật; thử trước bằng tài liệu tổng hợp. Theo điều khoản Google, không gửi thông tin cá nhân/bảo mật vào Unpaid Services. Dùng sổ tổng hợp với Free tier; luồng khách thật chỉ bật bằng project paid và khai báo GEMINI_PET_RECORD_DATA_TIER=paid. Đây là khai báo của người vận hành, không phải kiểm tra billing tự động. Không suy ra chính sách dữ liệu hoặc hạn mức của 3.1 Flash-Lite từ hàng model khác trong dashboard.

Theo [EC2 environment guide](ec2-environment-guide.md), mở file `/opt/pawworldcare/shared/.env` bằng quyền root, giữ nguyên các giá trị đang có và thêm/sửa đúng các biến sau:

```dotenv
PET_RECORD_IMPORT_ENABLED=true
GEMINI_API_KEY=REPLACE_WITH_YOUR_PRIVATE_KEY
GEMINI_PET_RECORD_DATA_TIER=paid
GEMINI_PET_RECORD_MODEL=gemini-3.5-flash-lite
```

Chỉ đây là mẫu; không dán placeholder vào production. Key chỉ ở backend. Sau thay đổi env phải tái tạo container theo quy trình release; restart container không nạp lại env-file. Nếu thiếu key khi bật, backend từ chối khởi động với tên biến thiếu, không in giá trị. Khi tắt, UI giữ nhập tay và giải thích tính năng chưa bật. Không thay `AI_ENABLED`: biến đó điều khiển gợi ý sitter, tách biệt với đọc sổ.

## Luồng và giới hạn

Customer đăng nhập mở thêm/sửa thú cưng → chọn sổ JPEG/PNG/PDF tối đa5MB → đồng ý gửi nội dung tới Google → trích xuất → đối chiếu đoạn nguồn và trang → chọn/sửa từng mục → xác nhận → đưa vào bản sửa → Lưu thú cưng. Không có tự lưu. Kết quả không xác minh y tế, không chẩn đoán/kê đơn/tính liều; chưa biết không phải không có rủi ro. Mục không chọn không đổi. Đóng bản sửa chưa lưu vẫn cần xác nhận.

Backend không lưu tệp, tên tệp hoặc phản hồi Gemini vào Mongo/R2/log ứng dụng. Google xử lý dữ liệu theo điều khoản provider; không tuyên bố Google không lưu dữ liệu. Nội dung sổ có thể chứa thông tin cá nhân: khách phải xem/loại bỏ thông tin không cần thiết trước khi gửi. Bản đầu không cung cấp kho lưu sổ gốc hoặc lịch sử bệnh án.

Ảnh được kiểm tra định dạng, tối đa20MP, bỏ metadata và thu gọn1600px; PDF kiểm tra signature/EOF/size, không tuyên bố kiểm định toàn bộ cấu trúc PDF. Không thực thi liên kết/mã/nội dung chỉ dẫn trong tài liệu. Gọi countTokens trước, từ chối quá16000tokens; giới hạn generation6000outputtokens, phản hồi96KiB và tổng timeout45giây. Đây là chặn kích thước/công việc, không phải cam kết chi phí hay độ chính xác. Không tự retry trả phí. Hai tác vụ đồng thời và hai yêu cầu/phút/customer trên mỗi process; chưa phải quota toàn project hoặc bộ đếm billing bền vững. Khi429, báo hạn mức và giữ nhập tay.

## Nghiệm thu trước khi bật thật

1. Metadata chỉ Customer truy cập, không lộ key; guest401, Staff/Admin403; POST phải có CSRF và đồng ý gửiGoogle.
2. Dùng tài liệu tổng hợp một trang để kiểm tra model/key/quota thực tế, ảnh xoay, PDF scan, chữ mờ, dữ liệu thiếu và nguồn trang.
3. Kiểm tra thiếu key, hết quota, lỗi provider và timeout đều không sửa hồ sơ.
4. Kiểm tra khách không chọn hoặc chưa xác nhận thì không áp dụng; sửa bản nháp rồi phải xác nhận lại; lưu vẫn kiểm tra owner/version/idempotency.
5. Chỉ đánh dấu provider acceptance sau khi thực sự chạy với key. Unit/integration stubs không chứng minh chất lượng đọc sổ thật.

Tắt nhanh bằng `PET_RECORD_IMPORT_ENABLED=false` và tái tạo container đúng quy trình. Nguồn rollback046f33b tương thích careProfile hiện có; không có migration hoặc index mới.

Nguồn chính thức: [model](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite), [PDF](https://ai.google.dev/gemini-api/docs/document-processing), [structured output](https://ai.google.dev/gemini-api/docs/structured-output), [điều khoản](https://ai.google.dev/gemini-api/terms).

## Hợp đồng và lựa chọn kiến trúc đã đối chiếu

Tài liệu model3.1 chính thức xác nhận generate_content, PDF inline và response_json_schema. Adapter REST dùng POST /v1beta/models/{model}:countTokens và :generateContent; authentication x-goog-api-key, media contents.parts.inlineData{mimeType,data}, JSON generationConfig.responseMimeType + responseJsonSchema; đọc candidates[0].content.parts[].text và chỉ nhận finishReason STOP. Response200 vẫn phải qua kiểm tra schema/giới hạn/field allowlist/source excerpts. Schema của Interactions API không dùng thay cho generateContent.

Chọn hai REST operation nhỏ bằng fetch có sẵn để không thêm SDK khi chưa cần streaming, tools hoặc multi-turn; adapter được inject fetch để test. Inline phù hợp upload nhỏ, dùng một lần và không cần Files API/lưu tệp rồi dọn; đổi lại phải encode base64 và gửi lại cho token preflight. countTokens thêm một RPC/latency nhưng chặn công việc lớn trước generate; timeout45giây và giới hạn local là quyết định sản phẩm, không phải quota do Google công bố. Không có background queue vì bản đầu là tác vụ ngắn, không lưu trạng thái, có nhập tay thay thế. Không retry ngầm để tránh lặp chi phí; khi khách chủ động thử lại thì đó là yêu cầu mới.

Đã xác minh tài liệu, cấu trúc source, kiểm thử giả lập và key/model local bằng hai tài liệu tổng hợp như bằng chứng bên dưới. Chưa xác minh billing khai báo, quota chịu tải thực tế, mạng VPS tới Google, chữ viết tay và hành vi timeout/quota live. Chỉ hoàn tất phần tích hợp hoạt động sau khi checklist live với sổ tổng hợp đã đạt. Code/deployment ở trạng thái disabled không đồng nghĩa nghiệm thu Gemini.

Tham khảo thêm [GenerateContent REST](https://ai.google.dev/api/generate-content), [CountTokens](https://ai.google.dev/api/tokens). Tài liệu chính thức đã đọc qua HTTP Accept:text/markdown sau khi Exa/Web fetch không đọc được định dạng markdown.


## Bằng chứng thử provider local — 2026-11-09

Key do chủ dự án cấu hình local được dùng trong bộ nhớ, không in/log/commit. GET metadata model3.5FlashLite và3.1FlashLite đều200, công bố generateContent/countTokens. Adapter thực tế đã gọi model `gemini-3.5-flash-lite` cho một ảnh PNG và một PDF một trang tổng hợp; cả hai qua countTokens/generate/JSON validation, kiểm tra ngày tiêm và đoạn nguồn, và không đổi UNKNOWN thành khẳng định không có dị ứng. Không gửi dữ liệu khách thật, không đổi .env và không bật feature production. Đây là nghiệm thu provider local có giới hạn; chưa chứng minh mạng VPS, billing/tier thực tế, chữ viết tay, mọi sổ hoặc khả năng chịu tải. Thử tổng hợp không phải nghiệm thu lâm sàng.
