# P37-A — Đồng bộ SRS và use case v1.0

**Ngày kiểm tra:** 15/10/2026 (Asia/Saigon)
**Phạm vi:** SRS 09/10, crosswalk UC/WBS 08/10, delta người dùng 14/10, mã nguồn và test đang có trong workspace.
**Trạng thái:** bản đồng bộ cục bộ để review; chưa ghi đè DOCX/XLSX trên Drive.

Tài liệu này làm rõ ba trạng thái khác nhau: `LOCAL_TESTED` nghĩa là mã hoặc adapter có test cục bộ đạt; `PARTIAL` nghĩa là đã có một phần mã/test nhưng còn route, provider, UI hoặc hợp đồng tích hợp; `CONTRACT_ONLY` nghĩa là mới có quyết định hoặc hợp đồng; `NOT_FOUND` nghĩa là chưa tìm thấy bằng chứng trong workspace. Không trạng thái nào tự chứng minh production đã sẵn sàng.

## Nguồn và quy tắc mã

- [P00 source crosswalk](p00-source-crosswalk-v1.md) là nguồn mapping 66 UC SRS 09/10 sang workbook 08/10 và WBS.
- [P00 amendments](p00-amendments-v1.md) và [P00 decisions/screens](p00-decisions-screens-v1.md) chứa delta, UC-N và EXT; UC-N/WBS-N là mã draft, không phải số lượng bắt buộc.
- [P01 domain/API contracts](../architecture/p01-domain-contract-v1.md) và [P51 financial contract](p51-financial-contract-v1.md) là boundary kỹ thuật. FIN-01…08 và các quyết định còn mở không được biến thành hành vi ngầm.
- `backend/src/app.js` hiện chỉ đăng ký health, public policy, auth (khi bật), customer profile, application status và user admin. Các module booking, care, incident, review, complaint, refund, address, board và directed proposal hiện là export để P34 wiring.
- Các file không commit và các fixture chỉ chứng minh nội dung đang có trong workspace; chúng không được gọi là đã merge hoặc đã tích hợp.

## Baseline nghiệp vụ đồng bộ

1. OTP là cơ chế đăng nhập; không đưa password flow vào SRS. Đăng ký bắt đầu với một contact, việc link/xác minh contact thứ hai vẫn là dependency của P06–P09.
2. Một booking có một service, một hoặc nhiều pet và một hoặc nhiều visit; giá, policy, địa chỉ và hướng dẫn được snapshot.
3. Một visit có thể postpay; booking nhiều visit phải prepay. `Paid`, `Offer accepted`, `Assigned` và Customer-confirmed directed proposal là các trạng thái riêng.
4. Cutoff tự hủy/rút là **ít nhất 1 giờ theo server clock**. Mốc reschedule 12 giờ/slot mới 24 giờ/expiry 6 giờ vẫn là quyết định mở FIN-04, không được thay bằng cutoff hủy.
5. Hủy phần visit đã prepay mà không reschedule giữ 30% phần bị hủy. Cơ sở phân bổ, làm tròn, discount và phần đã thực hiện vẫn cần P51 chốt.
6. Sitter tối đa một settlement request mỗi tuần Thứ Hai–Chủ nhật theo giờ Việt Nam; approved, transfer recorded và paid không đồng nghĩa nhau.
7. Sitter được đánh giá Customer và xem complaint liên quan. Quyền Sitter tạo complaint, cửa sổ, moderation và phản hồi chưa được chốt.
8. Public policy phải xem được trước consent; draft, future, expired hoặc mơ hồ phải fail closed. PWA chỉ cache app shell công khai, không cache PII, access notes, ID, ảnh riêng tư hoặc payment state.

## Crosswalk 66 UC → implementation và bằng chứng

`Code/API` trỏ tới nguồn hiện có; `Test/UI` trỏ tới test hoặc màn hình có trong workspace. `PENDING` trong status là gate tích hợp, không phải lỗi test cục bộ.

