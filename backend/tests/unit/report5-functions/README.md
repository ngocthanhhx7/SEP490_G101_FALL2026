# Unit test từng hàm theo Report 5

Mỗi file `.test.js` chỉ kiểm thử một hàm thật. Các helper trong chính file đó chỉ dựng
dependency giả hoặc gom các assertion lặp lại của cùng hàm. Mỗi ca có một
`test` riêng với tên tiếng Việt, mã function, UTCID và loại N/A/B; không dùng
JSON bên ngoài hoặc vòng lặp để che phần thực thi từng ca.

## Kiểm tra trước khi push ngày 17/11/2026

Đối chiếu bộ test hiện có với danh mục bên dưới: **114 file test, 755 ca**, mỗi
file mang một mã function, UTCID riêng và loại N/A/B. Không có ca skip, todo,
only hoặc failing. 114 file test giữ nguyên logic; chỉ bỏ dòng trống thừa ở
cuối file theo kiểm tra whitespace của Git. Bộ test được đưa lên nhánh
`feature/report5-function-unit-tests`, tạo từ `develop` tại `692c252`.
README được sửa liên kết tới các tài liệu phụ không còn trong thư mục. 21 hàm
ghi 0 ca trong danh mục chưa có file test; không tính các hàm này là đã Passed.

Chạy lại trên checkout này với Node.js 24.22.1 và các dependency đã đối chiếu
package-lock: **627 Passed, 128 Failed, 0 skipped, tổng 755 ca**; **64 suites
Passed, 50 suites Failed**. Lệnh chạy toàn thư mục bên dưới trả exit code 1.
Backend lint, backend architecture check, frontend lint và frontend build đạt;
build còn cảnh báo chunk lớn hơn 500 kB. Unit test dùng dependency giả, không
chứng minh tích hợp MongoDB, provider hay môi trường production.

**128 ca Failed cần được phân loại trước khi cập nhật Defect_List.** Có cả
kỳ vọng SRS chưa được code đáp ứng và fixture/assertion cũ chưa tương thích với
code mới. Ví dụ quan sát trong lần chạy này:

| Nhóm file | Kết quả cần kiểm tra lại |
| --- | --- |
| `begin.test.js` | Fixture login chưa cung cấp contact đã đăng ký; query double thiếu `select()` của Contact. |
| `checkout-options.test.js` | Collection double thiếu `findOne()` cho lịch sử chăm sóc. |
| `checkout-confirm.test.js`, `checkout-read.test.js`, `checkout-payment-link.test.js` | Metadata index giả chưa đáp ứng kiểm tra kho nguồn tài chính mới; nhiều ca dừng ở `FINANCE_SOURCE_STORAGE_NOT_READY` trước hành vi cần kiểm thử. |
| `shop-order-place.test.js` | Connection double thiếu `model()` mà code mới sử dụng. |
| `shop-price-product-order.test.js` | Assertion so sánh toàn bộ object cũ thất bại khi kết quả có thêm `tierDiscount` và `unitDiscounts`. |

Chưa sửa mock, assertion, mã nghiệp vụ hoặc trạng thái defect trong lần đưa
bộ test lên nhánh này. Các số Passed/Failed ghi ở những phần đối chiếu phía
dưới là **kết quả lịch sử theo ngày ghi tại từng phần**, không phải kết quả
chạy lại ngày 17/11. Bộ test cần được review và đồng bộ các fixture với code
hiện tại trước khi dùng làm điều kiện CI bắt buộc hoặc xác nhận defect đã sửa.

| Hàm | File | Sheet đối chiếu | Số ca |
| --- | --- | --- | ---: |
| `normalizeCustomerDisplayName` | [normalize-customer-display-name.test.js](normalize-customer-display-name.test.js) | REG-01_normalizeCustomerDisplay | 34 |
| `registerVerifiedCustomer` | [register-verified-customer.test.js](register-verified-customer.test.js) | REG-02_registerVerifiedCustomer | 17 |
| `validateAndBuildReceipt` | Chưa có test: thiếu đặc tả SRS | REG-POL-01_validateAndBuildRece | 0 — chưa có đặc tả SRS |
| `begin` | [begin.test.js](begin.test.js) | OTP-01_begin | 24 |
| `verify` | [verify.test.js](verify.test.js) | OTP-02_verify | 28 |
| `canonicalizeContact` | [canonicalize-contact.test.js](canonicalize-contact.test.js) | CONTACT-01_canonicalizeContact | 9 |
| `lookup` | Chưa có test: thiếu đặc tả SRS | CONTACT-02_lookup | 0 — chưa có đặc tả SRS |
| `encrypt` | Chưa có test: thiếu đặc tả SRS | CONTACT-03_encrypt | 0 — chưa có đặc tả SRS |
| `decrypt` | Chưa có test: thiếu đặc tả SRS | CONTACT-04_decrypt | 0 — chưa có đặc tả SRS |
| `issueInTransaction` | [session-issue-in-transaction.test.js](session-issue-in-transaction.test.js) | SESSION-01_issueInTransaction | 8 |
| `authenticate` | [session-authenticate.test.js](session-authenticate.test.js) | SESSION-02_authenticate | 16 |
| `getCurrentUser` | [session-get-current-user.test.js](session-get-current-user.test.js) | SESSION-03_getCurrentUser | 10 |
| `verifyCsrf` | Chưa có test: thiếu đặc tả SRS | SESSION-04_verifyCsrf | 0 — chưa có đặc tả SRS |
| `revoke` | [session-revoke.test.js](session-revoke.test.js) | SESSION-05_revoke | 2 |
| `revokeUserSessions` | [session-revoke-user-sessions.test.js](session-revoke-user-sessions.test.js) | SESSION-06_revokeUserSessions | 3 |
| `resumeCsrf` | Chưa có test: thiếu đặc tả SRS | SESSION-07_resumeCsrf | 0 — chưa có đặc tả SRS |
| `setCookie` | Chưa có test: thiếu đặc tả SRS | SESSION-08_setCookie | 0 — chưa có đặc tả SRS |
| `clearCookie` | Chưa có test: thiếu đặc tả SRS | SESSION-09_clearCookie | 0 — chưa có đặc tả SRS |
| `lockUserAndRevokeSessions` | [session-lock-user-and-revoke-sessions.test.js](session-lock-user-and-revoke-sessions.test.js) | SESSION-10_lockUserAndRevokeSes | 6 |
| `decide` | [authz-decide.test.js](authz-decide.test.js) | AUTHZ-01_decide | 14 |
| `requireSession` | [auth-mw-require-session.test.js](auth-mw-require-session.test.js) | AUTH-MW-01_requireSession | 13 |
| `requireRoles` | [auth-mw-require-roles.test.js](auth-mw-require-roles.test.js) | AUTH-MW-02_requireRoles | 12 |
| `requireCsrf` | Chưa có test: thiếu đặc tả SRS | AUTH-MW-03_requireCsrf | 0 — chưa có đặc tả SRS |
| `hasRole` | [has-role.test.js](has-role.test.js) | ROLE-BE-01_hasRole | 30 |
| `validatePricingPolicy` | [validate-pricing-policy.test.js](validate-pricing-policy.test.js) | PRICE-CALC-01_validatePricingPo | 8 |
| `calculateQuote` | [calculate-quote.test.js](calculate-quote.test.js) | PRICE-CALC-02_calculateQuote | 15 |
| `quote` | [quote.test.js](quote.test.js) | QUOTE-01_quote | 7 |
| `basket` | [basket.test.js](basket.test.js) | QUOTE-02_basket | 5 |
| `readDecision` | [read-decision.test.js](read-decision.test.js) | QUOTE-03_readDecision | 2 |
| `options` | [checkout-options.test.js](checkout-options.test.js) | CHECKOUT-01_options | 3 |
| `confirm` | [checkout-confirm.test.js](checkout-confirm.test.js) | CHECKOUT-02_confirm | 13 |
| `read` | [checkout-read.test.js](checkout-read.test.js) | CHECKOUT-03_read | 4 |
| `paymentLink` | [checkout-payment-link.test.js](checkout-payment-link.test.js) | CHECKOUT-04_paymentLink | 8 |
| `bookingCheckoutInput` | [booking-checkout-input.test.js](booking-checkout-input.test.js) | BKG-INPUT-01_bookingCheckoutInp | 10 |
| `assertMatchSelection` | [assert-match-selection.test.js](assert-match-selection.test.js) | MATCH-SEL-01_assertMatchSelecti | 8 |
| `normalizeDispatchRequest` | [dispatch-normalize-request.test.js](dispatch-normalize-request.test.js) | DISPATCH-01_normalizeDispatchRe | 5 |
| `evaluateCandidate` | [dispatch-evaluate-candidate.test.js](dispatch-evaluate-candidate.test.js) | DISPATCH-02_evaluateCandidate | 8 |
| `rankEligibleCandidates` | [dispatch-rank-eligible-candidates.test.js](dispatch-rank-eligible-candidates.test.js) | DISPATCH-03_rankEligibleCandida | 7 |
| `suggest` | [dispatch-suggest.test.js](dispatch-suggest.test.js) | DISPATCH-04_suggest | 5 |
| `accept` | [offer-accept.test.js](offer-accept.test.js) | OFFER-01_accept | 13 |
| `decline` | [offer-decline.test.js](offer-decline.test.js) | OFFER-02_decline | 7 |
| `reassign` | [visit-reassign.test.js](visit-reassign.test.js) | REASSIGN-01_reassign | 10 |
| `withdraw` | [visit-withdraw.test.js](visit-withdraw.test.js) | WITHDRAW-01_withdraw | 11 |
| `paymentModeForOriginalVisitCount` | [billing-payment-mode-for-original-visit-count.test.js](billing-payment-mode-for-original-visit-count.test.js) | BILL-01_paymentModeForOriginalV | 3 |
| `createPrepaymentIntent` | [billing-create-prepayment-intent.test.js](billing-create-prepayment-intent.test.js) | BILL-02_createPrepaymentIntent | 4 |
| `issuePostpayBill` | [billing-issue-postpay-bill.test.js](billing-issue-postpay-bill.test.js) | BILL-03_issuePostpayBill | 7 |
| `createPaymentLink` | [payos-create-payment-link.test.js](payos-create-payment-link.test.js) | PAYOS-01_createPaymentLink | 5 |
| `getPaymentLink` | [payos-get-payment-link.test.js](payos-get-payment-link.test.js) | PAYOS-02_getPaymentLink | 3 |
| `verifyWebhook` | [payos-verify-webhook.test.js](payos-verify-webhook.test.js) | PAYOS-03_verifyWebhook | 5 |
| `handleWebhook` | [payment-handle-webhook.test.js](payment-handle-webhook.test.js) | PAY-WH-01_handleWebhook | 5 |
| `propose` | [refund-propose.test.js](refund-propose.test.js) | REFUND-01_propose | 7 |
| `decide` | [refund-decide.test.js](refund-decide.test.js) | REFUND-02_decide | 7 |
| `recordTransfer` | [refund-record-transfer.test.js](refund-record-transfer.test.js) | REFUND-03_recordTransfer | 2 |
| `calculateEmployeePayroll` | [calculate-employee-payroll.test.js](calculate-employee-payroll.test.js) | SAL-CALC-01_calculateEmployeePa | 3 |
| `prepareStatement` | [payroll-prepare-statement.test.js](payroll-prepare-statement.test.js) | PAYROLL-01_prepareStatement | 5 |
| `prepareAutomaticStatement` | [payroll-prepare-automatic-statement.test.js](payroll-prepare-automatic-statement.test.js) | PAYROLL-02_prepareAutomaticStat | 3 |
| `decideStatement` | [payroll-decide-statement.test.js](payroll-decide-statement.test.js) | PAYROLL-03_decideStatement | 4 |
| `submitAdvance` | Chưa có test: thiếu đặc tả SRS | PAYROLL-04_submitAdvance | 0 — chưa có đặc tả SRS |
| `decideAdvance` | Chưa có test: thiếu đặc tả SRS | PAYROLL-05_decideAdvance | 0 — chưa có đặc tả SRS |
| `submitAdjustment` | [salary-submit-adjustment.test.js](salary-submit-adjustment.test.js) | SAL-ADJ-01_submitAdjustment | 4 |
| `decideAdjustment` | [salary-decide-adjustment.test.js](salary-decide-adjustment.test.js) | SAL-ADJ-02_decideAdjustment | 4 |
| `allocateBookingReceipt` | Chưa có test: thiếu đặc tả SRS | ALLOC-01_allocateBookingReceipt | 0 — chưa có đặc tả SRS |
| `calculateWeeklyCommission` | Chưa có test: thiếu đặc tả SRS | COMMISSION-01_calculateWeeklyCo | 0 — chưa có đặc tả SRS |
| `previewEqualTaxCostSplit` | Chưa có test: thiếu đặc tả SRS | COMMISSION-02_previewEqualTaxCo | 0 — chưa có đặc tả SRS |
| `vietnamRequestWeek` | Chưa có test: thiếu đặc tả SRS | SET-WEEK-01_vietnamRequestWeek | 0 — chưa có đặc tả SRS |
| `recognizeCompletion` | Chưa có test: thiếu đặc tả SRS | EARNING-01_recognizeCompletion | 0 — chưa có đặc tả SRS |
| `accrue` | Chưa có test: thiếu đặc tả SRS | EARNING-02_accrue | 0 — chưa có đặc tả SRS |
| `readOwn` | [settlement-read-own.test.js](settlement-read-own.test.js) | SETTLE-01_readOwn | 4 |
| `submit` | Chưa có test: thiếu đặc tả SRS | SETTLE-02_submit | 0 — chưa có đặc tả SRS |
| `withdraw` | Chưa có test: thiếu đặc tả SRS | SETTLE-03_withdraw | 0 — chưa có đặc tả SRS |
| `decide` | Chưa có test: thiếu đặc tả SRS | SET-ADMIN-01_decide | 0 — chưa có đặc tả SRS |
| `recordTransfer` | Chưa có test: thiếu đặc tả SRS | SET-ADMIN-02_recordTransfer | 0 — chưa có đặc tả SRS |
| `priceProductOrder` | [shop-price-product-order.test.js](shop-price-product-order.test.js) | SHOP-PRICE-01_priceProductOrder | 2 |
| `sellableQuantity` | [shop-sellable-quantity.test.js](shop-sellable-quantity.test.js) | SHOP-PRICE-02_sellableQuantity | 3 |
| `place` | [shop-order-place.test.js](shop-order-place.test.js) | SHOP-ORDER-01_place | 10 |
| `handToCarrier` | [shop-hand-to-carrier.test.js](shop-hand-to-carrier.test.js) | SHOP-MGMT-01_handToCarrier | 5 |
| `markReady` | [shop-mark-ready.test.js](shop-mark-ready.test.js) | SHOP-MGMT-02_markReady | 2 |
| `handToCustomer` | [shop-hand-to-customer.test.js](shop-hand-to-customer.test.js) | SHOP-MGMT-03_handToCustomer | 3 |
| `markDelivered` | [shop-mark-delivered.test.js](shop-mark-delivered.test.js) | SHOP-MGMT-04_markDelivered | 2 |
| `markReturning` | [shop-mark-returning.test.js](shop-mark-returning.test.js) | SHOP-MGMT-05_markReturning | 2 |
| `confirmReturned` | [shop-confirm-returned.test.js](shop-confirm-returned.test.js) | SHOP-MGMT-06_confirmReturned | 9 |
| `recordPayment` | [shop-record-payment.test.js](shop-record-payment.test.js) | SHOP-MGMT-07_recordPayment | 2 |
| `cancel` | [shop-cancel-order.test.js](shop-cancel-order.test.js) | SHOP-MGMT-08_cancel | 4 |
| `get` | [profile-get.test.js](profile-get.test.js) | PROFILE-01_get | 3 |
| `update` | [profile-update.test.js](profile-update.test.js) | PROFILE-02_update | 9 |
| `listVerifiedContacts` | [account-list-verified-contacts.test.js](account-list-verified-contacts.test.js) | ACCOUNT-01_listVerifiedContacts | 3 |
| `list` | [user-admin-list.test.js](user-admin-list.test.js) | USER-ADMIN-01_list | 7 |
| `getById` | [user-admin-get-by-id.test.js](user-admin-get-by-id.test.js) | USER-ADMIN-02_getById | 3 |
| `decide` | [user-admin-decide.test.js](user-admin-decide.test.js) | USER-ADMIN-03_decide | 8 |
| `changeRoles` | [user-admin-change-roles.test.js](user-admin-change-roles.test.js) | USER-ADMIN-04_changeRoles | 5 |
| `createPet` | [pet-create.test.js](pet-create.test.js) | PET-01_createPet | 7 |
| `listPets` | [pet-list.test.js](pet-list.test.js) | PET-02_listPets | 2 |
| `update` | [pet-update.test.js](pet-update.test.js) | PET-03_update | 5 |
| `archive` | [pet-archive.test.js](pet-archive.test.js) | PET-04_archive | 4 |
| `normalizeServiceLocation` | [normalize-service-location.test.js](normalize-service-location.test.js) | ADDRESS-01_normalizeServiceLoca | 4 |
| `normalizePrivateAccessNotes` | [normalize-private-access-notes.test.js](normalize-private-access-notes.test.js) | ADDRESS-02_normalizePrivateAcce | 4 |
| `create` | [address-create.test.js](address-create.test.js) | ADDRESS-03_create | 8 |
| `update` | [address-update.test.js](address-update.test.js) | ADDRESS-04_update | 9 |
| `archive` | [address-archive.test.js](address-archive.test.js) | ADDRESS-05_archive | 7 |
| `accessNotes` | [address-access-notes.test.js](address-access-notes.test.js) | ADDRESS-06_accessNotes | 10 |
| `list` | [booking-history-list.test.js](booking-history-list.test.js) | BKG-HISTORY-01_list | 6 |
| `submit` | [application-submit.test.js](application-submit.test.js) | APPLICATION-01_submit | 14 |
| `getMine` | [application-get-mine.test.js](application-get-mine.test.js) | APPLICATION-02_getMine | 2 |
| `updateMine` | [application-update-mine.test.js](application-update-mine.test.js) | APPLICATION-03_updateMine | 2 |
| `startReview` | [application-start-review.test.js](application-start-review.test.js) | APPLICATION-04_startReview | 2 |
| `startInterview` | [application-start-interview.test.js](application-start-interview.test.js) | APPLICATION-05_startInterview | 2 |
| `decide` | [application-decide.test.js](application-decide.test.js) | APPLICATION-06_decide | 7 |
| `changeSitterStatus` | [application-change-sitter-status.test.js](application-change-sitter-status.test.js) | APPLICATION-07_changeSitterStat | 7 |
| `requestVerification` | [app-status-request-verification.test.js](app-status-request-verification.test.js) | APP-STATUS-01_requestVerificati | 1 |
| `verifyAndReadStatus` | [app-status-verify-and-read-status.test.js](app-status-verify-and-read-status.test.js) | APP-STATUS-02_verifyAndReadStat | 5 |
| `localDateTimeToUtc` | [local-date-time-to-utc.test.js](local-date-time-to-utc.test.js) | AVAIL-01_localDateTimeToUtc | 3 |
| `normalizeWorkingWindows` | [normalize-working-windows.test.js](normalize-working-windows.test.js) | AVAIL-02_normalizeWorkingWindow | 5 |
| `updateMine` | [availability-update-mine.test.js](availability-update-mine.test.js) | AVAIL-03_updateMine | 5 |
| `replaceMine` | [work-area-replace-mine.test.js](work-area-replace-mine.test.js) | WORK-AREA-01_replaceMine | 5 |
| `windowsCover` | [windows-cover.test.js](windows-cover.test.js) | SHIFT-POL-01_windowsCover | 6 |
| `occupiedMinutes` | [occupied-minutes.test.js](occupied-minutes.test.js) | SHIFT-POL-02_occupiedMinutes | 5 |
| `request` | [day-off-request.test.js](day-off-request.test.js) | DAY-OFF-01_request | 10 |
| `scoreSitter` | [score-sitter.test.js](score-sitter.test.js) | AI-SCORE-01_scoreSitter | 5 |
| `validateSlot` | [validate-slot.test.js](validate-slot.test.js) | AI-SLOT-01_validateSlot | 5 |
| `planInsertion` | [plan-insertion.test.js](plan-insertion.test.js) | AI-SLOT-02_planInsertion | 7 |
| `cachedMatrix` | [cached-matrix.test.js](cached-matrix.test.js) | ROUTING-01_cachedMatrix | 3 |
| `recommend` | [ai-recommend.test.js](ai-recommend.test.js) | AI-REC-01_recommend | 7 |
| `readDecision` | [ai-read-decision.test.js](ai-read-decision.test.js) | AI-REC-02_readDecision | 2 |
| `importArtifact` | [ai-model-import-artifact.test.js](ai-model-import-artifact.test.js) | AI-MODEL-01_importArtifact | 1 |
| `review` | [ai-model-review.test.js](ai-model-review.test.js) | AI-MODEL-02_review | 1 |
| `status` | [ai-model-status.test.js](ai-model-status.test.js) | AI-MODEL-03_status | 1 |
| `boardingCarePlan` | [boarding-care-plan.test.js](boarding-care-plan.test.js) | BOARDING-01_boardingCarePlan | 2 |
| `preview` | [care-plan-preview.test.js](care-plan-preview.test.js) | CARE-PLAN-01_preview | 3 |
| `finalize` | [care-plan-finalize.test.js](care-plan-finalize.test.js) | CARE-PLAN-02_finalize | 3 |
| `createProposal` | [proposal-create.test.js](proposal-create.test.js) | PROPOSAL-01_createProposal | 5 |
| `confirmProposal` | [proposal-confirm.test.js](proposal-confirm.test.js) | PROPOSAL-02_confirmProposal | 5 |
| `readVisit` | [execution-read-visit.test.js](execution-read-visit.test.js) | EXEC-VISIT-01_readVisit | 5 |
| `checkIn` | [execution-check-in.test.js](execution-check-in.test.js) | EXEC-VISIT-02_checkIn | 8 |
| `updateChecklist` | [execution-update-checklist.test.js](execution-update-checklist.test.js) | EXEC-VISIT-03_updateChecklist | 6 |
| `checkOut` | [execution-check-out.test.js](execution-check-out.test.js) | EXEC-VISIT-04_checkOut | 7 |

