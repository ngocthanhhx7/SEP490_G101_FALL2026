# P00 — Kiểm kê nguồn và crosswalk v1.0

Ngày kiểm tra: 14/10/2026 (Asia/Saigon). Owner P00: Nguyễn Ngọc Thành, theo chỉ định người dùng trong phiên. Trạng thái tài liệu: draft cục bộ có kiểm chứng nguồn; chưa sửa DOCX/XLSX Drive. Không chứa toàn văn báo cáo hoặc dữ liệu khách hàng.

Nguồn gốc tại `G:/My Drive/SEP490_G101_FALL2026/report/`. Locator tNrM là table/hàng DOCX, không phải trang PDF; rN là hàng Excel 1-based. Hash dưới đây khóa bytes đã đọc, không dùng mtime làm quyết định nghiệp vụ.

| Nguồn | Tệp | Phiên bản/locator | Phạm vi | SHA-256 |
| --- | --- | --- | --- | --- |
| SRC-01 | PWC_Report-1_Project Introduction_1.docx | Change log 08/10; t10 FE-01–20 | Phạm vi một đơn vị, chăm chó/mèo; phần tiền bị delta thay | aa0a5929d8c03558b06f364fd93bdd317fdbd828baca969621be63263de88dfa |
| SRC-02 | PWC_Report-2_Project Management Plan_1.docx | Change log 03/10; t3 | Git/RACI/mốc; tổng 212 pds ở mức báo cáo, khác 119 WBS | a401fdedd1b9bbb50442eed1dec92762170dbb801e1a355e8cb4772fe0d51ec1 |
| SRC-03 | PWC_Report-3_Software Requirement Specification.docx | Change log 09/10 t1r9; t25/t26/t71/t75 | 66 UC hiện hành; đọc 14/10 không biến thành SRS 14/10 | c6fc727e5a88061c23921f5e657ec909600219bf638476f804bdd9bf3f023a1c |
| SRC-04 | PWC_UC_List_Draft.xlsx | Sheet Danh sách UC r5–70; WBS → UC r4–73; nhãn 08/10 | 66 UC cũ: có Manage Account, check-in/out gộp | 5052e9d2857e0915ffd11985ed68b09d2f3b75d1f65e18fecbaa1b4634ffe0ae |
| SRC-05 | PWC_Project_Tracking_1.xlsx | WBS r2–71, G/K/N/Q/R; ghi chú r100–103 | 70 function, 67 committed/3 backlog; owner và lịch là kế hoạch | 586dcacba6930f12c418cca1e124431602e8f7623f9b1dbac65a0cdb4beb81e9 |

SRC-06: quyết định người dùng được tổng hợp trong `doc/implementation-prompts/user-requirements-delta.md`, ngày 14/10; xem bản phân loại độc lập ở [quyết định và màn hình](p00-decisions-screens-v1.md). Không tìm thấy một SRS riêng có change log 14/10 trong thư mục report. Không tuyên bố đã đọc hai bản SRS khác nhau.

Nguồn bổ khuyết: `revised-uc-wbs-plan.md`, `financial-decision-contract.md`, `policy-and-screen-matrix.md`, `execution-map.md` thuộc bộ prompt cục bộ đang chưa commit khi bắt đầu phiên. Nội dung được chuyển thành draft P00 có nguồn, không thay đổi các tệp đó. Figma chưa có URL/node/frame; diagram, weekly/MOM và PDF/POD chưa được kiểm chứng lại trong phiên này. Các nhận xét từ source-register về những nguồn đó là nhận xét của phiên trước.

## Crosswalk 66 UC

Actor lấy từ workbook 08/10 và được giữ như provenance; quyền cuối phải theo SRS t26 và bản bổ khuyết. UC-05 là include của UC-01/02/04, không cần actor người dùng độc lập. Admin kế thừa Staff (GBR-03). Các mã thuộc namespace nguồn cụ thể, không shift theo số đơn thuần.