| SRS UC | Tên / actor | WBS | Code/API | Test/UI | Status | Policy / EXT |
| --- | --- | --- | --- | --- | --- | --- |
| UC-01 | Register Account / Guest | 1 | `auth.routes.js`, registration service | `customer-registration.test.js`, `CustomerRegistrationPage` | LOCAL_TESTED / PENDING provider | P06–P09, EXT-26 |
| UC-02 | Log In / Customer, Sitter, Staff, Admin | 2 | `auth.routes.js`, session service | `auth.routes.test.js`, `SignInPage` | LOCAL_TESTED / PENDING OTP UI | P06–P09, EXT-26 |
| UC-03 | Log Out / registered roles | 2 | session revoke route | `auth.routes.test.js`, account shell | LOCAL_TESTED / PENDING CSRF rehydrate | P06–P09 |
| UC-04 | Change Email or Phone / registered roles | 3 | contact-change routes/services | auth/contact unit tests, account settings page | LOCAL_TESTED / PENDING second-contact decision | P09, EXT-26 |
| UC-05 | Verify OTP / include | 5, 53, 66, 70 | OTP challenge/verification routes | OTP/auth integration tests | LOCAL_TESTED / PENDING live channel | P06, EXT-26 |
| UC-06 | View Home Page / Guest, Customer | 8 | public frontend route | `PublicHome.test.jsx`, `HomePage` | LOCAL_TESTED | P13 |
| UC-07 | View Service List / Guest, Customer | 9 | public catalog adapter | `PublicServicePages.test.jsx` | LOCAL_TESTED | P13 |
| UC-08 | View Service Details / Guest, Customer | 10 | service detail adapter | `PublicServicePages.test.jsx` | LOCAL_TESTED | P13 |
| UC-09 | View Service Areas and Policies / Guest, Customer | 11 | public policy route/module | `PublicPolicies.test.jsx`, policy pages | LOCAL_TESTED / PENDING approved source | P13/P45, EXT-08/22 |
| UC-10 | Manage User Accounts / Admin | 6, 7 | `user-admin.routes.js` | `AdminUsersPage.test.jsx`, user service tests | LOCAL_TESTED / PENDING runtime auth config | P10 |
| UC-11 | Update Customer Profile / Customer | 12 | `customer-profile.routes.js` | `CustomerProfilePage.test.jsx`, integration test | LOCAL_TESTED | P14 |
| UC-12 | Manage Service Addresses / Customer | 13 | `customer-address.routes.js` | address unit/integration tests | PARTIAL / export-only route | P14 |
| UC-13 | View Pet List / Customer | 14 | pet list service/API | `PetListPage.test.jsx`, pet service tests | PARTIAL / route pending | P15/P50, EXT-27 |
| UC-14 | Add Pet Profile / Customer | 15 | pet profile adapter | `PetDetailsPage.test.jsx`, API tests | PARTIAL / care fields pending | P15/P50, EXT-27 |
| UC-15 | Update Pet Profile / Customer | 15 | pet profile adapter | pet detail/API tests | PARTIAL / snapshot pending | P15/P50, EXT-27 |
| UC-16 | Submit Sitter Application / Guest | 16 | `sitter-application.routes.js` | application page/integration tests | PARTIAL / export-only route | P16/P46, EXT-24/25 |
| UC-17 | View Sitter Applications / Admin | 17 | application list service/route | `SitterApplicationsPage.test.jsx` | PARTIAL / export-only route | P16 |
| UC-18 | Approve or Reject Application / Admin | 18 | application decision service | review page tests, application integration | PARTIAL / media/provider pending | P16/P46 |
| UC-19 | Suspend or Reinstate Sitter / Admin | 18 | sitter-status command | application review tests | PARTIAL / offer guard wiring pending | P16 |
| UC-20 | View Sitter Profile / Customer, Staff | 57 | no registered profile module | no dedicated page/test | NOT_FOUND | P28 |
| UC-21 | Update Sitter Profile / Sitter | 57 | no registered profile module | no dedicated page/test | NOT_FOUND | P28 |
| UC-22 | View Sitter List / Staff | 58 | no registered list module | no dedicated page/test | NOT_FOUND | P28 |
| UC-23 | View Sitter Earnings / Sitter, Admin | 47 | ledger contract only | no settlement runtime test | CONTRACT_ONLY | P28/P41, EXT-06/18 |
| UC-24 | Manage Services / Admin | 19 | `service-catalog.routes.js` | service page/integration tests | PARTIAL / export-only route | P17 |
| UC-25 | Configure Service Prices / Admin | 20 | `service-price.routes.js` | price page/integration tests | PARTIAL / export-only route | P17 |
| UC-26 | Configure Booking Policies / Admin | 21 | service policy/version models | system-settings tests | PARTIAL / booking consumer pending | P17, EXT-01/02/08 |
| UC-27 | Create Booking / Customer | 24 | booking contract; directed proposal adapter | booking page adapters/tests | CONTRACT_ONLY / creation integration pending | P19/P42, EXT-01/02/11/20 |
| UC-28 | View My Bookings / Customer | 25 | `booking-read.service.js` | booking read API/page tests | PARTIAL / export-only route | P20 |
| UC-29 | View Booking Details / Customer | 26 | booking read service | booking detail tests | PARTIAL / export-only route | P20 |
| UC-30 | View Customer Dashboard / Customer | 67 | role shell only | no dashboard data test | CONTRACT_ONLY | P28, EXT-09 |
| UC-31 | View Visit Schedule / Customer | 27 | booking/visit contract | no registered schedule page | CONTRACT_ONLY | P20 |
| UC-32 | Track Visit Status / Customer | 28 | read DTO field in booking contract | booking detail tests | PARTIAL / route pending | P20 |
| UC-33 | Set Working Hours / Sitter | 22 | availability service | `SitterAvailabilityPage.test.jsx`, service tests | PARTIAL / route pending | P18 |
| UC-34 | Request Day Off / Sitter | 23 | day-off service | day-off panel tests | PARTIAL / route pending | P18 |
| UC-35 | View Unassigned Visits / Staff | 29 | `visit-board.service.js` | board service/route tests | PARTIAL / export-only route | P22 |
| UC-36 | Assign Sitter to Visit / Staff | 30 | dispatch/visit board services | dispatch and board tests | PARTIAL / booking repository pending | P21, EXT-11/20 |
| UC-37 | View All Bookings / Staff | 29 | visit board read projection | staff board tests | PARTIAL / export-only route | P22 |
| UC-38 | Monitor Today's Visits / Staff | 29 | visit board read projection | staff board tests | PARTIAL / export-only route | P22 |
| UC-39 | View Staff Dashboard / Staff | 69 | role shell only | role layout tests | CONTRACT_ONLY | P28, EXT-09 |
| UC-40 | View My Assignments / Sitter | 31 | assignment contract only | no current registered page | CONTRACT_ONLY | P24 |
| UC-41 | Accept or Decline Offer / Sitter | 31 | offer contract only | no current offer command test | CONTRACT_ONLY | P24, EXT-11/20 |
| UC-42 | View Visit Details / Sitter | 59 | visit detail contract only | no current registered page | CONTRACT_ONLY | P24 |
| UC-43 | View Home Access Notes / Sitter | 59 | access-notes route export | address/access unit tests | PARTIAL / export-only route | P14/P24 |
| UC-44 | Withdraw from Visit / Sitter | 60 | visit withdrawal module | booking change/cancellation tests | PARTIAL / export-only route | P24/P25, EXT-03/16 |
| UC-45 | Reassign Sitter / Staff | 32 | dispatch remedies/visit board | board service tests | PARTIAL / booking repository pending | P24 |
| UC-46 | View Pet Sitter Dashboard / Sitter | 68 | role shell only | role layout tests | CONTRACT_ONLY | P28, EXT-09 |
| UC-47 | Request Booking Change / Customer | 33 | booking change module | booking change service/route tests | PARTIAL / export-only route | P25, EXT-04/15 |
| UC-48 | Approve Booking Change / Staff | 33 | change decision module | booking change route tests | PARTIAL / export-only route | P25, EXT-15/16 |
| UC-49 | Cancel Booking or Visit / Customer, Staff | 34 | cancellation module | cancellation service/route tests | PARTIAL / money decision pending | P25/P51, EXT-03/05/13/14 |
| UC-50 | Confirm Care Instructions / Customer | 35 | `care-instructions.service.js` | care instruction API/page tests | PARTIAL / export-only route | P26 |
| UC-51 | Confirm Handover / Sitter | 36 | handover service | handover tests/page | PARTIAL / export-only route | P26 |
| UC-52 | Check In / Sitter | 37 | care evidence route/service | care evidence tests/page | PARTIAL / export-only route | P27 |
| UC-53 | Check Out / Sitter | 37 | care evidence route/service | care evidence tests/page | PARTIAL / export-only route | P27, OPEN-CLOSE |
| UC-54 | Complete Visit Checklist / Sitter | 38 | checklist service | checklist tests/page | PARTIAL / export-only route | P27 |
| UC-55 | View Care Report / Customer, Staff | 39 | care report route/service | care report page/API tests | PARTIAL / private media pending | P27 |
| UC-56 | Report Incident / Sitter, Customer | 40 | incident module/service | incident route/service tests | PARTIAL / export-only route | P29 |
| UC-57 | View Incidents / Staff | 41 | incident list projection | incident tests | PARTIAL / export-only route | P29 |
| UC-58 | Resolve Incident / Staff, Admin | 42 | incident resolution module | incident tests | PARTIAL / money hold pending | P29/P51 |
| UC-59 | Pay for Booking / Customer | 43–45 | payOS provider/webhook boundary | provider/webhook tests | PARTIAL / booking billing wiring pending | P31/P51, EXT-01/02/17 |
| UC-60 | View Unpaid Bookings / Customer | 65 | unpaid page/job boundary | `CustomerUnpaidBookingsPage.test.jsx`, job tests | PARTIAL / billing source pending | P31/P33 |
| UC-61 | Process Refund / Staff, Admin | 46 | refund proposal/lifecycle routes | refund service/route/page tests | PARTIAL / provider transfer pending | P32/P51, EXT-05/13/14 |
| UC-62 | Rate Visit / Customer | 48 | review module/service | review page/API tests | PARTIAL / export-only route | P30/P47, EXT-07/19 |
| UC-63 | Submit Complaint / Customer | 49 | complaint module/service | complaint page/API tests | PARTIAL / export-only route | P30/P47, EXT-07/28 |
| UC-64 | Handle Complaint / Staff, Admin | 50 | complaint review/resolution module | complaint route/service tests | PARTIAL / export-only route | P30/P47 |
| UC-65 | View Notifications / registered roles | 51 | no notification center in current runtime | no current page/test | NOT_FOUND | P33 |
| UC-66 | View Admin Dashboard / Admin | 54 | role shell only | role layout tests | CONTRACT_ONLY | P28, EXT-09 |