Đối chiếu theo bản báo cáo đã sửa ngày 10/11/2026. Danh sách và kỳ vọng được
giữ đúng sheet tương ứng; không bổ sung ca mới. Các factory chỉ được gọi để inject
model, clock, provider và lấy hàm cần test. Không dùng database, gửi OTP hoặc
cấp session thật.

Chạy các file test trong thư mục này từ `backend`:

```powershell
npm run test:unit -- --testPathPatterns=report5-functions
```

Chạy riêng một hàm, ví dụ `begin`:

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/begin.test.js
```

Chạy riêng 17 ca của `registerVerifiedCustomer`:

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/register-verified-customer.test.js
```

Chạy từng hàm mới:

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/verify.test.js
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/canonicalize-contact.test.js
```

Chạy riêng bộ session:

```powershell
npm run test:unit -- --testPathPatterns=report5-functions/session- --verbose
```

Chạy từng file session từ `backend`:

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/session-issue-in-transaction.test.js --verbose
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/session-authenticate.test.js --verbose
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/session-get-current-user.test.js --verbose
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/session-revoke.test.js --verbose
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/session-revoke-user-sessions.test.js --verbose
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/session-lock-user-and-revoke-sessions.test.js --verbose
```

Chạy từng file phân quyền và middleware từ `backend`:

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/authz-decide.test.js --verbose
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/auth-mw-require-session.test.js --verbose
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/auth-mw-require-roles.test.js --verbose
```

Ba file mới có 39 ca theo I.4.3 Role inheritance, I.4.4 Permission Matrix,
III.1.4 Authorization, GBR-01/02/03/04/08 và IV.2.3. `decide` dùng policy mẫu
theo các dòng Booking/Visit/User account/Pet profile của Permission Matrix.
Các ca kiểm tra lựa chọn và tuân thủ policy, không chứng minh policy production
hay toàn bộ API. `requireSession` dùng authenticate port giả; `requireRoles`
dùng req.auth dựng sẵn, không gọi chung các middleware khác trong cùng test.

Admin kế thừa Sale Staff theo I.4.3 trong SRS, dù GBR-03 chỉ nêu Staff. Các ca
Sale Staff được giữ theo SRS, không thay bằng role khác để làm xanh test.
`requireCsrf` chưa có đặc tả SRS về Origin/header/token nên chỉ có ghi chú phạm vi;
không tạo ca từ các nhánh kỹ thuật của middleware hoặc coi HTTPS là đặc tả CSRF.

Session dựa trên UC-02/03/10, III.1.4 Authorization, III.3.1.1 Account Settings,
III.3.2.2 User Details, GBR-01/02/04/08 và IV.2.3 Session end. Mỗi file gọi đúng
một hàm đang kiểm thử; model giả tôn trọng bộ lọc phiên hết hạn/thu hồi/userId.
Không gọi hàm session khác để tạo dữ liệu hoặc kiểm chứng kết quả.

`issueInTransaction` dùng lựa chọn mặc định vì SRS không đặc tả rememberDevice.
CSRF và chi tiết đặt/xóa cookie chưa có đặc tả SRS tương ứng, nên bốn hàm này
chỉ có ghi chú phạm vi. Không gán yêu cầu HTTPS thành đặc tả cookie.

`lockUserAndRevokeSessions` dùng authorize giả; ca từ chối chỉ chứng minh hàm
tôn trọng quyết định của port. Các điều kiện không khóa Pet Sitter/Admin hoặc
Customer còn booking/order chưa xong thuộc bước quyết định ở caller/port;
không khẳng định sáu ca của helper này đã kiểm tra các điều kiện đó hay RBAC thật.

`verify` chỉ kiểm tra phần xử lý OTP và gọi dependency sau xác minh. REGISTER
handler và session service được mock; bộ test không chứng minh tạo tài khoản
hay thời hạn session thật. Các ca đổi liên hệ kiểm tra trạng thái bản ghi giả
trước/sau xác minh, không chứng minh transaction MongoDB thật.

`canonicalizeContact` kiểm tra dữ liệu bắt buộc, email hợp lệ/chuẩn hóa và số
điện thoại tại giao diện service. Số SRS `0912345678` được truyền dưới dạng
canonical `+84912345678`; quy tắc nhập 10 số bắt đầu bằng 0 và giới hạn email
riêng của màn hình đổi liên hệ thuộc boundary, không được gán cho hàm này.

`lookup`, `encrypt`, `decrypt` có tab và ghi chú phạm vi riêng. SRS chưa đặc tả
khóa tra cứu hoặc mã hóa/giải mã liên hệ, nên chưa tạo test thực thi. GBR-05 là
quy tắc liên hệ duy nhất tại lớp nghiệp vụ; quy định không lưu/log OTP dạng đọc
được cũng không phải đặc tả cho hàm mã hóa liên hệ. Không gán hai yêu cầu này
làm căn cứ kiểm thử HMAC/AES/IV/tag/ciphertext.

Các ca Failed được giữ dưới dạng test thông thường để phản ánh sai khác đã ghi
trong sheet. Không dùng `skip`, `todo`, `test.failing` hoặc đổi expected theo
code hiện tại để làm xanh kết quả. `registerVerifiedCustomer` dùng 17 ca theo
UC-01, III.1.1.1, GBR-05/27 và MSG01/05/12; mã UTCID01–UTCID17 trùng sheet mới.
`begin` giữ bộ 24 ca theo SRS. Không đưa lại các ca kỹ thuật đã bỏ.

`validateAndBuildReceipt` chưa có yêu cầu tương ứng trong SRS hiện tại. Đã bỏ
file chứa 61 ca mở rộng và thay bằng ghi chú phạm vi; không để file `.test.js`
rỗng hoặc tạo test giả để báo Passed. 0 ca không phải bằng chứng kiểm thử đạt.

Lần chạy mới nhất ngày 10/11/2026: 157 ca trong 11 file, 139 Passed và 18 Failed.
Theo từng hàm: tên hiển thị 24/10, tạo Customer 13/4, begin 23/1, verify 28/0,
canonicalizeContact 9/0 (Passed/Failed).
Bộ session có 45 ca: issueInTransaction 7/1, authenticate 15/1, getCurrentUser
9/1, revoke 2/0, revokeUserSessions 3/0, lockUserAndRevokeSessions 6/0.
Ba ca Failed mới đều là UTCID04 của SESSION-01/02/03, cùng nguyên nhân code
chưa chấp nhận SALE_STAFF như SRS yêu cầu; theo dõi bằng DEF_SESSION_ROLE_01.
Riêng REG-02, UTCID05–UTCID08 Failed do code vẫn chấp nhận
tên 1 ký tự, 51 ký tự, có chữ số hoặc ký hiệu, trái MSG12. Kết quả 17 ca khớp
sheet mới. Không có ca bị bỏ qua hoặc đánh dấu todo; lệnh Jest trả exit code 1
vì các ca Failed này. Backend lint và `check:architecture` đạt.

File cũ trong `tests/unit/` được giữ nguyên. Vì vậy lệnh chạy toàn bộ unit test
có thể bao gồm cả các bộ cũ; dùng lệnh theo thư mục ở trên để xem riêng các file
đối chiếu Report 5 này.

`hasRole` có 30 ca theo SRS I.4.3/I.4.4, III.1.4 và GBR-01/02/03: 25 tổ hợp
giữa 5 role và 5 cổng quyền, cùng 5 ca Guest (`actorRoles=[]`). Mỗi cổng gắn
với thao tác đại diện trong Permission Matrix, không bao hàm ownership/session.
Không thêm đầu vào đa role, sai kiểu hoặc role giả vì SRS chưa đặc tả chúng.
Kết quả ngày 10/11/2026: 28 Passed, 2 Failed; N=7, A=23, B=0.
UTCID19 (Sale Staff có quyền Sale Staff) và UTCID24 (Admin kế thừa Sale Staff)
trả false thay vì true; theo dõi bằng DEF_ROLE_BE_01 trong báo cáo.
Giữ expected theo SRS, không sửa runtime hoặc bỏ qua ca lỗi.

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/has-role.test.js --verbose
```

Hai hàm tính giá dựa trên UC-23 Normal Flow 2–4 / Alternative Step 4,
III.6.2.2 Configure Service Prices, III.7.1 Create Booking — Booking summary,
GBR-20 và MSG52. `validatePricingPolicy` có 8 ca về phụ phí không âm và
khoảng cân nặng không chồng lấn; `calculateQuote` có 15 ca về giá gốc dương,
phụ phí kích thước/pet thêm/di chuyển và tổng giá các lượt. Mỗi file chỉ import
hàm đang kiểm thử từ module pricing; không mock logic tính giá.

Các số tiền, tỷ lệ phụ phí 20% và khoảng cân nặng 5–10 kg là dữ liệu tổng hợp,
không phải giá, tỷ lệ hay nhóm cân nặng cố định do SRS quy định. Các ca biên
cân nặng kiểm tra cách áp dụng khoảng mẫu, không gán 5 hoặc 10 kg thành biên
bắt buộc của hệ thống. VND là đơn vị hiện có của project, không phải một yêu
cầu tiền tệ mới suy ra từ màn hình SRS. Rule TRAVEL đã được caller chọn theo
khu vực; các test chỉ kiểm tra cộng khoản đó, không chứng minh việc chọn khu vực.

