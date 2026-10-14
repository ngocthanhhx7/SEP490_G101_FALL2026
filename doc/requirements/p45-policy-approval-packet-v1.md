# P45 policy approval packet v1

Trạng thái: **PENDING_APPROVAL**. Tài liệu này là gói trình Leader và người có thẩm quyền duyệt nội dung; không phải nguồn policy production và không được dùng để bật consent.

## Bản ghi cần duyệt

| slug | versionId đề xuất | sourceRef | effectiveAt | expiresAt |
| --- | --- | --- | --- | --- |
| `terms` | `terms-2026-10-14-draft-1` | `P45-APPROVAL-TERMS-2026-10-14` | Chưa chốt, sau thời điểm duyệt | Chưa chốt |
| `privacy` | `privacy-2026-10-14-draft-1` | `P45-APPROVAL-PRIVACY-2026-10-14` | Chưa chốt, sau thời điểm duyệt | Chưa chốt |
| `contact-verification` | `contact-2026-10-14-draft-1` | `P45-APPROVAL-CONTACT-2026-10-14` | Chưa chốt | Chưa chốt |
| `service-areas` | `service-areas-2026-10-14-draft-1` | `P45-APPROVAL-AREAS-2026-10-14` | Chưa chốt | Chưa chốt |
| `booking` | `booking-2026-10-14-draft-1` | `P45-APPROVAL-BOOKING-2026-10-14` | Chưa chốt | Chưa chốt |
| `payments` | `payments-2026-10-14-draft-1` | `P45-APPROVAL-PAYMENTS-2026-10-14` | Chưa chốt | Chưa chốt |
| `cancellations-refunds` | `cancellations-2026-10-14-draft-1` | `P45-APPROVAL-CANCEL-2026-10-14` | Chưa chốt | Chưa chốt |
| `care-evidence` | `care-evidence-2026-10-14-draft-1` | `P45-APPROVAL-EVIDENCE-2026-10-14` | Chưa chốt | Chưa chốt |
| `safety-complaints` | `safety-complaints-2026-10-14-draft-1` | `P45-APPROVAL-SAFETY-2026-10-14` | Chưa chốt | Chưa chốt |
| `sitter-onboarding` | `sitter-onboarding-2026-10-14-draft-1` | `P45-APPROVAL-SITTER-2026-10-14` | Chưa chốt | Chưa chốt |
| `settlement-and-ratings` | `settlement-2026-10-14-draft-1` | `P45-APPROVAL-SETTLEMENT-2026-10-14` | Chưa chốt | Chưa chốt |
| `pwa` | `pwa-2026-10-14-draft-1` | `P45-APPROVAL-PWA-2026-10-14` | Chưa chốt | Chưa chốt |

Các `versionId` trên chỉ là định danh đề xuất. Chỉ bản ghi trong `PublicPolicyVersion` có `status=APPROVED`, `approvedAt`, `approvedBy`, `sourceRef`, `contentHash` và thời điểm hiệu lực hợp lệ mới được public endpoint trả về hoặc dùng cho receipt consent.

## Nội dung cần Leader xác nhận

### Terms (`terms`)

- Phạm vi dịch vụ Paw World Care, điều kiện tạo và sử dụng tài khoản Customer/Pet Sitter.
- Trình tự đặt dịch vụ, xác nhận lịch, thay đổi thông tin và trách nhiệm cung cấp thông tin chính xác.
- Quyền tạm khóa/hủy tài khoản, kênh liên hệ và cơ chế tiếp nhận khiếu nại.
- Không đưa mức giá, phí, thời hạn hoặc tuyên bố tuân thủ luật khi chưa có quyết định có thẩm quyền.

### Privacy (`privacy`)

- Nhóm dữ liệu thu thập: định danh hiển thị, email/số điện thoại OTP, dữ liệu pet, địa chỉ phục vụ và dữ liệu vận hành.
- Mục đích sử dụng, thời hạn lưu, phân quyền truy cập và các trường hợp chia sẻ với provider cần thiết.
- Cách xử lý yêu cầu xem, sửa, xóa hoặc hạn chế dữ liệu; đầu mối liên hệ privacy.
- Không ghi số OTP, contact plaintext, giấy tờ định danh hoặc secret vào log/public policy/PWA cache.

### Các policy vận hành còn lại

Leader cần duyệt nội dung tương ứng với ma trận P45: OTP/liên hệ, vùng phục vụ, booking, payment/prepay, hủy/reschedule/refund, bằng chứng chăm sóc, an toàn/complaint, onboarding sitter 30 ngày, settlement/rating và PWA. Quy tắc hủy tối thiểu 1 giờ, multi-visit prepay và tỷ lệ giữ 30% chỉ được ghi khi các quyết định FIN liên quan đã được chốt và có `sourceRef`.

## Quy trình xuất bản sau khi duyệt

1. Người có thẩm quyền xác nhận nội dung, `approvedBy`, ngày duyệt, `effectiveAt`, `expiresAt` (nếu có) và nguồn lưu trữ.
2. P17/owner policy ghi một bản `PublicPolicyVersion` bất biến, tính `contentHash`, không sửa bản đã duyệt.
3. Public endpoint chỉ chọn bản APPROVED đang hiệu lực; frontend cập nhật catalog bằng DTO đó.
4. Registration gửi đúng cặp `terms`/`privacy` versionId; server kiểm tra lại trong transaction và lưu receipt vào User trước khi cấp session.
5. Thay version hoặc hết hạn làm readiness false và yêu cầu consent lại; không fallback sang fixture hoặc bản nháp.