## EXT crosswalk

| EXT | Requirement carried forward | Evidence in workspace | Status / next gate |
| --- | --- | --- | --- |
| EXT-01 | One visit may postpay | P51 contract; billing boundary | PARTIAL; settle bill ordering |
| EXT-02 | Multi-visit must prepay | P51/P42 contracts; webhook verifier | PARTIAL; booking/payment wiring |
| EXT-03 | Customer/Sitter cancel at least 1h | P25 cancellation module | PARTIAL; money and runtime wiring |
| EXT-04 | Customer chooses replacement slot | P25 change module | PARTIAL; FIN-04 decision |
| EXT-05 | Retain 30% for paid cancelled visits | P51 financial contract | CONTRACT_ONLY; allocation/rounding |
| EXT-06 | One settlement request per VN week | P51 contract | CONTRACT_ONLY; P41 ledger |
| EXT-07 | Sitter rates Customer and sees related complaints | P47 proposal; review/complaint code | PARTIAL; actor/privacy contract |
| EXT-08 | Public policies before consent | P45 source and public policy UI | LOCAL_TESTED / PENDING approved content |
| EXT-09 | Role dashboards and avatar interactions | P48 shell and layout tests | PARTIAL; data routes/Figma |
| EXT-10 | PWA capability | manifest/service worker in workspace | PARTIAL; device/offline validation |
| EXT-11 | Customer-directed sitter confirmation | P42 service/routes/tests | PARTIAL; P34 module registration |
| EXT-12 | Query optimization | P44 docs and query-focused tests | PENDING; no load result |
| EXT-13 | Basis for 30% retention | P51 open decision | CONTRACT_ONLY; decision required |
| EXT-14 | Operator/sitter-caused cancellation remedy | P51/P25 open policy | CONTRACT_ONLY; owner decision |
| EXT-15 | Reschedule selected visits | P25 route/service | PARTIAL; cutoff decision |
| EXT-16 | Post-cutoff exception handling | P25 contract | CONTRACT_ONLY; Staff exception policy |
| EXT-17 | One versus many visit lifecycle | P01/P51 contracts | PARTIAL; booking integration |
| EXT-18 | Weekly settlement lifecycle | P51 contract | CONTRACT_ONLY; P41 implementation |
| EXT-19 | Two-way rating and related complaints | P47 contract and review/complaint modules | PARTIAL; sitter direction |
| EXT-20 | Directed proposal confirmation boundary | P42 contract/tests | PARTIAL; no auto-ranking substitution |
| EXT-21 | Public-shell PWA cache boundary | P43 handoff and service worker | PARTIAL; physical device check |
| EXT-22 | Public payment/cancel/refund policies | P45 policy catalog | PENDING content approval |
| EXT-23 | Cursor/projection/query performance | P44 proposal | PENDING explain/load evidence |
| EXT-24 | Applicant status and reapply date | P46 status route/service | PARTIAL; runtime route/provider |
| EXT-25 | Scoped applicant verification | P46 contract | PARTIAL; OTP/channel decision |
| EXT-26 | OTP-only and dual contact verification | P06/P09 auth implementation | LOCAL_TESTED / PENDING live channels |
| EXT-27 | Care-ready dog/cat profile | P50 dictionary and pet pages | PARTIAL; schema/snapshot |
| EXT-28 | Sitter complaint creation proposal only | P47 open item | CONTRACT_ONLY; do not enable actor yet |

## SRS patch queue

The next Drive revision should apply this crosswalk as a controlled patch: preserve the original version, update UC-09 policy references, split check-in/check-out, remove the old Manage Account UC, add UC-N01…N08 and WBS-N01…N16 only after owner approval, and update payment/cancellation/settlement rules together. The current repository contains the reviewable patch and provenance; it does not claim the source workbook or SRS has already been edited.