Phạm vi còn thiếu so với SRS: bảng ngưỡng giảm giá có số lượt tăng dần và tỷ lệ
1–50%, giảm giá theo hạng khách hàng (GBR-42), lựa chọn bảng giá theo khu vực
và việc lưu/giữ snapshot giá. Hợp đồng hai hàm hiện tại không có bảng ngưỡng
hoặc dữ liệu hạng khách hàng; `comboPerVisitBps`/`comboMaxBps` là mô hình tuyến
tính có trần, không biểu diễn đầy đủ các dòng ngưỡng của SRS. Không tự thêm
trường giả để tạo ca test hoặc coi phần này đã Passed. Các ca báo giá dùng
cấu hình chưa áp dụng giảm giá, `orderStepBps=0` để không đưa phụ phí bậc giá
ngoài SRS vào expected. Không kiểm tra overflow, rounding, giới hạn số rule,
giới hạn maxPets, các billing mode khác hoặc provider/database failures.

Kết quả chạy riêng hai file ngày 10/11/2026: 23 ca, 21 Passed, 2 Failed.
`validatePricingPolicy`: 6 Passed / 2 Failed; UTCID07–08 vẫn chấp nhận hai nhóm
cân nặng chồng lấn thay vì từ chối theo UC-23 bước 4 và MSG52; theo dõi bằng
`DEF_PRICE_POLICY_01`. `calculateQuote`: 15 Passed / 0 Failed trong phạm vi đã
nêu, không có nghĩa đã bao phủ toàn bộ yêu cầu giá của SRS. AppError 422 /
VALIDATION_FAILED là cách ánh xạ lỗi ở service hiện tại, không khẳng định SRS
quy định HTTP status hoặc chuỗi thông báo này. Không thay đổi runtime để làm
xanh các ca Failed.

Chạy từng file từ `backend`:

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/validate-pricing-policy.test.js --verbose
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/calculate-quote.test.js --verbose
```

Ba hàm QUOTE được đối chiếu SRS ngày 12/11/2026: UC-25 bước 1–4,
Description/Postconditions, III.7.1 Booking, GBR-20, I.4.4 và GBR-02.
`quote` có 7 ca, `basket` có 5 ca và `readDecision` có 2 ca. Mỗi file chỉ gọi
method đang kiểm thử; factory dùng để inject repository/clock. Các test quote
và basket dùng validator/calculator thật, context và DecisionSnapshot giả.

`basket` chỉ được kiểm tra với một dòng dịch vụ, ánh xạ một dịch vụ cho một
booking của UC-25, và trường hợp không chọn dịch vụ/pet. SRS chưa đặc tả giỏ
nhiều dịch vụ, chính sách giữa nhiều dòng hay giới hạn 20 dòng. UC-61 nói về
giỏ sản phẩm, không được dùng làm căn cứ cho giỏ dịch vụ. Không mở rộng các
ca theo nhánh code như policies không tương thích, overflow, phí bậc giá,
traits chưa có giá, ID sai, thời hạn quote 10 phút hoặc lỗi DB/provider.

`readDecision` ánh xạ yêu cầu hiển thị giá của lựa chọn trước Confirm trong
UC-25/III.7.1 và giới hạn dữ liệu Customer trong I.4.4/GBR-02 vào ownerId của
bản ghi báo giá. Đây là cách áp dụng quy tắc dữ liệu của Customer cho API giá,
không khẳng định SRS có entity quote hoặc đặc tả TTL/kind/UUID riêng. Query
double thực sự lọc ownerId: Customer khác nhận lỗi và không đọc được giá của
chủ bản ghi. Kiểm tra này không chứng minh session/route RBAC hoặc MongoDB
thật. Bản ghi tạm không phải snapshot của booking đã xác nhận; không gán quy
tắc giữ giá lịch sử của booking cho thời hạn sống của quote.

Các số tiền 100000/20000/15000 VND và tỷ lệ phụ phí 20% là fixture, không phải
mức giá cố định trong SRS. Các ca hợp lệ chưa áp dụng giảm giá, orderStepBps=0.
Khu vực đã được port giải quyết thành rule TRAVEL; test không chứng minh chọn
khu vực. Ca dịch vụ không active chỉ kiểm tra quote tôn trọng lỗi do context
port trả về, không kiểm tra truy vấn active thật. Thông báo UI/MSG và HTTP
status không được suy ra từ SRS; các AppError được đối chiếu theo hợp đồng
service hiện tại.

Kết quả chạy riêng ngày 12/11/2026: 14 ca, 12 Passed, 2 Failed.
`quote`: 6 Passed / 1 Failed; `basket`: 4 Passed / 1 Failed;
`readDecision`: 2 Passed / 0 Failed. UTCID03 của quote và basket trả PREPAY
cho booking 3 lượt, trái UC-25 Description/Postconditions và III.7.1 yêu cầu
thanh toán sau booking. Theo dõi bằng `DEF_QUOTE_PAYMENT_01`; chỉ ghi nhận
mode trả về sai, không khẳng định đã xảy ra thu tiền thật. Không đổi expected,
bỏ qua test hoặc sửa runtime để làm xanh.

Chưa bao phủ bảng ngưỡng giảm giá, giảm giá theo hạng, booking/time/address
validation ở lớp khác, persist booking snapshot, giỏ nhiều dịch vụ hoặc quyền
production. Các ca Passed chỉ áp dụng cho phạm vi đã ghi trong từng sheet.

Chạy từng file từ `backend`:

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/quote.test.js --verbose
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/basket.test.js --verbose
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/read-decision.test.js --verbose
```

Bốn hàm CHECKOUT được đối chiếu SRS ngày 12/11/2026 theo UC-25/27/49,
III.7.1/8.2, I.4.4 và GBR-01/02/09/17/18/20/26/33/34. Mỗi file chứa đúng
các UTCID của một hàm. Factory chỉ dựng dependency; không gọi method checkout
khác để tạo fixture. Hàm thật, validator, snapshot allocation, boarding adapter
và unit-of-work vẫn chạy; model/query/provider/index/transaction là double.

`options` chỉ kiểm tra cổng Customer/Guest/Staff và chuyển tiếp danh sách từ
port. Danh sách mock không chứng minh pipeline Mongo, sitter đã từng chăm pet
theo GBR-12 hoặc eligibility production. Cổng này không phải quyền đọc toàn
bộ booking của Staff qua API quản trị.

`confirm` kiểm tra consent, notice 24 giờ, khoảng 30 ngày (30 lượt, mỗi ngày
một lượt), từ chối ngày thứ 31, tối đa 2 lượt/ngày, overlap của cùng pet, sở
hữu pet/địa chỉ, giá thay đổi trước Confirm, snapshot và POSTPAY. Ngày/giờ đều
tổng hợp, đồng hồ cố định. Fixture mặc định là Customer từng trả bill, không
quá hạn, địa chỉ được phục vụ và chỉ một dịch vụ HOME. Chưa kiểm chứng kiểm
tra quá hạn GBR-11, giới hạn Customer mới GBR-33, khu vực không được phục vụ,
preferred sitter GBR-12 hoặc care-instruction confirmation UC-40. Không ghi
các phần thiếu này là Passed.

`read` kiểm tra booking của đúng Customer, ngăn khác chủ/Guest và giữ giá đã
lưu khi bảng giá mới thay đổi. Các query double lọc ownerId/customerId và ID;
không trả dữ liệu dựng sẵn bất kể bộ lọc. `paymentLink` dùng bill chờ trả
AWAITING_PAYMENT/POSTPAY với visits COMPLETED, amount dương, final và hạn
48 giờ theo UC-49. Đây là biểu diễn fixture của bill sau booking; không lấy
PREPAY hoặc cửa sổ 15 phút trong runtime làm yêu cầu SRS.

Các ca payment kiểm tra link payOS, chặn thu sớm/bill 0/case còn mở, giữ bill
UNPAID khi provider lỗi, thử lại và ngăn khác chủ/Guest. Retry chỉ mô tả port
từ chối rõ ràng trước tạo link theo UC-49 Step 3; không chứng minh có thể retry
an toàn khi kết quả provider không rõ. Double payment intent thực sự áp dụng
$set, để lần gọi sau nhìn thấy RECONCILIATION_REQUIRED từ lần gọi trước.
Các ca không khẳng định đã thanh toán thật hoặc ghi payment webhook.

Kết quả bốn file: 28 ca, 20 Passed, 8 Failed. `options`: 3/0;
`confirm`: 9/4; `read`: 4/0; `paymentLink`: 4/4 (Passed/Failed).
Các lỗi được giữ theo SRS, không sửa runtime hoặc dùng skip/failing:

- `DEF_CHECKOUT_NOTICE_01` — confirm UTCID04: nhận lịch bắt đầu trước 24 giờ.
- `DEF_CHECKOUT_DAYS_01` — confirm UTCID06: nhận lịch kéo dài sang ngày thứ 31.
- `DEF_CHECKOUT_DAILY_01` — confirm UTCID07: nhận 3 lượt cùng ngày.
- `DEF_CHECKOUT_PREPAY_01` — confirm UTCID11: tạo PREPAY cho booking nhiều lượt.
- `DEF_CHECKOUT_EARLY_PAY_01` — paymentLink UTCID02: tạo link trước khi các lượt kết thúc.
- `DEF_CHECKOUT_ZERO_BILL_01` — paymentLink UTCID03: gọi provider cho bill 0.
- `DEF_CHECKOUT_BILL_HOLD_01` — paymentLink UTCID04: tạo link khi có case OPEN/financialHold.
- `DEF_CHECKOUT_PAYMENT_RETRY_01` — paymentLink UTCID06: lần thử lại bị chặn bởi trạng thái reconciliation.

Mã lỗi là mã theo dõi báo cáo, chưa phải issue GitHub. AppError/HTTP status
theo hợp đồng service; SRS không đặc tả chuỗi lỗi hoặc mã HTTP cho mọi tình
huống. Không thêm test ID/idempotency/quote TTL/storage provisioning failure,
allocation rounding hay boarding vì chưa có căn cứ trong SRS cho phạm vi này.
Các index trong fixture chỉ cho phép đi qua dependency gate; không chứng minh
storage thật đã được provision. Transaction double không mô phỏng rollback;
assert không ghi booking/visit/payment không khẳng định không có bookingGuard
write hoặc MongoDB rollback thật.

Chạy từng file từ `backend`:

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/checkout-options.test.js --verbose
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/checkout-confirm.test.js --verbose
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/checkout-read.test.js --verbose
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/checkout-payment-link.test.js --verbose
```

Hai hàm `bookingCheckoutInput` và `assertMatchSelection` được đối chiếu SRS
ngày 12/11/2026 theo UC-25, III.7.1, I.4.4 và GBR-02/09/10/12/34. Mỗi file
chỉ gọi hàm tương ứng; helper dựng dữ liệu tổng hợp, không gọi checkout hoặc
AI để tạo fixture. Mỗi UTCID có một `test` riêng, khớp ma trận trong báo cáo.

`bookingCheckoutInput` có 10 ca: một lượt, hai lượt cùng ngày, đủ 60 lượt,
vượt 60 lượt, consent false/thiếu, lịch rỗng, thiếu giờ, thiếu địa chỉ và giữ
preferred sitter khi có chọn. Biên 60 được suy ra từ 30 ngày × 2 lượt/ngày
của GBR-09, không phải giới hạn mảng được SRS viết trực tiếp. Lịch 60 có đủ
hai lượt mỗi ngày trong 30 ngày; ca 61 thêm một lượt vào ngày 31. Fixture
giả định Customer đã từng trả bill, không áp giới hạn 7 ngày của GBR-33.
Kết quả chỉ chứng minh validator kiểm tra số lượng phần tử và các trường
DTO; không chứng minh đã kiểm tra khoảng ngày, số lượt mỗi ngày, notice
24 giờ, quá hạn, sở hữu địa chỉ, service area hoặc lịch sử chăm pet. Không
thêm ca kỹ thuật như itemIndex 0–19, bookingMode, ID sai và unknown fields.

`assertMatchSelection` có 8 ca: không bắt buộc tham chiếu khi không yêu cầu
sitter, tham chiếu hợp lệ, có preferred sitter, khác chủ và thay đổi dịch vụ,
pet, địa chỉ hoặc khung giờ. UC-25/III.7.1 và GBR-12 là căn cứ để áp dụng
đề xuất cho đúng lựa chọn đang Confirm; MATCH/cache là cách biểu diễn của
code, không phải entity được SRS định nghĩa. Giới hạn owner được ánh xạ
từ quy tắc dữ liệu Customer của I.4.4/GBR-02. Query double thực sự lọc
ID/kind/owner/expiry; các điều kiện kỹ thuật khác luôn hợp lệ.

Caller được giả định đã xác thực và kiểm tra former carer/eligibility.
Test không chứng minh ranking, first offer, fallback khi sitter bận hoặc
phân công. DIRECT/SYSTEM là dữ liệu của code, không coi là yêu cầu SRS.
Không thêm test riêng cho TTL, version counter, clinic/day scope, feature
snapshot, trọng số hoặc lỗi DB. AppError/status/message/Date được kiểm tra
theo hợp đồng hàm; SRS không ấn định những biểu diễn kỹ thuật đó.

Kết quả chạy riêng: **18 Passed, 0 Failed** (`bookingCheckoutInput`: 10/0;
`assertMatchSelection`: 8/0). Lint và architecture check của backend đều
Passed. Không sửa runtime hoặc chạy lại các suite lịch sử để suy rộng kết quả.

Chạy từng file từ `backend`:

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/booking-checkout-input.test.js --verbose
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/assert-match-selection.test.js --verbose
```

Bốn hàm DISPATCH được đối chiếu SRS ngày 12/11/2026 theo UC-25, UC-31,
III.7.1, GBR-04/10/12/28/45 và JOB-02 bước 1. Mỗi file chỉ gọi hàm đang test;
`createSitterDispatchService` chỉ được dùng để inject port và lấy `suggest`.
Context/candidates được dựng độc lập; không gọi hàm dispatch khác để tạo
fixture. Các helper nội bộ vẫn chạy thật khi gọi `rankEligibleCandidates`
hoặc `suggest`. Mỗi UTCID có một `test` riêng, khớp sheet tương ứng.

`normalizeDispatchRequest`: 5 ca về lượt Confirmed chưa thanh toán, giữ
preferred sitter optional, thiếu dịch vụ, thiếu khu vực và thiếu giờ.
`serviceId`, `areaCode` và `startAt` là cách ánh xạ dữ liệu của UC-25 vào
context nội bộ. Caller đã giải quyết khu vực từ địa chỉ và kiểm tra former
carer. Fixture thanh toán sau booking dùng paymentRequired=false và
dispatchAllowed=true; không lấy nhánh PREPAY của code làm yêu cầu SRS.

`evaluateCandidate`: 8 ca về người đủ điều kiện, chưa duyệt, suspended,
ngoài khu vực, ngoài giờ làm, ngày nghỉ, conflict gồm travel và ứng viên
thay thế dù khách có preferred sitter. Các flags do port đã tính sẵn; không
chứng minh phép tính lịch, travel buffer hoặc repository thật. Suspended
được biểu diễn bằng active=false trong khi userState vẫn ACTIVE, đúng
GBR-04 cho phép sitter đăng nhập nhưng không nhận lượt mới.