| SRS 09/10 | Tên | Workbook 08/10 | Actor nguồn | WBS | Lý do | Locator |
| --- | --- | --- | --- | --- | --- | --- |
| UC-01 | Register Account | UC-01 | Guest | 1, 53, 66 | Tên không đổi; mã giữ nguyên | SRS t25r2; UC sheet Danh sách UC r5 |
| UC-02 | Log In | UC-02 | Customer, Pet Sitter, Staff, Admin | 2, 53, 66 | Tên không đổi; mã giữ nguyên | SRS t25r3; UC sheet Danh sách UC r6 |
| UC-03 | Log Out | UC-03 | Customer, Pet Sitter, Staff, Admin | 2 | Tên không đổi; mã giữ nguyên | SRS t25r4; UC sheet Danh sách UC r7 |
| UC-04 | Change Email or Phone Number | UC-04 | Customer, Pet Sitter, Staff, Admin | 3, 53, 66 | Tên không đổi; mã giữ nguyên | SRS t25r5; UC sheet Danh sách UC r8 |
| UC-05 | Verify OTP | UC-05 | — | 53, 66, 70 | Tên không đổi; mã giữ nguyên | SRS t25r6; UC sheet Danh sách UC r9 |
| UC-06 | View Home Page | UC-06 | Guest, Customer | 8 | Tên không đổi; mã giữ nguyên | SRS t25r7; UC sheet Danh sách UC r10 |
| UC-07 | View Service List | UC-07 | Guest, Customer | 9 | Tên không đổi; mã giữ nguyên | SRS t25r8; UC sheet Danh sách UC r11 |
| UC-08 | View Service Details | UC-08 | Guest, Customer | 10 | Tên không đổi; mã giữ nguyên | SRS t25r9; UC sheet Danh sách UC r12 |
| UC-09 | View Service Areas and Policies | UC-09 | Guest, Customer | 11 | Tên không đổi; mã giữ nguyên | SRS t25r10; UC sheet Danh sách UC r13 |
| UC-10 | Manage User Accounts | UC-11 | Admin | 6, 7 | Tên trùng nguồn; đánh lại mã sau bỏ Manage Account | SRS t25r11; UC sheet Danh sách UC r15 |
| UC-11 | Update Customer Profile | UC-12 | Customer | 12 | Tên trùng nguồn; đánh lại mã sau bỏ Manage Account | SRS t25r12; UC sheet Danh sách UC r16 |
| UC-12 | Manage Service Addresses | UC-13 | Customer | 13 | Tên trùng nguồn; đánh lại mã sau bỏ Manage Account | SRS t25r13; UC sheet Danh sách UC r17 |
| UC-13 | View Pet List | UC-14 | Customer | 14 | Tên trùng nguồn; đánh lại mã sau bỏ Manage Account | SRS t25r14; UC sheet Danh sách UC r18 |
| UC-14 | Add Pet Profile | UC-15 | Customer | 15 | Tên trùng nguồn; đánh lại mã sau bỏ Manage Account | SRS t25r15; UC sheet Danh sách UC r19 |
| UC-15 | Update Pet Profile | UC-16 | Customer | 15 | Tên trùng nguồn; đánh lại mã sau bỏ Manage Account | SRS t25r16; UC sheet Danh sách UC r20 |
| UC-16 | Submit Sitter Application | UC-17 | Guest | 16 | Tên trùng nguồn; đánh lại mã sau bỏ Manage Account | SRS t25r17; UC sheet Danh sách UC r21 |
| UC-17 | View Sitter Applications | UC-18 | Admin | 17 | Tên trùng nguồn; đánh lại mã sau bỏ Manage Account | SRS t25r18; UC sheet Danh sách UC r22 |
| UC-18 | Approve or Reject Sitter Application | UC-19 | Admin | 18 | Tên trùng nguồn; đánh lại mã sau bỏ Manage Account | SRS t25r19; UC sheet Danh sách UC r23 |
| UC-19 | Suspend or Reinstate Pet Sitter | UC-20 | Admin | 18 | Tên trùng nguồn; đánh lại mã sau bỏ Manage Account | SRS t25r20; UC sheet Danh sách UC r24 |
| UC-20 | View Sitter Profile | UC-21 | Customer, Staff | 57 | Tên trùng nguồn; đánh lại mã sau bỏ Manage Account | SRS t25r21; UC sheet Danh sách UC r25 |
| UC-21 | Update Sitter Profile | UC-22 | Pet Sitter | 57 | Tên trùng nguồn; đánh lại mã sau bỏ Manage Account | SRS t25r22; UC sheet Danh sách UC r26 |
| UC-22 | View Sitter List | UC-23 | Staff | 58 | Tên trùng nguồn; đánh lại mã sau bỏ Manage Account | SRS t25r23; UC sheet Danh sách UC r27 |
| UC-23 | View Sitter Earnings | UC-24 | Pet Sitter, Admin | 47 | Tên trùng nguồn; đánh lại mã sau bỏ Manage Account | SRS t25r24; UC sheet Danh sách UC r28 |
| UC-24 | Manage Services | UC-25 | Admin | 19 | Tên trùng nguồn; đánh lại mã sau bỏ Manage Account | SRS t25r25; UC sheet Danh sách UC r29 |
| UC-25 | Configure Service Prices | UC-26 | Admin | 20 | Tên trùng nguồn; đánh lại mã sau bỏ Manage Account | SRS t25r26; UC sheet Danh sách UC r30 |
| UC-26 | Configure Booking Policies | UC-27 | Admin | 21 | Tên trùng nguồn; đánh lại mã sau bỏ Manage Account | SRS t25r27; UC sheet Danh sách UC r31 |
| UC-27 | Create Booking | UC-28 | Customer | 24 | Tên trùng nguồn; đánh lại mã sau bỏ Manage Account | SRS t25r28; UC sheet Danh sách UC r32 |
| UC-28 | View My Bookings | UC-29 | Customer | 25 | Tên trùng nguồn; đánh lại mã sau bỏ Manage Account | SRS t25r29; UC sheet Danh sách UC r33 |
| UC-29 | View Booking Details | UC-30 | Customer | 26 | Tên trùng nguồn; đánh lại mã sau bỏ Manage Account | SRS t25r30; UC sheet Danh sách UC r34 |
| UC-30 | View Customer Dashboard | UC-31 | Customer | 67 | Tên trùng nguồn; đánh lại mã sau bỏ Manage Account | SRS t25r31; UC sheet Danh sách UC r35 |
| UC-31 | View Visit Schedule | UC-32 | Customer | 27 | Tên trùng nguồn; đánh lại mã sau bỏ Manage Account | SRS t25r32; UC sheet Danh sách UC r36 |
| UC-32 | Track Visit Status | UC-33 | Customer | 28 | Tên trùng nguồn; đánh lại mã sau bỏ Manage Account | SRS t25r33; UC sheet Danh sách UC r37 |
| UC-33 | Set Working Hours | UC-34 | Pet Sitter | 22 | Tên trùng nguồn; đánh lại mã sau bỏ Manage Account | SRS t25r34; UC sheet Danh sách UC r38 |
| UC-34 | Request Day Off | UC-35 | Pet Sitter | 23 | Tên trùng nguồn; đánh lại mã sau bỏ Manage Account | SRS t25r35; UC sheet Danh sách UC r39 |
| UC-35 | View Unassigned Visits | UC-36 | Staff | 29 | Tên trùng nguồn; đánh lại mã sau bỏ Manage Account | SRS t25r36; UC sheet Danh sách UC r40 |
| UC-36 | Assign Sitter to Visit | UC-37 | Staff | 30 | Tên trùng nguồn; đánh lại mã sau bỏ Manage Account | SRS t25r37; UC sheet Danh sách UC r41 |
| UC-37 | View All Bookings | UC-38 | Staff | 29 | Tên trùng nguồn; đánh lại mã sau bỏ Manage Account | SRS t25r38; UC sheet Danh sách UC r42 |
| UC-38 | Monitor Today's Visits | UC-39 | Staff | 29 | Tên trùng nguồn; đánh lại mã sau bỏ Manage Account | SRS t25r39; UC sheet Danh sách UC r43 |
| UC-39 | View Staff Dashboard | UC-40 | Staff | 69 | Tên trùng nguồn; đánh lại mã sau bỏ Manage Account | SRS t25r40; UC sheet Danh sách UC r44 |
| UC-40 | View My Assignments | UC-41 | Pet Sitter | 31 | Tên trùng nguồn; đánh lại mã sau bỏ Manage Account | SRS t25r41; UC sheet Danh sách UC r45 |
| UC-41 | Accept or Decline Visit Offer | UC-42 | Pet Sitter | 31 | Tên trùng nguồn; đánh lại mã sau bỏ Manage Account | SRS t25r42; UC sheet Danh sách UC r46 |
| UC-42 | View Visit Details | UC-43 | Pet Sitter | 59 | Tên trùng nguồn; đánh lại mã sau bỏ Manage Account | SRS t25r43; UC sheet Danh sách UC r47 |
| UC-43 | View Home Access Notes | UC-44 | Pet Sitter | 59 | Tên trùng nguồn; đánh lại mã sau bỏ Manage Account | SRS t25r44; UC sheet Danh sách UC r48 |
| UC-44 | Withdraw from Visit | UC-45 | Pet Sitter | 60 | Tên trùng nguồn; đánh lại mã sau bỏ Manage Account | SRS t25r45; UC sheet Danh sách UC r49 |
| UC-45 | Reassign Sitter | UC-46 | Staff | 32 | Tên trùng nguồn; đánh lại mã sau bỏ Manage Account | SRS t25r46; UC sheet Danh sách UC r50 |
| UC-46 | View Pet Sitter Dashboard | UC-47 | Pet Sitter | 68 | Tên trùng nguồn; đánh lại mã sau bỏ Manage Account | SRS t25r47; UC sheet Danh sách UC r51 |
| UC-47 | Request Booking Change | UC-48 | Customer | 33 | Tên trùng nguồn; đánh lại mã sau bỏ Manage Account | SRS t25r48; UC sheet Danh sách UC r52 |
| UC-48 | Approve Booking Change | UC-49 | Staff | 33 | Tên trùng nguồn; đánh lại mã sau bỏ Manage Account | SRS t25r49; UC sheet Danh sách UC r53 |
| UC-49 | Cancel Booking or Visit | UC-50 | Customer, Staff | 34 | Tên trùng nguồn; đánh lại mã sau bỏ Manage Account | SRS t25r50; UC sheet Danh sách UC r54 |
| UC-50 | Confirm Care Instructions | UC-51 | Customer | 35 | Tên trùng nguồn; đánh lại mã sau bỏ Manage Account | SRS t25r51; UC sheet Danh sách UC r55 |
| UC-51 | Confirm Handover | UC-52 | Pet Sitter | 36 | Tên trùng nguồn; đánh lại mã sau bỏ Manage Account | SRS t25r52; UC sheet Danh sách UC r56 |
| UC-52 | Check In | UC-53 | Pet Sitter | 37 | Tách hai mục tiêu; cùng WBS 37; change log SRS t1r9 | SRS t25r53; UC sheet Danh sách UC r57 |
| UC-53 | Check Out | UC-53 | Pet Sitter | 37 | Tách hai mục tiêu; cùng WBS 37; change log SRS t1r9 | SRS t25r54; UC sheet Danh sách UC r57 |
| UC-54 | Complete Visit Checklist | UC-54 | Pet Sitter | 38 | Tên không đổi; mã giữ nguyên | SRS t25r55; UC sheet Danh sách UC r58 |
| UC-55 | View Care Report | UC-55 | Customer, Staff | 39 | Tên không đổi; mã giữ nguyên | SRS t25r56; UC sheet Danh sách UC r59 |
| UC-56 | Report Incident | UC-56 | Pet Sitter, Customer | 40 | Tên không đổi; mã giữ nguyên | SRS t25r57; UC sheet Danh sách UC r60 |
| UC-57 | View Incidents | UC-57 | Staff | 41 | Tên không đổi; mã giữ nguyên | SRS t25r58; UC sheet Danh sách UC r61 |
| UC-58 | Resolve Incident | UC-58 | Staff | 42 | Tên không đổi; mã giữ nguyên | SRS t25r59; UC sheet Danh sách UC r62 |
| UC-59 | Pay for Booking | UC-59 | Customer | 43, 44, 45 | Tên không đổi; mã giữ nguyên | SRS t25r60; UC sheet Danh sách UC r63 |
| UC-60 | View Unpaid Bookings | UC-60 | Staff | 65 | Tên không đổi; mã giữ nguyên | SRS t25r61; UC sheet Danh sách UC r64 |
| UC-61 | Process Refund | UC-61 | Admin | 46 | Tên không đổi; mã giữ nguyên | SRS t25r62; UC sheet Danh sách UC r65 |
| UC-62 | Rate Visit | UC-62 | Customer | 48 | Tên không đổi; mã giữ nguyên | SRS t25r63; UC sheet Danh sách UC r66 |
| UC-63 | Submit Complaint | UC-63 | Customer | 49 | Tên không đổi; mã giữ nguyên | SRS t25r64; UC sheet Danh sách UC r67 |
| UC-64 | Handle Complaint | UC-64 | Staff | 50 | Tên không đổi; mã giữ nguyên | SRS t25r65; UC sheet Danh sách UC r68 |
| UC-65 | View Notifications | UC-65 | Customer, Pet Sitter, Staff, Admin | 51 | Tên không đổi; mã giữ nguyên | SRS t25r66; UC sheet Danh sách UC r69 |
| UC-66 | View Admin Dashboard | UC-66 | Admin | 54 | Tên không đổi; mã giữ nguyên | SRS t25r67; UC sheet Danh sách UC r70 |

