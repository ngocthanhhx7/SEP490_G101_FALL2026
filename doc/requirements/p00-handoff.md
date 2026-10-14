# Bàn giao P00 — 14/10/2026

Pxx / task / WBS: P00 — chốt nguồn, phạm vi và truy vết; cross-cut 66 UC/70 WBS nguồn, 8 UC-N và 16 WBS-N provisional; EXT-01–28 được phân loại ở bản quyết định/bổ khuyết. 66/70 là kiểm kê, không giới hạn sản phẩm.

Người chịu trách nhiệm P00 và contributor được chỉ định: Nguyễn Ngọc Thành, theo trả lời người dùng “thành đi”. Owner IT module giữ provenance cột N; P00 không có IT owner WBS riêng được giao. Không coi việc đối chiếu nguồn là approval GitHub.

Branch: `feature/p00-source-scope-traceability`; workspace `D:/WW/SEP490_G101_FALL2026`; base `origin/develop` sau `git fetch origin develop`: `b0ca49ce474b2408d04059cc89b7f7b3ca85dfd6`. Không tạo worktree khác. Nhánh bắt đầu phiên là `feature/project-implementation-prompts`; HEAD cùng base. Giữ nguyên hai README đã sửa và toàn bộ thư mục prompt chưa commit của người dùng.

Trạng thái: PR_OPEN cho draft P00; VERIFIED chỉ cho kiểm kê/đối chiếu và checks tài liệu nêu dưới. Nguồn Drive chưa cập nhật. Các hợp đồng/module/provider chưa VERIFIED; chưa MERGED.

## Nguồn và hợp đồng

Đã đọc trực tiếp Report1 (change log08/10, FE), Report2 (change log03/10, schedule), SRS (change log09/10, overview t25, permission t26, APIs/jobs t28/29, NFR t71, GBR t75), UC workbook08/10 và WBS tracking. Hash/locator: [source crosswalk v1.0](p00-source-crosswalk-v1.md).

Đã đọc bộ prompt P00/master/delta/revised-plan/source-register/scope-coverage/execution-map/session-template cùng FIN/policy-screen/Figma-brand contract cục bộ có sẵn. Chưa sửa/stage bộ này. Không có SRS riêng change log14/10; ngày14/10 là ngày đọc và user delta. Không đọc lại diagram render, weekly/MOM/PDF/POD trong phiên này; không kế thừa tuyên bố kiểm chứng của phiên trước thành bằng chứng mới.

Hợp đồng API/DTO/event/state: chưa có code hoặc schema baseline; P01 phụ trách. P00 bổ khuyết actor/flow/rule/precondition/exception và dependency; chưa tự chốt DTO hay enum.

## Phạm vi hoàn thành và gate

- Kiểm kê/crosswalk 66 UC nguồn SRS và70 WBS; workbook UC-10 bị bỏ, UC-53 gộp → SRS UC-52/53 cùng WBS37; ba backlog55/56/62 riêng.
- Bổ khuyết v1.0 cho UC bị ảnh hưởng, UC-N01–08, WBS-N01–16, function/owner đề xuất/dependency/delta estimate/mốc; không renumber hoặc ghi Drive.
- Phân loại delta14/10, glossary, 13 nhóm màn cần đối chiếu Figma, negative/permission/race/deadline cases cho gói sau; không báo test runtime pass.
- Ghi mâu thuẫn owner PWA/feedback, FIN-01–08, dual-contact enrollment timing, Staff-close billing/earning, reschedule12h/24h/6h và schedule paymentI3 vs prepayI2.

Tệp tạo: README, `p00-source-crosswalk-v1.md`, `p00-amendments-v1.md`, `p00-decisions-screens-v1.md`, tệp bàn giao này, đều trong `doc/requirements/`. Shared file không sửa; đề xuất integrator sửa source-register locator và chốt owners, P37 đồng bộ version/crosswalk vào nguồn được giao tiếp theo. `.gitkeep` được giữ; không stage tệp của người dùng.