`rankEligibleCandidates`: 7 ca về danh sách có rank/reasons, loại người
không hợp lệ, tất cả bận, rating, số lượt trong ngày, preferred đứng đầu và
người thay khi preferred bận. SRS không cố định trọng số. Hai ca rating/số
lượt giữ mọi yếu tố còn lại bằng nhau, giả định không ai từng chăm pet;
không assert workload phải thắng rating khi hai yếu tố mâu thuẫn. Fixture
activeWorkload là số lượt trong ngày do caller cung cấp, không chứng minh
query đếm. Không cố định tie-break theo ID hoặc khoảng cách. Ca preferred
đủ điều kiện chỉ kiểm tra người đầu tiên, không kết luận số ứng viên khác.

`suggest`: 5 ca đọc ứng viên cho lượt Confirmed/UNPAID, chỉ chuyển người
đủ điều kiện tới ranker, không ai thì rỗng, ưu tiên preferred và đề xuất người
thay khi preferred bận. Reader/ranker là mock. Ranker trong ca lọc chỉ đổi
thứ tự hai người có các yếu tố bằng nhau; không áp trọng số mới ngoài SRS.
Các ca này không tạo offer, giữ chỗ, phân công hoặc lưu Needs action.

Kết quả chạy riêng: **25 ca, 22 Passed, 3 Failed**. Theo từng hàm:
normalizeDispatchRequest 5/0, evaluateCandidate 7/1,
rankEligibleCandidates 6/1, suggest 4/1 (Passed/Failed).
Lint và architecture check của backend Passed.

Ba ca Failed dùng chung `DEF_DISPATCH_PREFERRED_FALLBACK_01`:
DISPATCH-02 UTCID08, DISPATCH-03 UTCID07 và DISPATCH-04 UTCID05.
`evaluateCandidate` thêm NOT_REQUESTED_SITTER cho mọi người khác khi
request có requestedSitterId. Vì vậy ranking/suggest trả selected=[] dù
preferred bận và reader vẫn có một người thay thế đủ điều kiện. GBR-12 và
JOB-02 bước 1 yêu cầu xét người khác khi preferred không nhận được lượt.
Đây là một nguyên nhân được quan sát qua ba hàm, không phải ba lỗi độc lập.
Mã lỗi chỉ dùng theo dõi báo cáo, chưa phải issue GitHub. Giữ test thông
thường với expected theo SRS; không skip/failing hoặc sửa runtime để làm xanh.

Chưa bao phủ prior-care history trong ranking: safeCandidateView/rankingKey
chưa nhận dữ liệu lịch sử theo pet; không tự thêm property giả để viết test
hoặc ghi Passed cho yêu cầu này. Chưa kiểm chứng loại người declined/expired
trong cùng round, first offer thực tế, answer deadline, atomic assignment,
DB rollback hoặc query adapter có lọc mất người thay thế. Không thêm ca
limit 100/10, alias/identifier/timezone, duplicate/tie-break, metric lỗi,
snapshot thiếu hoặc ranker timeout/format vì chưa có căn cứ SRS cho phạm vi
này. AppError, status, reason code và Date theo hợp đồng hàm; không phải SRS
quy định các biểu diễn kỹ thuật đó. Lack of test cases theo mật độ 100/KLOC
của template không phải số yêu cầu SRS thiếu; không thêm ca chỉ để đạt mật độ.

Chạy từng file từ `backend` (ba file sau trả exit code 1 vì lỗi đã ghi nhận):

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/dispatch-normalize-request.test.js --verbose
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/dispatch-evaluate-candidate.test.js --verbose
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/dispatch-rank-eligible-candidates.test.js --verbose
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/dispatch-suggest.test.js --verbose
```

Hai hàm OFFER được đối chiếu SRS ngày 12/11/2026 theo UC-35, III.11.1,
I.4.4 ghi chú 7, GBR-01/02/04/12/13 và UC-25 Postconditions. Mỗi file gọi
riêng một public method thật; factory chỉ inject repository/clock. Hai method
là wrapper arrow một dòng gọi `decide` dùng chung: báo cáo ghi C3=1 LOC của
wrapper, không cộng lại LOC helper vào từng hàm. `decide` và guards chạy thật.

`accept` có 13 ca: nhận offer hợp lệ cho visit trả sau booking; Guest,
Customer và sitter khác không được nhận; biên ngay trước/đúng/sau hạn 2 giờ;
offer đã đóng; visit đã được Staff/sitter khác nhận; sitter suspended;
conflict gồm travel; ngay trước/đúng hạn 30 phút cho lượt sắp bắt đầu.
Clock cố định. OfferedAt/deadline trong fixture đúng 2 giờ hoặc 30 phút;
test chỉ chứng minh hàm tôn trọng deadline đã lưu, không chứng minh nơi tạo
offer đã tính đúng thời hạn hay ngưỡng 24 giờ.

Ca thành công kiểm tra offer ACCEPTED, visit ASSIGNED, bản ghi assignment
và event OfferAccepted qua port. Không chứng minh Customer đã nhận thông
báo hoặc UI MSG26. Ca visit có người nhận trước chỉ dựng snapshot đã được
lưu trước, không mô phỏng đua hai transaction. Eligibility/slot là port giả
đã tính suspended và conflict/travel; test không kiểm chứng query lịch hoặc
phép tính buffer. Fixture UNPAID/paymentRequired=false theo UC-25 trả sau
booking, không dùng nhánh PREPAY của code làm yêu cầu SRS.

`decline` có 7 ca: thiếu reason bắt buộc; Guest, Customer và khác chủ;
đúng hạn 2 giờ/30 phút; offer đã Accepted. Chữ ký hiện tại chỉ có
`decline(actor, offerId, expectedVersion, idempotencyKey)`, không nhận reason
hoặc details. Không truyền thêm tham số thứ 5 hoặc property giả. SRS yêu
cầu reason chọn từ danh sách nhưng chưa liệt kê bộ giá trị; không bịa enum
hoặc giới hạn độ dài. Chưa thể kiểm thử luồng Decline hợp lệ có lý do và lưu
lý do với hợp đồng hiện tại. Sáu ca guard Passed chỉ chứng minh các chặn
hiện có, không coi là luồng Decline hợp lệ hoặc hàm đã đạt toàn bộ SRS.

Kết quả chạy hai file: **20 ca, 19 Passed, 1 Failed**. `accept`: 13/0;
`decline`: 6/1 (Passed/Failed). Lint và architecture check backend Passed.
Giữ test Failed thông thường, không dùng skip/failing hoặc sửa runtime.

`DEF_OFFER_DECLINE_REASON_01` — OFFER-02 UTCID01: không có reason nhưng hàm
không ném lỗi, fixture ghi DECLINED (writes=1) và OfferDeclined (events=1),
trái UC-35 Alternative 4.1 bước 1, GBR-12 và III.11.1 Reason Required.
Expected là từ chối validation, giữ PENDING và không ghi quyết định/outbox.
Status 422 theo quy ước validation project, không phải mã SRS; không bịa
code REASON_REQUIRED hoặc thông báo UI. Mã defect dùng trong báo cáo,
chưa phải issue GitHub.

Repository double thực sự chạy callback execute(transaction), cập nhật
store offer/visit/assignment và lưu event. Nó không mô phỏng MongoDB
transaction, rollback, khóa occupancy hoặc idempotency durable. Chưa kiểm
chứng offer tiếp theo, không offer lại trong round, notification delivery
hoặc MSG24/26/79 trên frontend. Các mã AppError/status/message còn lại theo
hợp đồng service hiện tại, không phải SRS quy định chuỗi kỹ thuật.

Không bổ sung ca ID/key/version sai, replay, clock/provider/port lỗi,
PREPAY hoặc DIRECT mismatch. Các tham số kỹ thuật luôn hợp lệ. Thiếu
coverage SRS không được suy ra từ chỉ số mật độ Lack of test cases và không
được lấp bằng test ngoài SRS.

Chạy từng file từ `backend` (`offer-decline` trả exit code 1 do lỗi trên):

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/offer-accept.test.js --verbose
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/offer-decline.test.js --verbose
```

Hai hàm `reassign` và `withdraw` được đối chiếu SRS ngày 12/11/2026 theo
UC-38/82, I.4.4, III.11.1.3/4/11.2.1 và GBR-01/02/03/04/13/21/24/29/32.
Mỗi file chỉ gọi một method thật, mỗi UTCID có một `test` riêng. Factory chỉ
inject repository/clock. `runVisitCommand` double thực sự chạy callback
execute(transaction); guards và quyết định service chạy thật. Port đọc trả
bản sao để cập nhật store sau khi lưu không làm thay đổi old sitter snapshot.

`reassign` có 10 ca: Staff đổi người và yêu cầu bàn giao có lý do/người
cũ/thời điểm; Admin có cùng quyền; Guest/Customer bị chặn; lý do trống;
replacement overlap hoặc suspended; no-show sau 30 phút; Staff khác đã lưu
trước; không chọn lại người hiện tại. Mặc định người mới trong giờ/khu vực,
eligibility/slot do port giả cung cấp. Ca bình thường quan sát event và notify
cho hai sitter, chưa chứng minh Customer đã nhận thông báo. Ca Staff khác
lưu trước dùng form version 4 và bản ghi đã đổi version 5 theo GBR-13/MSG25;
không phải test validation version hoặc đua hai transaction thật.

`withdraw` có 11 ca: rút sớm với lý do; biên 12 giờ +1 ms, đúng 12 giờ và
12 giờ −1 ms; còn 6 giờ/30 phút; đã check-in; khác chủ; Guest/Customer;
lý do trống. SRS cho tự rút khi còn **ít nhất 12 giờ**. Khi ít hơn 12 giờ,
sitter giữ phân công đến khi Staff reassign/cancel. Port withdrawAssignment
giả cập nhật assignment WITHDRAWN và bỏ phân công trong visit tổng hợp;
test không chứng minh phép ghi DB thật. Reason là nhãn tổng hợp, không phải
enum được SRS chốt. Không test giới hạn 1000 ký tự hoặc control character.

Kết quả chạy riêng: **21 ca, 18 Passed, 3 Failed**. `reassign`: 9/1;
`withdraw`: 9/2 (Passed/Failed). Lint và architecture check backend Passed.
Giữ test Failed thông thường, không skip/failing hoặc sửa runtime.

- `DEF_REASSIGN_NO_SHOW_01` — REASSIGN UTCID08: visit chưa check-in, vẫn
  ASSIGNED sau giờ dự kiến 30 phút, nhưng hàm ném VISIT_STARTED vì startAt
  đã qua. III.11.2.1 và GBR-14/29 cho phép Staff đổi người ở tình huống này.
- `DEF_WITHDRAW_12H_01` — WITHDRAW UTCID04/05: còn 12 giờ −1 ms hoặc 6 giờ,
  hàm vẫn rút assignment và ghi event. Code đang dùng 60 phút, trái ngưỡng
  12 giờ của GBR-21/UC-82/III.11.1.4. Hai ca cùng một nguyên nhân.

Các mã defect chỉ dùng trong báo cáo, chưa phải issue GitHub. Ca 30 phút
Passed chỉ chứng minh chặn self-withdraw và trả route STAFF, chưa chứng minh
lưu late-withdrawal request vào Needs action hoặc gửi MSG56. Đây là mẫu
trong phân vùng dưới 12 giờ, không phải một biên SRS mới.

Chưa kiểm chứng Call first/xác nhận đã gọi khi replacement ngoài giờ/khu
vực theo GBR-32; hợp đồng hàm không có tham số xác nhận đó, không tự thêm
flag giả hoặc biến quy tắc cảnh báo thành cấm tuyệt đối. Chưa kiểm chứng
Customer notification delivery, revoke assignment/offer cũ, bàn giao được
xác nhận trước 1 giờ, flag/note bàn giao của withdrawal, đếm withdrawal,
offer người tiếp theo hoặc xử lý không còn ai. Không ghi các phần này Passed.

Store/eligibility/slot/outbox/notification là double. Không mô phỏng rollback,
khóa occupancy, durable CAS/idempotency hoặc provider thật. Không thêm ca
ID/key/version validation, replay, clock/DB/port lỗi hoặc finance/refund.
AppError/status/code/route theo hợp đồng service hiện tại; SRS không đặt
tên các mã kỹ thuật. Không assert UI/log hoặc chuỗi chứa mốc 60 phút trái
SRS. Chỉ số mật độ Lack of test cases không phải số yêu cầu SRS chưa bao phủ.

Chạy từng file từ `backend` (cả hai trả exit code 1 do các lỗi đã ghi nhận):

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/visit-reassign.test.js --verbose
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/visit-withdraw.test.js --verbose
```

Ba hàm BILL được đối chiếu SRS ngày 12/11/2026 theo UC-25/39/49, III.7.1,
I.4.4 và GBR-02/09/15/17/26. Mỗi file chỉ gọi một hàm/method thật; factory
chỉ inject ports/clock. Các method service vẫn gọi payment-mode helper thật
bên trong. Mỗi UTCID có một `test` riêng, không test.each/skip/failing hoặc
JSON runtime. Không sửa runtime để làm test xanh.

`paymentModeForOriginalVisitCount` có 3 ca cho số lượt hợp lệ 1, 2 và 60.
SRS yêu cầu trả sau booking cho cả một và nhiều lượt, không có quy tắc đổi
sang PREPAY vì số lượt. Biên 60 suy ra từ 30 ngày × 2 lượt/ngày của GBR-09,
giả định Customer đã từng trả bill; không chứng minh hàm kiểm tra lịch hoặc
GBR-33. Không thêm ca count 0/âm/NaN/overflow hoặc coi 2 là ngưỡng PREPAY
được SRS đặt ra.

`createPrepaymentIntent` có 4 ca về không tạo yêu cầu trả trước và đúng chủ.
Không có ca PREPAY thành công hợp lệ theo SRS này. Hai ca đầu dùng context
CONFIRMED/POSTPAY còn chưa kết thúc; ca thứ ba tái hiện snapshot bất thường
AWAITING_PAYMENT/PREPAY do nhánh code hiện tại tạo, với quote/deadline đủ
dữ liệu để quan sát khả năng tạo intent. Đây không phải policy được SRS
phê duyệt. Các ca cấm trả trước chỉ yêu cầu từ chối và không ghi intent/bill,
không bịa một mã lỗi cụ thể. Việc có intent PENDING không chứng minh đã
thu tiền, đã gọi payOS hoặc đã có link thanh toán thật.

`issuePostpayBill` có 7 ca: bill dương sau một lượt; booking nhiều lượt;
booking/lượt chưa xong; incident còn hold; complaint chưa final; khác chủ;
lượt cuối CANCELLED có phí hủy dương. COMPLETED ở context booking là biểu
diễn nội bộ cho đã kết thúc, không khẳng định SRS dùng enum đó. UC-49
Preconditions cho phép lượt cuối finished hoặc cancelled. Tiền 300000 VND
và phí hủy 30000 VND do eligibility port cung cấp, không chứng minh tính
giá/giảm giá/phí hủy/tiền Admin duyệt. Bill ISSUED là khoản phải trả, chưa
phải receipt/payment record/thu nhập sitter; không ghi PAID khi mới lập bill.

Fixture final tại NOW, dueAt=NOW+48 giờ từ eligibility port và completedAt
sớm hơn một giờ. Ca thường kiểm tra giữ dueAt đó, không chứng minh hàm
tính 48 giờ. Snapshot hold/chưa final không chứng minh query case, cửa sổ
disagree 72 giờ hoặc quyết định Admin. Chưa bao phủ bill 0 đóng booking,
Staff-closed visit, tip, thông báo bill/email, webhook/dedup, retry payment
hoặc Overdue. Các phần này không được ghi Passed.

Kết quả chạy riêng: **14 ca, 9 Passed, 5 Failed**. Theo từng hàm:
paymentModeForOriginalVisitCount 1/2; createPrepaymentIntent 3/1;
issuePostpayBill 5/2 (Passed/Failed). Lint và architecture check backend
Passed. Các mã dưới đây dùng theo dõi báo cáo, chưa phải issue GitHub:

- `DEF_BILL_PAYMENT_MODE_01` — BILL-01 UTCID02/03 chọn PREPAY với 2/60
  lượt; BILL-03 UTCID02 chặn bill trả sau cho 2 lượt. Cùng một chính sách
  sai so với UC-25/GBR-17/UC-49, không phải ba lỗi độc lập.
- `DEF_BILL_PREPAY_01` — BILL-02 UTCID03 vẫn ghi một intent PENDING từ
  snapshot PREPAY trước khi booking kết thúc; liên quan chính sách mode
  trong code, không kết luận đã thu tiền thật.
- `DEF_BILL_CANCELLED_VISIT_01` — BILL-03 UTCID07 chặn bill có phí hủy
  final vì visitState CANCELLED, trong khi UC-49/UC-39/GBR-15/17 cho phép
  booking kết thúc bằng lượt cuối bị hủy và vẫn có khoản phải trả.

Port context thực sự lọc owner/booking/visit theo query nhận được. Port ghi
lưu bản ghi vào store tổng hợp và trả bản sao. Không mô phỏng DB transaction,
atomicity, durable idempotency, provider hoặc route/session authorization.
Không thêm ID/key/version, stale quote, replay, currency sai, lỗi port/clock
hoặc deadline kỹ thuật PREPAY vì chưa có đặc tả SRS cho phạm vi này.
AppError/status/state theo hợp đồng code, không phải SRS ấn định chuỗi kỹ
thuật. Lack of test cases là mật độ template, không phải số yêu cầu SRS thiếu.

Chạy từng file từ `backend` (đều trả exit code 1 vì các lỗi đã ghi nhận):

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/billing-payment-mode-for-original-visit-count.test.js --verbose
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/billing-create-prepayment-intent.test.js --verbose
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/billing-issue-postpay-bill.test.js --verbose
```

