# Bàn giao P51-A — 14/10/2026

Pxx/task/WBS: P51-A, EXT-FINANCIAL, hợp đồng financial cancellation và settlement. Đây là phạm vi nền được giao riêng, không tự gán thành dòng WBS nguồn. Contributor/author/committer được ủy quyền: Nguyễn Hữu Anh Nhật; push/PR account dự kiến đã xác minh anhnhat432. Reviewer được giao Đoàn Tiến Đạt (doantd11), thay Hải theo chỉ định người dùng; merge cuối Nguyễn Ngọc Thành (ngocthanhhx7). Không coi IT owner downstream là approval GitHub.

Branch: feature/p51-a-financial-cancellation-and-settlement-contracts. Worktree: D:/WW/SEP490_G101_FALL2026-p51-a. Base origin/develop: 0c19ba04dccd55670da3c134befb7ca14c23e5d8; dependency P00/PR3 và P49/PR4 đã merged qua GitHub API tại phiên này. P50/PR5 cũng merged trước base. Checkout chính có README đang sửa được giữ nguyên; không reset/clean/switch.

## Phạm vi và nguồn

Đã đọc bộ prompt P51/master, FIN, delta14/10, role map, revised plan, source register, scope coverage, execution map/order, Figma/brand và session template cục bộ; P00 decisions/crosswalk và P49 benchmark đã theo dõi trong Git. Không đọc lại báo cáo Drive, web Rover hoặc source HouseBuddy trong phiên P51; dùng phân tích có provenance của predecessor, không tuyên bố đã xác minh nguồn mới. Không sửa Drive hoặc legacy code.

UC liên quan dùng hệ SRS09/10: UC23 earnings (workbook24), UC27 booking (28), UC44 withdrawal (45), UC47/48 change (48/49), UC49 cancel (50), UC59/60/61 payment/unpaid/refund (59/60/61); UC-N04–06 và WBS-N05–07 là provisional settlement/payroll. WBS nguồn24/33/34/43–47/60/64/65 là nơi tiêu thụ hợp đồng, không đổi contributor của các module đó.

Người dùng ngày14/10 duyệt phương án FIN-01–08 đã trình, kèm “chi tiết còn thiếu chờ chốt”. [Hợp đồng v1.0](p51-financial-contract-v1.md) ghi chính xác phần duyệt và các decision IDs còn mở. API/enums/schema/atomic strategy là proposal cho P01; không tạo DTO runtime hoặc config trả thành công giả.

Tệp trong phạm vi:

- doc/requirements/p51-financial-contract-v1.md và p51-handoff.md; README requirements thêm mục lục.
- doc/api/p51-financial-api-v1.md và README: quyền, commands, errors, events,24 acceptance cases chưa chạy runtime.
- doc/database/p51-financial-ledger-v1.md và README: snapshots, VND, ledger, quota và earning reservations.
- Bỏ .gitkeep của api/database khi có nội dung thực được stage. Không stage prompts, auth helper hoặc script audit cục bộ.

## Trạng thái và gate

DOCUMENT_CONTRACT_READY_WITH_OPEN_DECISIONS; VERIFIED chỉ áp dụng checks tài liệu sau khi audit đạt. MONEY_IMPLEMENTATION = BLOCKED_BY_DECISION; RUNTIME = INTEGRATION_PENDING. FIN-01-TIME, FIN-02-ALLOC/ROUND, FIN-04, FIN-05-DELTA, FIN-06-CAUSE, FIN-07-ELIG/POSTPAY và FIN-08-EDIT do Leader/nhóm chốt. Không gọi hợp đồng tiền đã đóng toàn bộ hoặc code đã hoàn tất.

P01 có thể chuẩn hóa DTO/state/error/ports và phần quy tắc đã xác nhận. P17/P45 chỉ publish policy đã chốt; P19/P21/P42 dùng các gate payment/confirmation/assignment riêng; P25/P31/P32/P41 bổ sung implementation và acceptance khi decision/provider/runtime sẵn sàng. P34 áp shared wiring; P37 đồng bộ SRS/workbook có version khi được giao. Không triển khai các gói khác trong P51.

## Kiểm tra và giới hạn

Audit tài liệu cục bộ: node D:/WW/SEP490_G101_FALL2026/.codex/p51-check.cjs → PASS_DOCUMENT_AUDIT:7 Markdown,22 relative links,9 bảng đúng số cột, UTF-8/LF/newline/whitespace;24 AC IDs và9 decision IDs. Kiểm tra phép tính fixture900.000/30%,4 conservation examples và ranh giới tuần VN/năm mới bằng công cụ tính độc lập đạt. Đây không là test implementation.

git diff --check và git diff --cached --check trước commit; staged list chỉ tài liệu nêu trên và xóa hai placeholder. Rà soát nội dung về approval phạm vi, completed visits, cause, late callback, double billing/refund, earning reserve xuyên tuần và rejected quota. Case AC-01–24 là NOT_RUN_RUNTIME; không đánh dấu unit/integration/build/CI pass.

Unit/integration/build/lint runtime: N/A vì frontend/backend không có manifest, lockfile, app hoặc configured scripts; không có workflow CI cấu hình. DB/payOS/bank transfer/refund/storage chưa kiểm chứng; không tạo fixture sản phẩm hoặc gọi provider. Race/deadline/auth là acceptance yêu cầu cho implementation sau.

UI_NOT_IN_SCOPE; Figma NOT_INSPECTED, chưa có frame/screenshot;360px/keyboard/touch chưa chạy. Logo/font/assets không thay đổi. Không giả server ack, Paid, approval thủ công hoặc tích hợp bank.

## Git và review

Tại thời điểm soạn nội dung, chưa tạo commit/PR/approval/merge; các mốc xuất bản được xác minh sau checks và ghi ở PR cùng bàn giao cuối phiên. Author/committer phải là Nhật qua helper; review thật nội dung head mới nhất bằng phiên Đạt đã xác minh; Thành chỉ merge bản tài liệu sau approval, kiểm tra branch/checks/conversations và dependency. Merge tài liệu có gate còn mở không là phê duyệt chi tiết tiền còn thiếu. Không force push, direct push develop hoặc bypass protection.