Workbook UC-10 Manage Account được loại khỏi SRS theo t1r9; Account Settings là màn WBS 4, tên Staff/Sitter chỉ đọc. Customer sửa tên qua UC-11; Admin sửa Staff/Sitter qua UC-10. Không thêm UC thứ 67 từ màn này. Workbook UC-53 gộp được tách thành UC-52/53, cả hai về WBS 37.

## Kiểm kê 70 WBS

K = người viết SRS; Q = code owner kế hoạch; N = IT owner. Các cột này không chứng minh đóng góp hoặc approval. Deadline dưới đây là code cột R; không lẫn với deadline SRS L hoặc IT O. Dòng không có UC được giữ như nền/job, không phát minh UC tương ứng.

| WBS | Function | Workbook UC/job | SRS / loại | pds | SRS K | Code Q | IT N | Iteration | Code deadline R | Locator |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Customer Registration | UC-01 | UC-01 | 1 | Đặng Văn Hải | Đặng Văn Hải | Nguyễn Hữu Anh Nhật | Code Frame | 2026-10-09 | SRC-05 WBS r2; SRC-04 WBS → UC r4 |
| 2 | Login / Logout | UC-02, UC-03 | UC-02, UC-03 | 2 | Đoàn Tiến Đạt | Đoàn Tiến Đạt | Đặng Văn Hải | Code Frame | 2026-10-09 | SRC-05 WBS r3; SRC-04 WBS → UC r5 |
| 3 | Change Email or Phone Number | UC-04 | UC-04 | 1 | Nguyễn Hữu Anh Nhật | Nguyễn Hữu Anh Nhật | Nguyễn Ngọc Thành | Iteration 1 | 2026-10-23 | SRC-05 WBS r4; SRC-04 WBS → UC r6 |
| 4 | Account Settings | UC-10 | SCREEN-ACCOUNT; UC-04/UC-11/UC-10 (liên quan, không UC mới) | 1 | Nguyễn Hữu Anh Nhật | Nguyễn Hữu Anh Nhật | Nguyễn Ngọc Thành | Iteration 1 | 2026-10-23 | SRC-05 WBS r5; SRC-04 WBS → UC r7 |
| 5 | Role-Based Authorization | — | NFR/job; không phải mục tiêu UC độc lập | 3 | Nguyễn Hữu Anh Nhật | Nguyễn Hữu Anh Nhật | Nguyễn Ngọc Thành | Iteration 1 | 2026-10-23 | SRC-05 WBS r6; SRC-04 WBS → UC r8 |
| 6 | User List | UC-11 | UC-10 | 1 | Nguyễn Ngọc Thành | Nguyễn Ngọc Thành | Phạm Thành Chung | Code Frame | 2026-10-09 | SRC-05 WBS r7; SRC-04 WBS → UC r9 |
| 7 | User Details | UC-11 | UC-10 | 2 | Nguyễn Ngọc Thành | Nguyễn Ngọc Thành | Phạm Thành Chung | Code Frame | 2026-10-09 | SRC-05 WBS r8; SRC-04 WBS → UC r10 |
| 8 | Home Page | UC-06 | UC-06 | 2 | Phạm Thành Chung | Phạm Thành Chung | Đoàn Tiến Đạt | Code Frame | 2026-10-09 | SRC-05 WBS r9; SRC-04 WBS → UC r11 |
| 9 | Service List | UC-07 | UC-07 | 1 | Phạm Thành Chung | Phạm Thành Chung | Đoàn Tiến Đạt | Iteration 1 | 2026-10-23 | SRC-05 WBS r10; SRC-04 WBS → UC r12 |
| 10 | Service Details | UC-08 | UC-08 | 2 | Phạm Thành Chung | Phạm Thành Chung | Đoàn Tiến Đạt | Iteration 1 | 2026-10-23 | SRC-05 WBS r11; SRC-04 WBS → UC r13 |
| 11 | Service Areas and Policies | UC-09 | UC-09 | 1 | Phạm Thành Chung | Phạm Thành Chung | Đoàn Tiến Đạt | Iteration 1 | 2026-10-23 | SRC-05 WBS r12; SRC-04 WBS → UC r14 |
| 12 | Customer Profile | UC-12 | UC-11 | 2 | Đoàn Tiến Đạt | Đoàn Tiến Đạt | Đặng Văn Hải | Code Frame | 2026-10-09 | SRC-05 WBS r13; SRC-04 WBS → UC r15 |
| 13 | Service Addresses and Home Access | UC-13 | UC-12 | 2 | Đoàn Tiến Đạt | Đoàn Tiến Đạt | Đặng Văn Hải | Iteration 1 | 2026-10-23 | SRC-05 WBS r14; SRC-04 WBS → UC r16 |
| 14 | Pet List | UC-14 | UC-13 | 1 | Nguyễn Ngọc Thành | Nguyễn Ngọc Thành | Phạm Thành Chung | Iteration 1 | 2026-10-23 | SRC-05 WBS r15; SRC-04 WBS → UC r17 |
| 15 | Pet Details | UC-15, UC-16 | UC-14, UC-15 | 3 | Đoàn Tiến Đạt | Đoàn Tiến Đạt | Đặng Văn Hải | Iteration 1 | 2026-10-23 | SRC-05 WBS r16; SRC-04 WBS → UC r18 |
| 16 | Pet Sitter Application Form | UC-17 | UC-16 | 3 | Đặng Văn Hải | Đặng Văn Hải | Nguyễn Hữu Anh Nhật | Iteration 1 | 2026-10-23 | SRC-05 WBS r17; SRC-04 WBS → UC r19 |
| 17 | Pet Sitter Application List | UC-18 | UC-17 | 1 | Nguyễn Hữu Anh Nhật | Nguyễn Hữu Anh Nhật | Nguyễn Ngọc Thành | Iteration 1 | 2026-10-23 | SRC-05 WBS r18; SRC-04 WBS → UC r20 |
| 18 | Pet Sitter Application Review | UC-19, UC-20 | UC-18, UC-19 | 2 | Đoàn Tiến Đạt | Đoàn Tiến Đạt | Đặng Văn Hải | Iteration 1 | 2026-10-23 | SRC-05 WBS r19; SRC-04 WBS → UC r21 |
| 19 | Service Management | UC-25 | UC-24 | 2 | Nguyễn Ngọc Thành | Nguyễn Ngọc Thành | Phạm Thành Chung | Iteration 1 | 2026-10-23 | SRC-05 WBS r20; SRC-04 WBS → UC r22 |
| 20 | Service Price Configuration | UC-26 | UC-25 | 3 | Đặng Văn Hải | Đặng Văn Hải | Nguyễn Hữu Anh Nhật | Iteration 1 | 2026-10-23 | SRC-05 WBS r21; SRC-04 WBS → UC r23 |
| 21 | System Settings | UC-27 | UC-26 | 2 | Nguyễn Ngọc Thành | Nguyễn Ngọc Thành | Phạm Thành Chung | Iteration 1 | 2026-10-23 | SRC-05 WBS r22; SRC-04 WBS → UC r24 |
| 22 | Working Hours Calendar | UC-34 | UC-33 | 2 | Phạm Thành Chung | Phạm Thành Chung | Đoàn Tiến Đạt | Iteration 1 | 2026-10-23 | SRC-05 WBS r23; SRC-04 WBS → UC r25 |
| 23 | Day Off Request | UC-35 | UC-34 | 1 | Đoàn Tiến Đạt | Đoàn Tiến Đạt | Đặng Văn Hải | Iteration 3 | 2026-11-20 | SRC-05 WBS r24; SRC-04 WBS → UC r26 |
| 24 | Create Booking | UC-28 | UC-27 | 4 | Phạm Thành Chung | Phạm Thành Chung | Đoàn Tiến Đạt | Iteration 2 | 2026-11-06 | SRC-05 WBS r25; SRC-04 WBS → UC r27 |
| 25 | Booking List | UC-29 | UC-28 | 1 | Đoàn Tiến Đạt | Đoàn Tiến Đạt | Đặng Văn Hải | Iteration 2 | 2026-11-06 | SRC-05 WBS r26; SRC-04 WBS → UC r28 |
| 26 | Booking Details | UC-30 | UC-29 | 2 | Nguyễn Hữu Anh Nhật | Nguyễn Hữu Anh Nhật | Nguyễn Ngọc Thành | Iteration 2 | 2026-11-06 | SRC-05 WBS r27; SRC-04 WBS → UC r29 |
| 27 | Visit Schedule | UC-32 | UC-31 | 2 | Đoàn Tiến Đạt | Đoàn Tiến Đạt | Đặng Văn Hải | Iteration 2 | 2026-11-06 | SRC-05 WBS r28; SRC-04 WBS → UC r30 |
| 28 | Visit Status Tracker | UC-33 | UC-32 | 2 | Nguyễn Hữu Anh Nhật | Nguyễn Hữu Anh Nhật | Nguyễn Ngọc Thành | Iteration 2 | 2026-11-06 | SRC-05 WBS r29; SRC-04 WBS → UC r31 |
| 29 | Visit Board | UC-36, UC-38, UC-39 | UC-35, UC-37, UC-38 | 3 | Nguyễn Hữu Anh Nhật | Nguyễn Hữu Anh Nhật | Nguyễn Ngọc Thành | Iteration 2 | 2026-11-06 | SRC-05 WBS r30; SRC-04 WBS → UC r32 |
| 30 | Assign Pet Sitter | UC-37 | UC-36 | 3 | Đặng Văn Hải | Đặng Văn Hải | Nguyễn Hữu Anh Nhật | Iteration 2 | 2026-11-06 | SRC-05 WBS r31; SRC-04 WBS → UC r33 |
| 31 | My Assignments | UC-41, UC-42 | UC-40, UC-41 | 2 | Đoàn Tiến Đạt | Đoàn Tiến Đạt | Đặng Văn Hải | Iteration 2 | 2026-11-06 | SRC-05 WBS r32; SRC-04 WBS → UC r34 |
| 32 | Reassign Pet Sitter | UC-46 | UC-45 | 2 | Đoàn Tiến Đạt | Đoàn Tiến Đạt | Đặng Văn Hải | Iteration 2 | 2026-11-06 | SRC-05 WBS r33; SRC-04 WBS → UC r35 |
| 33 | Request Booking Change | UC-48, UC-49 | UC-47, UC-48 | 2 | Nguyễn Hữu Anh Nhật | Nguyễn Hữu Anh Nhật | Nguyễn Ngọc Thành | Iteration 3 | 2026-11-20 | SRC-05 WBS r34; SRC-04 WBS → UC r36 |
| 34 | Cancel Booking / Visit | UC-50 | UC-49 | 2 | Nguyễn Ngọc Thành | Nguyễn Ngọc Thành | Phạm Thành Chung | Iteration 3 | 2026-11-20 | SRC-05 WBS r35; SRC-04 WBS → UC r37 |
| 35 | Visit Care Instructions | UC-51 | UC-50 | 2 | Phạm Thành Chung | Phạm Thành Chung | Đoàn Tiến Đạt | Iteration 2 | 2026-11-06 | SRC-05 WBS r36; SRC-04 WBS → UC r38 |
| 36 | Handover Confirmation | UC-52 | UC-51 | 1 | Nguyễn Ngọc Thành | Nguyễn Ngọc Thành | Phạm Thành Chung | Iteration 2 | 2026-11-06 | SRC-05 WBS r37; SRC-04 WBS → UC r39 |
| 37 | Visit Check-in / Check-out | UC-53 | UC-52, UC-53 | 2 | Đặng Văn Hải | Đặng Văn Hải | Nguyễn Hữu Anh Nhật | Iteration 2 | 2026-11-06 | SRC-05 WBS r38; SRC-04 WBS → UC r40 |
| 38 | Visit Checklist and Photos | UC-54 | UC-54 | 3 | Nguyễn Ngọc Thành | Nguyễn Ngọc Thành | Phạm Thành Chung | Iteration 2 | 2026-11-06 | SRC-05 WBS r39; SRC-04 WBS → UC r41 |
| 39 | Care Report | UC-55 | UC-55 | 1 | Nguyễn Ngọc Thành | Nguyễn Ngọc Thành | Phạm Thành Chung | Iteration 2 | 2026-11-06 | SRC-05 WBS r40; SRC-04 WBS → UC r42 |
| 40 | Report Incident | UC-56 | UC-56 | 2 | Đoàn Tiến Đạt | Đoàn Tiến Đạt | Đặng Văn Hải | Iteration 3 | 2026-11-20 | SRC-05 WBS r41; SRC-04 WBS → UC r43 |
| 41 | Incident List | UC-57 | UC-57 | 1 | Đoàn Tiến Đạt | Đoàn Tiến Đạt | Đặng Văn Hải | Iteration 3 | 2026-11-20 | SRC-05 WBS r42; SRC-04 WBS → UC r44 |
| 42 | Incident Details and Resolution | UC-58 | UC-58 | 2 | Đoàn Tiến Đạt | Đoàn Tiến Đạt | Đặng Văn Hải | Iteration 3 | 2026-11-20 | SRC-05 WBS r43; SRC-04 WBS → UC r45 |
| 43 | Booking Payment | UC-59 | UC-59 | 2 | Phạm Thành Chung | Phạm Thành Chung | Đoàn Tiến Đạt | Iteration 3 | 2026-11-20 | SRC-05 WBS r44; SRC-04 WBS → UC r46 |
| 44 | Payment Gateway Integration (payOS) | UC-59 | UC-59 | 3 | Đặng Văn Hải | Đặng Văn Hải | Nguyễn Hữu Anh Nhật | Iteration 3 | 2026-11-20 | SRC-05 WBS r45; SRC-04 WBS → UC r47 |
| 45 | Payment Result Webhook | UC-59 | UC-59 | 3 | Đặng Văn Hải | Đặng Văn Hải | Nguyễn Hữu Anh Nhật | Iteration 3 | 2026-11-20 | SRC-05 WBS r46; SRC-04 WBS → UC r48 |
| 46 | Refund Processing | UC-61 | UC-61 | 2 | Nguyễn Ngọc Thành | Nguyễn Ngọc Thành | Phạm Thành Chung | Iteration 3 | 2026-11-20 | SRC-05 WBS r47; SRC-04 WBS → UC r49 |
| 47 | Pet Sitter Earnings | UC-24 | UC-23 | 1 | Phạm Thành Chung | Phạm Thành Chung | Đoàn Tiến Đạt | Iteration 3 | 2026-11-20 | SRC-05 WBS r48; SRC-04 WBS → UC r50 |
| 48 | Rate Visit | UC-62 | UC-62 | 1 | Phạm Thành Chung | Phạm Thành Chung | Đoàn Tiến Đạt | Iteration 3 | 2026-11-20 | SRC-05 WBS r49; SRC-04 WBS → UC r51 |
| 49 | Submit Complaint | UC-63 | UC-63 | 1 | Nguyễn Hữu Anh Nhật | Nguyễn Hữu Anh Nhật | Nguyễn Ngọc Thành | Iteration 3 | 2026-11-20 | SRC-05 WBS r50; SRC-04 WBS → UC r52 |
| 50 | Complaint Management | UC-64 | UC-64 | 2 | Nguyễn Hữu Anh Nhật | Nguyễn Hữu Anh Nhật | Nguyễn Ngọc Thành | Iteration 3 | 2026-11-20 | SRC-05 WBS r51; SRC-04 WBS → UC r53 |
| 51 | Notification Center | UC-65 | UC-65 | 1 | Nguyễn Hữu Anh Nhật | Nguyễn Hữu Anh Nhật | Nguyễn Ngọc Thành | Iteration 3 | 2026-11-20 | SRC-05 WBS r52; SRC-04 WBS → UC r54 |
| 52 | Visit Reminder Job | JOB-01 | NFR/job; không phải mục tiêu UC độc lập | 1 | Nguyễn Hữu Anh Nhật | Nguyễn Hữu Anh Nhật | Nguyễn Ngọc Thành | Iteration 3 | 2026-11-20 | SRC-05 WBS r53; SRC-04 WBS → UC r55 |
| 53 | Email Service Integration | UC-01, UC-02, UC-04, UC-05 | UC-01, UC-02, UC-04, UC-05 | 1 | Phạm Thành Chung | Phạm Thành Chung | Đoàn Tiến Đạt | Iteration 1 | 2026-10-23 | SRC-05 WBS r54; SRC-04 WBS → UC r56 |
| 54 | Admin Dashboard | UC-66 | UC-66 | 2 | Nguyễn Ngọc Thành | Nguyễn Ngọc Thành | Phạm Thành Chung | Iteration 3 | 2026-11-20 | SRC-05 WBS r55; SRC-04 WBS → UC r57 |
| 55 | Operational & Financial Reports | Backlog | BACKLOG; không tạo UC mới | 2 | Phạm Thành Chung | Phạm Thành Chung | Đoàn Tiến Đạt | Backlog | — | SRC-05 WBS r56; SRC-04 WBS → UC r58 |
| 56 | Audit Log | Backlog | BACKLOG; không tạo UC mới | 1 | Phạm Thành Chung | Phạm Thành Chung | Đoàn Tiến Đạt | Backlog | — | SRC-05 WBS r57; SRC-04 WBS → UC r59 |
| 57 | Pet Sitter Profile | UC-21, UC-22 | UC-20, UC-21 | 1 | Phạm Thành Chung | Phạm Thành Chung | Đoàn Tiến Đạt | Iteration 3 | 2026-11-20 | SRC-05 WBS r58; SRC-04 WBS → UC r60 |
| 58 | Pet Sitter List | UC-23 | UC-22 | 1 | Nguyễn Hữu Anh Nhật | Nguyễn Hữu Anh Nhật | Nguyễn Ngọc Thành | Iteration 3 | 2026-11-20 | SRC-05 WBS r59; SRC-04 WBS → UC r61 |
| 59 | Visit Details (Pet Sitter) | UC-43, UC-44 | UC-42, UC-43 | 1 | Đoàn Tiến Đạt | Đoàn Tiến Đạt | Đặng Văn Hải | Iteration 2 | 2026-11-06 | SRC-05 WBS r60; SRC-04 WBS → UC r62 |
| 60 | Withdraw from Visit | UC-45 | UC-44 | 1 | Đoàn Tiến Đạt | Đoàn Tiến Đạt | Đặng Văn Hải | Iteration 3 | 2026-11-20 | SRC-05 WBS r61; SRC-04 WBS → UC r63 |
| 61 | Offer Expiry Job | JOB-02 | NFR/job; không phải mục tiêu UC độc lập | 1 | Phạm Thành Chung | Phạm Thành Chung | Đoàn Tiến Đạt | Iteration 2 | 2026-11-06 | SRC-05 WBS r62; SRC-04 WBS → UC r64 |
| 62 | Late Visit Alert | Backlog | BACKLOG; không tạo UC mới | 1 | Phạm Thành Chung | Phạm Thành Chung | Đoàn Tiến Đạt | Backlog | — | SRC-05 WBS r63; SRC-04 WBS → UC r65 |
| 63 | Auto Assignment Job | JOB-02 | NFR/job; không phải mục tiêu UC độc lập | 2 | Đặng Văn Hải | Đặng Văn Hải | Nguyễn Hữu Anh Nhật | Iteration 2 | 2026-11-06 | SRC-05 WBS r64; SRC-04 WBS → UC r66 |
| 64 | Payment Reminder & Overdue Job | JOB-03 | NFR/job; không phải mục tiêu UC độc lập | 1 | Đặng Văn Hải | Đặng Văn Hải | Nguyễn Hữu Anh Nhật | Iteration 3 | 2026-11-20 | SRC-05 WBS r65; SRC-04 WBS → UC r67 |
| 65 | Unpaid Bookings | UC-60 | UC-60 | 1 | Nguyễn Ngọc Thành | Nguyễn Ngọc Thành | Phạm Thành Chung | Iteration 3 | 2026-11-20 | SRC-05 WBS r66; SRC-04 WBS → UC r68 |
| 66 | SMS OTP Integration | UC-01, UC-02, UC-04, UC-05 | UC-01, UC-02, UC-04, UC-05 | 2 | Nguyễn Ngọc Thành | Nguyễn Ngọc Thành | Phạm Thành Chung | Iteration 1 | 2026-10-23 | SRC-05 WBS r67; SRC-04 WBS → UC r69 |
| 67 | Customer Dashboard | UC-31 | UC-30 | 1 | Phạm Thành Chung | Phạm Thành Chung | Đoàn Tiến Đạt | Iteration 3 | 2026-11-20 | SRC-05 WBS r68; SRC-04 WBS → UC r70 |
| 68 | Pet Sitter Dashboard | UC-47 | UC-46 | 1 | Phạm Thành Chung | Phạm Thành Chung | Đoàn Tiến Đạt | Iteration 3 | 2026-11-20 | SRC-05 WBS r69; SRC-04 WBS → UC r71 |
| 69 | Staff Dashboard | UC-40 | UC-39 | 1 | Nguyễn Ngọc Thành | Nguyễn Ngọc Thành | Phạm Thành Chung | Iteration 3 | 2026-11-20 | SRC-05 WBS r70; SRC-04 WBS → UC r72 |
| 70 | OTP Verification | UC-05 | UC-05 | 1 | Nguyễn Hữu Anh Nhật | Nguyễn Hữu Anh Nhật | Nguyễn Ngọc Thành | Code Frame | 2026-10-09 | SRC-05 WBS r71; SRC-04 WBS → UC r73 |