Ba hàm PAYOS được đối chiếu SRS ngày 12/11/2026 theo API-01/02/03,
UC-49, GBR-17/18, JOB-03/04 và IV.3 Payment details. Mỗi file chỉ gọi một
method thật; factory chỉ inject fetch và khóa tổng hợp. Không gọi method
payOS khác để tạo fixture. HMAC/response verification chạy thật, không mock
crypto. Mỗi UTCID có một `test` riêng, không test.each/skip/failing hoặc
JSON bên ngoài khi chạy test.

`createPaymentLink` có 5 ca: link/VietQR và request có auth/HMAC/deadline;
bill 0 không gửi request thanh toán; provider từ chối; lỗi kết nối; thử lại
sau lần từ chối rõ ràng. Caller được giả định đã xác thực owner, bill final,
không hold và hạn trả tiền. Clock cố định, expiredAt là deadline NOW+48 giờ
từ caller; chỉ kiểm tra chuyển giá trị này sang provider. Chưa chứng minh
link thật hết hạn hoặc bill được tính hạn 48 giờ. Ca 0 chỉ chặn yêu cầu thu,
không kiểm chứng đóng booking với bill 0.

Response PENDING không phải đã thanh toán. Adapter không có port booking,
nên các ca provider lỗi không chứng minh bill thực tế vẫn UNPAID, MSG33
hoặc Staff list. Retry dùng fetch mock trả payload từ chối rõ ràng trước khi
tạo link, rồi trả link ở lần sau; không suy rộng thành retry an toàn khi
timeout/POST có kết quả chưa rõ hoặc provider đã tạo link.

`getPaymentLink` có 3 ca: GET có auth trả PAID; trả PENDING/chưa thanh toán;
lỗi mạng không trả trạng thái suy đoán. Đây là dữ liệu để caller đối soát,
không trực tiếp chuyển booking Paid/Overdue hoặc cancel product order.
Chưa kiểm chứng job guard về owner/hold/deadline, race payment đến khi job
chạy hoặc việc ghi payment một lần. Enum/field provider theo hợp đồng
adapter, không khẳng định SRS đặt mọi tên kỹ thuật.

`verifyWebhook` có 5 ca: HMAC hợp lệ; thiếu signature; signature sai; amount
bị sửa nhưng giữ chữ ký cũ; signed data code=99 trong envelope success=true.
Theo hợp đồng provider, body.data là phần có chữ ký, root success/code không
phải bằng chứng trả tiền. Ca cuối giữ kết quả đã ký, không tự chuyển bill
UNPAID/PAID. Chữ ký fixture tính trước bằng Python hmac với chuỗi canonical
ghi ngay trong file test; không dùng signer của code đang test. Request
HMAC của ca tạo link được đối chiếu với một canonical string tường minh.

Chưa kiểm chứng matching amount/order/currency với intent, receipt identity,
webhook trễ/lặp, dedup/ghi payment một lần, dispatch sau payment, hoặc
privacy/storage của toàn bộ luồng. Các phần này thuộc payment-webhook
service/repository. Verify trả dữ liệu đã ký cho lớp nội bộ xử lý tiếp,
không được coi là đã xác nhận giao dịch trong DB.

Kết quả chạy riêng: **13 ca, 13 Passed, 0 Failed**. createPaymentLink 5/0;
getPaymentLink 3/0; verifyWebhook 5/0 (Passed/Failed). Lint và architecture
check backend Passed. Không sửa runtime, không gọi payOS hoặc dùng khóa thật.
Các response thành công là plain JSON fixture có chữ ký literal, không làm
tắt kiểm tra kiểu dữ liệu hay signature của provider.

Không thêm ca config/env, URL/credential validation, ID/mô tả/items limits,
null/deep canonicalization, expiredAt int32, timeout numeric hoặc parser
format theo nhánh code. AppError/status/field và canonical encoding theo
hợp đồng provider; SRS là nguồn chọn hành vi nghiệp vụ. Không assert UI/log
hoặc kết luận tích hợp production từ các ca Passed. Lack of test cases là
mật độ template, không phải số yêu cầu SRS còn thiếu.

Chạy từng file từ `backend`:

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/payos-create-payment-link.test.js --verbose
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/payos-get-payment-link.test.js --verbose
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/payos-verify-webhook.test.js --verbose
```

Bốn hàm webhook/refund được đối chiếu ngày 12/11/2026 với SRS UC-48 Normal 4,
UC-49 Normal 5–6 / Alternative 5 và 5.1, UC-51, GBR-02/03/18/30,
API-03, Payment lifecycle và IV.3 Payment details. Mỗi UTCID có một test
riêng và khớp cột trong sheet tương ứng. Dùng dữ liệu tổng hợp; không sửa runtime.

| Hàm | Passed | Failed | Phạm vi SRS |
| --- | ---: | ---: | --- |
| handleWebhook | 3 | 2 | Chữ ký, ghi một lần, callback trễ, kết quả thất bại |
| propose | 6 | 1 | Reason/evidence, giới hạn tổng bill, quyền Staff/Admin |
| decide | 5 | 2 | Duyệt/giảm/từ chối, bill chưa trả, giới hạn bill, quyền Admin |
| recordTransfer | 2 | 0 | Ghi khoản kế toán đã trả ngoài PWC; chặn chưa duyệt |

Kết quả thực chạy: **21 ca, 16 Passed, 5 Failed, 0 Untested**. Lint và
architecture check backend Passed. Các ca Failed chạy bình thường, có Defect ID
trong sheet; không dùng skip/todo/failing hoặc đổi kỳ vọng để chạy xanh.
Mã defect là mã theo dõi cục bộ, chưa tạo GitHub issue.

- `DEF_WH_LATE_01`: giao dịch thành công 02:00Z, hết hạn 04:00Z, callback đến
  05:00Z. Theo UC-49 Alternative 5.1, khoản trả trước hạn phải được ghi nhận.
  Hiện hàm trả reconciliation/INTENT_EXPIRED và chưa yêu cầu ghi payment/Paid.
- `DEF_WH_FAILURE_01`: signed data code=99 đại diện payment thất bại. UC-49
  Alternative 5 yêu cầu ghi Failed. Hàm chỉ gửi reconciliation, receipt lưu
  provider code nhưng intent vẫn PENDING trong double. FAILED là ánh xạ Payment
  lifecycle của SRS vào fixture; code chưa có decision ghi Failed. Đây là
  khoảng trống ở service/port đang test, chưa kết luận consumer đối soát của
  luồng production không xử lý được.
- `DEF_REF_EVIDENCE_01`: GBR-30 yêu cầu evidence cùng reason, nhưng bỏ
  evidenceRefs thì hàm vẫn lưu PROPOSED với mảng bằng chứng rỗng.
- `DEF_REF_LOWER_01`: UC-51 cho Admin giảm 30000 xuống 20000. Hàm không nhận
  số tiền duyệt; test dùng amountVnd=20000 làm probe và code bỏ qua, giữ 30000.
  SRS không quy định tên field này; cần bổ sung hợp đồng hỗ trợ giảm tiền.
- `DEF_REF_UNPAID_01`: UC-51 Normal 4 yêu cầu giảm bill chưa trả 100000 còn
  70000. Chưa thu tiền nên collected capacity=0; hàm ném REFUND_LIMIT_EXCEEDED,
  không có port cập nhật bill hoặc phân nhánh paid/unpaid. Bill fixture chỉ
  quan sát; không tự cập nhật bill trong mock để thay logic service.

Webhook dùng verifier giả để kiểm tra thứ tự chặn và repository double có
receipt dedup theo eventId, điều kiện MARK_PAID, payment và outbox. HMAC thật
thuộc file verifyWebhook trước đó, không được tính là đã kiểm tra trong suite
này. Chỉ chứng minh lệnh service gửi tới port và hiệu ứng trong double, chưa
chứng minh transaction/index, dedup MongoDB hay consumer đối soát production.
Receipt không có accountNumber/signature; không suy rộng thành mọi storage/log
đều an toàn. Không kiểm chứng UI MSG31/32, product order/counter, retry link
hoặc expiry/CAS/timezone như các case riêng ngoài SRS.

Refund fixture seed record trực tiếp, không gọi propose để dựng decide hoặc
decide để dựng recordTransfer. UnitOfWork clone state và chỉ commit khi callback
thành công. Repository double thực hiện CAS/reserve/settle/ledger cơ bản;
kiểm tra quyền, số tiền và bằng chứng vẫn do service thật thực hiện.
Capacity 30000 biểu diễn bill 100000 trừ khoản đã hoàn/giữ 70000. Biên 30000
và 30001 suy ra từ trần tổng bill và đơn vị VND; không đặt tỷ lệ hoàn mới.
Chưa kiểm chứng cách adapter tính tổng collected/adjustments, DB concurrency,
case finality hoặc thông báo cho Staff/Customer.

`recordTransfer` chỉ ghi nhận khoản đã được kế toán trả ngoài PWC; không gọi
ngân hàng/payOS. Admin là điều kiện fixture theo code, không khẳng định SRS
định nghĩa quyền riêng cho thao tác ghi chuyển khoản hoặc role Accounting.
Reference/evidence/paidAt đầy đủ theo hợp đồng code. Không tạo case UNKNOWN,
FAILED, retry, sai format, thiếu chứng từ hoặc timestamp tương lai vì SRS
chưa đặc tả những nhánh kỹ thuật này. AppError/status/enum là hợp đồng code,
SRS là nguồn chọn tình huống nghiệp vụ. Lack of test cases là mật độ template,
không phải số requirement chưa bao phủ; không thêm case ngoài SRS để đạt 0.

Chạy từng file từ `backend` (ba file đầu hiện trả exit code 1 do các ca Failed
nêu trên):

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/payment-handle-webhook.test.js --verbose
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/refund-propose.test.js --verbose
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/refund-decide.test.js --verbose
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/refund-record-transfer.test.js --verbose
```


Đối chiếu payroll ngày 13/11/2026 dùng bản SRS hiện tại: UC-75 Review Pay
Statement, UC-76 Close Pay Statement, GBR-31/43/44 và Permission Matrix/GBR-02.
SRS quy định full-time hưởng lương tháng hợp đồng; part-time hưởng theo lượt
đủ điều kiện; mỗi lượt/groomed pet có difficulty bonus và tips qua PWC được
chia cho những người làm. Không lấy KPI/5% commission/50% advance của policy
legacy làm requirement SRS. Mỗi UTCID là một test độc lập, không each/skip/todo/
failing hoặc JSON runtime. Không sửa runtime.

| Hàm | Ca | Passed | Failed | Giới hạn kết luận |
| --- | ---: | ---: | ---: | --- |
| calculateEmployeePayroll | 3 | 2 | 1 | Contract base full-time; part-time không có lượt |
| prepareStatement | 5 | 4 | 1 | Period/cadence, monthly base, kỳ chưa kết thúc và quyền |
| prepareAutomaticStatement | 3 | 3 | 0 | Wrapper chuyển assessment tháng/tuần và quyền |
| decideStatement | 4 | 4 | 0 | Ghi trả ngoài PWC, chặn PREPARED, bảo toàn PAID, quyền |
| submitAdvance | 0 | 0 | 0 | Chưa có đặc tả SRS, không thực thi |
| decideAdvance | 0 | 0 | 0 | Chưa có đặc tả SRS, không thực thi |

Kết quả thực chạy bốn file: **15 ca, 13 Passed, 2 Failed, 0 Untested**.
Lint và architecture check backend Passed. Defect ID trong sheet là mã cục bộ,
chưa tạo GitHub issue. Các ca Failed chạy bình thường và giữ kỳ vọng SRS:

- `DEF_SAL_PARTTIME_01`: không có lượt hoàn thành, không bonus/tips nhưng
  calculator legacy PART_TIME/paidMinutes vẫn trả base 3000000 thay vì 0.
  monthlyBaseVnd là field code bắt buộc, không phải SRS cho part-time lương tháng.
  Cần mô hình trả theo lượt. Giá trị full-time 10000000 trong fixture là hợp đồng
  tổng hợp, không phải mức lương bắt buộc của SRS.
- `DEF_PAY_WEEK_01`: kỳ tuần 26/10–02/11 đã kết thúc bị chặn vì qua cuối tháng.
  UC-75/GBR-44 quy định statement part-time theo tuần; hàm hiện yêu cầu chia
  assessment và không lập được một statement cho cả tuần này.

`calculateEmployeePayroll` UTCID02 chỉ assert phần base, không xác nhận total
có commission legacy là đúng SRS. Hàm chưa nhận đơn giá/số lượt, difficulty
bonus hoặc tips; không bịa input/định mức để gán Passed cho các phần này.
`prepareStatement` UTCID02 chỉ xác nhận period/payCycle WEEKLY, không xác nhận
số tiền part-time. Các fixture không có credit/tip/difficulty/advance hoặc
statutory deduction, không đổi hợp đồng, không có kỳ cũ trùng nhau.

Model, storage gate, preview, commission source và notification là dependency
doubles khi cần; validator/calculator vẫn thật trong file prepareStatement.
Query double lọc employee/month/status; CAS cập nhật đúng id/version;
transaction clone state và chỉ commit khi callback thành công. Không chứng minh
MongoDB transaction/index, nguồn tổng hợp thu nhập hay notification delivery.

File prepareAutomaticStatement chỉ gọi wrapper thật, preview và
this.prepareStatement đều là dependency giả. Preview input có shape thực tế;
sourceHash khớp là precondition kỹ thuật. Các ca chỉ chứng minh chuyển đúng
assessment tháng/tuần và kết quả dependency; không chứng minh preview đúng,
DB đã lưu hay job chạy đúng cuối kỳ. Không chạy chung method prepareStatement
thật trong file wrapper.