## Kiểm tra

- Parser python-docx/openpyxl đọc trực tiếp nguồn; so tên/mã/effort/owner/deadline và mapping. Kết quả: 66 SRS UC, 66 UC workbook, 70 WBS; 119 pds =115 committed+4 backlog; backlog IDs55/56/62. Manage Account không thành UC mới; checkin/out về WBS37.
- Script audit cục bộ `.codex/p00-check.py`: PASS trên5 tệp cho tên SRS/WBS từng dòng, coverage/mã provisional, hash source, relative links, column counts, UTF-8/LF/trailing whitespace và phép tính ví dụ FIN. Script là công cụ kiểm kê tạm đã ignore, không là test sản phẩm hoặc cấu hình shared.
- `git diff --check` trước stage và `git diff --cached --check`: PASS. Staged list đã kiểm tra: chỉ năm tài liệu P00 được đưa vào commit nội dung; bản cập nhật bàn giao chỉ stage tệp này.
- Unit/integration/build/lint runtime: N/A, frontend/backend chưa có manifest/lockfile/script/app; không có workflow CI cấu hình. Case âm/race/deadline là acceptance requirement, chưa thực thi. UI360px/keyboard/touch chưa test vì không triển khai UI.

## UI và tích hợp thật

UI_NOT_IN_SCOPE. Figma chưa có URL/node/frame/screenshot nên NOT_INSPECTED, không VERIFIED_FIGMA. Font/icon/ảnh không thay đổi; bộ nhận diện frontend/public giữ nguyên.

Database/email/SMS/payOS/private storage chưa kiểm chứng; không có fixture/mock sản phẩm được tạo. Chưa chạy provider, camera/upload, PWA/offline, explain/load/UAT. Không đưa credentials hoặc báo cáo gốc vào Git.

## Dependency mở và bước tiếp theo

P49/P50 có thể dùng inventory và delta để nghiên cứu độc lập; P51 chốt FIN/đổi lịch/settlement/privacy, P01 chốt contracts với phần đã quyết định. P02/P03/P04 chuẩn bị theo owner được ghi nhận; P34 chốt shared ownership/tích hợp. Chưa cho phép gọi toàn flow VERIFIED khi predecessor/provider còn thiếu.

Leader cần ghi nhận owner module và quyết định còn mở trước code; bản đề xuất không tự thay assignment nguồn. P37 áp patch có backup/version khi được giao cập nhật SRS/workbook/diagrams; P00 này giữ bản gốc Drive theo yêu cầu. PR độc lập yêu cầu một thành viên khác Thành approve head mới nhất; Thành merge cuối sau đủ gate.

## Git và danh tính

Author theo chỉ định: Thành; email dùng theo danh tính người dùng cung cấp, không đưa bảng email/cấu hình cục bộ vào repo. Git committer cục bộ hiện là Thành; không thay global/default identity. GitHub API `/user` xác minh tài khoản đang dùng `ngocthanhhx7`. API `/user/emails` trả HTTP404, nên chưa xác minh email author liên kết/verified trên GitHub; không coi đổi email là đổi tài khoản push/PR/review.

Commit nội dung: `53cbf67411ba65fd142eec4e66344f7598ff2e01` — `docs: reconcile P00 sources scope and traceability`; author và committer là Thành. Đã push nhánh. [PR #3](https://github.com/ngocthanhhx7/SEP490_G101_FALL2026/pull/3) vào develop được mở bằng tài khoản `ngocthanhhx7`; API lúc kiểm tra trả state=open, merged=false, reviews=[] trên head commit nội dung.

Bản ghi PR này được commit tiếp theo trên cùng nhánh, không sửa lịch sử commit trước. Bàn giao chat kiểm tra lại reviews/head mới nhất sau push. Chưa có approval độc lập, chưa merge; không tự approve hoặc merge thay thành viên. Bản ổn định lên main cần PR riêng, chưa thực hiện trong P00.