Kiểm kê: 66 UC hiện hành; 66 UC workbook; 70 WBS; 67 committed + 3 backlog. Tổng G2:G71 = 119 pds; backlog #55/#56/#62 = 4 pds; committed = 115 pds. Source note r100: Code Frame 11 + Iterations 104 = 115; không lấy 212 pds Report 2 làm tổng của WBS mới. Không cộng các pds chia giữa UC để đếm effort hai lần.

WBS 62 hoãn job thông báo riêng; UC-38/GBR-16/29 vẫn yêu cầu board đỏ ở +15 phút và Needs action ở +30 phút. Không dùng backlog này để xóa cảnh báo vận hành hiện hành. WBS 55 báo cáo vận hành/tài chính, 56 audit UI là backlog; bảo vệ quyền/idempotency/evidence không trở thành tùy chọn vì backlog.

Không có JS/JSX/TS/TSX/JSON ứng dụng trong frontend/backend và không có manifest/lockfile/runtime/CI. Ghi chú WBS “Built in code frame” khác bằng chứng code trong checkout: implementation chưa kiểm chứng. Không chạy npm test/build khi chưa tồn tại script.

Bản sửa và provisional IDs: [bổ khuyết v1](p00-amendments-v1.md). Màn/thuật ngữ/điểm mở: [quyết định v1](p00-decisions-screens-v1.md). Kết quả phiên: [bàn giao](p00-handoff.md).