File decideStatement dùng APPROVED làm enum code của fixture được giả định đã
review/đóng theo SRS; chưa chứng minh approval tương đương hoàn tất sitter review
hoặc chặn được mọi statement chưa đóng. Chưa kiểm chứng accept/complain trong
3 ngày, Admin correction/explanation, đóng không có review lần hai hoặc điều
chỉnh kỳ sau. Chỉ bảo toàn bảng kê PAID và ghi khoản đã được trả ngoài PWC;
không gọi ngân hàng/payOS hoặc chuyển tiền thật.

Hai hàm tạm ứng được ghi 0 ca trong danh mục trên, không có `.test.js` rỗng
hoặc ca giả vì SRS không đặc tả nghiệp vụ/quyền tạm ứng. Không tự đặt hạn mức
50%, một lần/tháng, không lãi, rút/duyệt/chi dựa theo code. 0 ca không có nghĩa
đã Passed; Untested=0 vì chưa có danh sách ca, Lack of test cases=N/A.
Các tab có ca dùng mật độ 100 ca/KLOC theo template; chỉ số Lack không phải
số requirement chưa bao phủ và không dùng để thêm case ngoài SRS.

Chạy từng file từ `backend` (hai file đầu hiện exit code 1 do defect trên):

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/calculate-employee-payroll.test.js --verbose
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/payroll-prepare-statement.test.js --verbose
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/payroll-prepare-automatic-statement.test.js --verbose
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/payroll-decide-statement.test.js --verbose
```


Đối chiếu adjustment/commission ngày 13/11/2026 theo SRS UC-76 Normal 3–4,
Alternative 6.1/Postconditions, GBR-44 và Permission Matrix/GBR-02.
`submitAdjustment` có 4 ca; `decideAdjustment` có 4 ca. Kết quả thực chạy:
**8 Passed, 0 Failed, 0 Untested**. Lint và architecture check backend Passed.
Mỗi file chỉ gọi một target thật; validator thật; không gọi target khác để seed
fixture. Mỗi UTCID là một test riêng, không each/skip/todo/failing/JSON runtime.
Không sửa runtime hoặc tạo bảng kê/chuyển tiền thật.

Các ca submit chỉ kiểm chứng ghi sai số thiếu/thừa vào record riêng có lý do,
history và giữ nguyên bảng kê PAID. SUPPLEMENT/RECOVERY là biểu diễn hai dấu
sai số trong code; SRS không quy định workflow thu hồi lương hoặc tỷ lệ khấu trừ
mới. Các ca decide ánh xạ xác nhận sai số vào APPROVE, giải thích số cũ đúng vào
REJECT, giữ decisionReason/history và nguyên original PAID. Đây là ánh xạ hạn chế;
không khẳng định SRS yêu cầu workflow hai bước tạo/duyệt adjustment hoặc REJECT
đã đóng complaint/statement.

Yêu cầu đưa sửa sai vào bảng kê kỳ sau theo UC-76/GBR-44 **chưa được chứng minh**.
Hai hàm chỉ lưu/duyệt record riêng, chưa nhận kỳ áp dụng hay gộp khoản vào
statement kỳ sau. Không tự thêm param settlementPeriod hoặc cập nhật kỳ sau
trong mock để gán Passed. Notification delivery, complaint closure/no-second-review,
payroll adapter và trả tiền ngoài PWC cũng chưa được kiểm chứng.

Role/command/model/event là dependency doubles. Role port được cấu hình từ chối
ở ca Staff; test kiểm tra target gọi role(actor, ADMIN) và dừng trước command,
không chứng minh implementation phân quyền của payroll service. Command clone
state và chỉ commit khi callback thành công. Model lọc original id, adjustment
id/version và reference, event chỉ lưu history quan sát. Chưa kiểm chứng MongoDB
transaction/index/idempotency/audit hoặc notification production.
Original 10000000 và sai số 200000 là fixture tổng hợp, không phải hạn mức SRS.
Không thêm ca số tiền/overflow/ID, 1000 ký tự, source reuse, CAS race,
RECORD_PAYMENT/RECONCILE hoặc transfer claim từ nhánh code ngoài đặc tả SRS.

Ba hàm còn lại được ghi trong danh mục trên với 0 ca áp dụng:

- `allocateBookingReceipt`: SRS chưa đặc tả phân bổ receipt/thuế theo trọng số
  visit, largest remainder, hash snapshot hoặc tax 50/50. Quy tắc chia đều tips
  của GBR-31 không phải quy tắc phân bổ khoản thu dịch vụ/thuế; hàm không nhận tips.
- `calculateWeeklyCommission`: SRS GBR-31/43/44 dùng contract pay/visit pay,
  difficulty bonus và tips; không đặc tả phí 10/9/8/7%, biên 5/10/20 booking
  hoặc reset thứ Hai. Policy legacy/addendum khác không thay thế SRS của yêu cầu này.
- `previewEqualTaxCostSplit`: SRS chưa đặc tả tax cost 50/50, bên chịu VND lẻ,
  trừ thuế khỏi khoản sitter hoặc platform funding. Không tự suy ra từ code.

Không tạo `.test.js` rỗng hoặc ca giả cho ba hàm chưa có đặc tả. 0 ca không có
nghĩa đã Passed; Untested=0 vì chưa có danh sách ca, Lack of test cases=N/A.
Các sheet có ca vẫn dùng mật độ 100 ca/KLOC của template; không thêm case ngoài
SRS để đưa Lack về 0. AppError/status/enum theo hợp đồng code, SRS chọn hành vi.

Chạy riêng từng file từ `backend`:

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/salary-submit-adjustment.test.js --verbose
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/salary-decide-adjustment.test.js --verbose
```


Đối chiếu shop/settlement ngày 14/11/2026 theo SRS UC-62/64/65/66/67,
III Shopping Cart/Product Checkout/Order Management/Stock List,
GBR-10/35/36/37/42 và JOB-04 trong phạm vi ghi rõ từng ca. Mỗi UTCID có một
test riêng trong file tương ứng, chỉ gọi một target method/function thật.
Không test.each/skip/todo/failing hoặc runtime JSON. Không sửa runtime.

Kết quả thực chạy **48 ca: 44 Passed, 4 Failed, 0 Untested**, trong 12 file.
Lint và architecture check backend Passed. Bảy hàm settlement được ghi 0 ca
trong danh mục trên, không có `.test.js` rỗng hay ca giả: SRS không đặc tả
request-week/quota, ordinal booking chọn bậc phí, earning dựa receipt/tax,
reservation và yêu cầu quyết toán của mô hình LEGACY_PARTNER. Không đồng nhất
quyền xem thu nhập hoặc tuần lương theo GBR-31/44 với projection bucket/quota
của settlement legacy. 0 ca không có nghĩa Passed; Lack=N/A và Untested=0
vì chưa có danh sách ca được SRS đặc tả.

Riêng readOwn có 4 ca từ I.4.4 note 10/GBR-02/Privacy để kiểm quyền PET_SITTER,
query đúng sitterId, chặn earning/request sai owner và lọc field riêng tư.
Repository/policy/UoW là doubles; role/owner/allowlist thật. Chỉ isolation/read-only,
không xác nhận các số dư/quota/request-week hoặc công thức legacy. Không chứng minh
endpoint legacy đang mở ở runtime hoặc thay được nguồn thu nhập theo SRS.

Bốn ca Failed giữ kỳ vọng SRS, có mã theo dõi cục bộ trong sheet (chưa tạo issue):

- `DEF_SHOP_PREPAID_DELIVERY`, `DEF_SHOP_PREPAID_PICKUP`: UC-62 cho phép
  trả trước qua payOS cho cả delivery/pickup, nhưng validator hiện chỉ nhận
  COD/PAY_AT_SHOP và từ chối PREPAID. Chưa kiểm chứng tạo link/QR/webhook thật.
- `DEF_SHOP_SHIP_UNPAID`: UC-64 Alternative 1.1 cấm chuẩn bị prepaid chưa trả;
  code vẫn handed to carrier, giải phóng hold và trừ stock.
- `DEF_SHOP_CANCEL_REFUND`: prepaid đã trả bị cancel phải refund mark theo
  GBR-37/UC-67/JOB-04; code CANCELLED/release hold nhưng không ghi refundMarked.

Các ca pricing chỉ xác nhận line totals/subtotal và pickup không shipping.
Giá fixture tổng hợp, không dùng flat demo shipping fee 25000 làm requirement.
Chưa kiểm chứng tier discount GBR-42, configured area fee, refusal limit,
payOS deadline/provider hoặc job thực tế. Các hàm chưa có contract dữ liệu cần
thiết không được gán Passed cho phần này bằng cách thêm param giả.
Sellable quantity kiểm tra stock-held với biên 0/1 trên dữ liệu nhất quán;
không thêm case stock âm, NaN/overflow hoặc held vượt stock theo code Math.max.

Model/UoW/notification/phone/code generator là doubles; target, validator,
permission, calculator và transition chạy thật. Model thực thi filter
id/status/version, $gte/$expr, stock-held >= quantity và ghi create/update;
không tự thực hiện trạng thái/paid/refund của service. Transaction clone state,
commit chỉ khi callback thành công. Không chứng minh MongoDB races/index,
runtime routes, actual notification delivery hoặc provider production.
Các trạng thái được seed trực tiếp; không gọi method khác để dựng fixture.

Carrier handoff và pickup handover mới trừ stock; markReady/payment/status
delivery/returning giữ stock theo SRS. ConfirmReturned cộng chỉ hàng bán lại,
phân biệt ba lý do SRS, chỉ khách từ chối mới tăng refusal. Biên 0..ordered
theo SRS/MSG104; không dùng giới hạn cart/regex từ code làm case SRS. Gửi lại
confirm không cộng stock/refusal lần hai, nhưng chưa kiểm chứng Mongo races.
Refund test chỉ mark, không tính tiền hoàn/shipping hoặc trả tiền kế toán.

RecordPayment test xác nhận cash đã nhận đủ theo precondition của caller và
không ghi lặp, giữ hold tới handover; chưa kiểm chứng partial cash vì API không
nhận amount. Không coi mọi cash confirmation cho order ban đầu PREPAID đều
bị SRS cấm, và không coi method này là webhook verifier.
Cancel test giả định caller đã xác nhận điều kiện hủy hợp lệ; chỉ kiểm tra
tác động stock/refund, chưa kiểm chứng deadline, hỏi payOS trước hủy, unpaid
race tại thời điểm save, refusal pickup no-show hoặc quyền hủy thủ công tùy ý.
MarkReady chỉ gọi notification port, chưa chứng minh thời hạn pickup được tính
đúng từ lúc ready hoặc nội dung khách thấy. AppError/status/enum là hợp đồng
code; SRS chọn hành vi nghiệp vụ, không đặt mọi chuỗi kỹ thuật.

Cách chạy từng file: lấy tên file ở bảng danh mục đầu tài liệu và dùng
`npm run test:unit -- --runTestsByPath tests/unit/report5-functions/<tên-file>.test.js --verbose`
từ thư mục `backend`.
Ba file place, handToCarrier và cancel hiện exit code 1 do các ca Failed nêu trên.


Đối chiếu profile/user/pet ngày 14/11/2026 theo SRS UC-04/10/11/13/14/15,
III Account Settings/User List/User Details/Customer Profile/Pet List/Pet Details,
GBR-01/02/04/06/27/43 và MSG12/72. Mỗi UTCID là một test tường minh trong
file riêng của target method; factory chỉ inject dependency và chọn method.
Không gọi method khác để dựng dữ liệu, không test.each/skip/todo/failing,
không đọc JSON runtime. Không đổi runtime để làm xanh các ca trái SRS.

Kết quả thực chạy **56 ca: 39 Passed, 17 Failed, 0 Untested**, trong 11 file.
Backend lint và architecture check Passed. Mã defect là mã cục bộ trong
báo cáo/test source, chưa tạo issue bên ngoài. Sáu file có Failed sẽ exit code 1.

| Sheet | Passed | Failed | Phát hiện chính |
| --- | ---: | ---: | --- |
| PROFILE-01_get | 3 | 0 | Đọc đúng hồ sơ/contact |
| PROFILE-02_update | 5 | 4 | Chấp nhận tên 1/51 ký tự hoặc số; chưa nhận nhóm emergency contact |
| ACCOUNT-01_listVerifiedContacts | 3 | 0 | Chỉ contact verified của actor và che giá trị |
| USER-ADMIN-01_list | 5 | 2 | Chưa tìm email/phone |
| USER-ADMIN-02_getById | 3 | 0 | Chi tiết tài khoản và state |
| USER-ADMIN-03_decide | 4 | 4 | Khóa được sitter/Admin hoặc Customer còn booking/order chưa xong |
| USER-ADMIN-04_changeRoles | 3 | 2 | Cho đổi role dù SRS quy định chỉ đọc |
| PET-01_createPet | 4 | 3 | Bắt breed/weight, breed ngoài catalog bị từ chối |
| PET-02_listPets | 2 | 0 | Chỉ pet ACTIVE đúng owner |
| PET-03_update | 3 | 2 | Bắt breed/weight khi sửa |
| PET-04_archive | 4 | 0 | Owner và visit chưa xong, rollback nếu bị chặn |

Các biên tên 1/2/50/51 dựa trực tiếp trên yêu cầu 2–50 chữ và khoảng trắng.
Không lấy giới hạn 100 ký tự trong code làm requirement. Emergency contact
được probe thành một object đủ name/phone/relationship; tên field và FAMILY
là biểu diễn tổng hợp để chỉ ra API không nhận nhóm SRS, không phải enum
SRS đã phê duyệt. Chưa kiểm đủ các phân vùng nhóm thiếu field/phone sai/list
relationship vì hợp đồng hiện chưa hỗ trợ nhóm. Không coi Passed là bao phủ
toàn bộ Customer Profile, tier hoặc thay contact/OTP.

User List test thực thi filter thật qua model double cho name/role/state
và trang mặc định 20; không tự tìm contact thay service. Admin là precondition
ở caller của list/getById vì hai method không nhận actor. Không kiểm HMAC cursor,
UI counts hoặc các giới hạn kỹ thuật không có trong SRS. Decide kiểm reason,
quyền Admin, state/audit và lời gọi revoke port; không chứng minh session runtime
hay database thật. Booking/order tổng hợp có trong double nhưng code hiện không
query guard. Role readonly dựa trên III User Details, không lấy capability
changeRoles hiện có làm yêu cầu thay đổi role.

Pet Details quy định name/species bắt buộc; breed free text, weight và care
text tùy chọn. Các test dùng command branch có key hợp lệ để khớp flow source;
không thêm case retry/key format/catalog/traits/giới hạn weight riêng của code.
Không thêm hai ca chỉ thiếu Boolean kỹ thuật careNeedsConfirmed: SRS không
quy định field API này, và giá trị false không có nghĩa ép khách xác nhận care.
Các ca còn lại dùng false hợp lệ; không kiểm omission/retry/default kỹ thuật.
Feeding được kiểm cả dữ liệu lưu, không chỉ id trả về. Chưa kiểm photo và
vaccination date/status vì method chưa có field typed tương ứng. Archive dùng
visits như biểu diễn booking dependency hiện tại; chưa chứng minh mọi lifecycle.

User/Contact/Pet/catalog, query/session/transaction và crypto là doubles;
target/validator/permission/mask chạy thật. Filter owner/state/version/search
thực thi theo query target; state mutation do target tạo, transaction clone và
chỉ commit khi callback thành công. Fixture seed trực tiếp trạng thái.
Không kiểm MongoDB/index/race, middleware HTTP, UI, crypto/provider production.
Lack of test cases là mật độ 100 ca/KLOC của template; Untested=0 chỉ nói
các ca trong sheet đã chạy, không có nghĩa toàn bộ SRS đã được bao phủ.

Cách chạy từng file: lấy tên file ở bảng danh mục đầu tài liệu và dùng
`npm run test:unit -- --runTestsByPath tests/unit/report5-functions/<tên-file>.test.js --verbose`
từ thư mục `backend`.


Đối chiếu địa chỉ ngày 14/11/2026 theo SRS UC-12, III.3.3.2 Service Addresses
and Home Access, Address copy/Protected records data rules, GBR-01/02 và
I.4.4 Permission Matrix. Năm file riêng, mỗi file chỉ gọi một target thật,
mỗi UTCID có một test tường minh. Không test.each/skip/todo/failing, không
đọc JSON runtime, không sửa runtime để chạy xanh. Fixture là dữ liệu tổng hợp.

Kết quả thực chạy **32 ca: 31 Passed, 1 Failed, 0 Untested**.
Backend lint và architecture check Passed. Sheet và test khớp UTCID/N/A/B,
ngày chạy và Defect ID; B=0 vì SRS không quy định giới hạn số/độ dài ở đây.

| Sheet | Passed | Failed |
| --- | ---: | ---: |
| ADDRESS-01_normalizeServiceLoca | 4 | 0 |
| ADDRESS-02_normalizePrivateAcce | 4 | 0 |
| ADDRESS-03_create | 8 | 0 |
| ADDRESS-04_update | 9 | 0 |
| ADDRESS-05_archive | 6 | 1 |

`DEF_ADDRESS_ARCHIVE_OPEN` / ADDRESS-05-UTCID03: địa chỉ có booking CONFIRMED
chưa xong, nhưng `archive` cho chuyển sang ARCHIVED khi truyền
`confirmOpenBookingImpact=true`. SRS cấm remove khi còn booking chưa xong;
MSG73 xác nhận xóa không cho phép vượt ràng buộc này. Ca giữ kỳ vọng từ chối,
không đổi thành test phải Passed. Đây là mã defect cục bộ, chưa tạo issue.
File `address-archive.test.js` hiện trả exit code 1 do ca này.

Hai normalizer kiểm nội dung bắt buộc/tùy chọn và free text từ SRS: địa chỉ
tiếng Việt/số nhà có gạch chéo, empty/blank, mã cổng/vị trí chìa khóa, empty
hoặc không nhập note. Return string/null là contract code, không phải UI MSG.
Không thêm max 60/500/1000, control characters, NFC/CRLF/tab, kiểu dữ liệu,
id/key regex, replay/concurrency hay default-address rule chỉ từ code.

Các service kiểm Customer ownership/role/session, label/location required,
note optional, sửa địa chỉ và giữ nguyên bản sao booking, chặn archive khi
còn booking và cho archive khi booking đã COMPLETED. Update với booking dùng
`confirmOpenBookingImpact=true` như fixture kỹ thuật hợp lệ để đi qua code;
không gán yêu cầu xác nhận mới cho SRS và không thêm ca buộc thiếu/có flag.

Chưa bao phủ ward/commune bắt buộc được chọn từ danh sách, tự tìm service area
hoặc lưu Not served theo GBR-10: các method chỉ nhận `location` string, chưa có
structured ward/street và port area lookup. Không thêm field giả hay coi lưu
chuỗi địa chỉ là Passed cho các yêu cầu này. Quyền xem note/giới hạn 1 giờ,
check-out và handover thuộc `accessNotes` (ADDRESS-06), không thuộc phạm vi
hai normalizer hoặc ba command đang làm. Chưa kiểm UI MSG51/modal MSG73.

Repository/clock là doubles; normalize/validator/permission/service thật.
Repository double lọc customerId/addressId/state/version, đếm booking theo
dữ liệu seed và ghi create/update/archive do target yêu cầu. Nó không tự chặn
archive theo SRS thay cho target. Transaction clone state, commit khi callback
thành công, không mô phỏng idempotency queue/Mongo race. Snapshot được seed
trực tiếp và giữ nguyên ở cấp service/port; chưa chứng minh repository Mongo
thật không sửa bản sao. Không xác nhận endpoint runtime, HTTP middleware,
database transaction/index hoặc các enum lifecycle chưa có case.

Lack of test cases là khuyến nghị mật độ 100 ca/KLOC của template, không phải
số requirement thiếu. Untested=0 vì toàn bộ ca trong tab đã chạy; không có
nghĩa bao phủ toàn bộ UC-12.

Cách chạy từng file: lấy tên file ở bảng danh mục đầu tài liệu và dùng
`npm run test:unit -- --runTestsByPath tests/unit/report5-functions/<tên-file>.test.js --verbose`
từ thư mục `backend`.


Đối chiếu access notes/booking history/application ngày 15/11/2026 theo SRS
UC-26/37/41/16/18/19, III Booking List/Visit Details/Application Form/Application
Review, GBR-01/02/04/05/17/25/28/30 và các data rule liên quan. Mỗi file chỉ gọi
một target function thật, mỗi UTCID là một test tường minh. Không runtime JSON,
không test.each/skip/todo/failing. Không sửa runtime để thay kết quả SRS.

Kết quả thực chạy **52 ca: 42 Passed, 10 Failed, 0 Untested**, trong 9 file.
Backend lint và architecture check Passed. Bốn file có Failed trả exit code 1.

| Sheet | Passed | Failed | Phạm vi |
| --- | ---: | ---: | --- |
| ADDRESS-06_accessNotes | 10 | 0 | Các ràng buộc SRS ghi ở từng UTCID; xem giới hạn bên dưới |
| BKG-HISTORY-01_list | 4 | 2 | Các ràng buộc SRS ghi ở từng UTCID; xem giới hạn bên dưới |
| APPLICATION-01_submit | 10 | 4 | Các ràng buộc SRS ghi ở từng UTCID; xem giới hạn bên dưới |
| APPLICATION-02_getMine | 2 | 0 | Chỉ permission guards; chưa có normal workflow SRS rõ ràng |
| APPLICATION-03_updateMine | 2 | 0 | Chỉ permission guards; chưa có normal workflow SRS rõ ràng |
| APPLICATION-04_startReview | 2 | 0 | Chỉ permission guards; chưa có normal workflow SRS rõ ràng |
| APPLICATION-05_startInterview | 2 | 0 | Chỉ permission guards; chưa có normal workflow SRS rõ ràng |
| APPLICATION-06_decide | 4 | 3 | Các ràng buộc SRS ghi ở từng UTCID; xem giới hạn bên dưới |
| APPLICATION-07_changeSitterStat | 6 | 1 | Các ràng buộc SRS ghi ở từng UTCID; xem giới hạn bên dưới |

Các mã defect dưới đây là mã theo dõi cục bộ trong báo cáo, chưa tạo issue:

- `DEF_BKG_HISTORY_OVERDUE` — BKG-HISTORY-01-UTCID03: Quá hạn thanh toán phải là Overdue.
- `DEF_BKG_HISTORY_STATUS_FILTER` — BKG-HISTORY-01-UTCID04: Tab Paid chỉ trả booking Paid.
- `DEF_APPLICATION_SINGLE_EMAIL` — APPLICATION-01-UTCID01: Thiếu phone dù có email phải bị từ chối.
- `DEF_APPLICATION_SINGLE_PHONE` — APPLICATION-01-UTCID02: Thiếu email dù có phone phải bị từ chối.
- `DEF_APPLICATION_BOTH_CONTACTS` — APPLICATION-01-UTCID03: Form đủ email và phone phải nộp được không tạo tài khoản.
- `DEF_APPLICATION_ACCOUNT_CONTACT` — APPLICATION-01-UTCID14: Contact đã thuộc account không được dùng ứng tuyển.
- `DEF_APPLICATION_REJECT_PENDING` — APPLICATION-06-UTCID02: Cho Admin từ chối application Pending theo SRS.
- `DEF_APPLICATION_REASON_LIST` — APPLICATION-06-UTCID04: Không chấp nhận lý do ngoài danh sách SRS.
- `DEF_APPLICATION_APPROVAL_CHECKS` — APPLICATION-06-UTCID05: Không approve khi thiếu checklist và call time/result Passed.
- `DEF_APPLICATION_SUSPEND_VISITS` — APPLICATION-07-UTCID07: Đình chỉ phải trả lại visit đã nhận và đánh dấu handover.

AccessNotes kiểm đúng sitter được gán, ba biên thời gian từ yêu cầu 1 giờ/check-out,
handover replacement, note tùy chọn và auth. State được seed ASSIGNED trước giờ,
IN_PROGRESS trong giờ, COMPLETED sau check-out. Chưa kiểm quyền Staff/Admin xử lý
Needs action/late/handover, audit ai mở note, UI countdown hoặc middleware runtime.

Booking history kiểm owner, newest first với ID/thời gian nhất quán và summary.
Quá due bị map PAYMENT_EXPIRED thay vì Overdue; status filter chưa có trong method.
`state=PAID` là probe cho tab SRS, không phải API field do SRS quy định. Các lỗi
này thuộc method trực tiếp, chưa chứng minh toàn bộ UI/API không có adapter khác.
Không thêm source-disabled, max 50/cursor/HMAC hoặc page-size 20 từ code vì đoạn
SRS Booking List không đặt những giới hạn này. Chưa kiểm global counts/all fields,
Staff view hoặc sort timestamp khi ID không theo thời gian.

Submit vẫn chỉ có contactChannel/contactValue, trong khi UC-16 yêu cầu cả phone
và email. Hai ca single-contact phải bị chặn nhưng được lưu; probe đủ email/phone
bị unknown-field rejection. `email`/`phone` trong probe là cách biểu diễn nhóm SRS
chưa có contract, không coi là tên API chính thức. PHONE dùng +84912345678 tương
ứng số 0912345678 ở SRS, tránh nhầm lỗi E164 với việc thiếu email. Existing contact
case có Customer và Contact VERIFIED tổng hợp, nhưng target không kiểm chúng.

Các ca Passed của submit chỉ xác nhận ràng buộc con như required/file presence,
tuổi trước sinh nhật 18 một ngày, duplicate Pending hoặc rejected 29 ngày trước.
Fixture legacy còn một contact, không coi là form đầy đủ SRS đã hợp lệ. Chưa có
Passed cho nộp đủ hai contact, đúng ngày 18/30, passport một trang, JPG/PNG/PDF/
5 MB, rate 3/device/network/giờ, SMTP retry hoặc Admin notification. Media/mail/
crypto đều là ports doubles. Intake runtime hiện yêu cầu Customer/verified email;
unit Guest dùng media double không chứng minh Guest upload end-to-end.

GetMine/updateMine chỉ có hai ca chặn guest/Staff theo GBR-01/02/I.4.4. UC-16
không mô tả flow tài khoản xem/sửa application sau gửi, nên không tự thêm flow
normal edit Pending, draft, timeline, canEdit, media replacement hoặc retry.
StartReview/startInterview cũng chỉ có hai ca Admin-only theo UC-18; không lấy
UNDER_REVIEW/INTERVIEW làm trạng thái mới của SRS. Không suy ra các stage nội bộ
tự thân là lỗi, cũng không gán Passed cho review/interview metadata chưa kiểm.

Decide có một ca reject qua stage INTERVIEW (precondition kỹ thuật) kiểm state,
reapplyAt đúng 30 ngày, không tạo User và gọi enqueue mail; chưa chứng minh email
đã giao/nội dung đúng. Reject từ Pending theo UC-18 bị stage guard chặn; reason
tự do ngoài danh sách vẫn được nhận; approve không có checklist/call time/result
Passed vẫn tạo User khi activation port giả thành công. Chưa có happy approve
đầy đủ SRS, tạo cả hai contact, welcome mail, offer eligibility hoặc sign-in.
Không ép giới hạn reason 3–1000/idempotency/version race của code thành SRS.

ChangeSitterStatus basic cases chỉ xác nhận đổi status/reason/audit, suspend giữ
User ACTIVE; chưa phải Passed cho toàn bộ UC-19. Accepted visit còn assigned cho
sitter cũ, không handover sau suspend trong direct target. Controller chỉ gọi
method và trả result, chưa có dispatch/reoffer port ở đường này. Chưa chạy jobs,
offer withdrawal/eligibility runtime, xử lý IN_PROGRESS hoặc concurrency.

Model/repository/clock/media/mail/crypto/activation là doubles; target/validator,
permission và HMAC chạy thật khi branch dùng. Filter id/owner/state/version/OR,
update/create và transaction clone/commit thực thi trong double; double không
tự thực hiện quyết định SRS thay target. Fixture seed trực tiếp, không gọi submit
hoặc method khác để dựng state cho decide/status. Không kiểm MongoDB/index/race,
HTTP middleware, providers hoặc jobs production. Code/tên field/status trong
assertion là contract hay probe được ghi rõ, không tự đặt nội dung MSG của SRS.

Lack of test cases là mật độ 100 ca/KLOC của template. Untested=0 chỉ có nghĩa
các ca trong tab đã chạy, không có nghĩa đủ mọi requirement/branch. Đặc biệt bốn
sheet permission-only phải giữ ghi chú phạm vi, không dùng 2 Passed để kết luận
toàn bộ hàm đã đáp ứng SRS.

Cách chạy từng file: lấy tên file ở bảng danh mục đầu tài liệu và dùng
`npm run test:unit -- --runTestsByPath tests/unit/report5-functions/<tên-file>.test.js --verbose`
từ thư mục `backend`.


Đối chiếu availability/application status/AI scheduling ngày 16/11/2026 theo SRS
UC-16/18/25/29/79/80, GBR-01/02/09/12/21/25/28/32/45, JOB-02 và
IV Security Application documents trong phạm vi ghi rõ từng ca. Mỗi file chỉ
gọi một target thật, từng UTCID là một test tường minh. Không runtime JSON,
test.each/skip/todo/failing; không đổi runtime để làm xanh kỳ vọng SRS.

Kết quả thực chạy **62 ca: 54 Passed, 8 Failed, 0 Untested**, trong 12 file.
Backend lint và architecture check Passed. Bốn file có ca Failed sẽ exit code 1.

| Sheet | Passed | Failed |
| --- | ---: | ---: |
| APP-STATUS-01_requestVerificati | 1 | 0 |
| APP-STATUS-02_verifyAndReadStat | 5 | 0 |
| AVAIL-01_localDateTimeToUtc | 3 | 0 |
| AVAIL-02_normalizeWorkingWindow | 5 | 0 |
| AVAIL-03_updateMine | 4 | 1 |
| WORK-AREA-01_replaceMine | 5 | 0 |
| SHIFT-POL-01_windowsCover | 6 | 0 |
| SHIFT-POL-02_occupiedMinutes | 5 | 0 |
| DAY-OFF-01_request | 7 | 3 |
| AI-SCORE-01_scoreSitter | 2 | 3 |
| AI-SLOT-01_validateSlot | 5 | 0 |
| AI-SLOT-02_planInsertion | 6 | 1 |

Các Defect ID là mã cục bộ trong báo cáo, chưa tạo issue bên ngoài:

- `DEF_AVAIL_ACCEPTED_CHANGE` — AVAIL-03-UTCID03: Thay đổi chạm visit đã nhận phải lưu và flag Staff.
- `DEF_DAY_OFF_REASON_SAVE` — DAY-OFF-01-UTCID01: Yêu cầu nghỉ phải lưu lý do bắt buộc.
- `DEF_DAY_OFF_REASON_REQUIRED` — DAY-OFF-01-UTCID02: Thiếu lý do không được gửi đơn nghỉ.
- `DEF_DAY_OFF_12_HOUR_GUARD` — DAY-OFF-01-UTCID07: Visit còn 11 giờ 59 phút phải rút buổi thay vì xin nghỉ.
- `DEF_AI_SCORE_DAILY_VISIT_COUNT` — AI-SCORE-01-UTCID03: Ít visit trong ngày phải được ưu tiên khi tổng phút bận bằng nhau.
- `DEF_AI_SCORE_EXTRA_TRAVEL` — AI-SCORE-01-UTCID04: Travel không tự thành yếu tố xếp hạng thứ tư ngoài ba yếu tố SRS.
- `DEF_AI_SCORE_EXTRA_EXPERIENCE` — AI-SCORE-01-UTCID05: Kinh nghiệm cùng dịch vụ không tự thành yếu tố thứ tư.
- `DEF_AI_SLOT_WINDOW_START` — AI-SLOT-02-UTCID07: Đúng đầu giờ làm tại cùng địa điểm phải khả thi.

Application status: SRS hiện chưa mô tả một flow OTP tra cứu application riêng.
RequestVerification chỉ có một ca kiểm response không lộ contact/document extras
và không đọc applicant record. VerifyAndReadStatus kiểm proof thất bại không đọc
repository, projection không lộ identity/contact/documents và hai biên reapply
trước/đúng 30 ngày. Proof/scoped applicationId là precondition kỹ thuật theo
contract hiện tại; không coi đó là yêu cầu OTP tracking mới của SRS. Không kiểm
code/UUID regex, 300/60 giây, rate/cooldown/provider outages hoặc SMS/email thật.

LocalDateTimeToUtc kiểm giữ đúng giờ lịch bằng biểu diễn UTC của code tại 09:00,
00:00 và 23:59. Asia/Ho_Chi_Minh/+07 là contract triển khai, không phải policy
giờ làm mới do SRS công bố. NormalizeWorkingWindows kiểm From–To, một/multiple
slot, Off, thiếu To/zero duration. Không thêm max 14, overlap/overnight hay các
format/control character từ implementation vào SRS.

Availability update kiểm Part-time lưu giờ mình, tuần Off và quyền truy cập.
SRS UC-29/GBR-45 nói thay đổi chạm accepted visits phải flag Staff, không cancel/
reassign. Direct method lại chặn bằng CONFIRMED_VISIT_CONFLICT trước save, là
ca Failed. Guard/contract eligibility là precondition của port; chưa kiểm full-time
bị cấm tự đặt giờ, Mongo revisions/Staff queue, effective-date/retry/version race.
Work-area replacement kiểm catalog Admin/owner/auth, không đổi sitter khác. Việc
flag accepted visits thuộc adapter chưa chạy, không gán Passed bằng mock tự flag.
Admin đổi khu vực là flow khác với personal method; không thêm regex/100-code cap.

WindowsCover chỉ kiểm bao phủ toàn visit: trong giờ, hai đầu khớp, vượt biên một
phút, gap và hai khung liền nhau. OccupiedMinutes chỉ kiểm số phút giao của các
khoảng nhất quán/không trùng: cộng thời gian, ngoài range, chạm biên, giao một
phần. Không kiểm cap 480/weeklyMinutes, lương, rounding từng giây hoặc data sai;
Passed arithmetic không chứng minh chính sách giờ hợp đồng đầy đủ.

Day-off request kiểm dates từ hôm nay/end>=start, reason, auth và ngưỡng 12 giờ.
Clock 08:00 VN 16/11; accepted visit lúc 19:59 còn 11h59 phải bị chặn nhưng vẫn
Pending. Ca đúng 20:00/12h chỉ xác nhận trường hợp cho phép, không chứng minh
source đã có chặn dưới ngưỡng. Reason không có trong signature, probe được bỏ
qua khi lưu; không truyền cũng tạo Pending. Ca dates Passed chỉ kiểm date rule,
không đồng nghĩa reason đã lưu. Repository double lưu nguyên payload target gửi,
lọc sitter/date khi trả conflicts, không tự thêm reason hoặc chặn late thay source.
Chưa kiểm concrete adapter/route (source còn ghi future route adapter), Staff
approve/reject, approved leave reoffer, concurrency hoặc notification thật.

Scorer: GBR-12/JOB-02 nêu familiarity, rating, ít visit/ngày; thuật toán tự đặt
trọng số. Chỉ assert quan hệ so sánh, không ép default weights/priors/smoothing
thành số SRS. Hai Passed là familiarity 0→1 và rating tốt hơn khi các yếu tố
khác bằng nhau. Một visit 120 phút so với hai visit tổng 120 phút phải ưu tiên
ít visit; probe dailyVisitCount chưa được method nhận nên score bằng nhau (Failed).
Không dùng busyMinutes thấp hơn làm bằng chứng giả rằng source đã đếm visit.
Travel/similar service experience cũng đổi score dù ba yếu tố SRS bằng nhau;
ghi Failed theo phạm vi scorer trực tiếp, chưa chạy approved policy/model/ranker
production. Không dùng điểm heuristic/fixture làm nhãn chất lượng thật. Preferred
sitter priority, raw-score tie offer groups và các gates nằm ngoài scorer chưa kiểm.

ValidateSlot chỉ kiểm đủ 24 giờ và độ dài dương, không thêm max 6h/same-day/
whole-minute constraints riêng của source. PlanInsertion kiểm trong giờ, không
nghỉ, không trùng, đủ travel, insert giữa hai visit và không mutate input. ETA20
với gap10 đã không đủ dù bỏ buffer, nên không coi buffer10/handover15 là số SRS.
Biên đầu giờ ở cùng điểm/ETA0 vẫn bị OUTSIDE_DAY_BOUNDS do điều kiện strict start,
giữ kỳ vọng eligible theo giờ làm (Failed). Không kiểm các caps 45/240/360/480,
break30, provider outage hoặc solver tối ưu; không assign hay đổi tài chính.

Pure helpers/scorer chạy thật. Repository/UoW/catalog/clock/OTP/persistence/matrix
là doubles khi cần; guard/validator/domain math thật. Transaction clone state và
commit khi callback thành công. Fixture seed trực tiếp; không gọi target khác để
dựng dữ liệu. Không kiểm MongoDB/index/race, HTTP middleware, Staff jobs hoặc
provider production. Enum/field/error code/UTC là representation code hoặc probe
được ghi rõ; SRS quyết định kỳ vọng nghiệp vụ, không đặt mọi tên API kỹ thuật.

Lack of test cases là mật độ 100 ca/KLOC template; Untested=0 chỉ nói các ca đã
có trong tab đều chạy, không nghĩa toàn bộ SRS/branches đã được bao phủ. Đặc biệt
APP-STATUS chỉ có các ca privacy/reapply có căn cứ, không bịa thêm flow để đủ mật độ.

Cách chạy từng file: lấy tên file ở bảng danh mục đầu tài liệu và dùng
`npm run test:unit -- --runTestsByPath tests/unit/report5-functions/<tên-file>.test.js --verbose`
từ thư mục `backend`.

## Đối chiếu routing/recommendation/care execution ngày16/11/2026

15 file riêng, mỗi file chỉ gọi một target thật. Oracle: SRS Report3 tại máy người dùng, UC-25/36/40/41/42/43/44, GBR-01/02/03/04/09/12/16/23/45, JOB-02, IV Security và data rule Price snapshot. Không copy tài liệu SRS vào repository.

Kết quả Jest thực tế: **59 ca, 52 Passed, 7 Failed, 0 Untested**; 10 suites Passed, 5 suites Failed. Failed giữ nguyên kỳ vọng SRS; runtime chưa sửa. Lint và architecture check xem kết quả kiểm tra thực tế cuối phiên; các test unit không chứng minh provider/Mongo/runtime integration.

| Sheet | Passed | Failed | Phạm vi |
| --- | ---: | ---: | --- |
| ROUTING-01_cachedMatrix | 3 | 0 | GBR-12; JOB-02: thời gian di chuyển phải được dùng đúng khi kiểm lịch; không suy diễn TTL/cache policy là SRS. |
| AI-REC-01_recommend | 5 | 2 | UC-25; GBR-09/12/45; JOB-02: chỉ gợi ý sitter rảnh trong giờ, giữ đường đi; không cấm khách cũ hoặc loại sitter chỉ vì mới. |
| AI-REC-02_readDecision | 2 | 0 | GBR-02; IV Security: chỉ đọc dữ liệu gắn owner hiện tại. |
| AI-MODEL-01_importArtifact | 1 | 0 | GBR-01; IV Security: anonymous không được thao tác nội bộ. SRS chưa đặc tả model registry. |
| AI-MODEL-02_review | 1 | 0 | GBR-01; IV Security: anonymous không được thao tác nội bộ. SRS chưa đặc tả model registry. |
| AI-MODEL-03_status | 1 | 0 | GBR-01; IV Security: anonymous không được thao tác nội bộ. SRS chưa đặc tả model registry. |
| BOARDING-01_boardingCarePlan | 2 | 0 | UC-25; UC-40; data rule Price snapshot: visit chăm tại nhà giữ đúng lịch, pet và khai báo đã xác nhận. |
| CARE-PLAN-01_preview | 3 | 0 | GBR-01/02/03; UC-25/40; data rule Price snapshot: bảo vệ thao tác nội bộ và giữ lịch/khai báo/giá booking chăm tại nhà. |
| CARE-PLAN-02_finalize | 3 | 0 | GBR-01/02/03; UC-25/40; data rule Price snapshot: bảo vệ thao tác nội bộ và giữ lịch/khai báo/giá booking chăm tại nhà. |
| PROPOSAL-01_createProposal | 5 | 0 | GBR-01/02/12; UC-25: chỉ khách của booking chọn sitter từng chăm pet, chỉ thời gian khả thi; snapshot giá giữ nguyên. |
| PROPOSAL-02_confirmProposal | 5 | 0 | GBR-01/02/12; UC-25: chỉ khách của booking chọn sitter từng chăm pet, chỉ thời gian khả thi; snapshot giá giữ nguyên. |
| EXEC-VISIT-01_readVisit | 4 | 1 | UC-36/44; GBR-01/02/04; IV Security: chỉ sitter được giao xem execution; sitter suspended vẫn xem visit cũ. |
| EXEC-VISIT-02_checkIn | 7 | 1 | UC-42; GBR-16/23; UC-41: assigned sitter, từ30 phút trước, có ảnh và đã xác nhận handover/instructions mới. |
| EXEC-VISIT-03_updateChecklist | 4 | 2 | UC-44; III.14.1.2; GBR-16: tick/skip với lý do, lưu nhiều lần trong visit và note cho khách. |
| EXEC-VISIT-04_checkOut | 6 | 1 | UC-43/44; GBR-16; III.14.1.1/2: có ảnh checkout; required tasks DONE/SKIPPED có reason; checklist phải có ảnh hoặc lý do. |

SRS chưa đặc tả model registry: mỗi file importArtifact/review/status chỉ kiểm anonymous bị chặn theo GBR-01; không tuyên bố nghiệp vụ import/duyệt/model quality đã được kiểm. SRS chỉ có at-home care: boardingCarePlan chỉ kiểm nhánh non-boarding giữ lịch/pet/snapshot, không tự đặt chính sách chia ca stay. Care-plan và proposal chỉ map các invariant/quyền có căn cứ; các state/shiftMinutes/expectedVersion/expiry là representation kỹ thuật, không biến thành yêu cầu SRS.

readDecision chỉ kiểm owner/projection, không suy ra SRS có MATCH TTL5 phút. cachedMatrix chỉ truyền đúng ETA có hướng/route thiếu; chưa chứng minh OSRM/traffic. recommend chạy scorer/scheduler thật với ports giả; không kiểm automatic dispatch, invitation, giá hoặc assignment production.

Execution fixtures seed trực tiếp, DB double thực hiện owner/query/update và clone/commit transaction. Model/storage/notification/completion-payroll là doubles. Không test target khác để chuẩn bị; không thay state/auth/media/checklist domain decisions. checkIn/updateChecklist/checkOut là wrapper1 dòng tới executeVisit thật, LOC header không được hiểu là branch coverage cho core. IN_PROGRESS/COMPLETED là enum code, không chứng minh đầy đủ UI Arrived/In progress/Report ready hoặc report delivery.

Các contract probe (instruction revision/ack, customerNote, checklist photo/reason) được ghi rõ là dữ liệu SRS chưa có trong method contract; Failed chỉ ra gap tại direct method, chưa kết luận tất cả runtime/route adapters. Không tự bịa lỗi API cho gap: chỉ assert từ chối/status409 khi SRS cần chặn, giữ enum/error hiện có cho các contract đã tồn tại.

| Defect ID | Quan sát và hướng xử lý |
| --- | --- |
| DEF_REC_NEW_SITTER_THRESHOLD | Sitter active/rảnh, không rating/history bị trả candidates=[] và BELOW_AUTOMATIC_THRESHOLD. GBR-12 không quy định loại sitter đủ điều kiện chỉ vì điểm dưới60. Cần xác nhận/loại bỏ policy ngoài SRS ở Customer recommend; operational ranker chưa được test ở đây. |
| DEF_REC_RETURNING_CUSTOMER | Khách đã completed care bị AppError409 CUSTOMER_CARE_HISTORY_EXISTS trước khi xét sitter. UC-25/GBR-12 không cấm khách cũ được gợi ý. Cần đồng bộ contract Customer recommendation với SRS; không suy ra automatic dispatch cũng chặn. |
| DEF_EXEC_SUSPENDED_HISTORY | readVisit ném AppError403 SITTER_NOT_ACTIVE cho assigned sitter suspended dù visit đã COMPLETED lúc11:00 và clock12:00. GBR-04 cho xem past visits. Tách quyền đọc lịch sử khỏi quyền nhận/thực hiện visit mới. |
| DEF_EXEC_INSTRUCTION_ACK | checkIn vẫn resolve IN_PROGRESS/version1 khi probe currentInstructionVersion2 và acknowledgedInstructionVersion1. Method không đọc revision/ack. GBR-23 cần guard từ authoritative instructions trước ghi; probe chưa phải field API có sẵn, chưa kiểm mọi route adapter. |
| DEF_EXEC_CHECKLIST_PARTIAL_SAVE | updateChecklist ném AppError422 CHECKLIST_INVALID khi mới lưu feed DONE, water chưa làm. III.14.1.2 cho Save nhiều lần trong visit; complete required tasks là gate checkout. Cần representation draft/progress riêng khỏi điều kiện kết thúc. |
| DEF_EXEC_CHECKLIST_NOTE | updateChecklist resolve nhưng customerNote probe không được lưu (undefined). III.14.1.2 có note cho khách để care report dùng. Cần contract/adapter lưu note; field hiện không được destructure, không giả API đã hỗ trợ. |
| DEF_EXEC_CHECKLIST_PHOTO_GUARD | checkOut resolve COMPLETED/version1 khi không có ảnh checklist hoặc lý do không upload, chỉ có ảnh checkout READY. III.14.1.1/2 và MSG84 cần chặn. Method chưa đọc dữ liệu checklist photo/reason; cần authoritative evidence port/guard, chưa kết luận mọi runtime adapter. |

Defect IDs là mã cục bộ trong báo cáo, chưa tạo issue GitHub. Untested=0 chỉ nghĩa các ca đã liệt kê đều chạy, không phải đủ toàn bộ feature/branch. Lack theo mật độ100ca/KLOC của template, không phải lý do tự thêm ca ngoài SRS.

Cách chạy từng file: lấy tên file ở bảng danh mục đầu tài liệu và dùng
`npm run test:unit -- --runTestsByPath tests/unit/report5-functions/<tên-file>.test.js --verbose`
từ thư mục `backend`.
Ở lần chạy ngày 16/11, 5 file có Failed trả exit code 1.
