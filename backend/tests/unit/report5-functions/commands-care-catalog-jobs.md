# Lệnh chạy từng hàm — đợt ngày 18/11/2026

Chạy các lệnh dưới đây trong thư mục `backend/`. Mỗi file chỉ kiểm một hàm; mỗi UTCID là một `test` tường minh. Kết quả chạy trên main `8c53c0c`, Node.js 24.21.0: **182 ca, 166 Passed, 16 Failed, không có skipped**. Backend lint và architecture check đạt. Các file có ca Failed trả exit code 1; đây là kết quả được ghi vào sheet, chưa phải lỗi đã sửa.

Đợt này có 65 sheet: 58 file `.test.js` và 7 file `.scope.md`. Các mục chưa có căn cứ SRS hoặc helper không export được ghi 0 ca/N/A; không tạo test giả để có kết quả Passed. Các giới hạn riêng được ghi tại từng sheet. Repository/provider là double; chưa kiểm tích hợp MongoDB/R2/email/routing/billing thật.

SRS đối chiếu: Report 3 hiện hành, UC/GBR và phần màn hình được ghi ở comment ngay trên từng test. Ma trận dùng form REG-01, có O, N/A/B và Passed/Failed dạng dropdown. Untested=0 chỉ có nghĩa đã chạy các ca đang liệt kê.

## CARE-NOTE-01_normalizeInstructi

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/care-normalize-instructions.test.js --verbose
```

3 ca: 3 Passed, 0 Failed. File [care-normalize-instructions.test.js](care-normalize-instructions.test.js).

## CARE-NOTE-02_readInstructions

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/care-read-instructions.test.js --verbose
```

4 ca: 3 Passed, 1 Failed. File [care-read-instructions.test.js](care-read-instructions.test.js).

## CARE-NOTE-03_updateInstructions

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/care-update-instructions.test.js --verbose
```

4 ca: 4 Passed, 0 Failed. File [care-update-instructions.test.js](care-update-instructions.test.js).

## CARE-NOTE-04_acknowledgeInstruc

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/care-acknowledge-instructions.test.js --verbose
```

3 ca: 3 Passed, 0 Failed. File [care-acknowledge-instructions.test.js](care-acknowledge-instructions.test.js).

## CARE-NOTE-05_getAccessNotes

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/care-get-access-notes.test.js --verbose
```

5 ca: 4 Passed, 1 Failed. File [care-get-access-notes.test.js](care-get-access-notes.test.js).

## HANDOVER-01_confirm

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/handover-confirm.test.js --verbose
```

3 ca: 0 Passed, 3 Failed. File [handover-confirm.test.js](handover-confirm.test.js).

## TRAVEL-01_command

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/travel-command.test.js --verbose
```

4 ca: 2 Passed, 2 Failed. File [travel-command.test.js](travel-command.test.js).

## TRAVEL-02_locate

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/travel-locate.test.js --verbose
```

4 ca: 3 Passed, 1 Failed. File [travel-locate.test.js](travel-locate.test.js).

## TRAVEL-03_eta

Lệnh chạy: **N/A — chưa có ca thực thi theo SRS**. Xem [travel-eta.scope.md](travel-eta.scope.md).

GBR-41 chỉ quy định vị trí dog walk. Không tìm thấy yêu cầu hiển thị/tính ETA từ vị trí sitter tới nhà khách trong SRS hiện hành; không tự đặt freshness/accuracy/provider fallback làm test case SRS.

## REVIEW-01_normalizeRating

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/review-normalize-rating.test.js --verbose
```

7 ca: 7 Passed, 0 Failed. File [review-normalize-rating.test.js](review-normalize-rating.test.js).

## REVIEW-02_rateVisit

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/review-rate-visit.test.js --verbose
```

6 ca: 5 Passed, 1 Failed. File [review-rate-visit.test.js](review-rate-visit.test.js).

## SITTER-REVIEW-01_ratingDecision

Lệnh chạy: **N/A — chưa có ca thực thi theo SRS**. Xem [sitter-rating-decision.scope.md](sitter-rating-decision.scope.md).

ratingDecision là helper nội bộ, không export hoặc trả từ service; policy SITTER_TO_CUSTOMER không được SRS hiện tại cho phép. Không trích code ra để giả lập gọi trực tiếp hoặc thêm policy test từ implementation. Chặn hành vi Sitter đánh giá Customer được kiểm trong SITTER-REVIEW-02.

## SITTER-REVIEW-02_rateCustomer

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/sitter-rate-customer.test.js --verbose
```

1 ca: 0 Passed, 1 Failed. File [sitter-rate-customer.test.js](sitter-rate-customer.test.js).

## COMPLAINT-01_submit

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/complaint-submit.test.js --verbose
```

10 ca: 10 Passed, 0 Failed. File [complaint-submit.test.js](complaint-submit.test.js).

## COMPLAINT-02_review

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/complaint-review.test.js --verbose
```

2 ca: 2 Passed, 0 Failed. File [complaint-review.test.js](complaint-review.test.js).

## COMPLAINT-03_resolve

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/complaint-resolve.test.js --verbose
```

4 ca: 4 Passed, 0 Failed. File [complaint-resolve.test.js](complaint-resolve.test.js).

## COMPLAINT-04_object

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/complaint-object.test.js --verbose
```

4 ca: 4 Passed, 0 Failed. File [complaint-object.test.js](complaint-object.test.js).

## COMPLAINT-05_decide

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/complaint-decide.test.js --verbose
```

3 ca: 3 Passed, 0 Failed. File [complaint-decide.test.js](complaint-decide.test.js).

## INCIDENT-01_report

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/incident-report.test.js --verbose
```

5 ca: 4 Passed, 1 Failed. File [incident-report.test.js](incident-report.test.js).

## INCIDENT-02_list

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/incident-list.test.js --verbose
```

3 ca: 3 Passed, 0 Failed. File [incident-list.test.js](incident-list.test.js).

## INCIDENT-03_detail

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/incident-detail.test.js --verbose
```

3 ca: 3 Passed, 0 Failed. File [incident-detail.test.js](incident-detail.test.js).

## INCIDENT-04_resolve

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/incident-resolve.test.js --verbose
```

4 ca: 4 Passed, 0 Failed. File [incident-resolve.test.js](incident-resolve.test.js).

## CATALOG-01_create

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/catalog-create.test.js --verbose
```

3 ca: 3 Passed, 0 Failed. File [catalog-create.test.js](catalog-create.test.js).

## CATALOG-02_update

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/catalog-update.test.js --verbose
```

2 ca: 2 Passed, 0 Failed. File [catalog-update.test.js](catalog-update.test.js).

## CATALOG-03_setPolicy

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/catalog-set-policy.test.js --verbose
```

2 ca: 2 Passed, 0 Failed. File [catalog-set-policy.test.js](catalog-set-policy.test.js).

## CATALOG-04_bookableSnapshot

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/catalog-bookable-snapshot.test.js --verbose
```

3 ca: 3 Passed, 0 Failed. File [catalog-bookable-snapshot.test.js](catalog-bookable-snapshot.test.js).

## PRICE-ADMIN-01_parsePriceVersio

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/price-admin-parse-version-input.test.js --verbose
```

2 ca: 2 Passed, 0 Failed. File [price-admin-parse-version-input.test.js](price-admin-parse-version-input.test.js).

## PRICE-ADMIN-02_createVersion

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/price-admin-create-version.test.js --verbose
```

2 ca: 2 Passed, 0 Failed. File [price-admin-create-version.test.js](price-admin-create-version.test.js).

## PRICE-ADMIN-03_getActivePrice

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/price-admin-get-active-price.test.js --verbose
```

2 ca: 2 Passed, 0 Failed. File [price-admin-get-active-price.test.js](price-admin-get-active-price.test.js).

## SETTING-01_parseCatalogSettingI

Lệnh chạy: **N/A — chưa có ca thực thi theo SRS**. Xem [setting-parse-catalog-input.scope.md](setting-parse-catalog-input.scope.md).

SRS mô tả các quy tắc booking, khu vực, chính sách và shop; không đặc tả công tắc SERVICE_CATALOG_VISIBLE cho toàn bộ catalogue hoặc lịch effectiveAt của công tắc này. Không đồng nhất Turn off từng service của UC-22 với tắt toàn catalogue. 0 ca áp dụng; chưa chạy test, không có nghĩa Passed.

## SETTING-02_isEnabledAt

Lệnh chạy: **N/A — chưa có ca thực thi theo SRS**. Xem [setting-is-enabled-at.scope.md](setting-is-enabled-at.scope.md).

SRS mô tả các quy tắc booking, khu vực, chính sách và shop; không đặc tả công tắc SERVICE_CATALOG_VISIBLE cho toàn bộ catalogue hoặc lịch effectiveAt của công tắc này. Không đồng nhất Turn off từng service của UC-22 với tắt toàn catalogue. 0 ca áp dụng; chưa chạy test, không có nghĩa Passed.

## SETTING-03_updateCatalogVisibil

Lệnh chạy: **N/A — chưa có ca thực thi theo SRS**. Xem [setting-update-catalog-visibility.scope.md](setting-update-catalog-visibility.scope.md).

SRS mô tả các quy tắc booking, khu vực, chính sách và shop; không đặc tả công tắc SERVICE_CATALOG_VISIBLE cho toàn bộ catalogue hoặc lịch effectiveAt của công tắc này. Không đồng nhất Turn off từng service của UC-22 với tắt toàn catalogue. 0 ca áp dụng; chưa chạy test, không có nghĩa Passed.

## CART-01_read

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/cart-read.test.js --verbose
```

3 ca: 3 Passed, 0 Failed. File [cart-read.test.js](cart-read.test.js).

## CART-02_addLine

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/cart-add-line.test.js --verbose
```

3 ca: 3 Passed, 0 Failed. File [cart-add-line.test.js](cart-add-line.test.js).

## CART-03_setLine

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/cart-set-line.test.js --verbose
```

3 ca: 3 Passed, 0 Failed. File [cart-set-line.test.js](cart-set-line.test.js).

## CART-04_removeLine

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/cart-remove-line.test.js --verbose
```

2 ca: 2 Passed, 0 Failed. File [cart-remove-line.test.js](cart-remove-line.test.js).

## PRODUCT-01_create

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/product-create.test.js --verbose
```

3 ca: 3 Passed, 0 Failed. File [product-create.test.js](product-create.test.js).

## PRODUCT-02_update

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/product-update.test.js --verbose
```

3 ca: 3 Passed, 0 Failed. File [product-update.test.js](product-update.test.js).

## PRODUCT-03_remove

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/product-remove.test.js --verbose
```

2 ca: 1 Passed, 1 Failed. File [product-remove.test.js](product-remove.test.js).

## SUPPLIER-01_create

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/supplier-create.test.js --verbose
```

3 ca: 3 Passed, 0 Failed. File [supplier-create.test.js](supplier-create.test.js).

## SUPPLIER-02_update

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/supplier-update.test.js --verbose
```

2 ca: 2 Passed, 0 Failed. File [supplier-update.test.js](supplier-update.test.js).

## SUPPLIER-03_stop

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/supplier-stop.test.js --verbose
```

2 ca: 2 Passed, 0 Failed. File [supplier-stop.test.js](supplier-stop.test.js).

## SUPPLIER-04_resume

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/supplier-resume.test.js --verbose
```

2 ca: 2 Passed, 0 Failed. File [supplier-resume.test.js](supplier-resume.test.js).

## SUP-NAME-01_supplierNameKey

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/supplier-name-key.test.js --verbose
```

2 ca: 2 Passed, 0 Failed. File [supplier-name-key.test.js](supplier-name-key.test.js).

## CONTRACT-01_save

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/contract-save.test.js --verbose
```

2 ca: 2 Passed, 0 Failed. File [contract-save.test.js](contract-save.test.js).

## CONTRACT-02_decide

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/contract-decide.test.js --verbose
```

2 ca: 2 Passed, 0 Failed. File [contract-decide.test.js](contract-decide.test.js).

## CONTRACT-03_activate

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/contract-activate.test.js --verbose
```

2 ca: 2 Passed, 0 Failed. File [contract-activate.test.js](contract-activate.test.js).

## NOTIFY-01_publish

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/notification-publish.test.js --verbose
```

2 ca: 2 Passed, 0 Failed. File [notification-publish.test.js](notification-publish.test.js).

## NOTIFY-02_list

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/notification-list.test.js --verbose
```

4 ca: 4 Passed, 0 Failed. File [notification-list.test.js](notification-list.test.js).

## NOTIFY-03_markRead

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/notification-mark-read.test.js --verbose
```

2 ca: 2 Passed, 0 Failed. File [notification-mark-read.test.js](notification-mark-read.test.js).

## NOTIFY-04_updatePreferences

Lệnh chạy: **N/A — chưa có ca thực thi theo SRS**. Xem [notification-update-preferences.scope.md](notification-update-preferences.scope.md).

UC-88/GBR-46 không mô tả tùy chọn bật/tắt từng kênh; chưa có expected result SRS cho updatePreferences. Không tạo ca theo quy tắc code tự có.

## NOTIFY-05_registerPushSubscript

Lệnh chạy: **N/A — chưa có ca thực thi theo SRS**. Xem [notification-register-push.scope.md](notification-register-push.scope.md).

SRS mô tả in-app/email/SMS nhưng không quy định Web Push subscription, endpoint hoặc khóa trình duyệt. Chưa có test case SRS cho registerPushSubscription.

## PRIVATE-IMG-01_upload

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/private-image-upload.test.js --verbose
```

2 ca: 2 Passed, 0 Failed. File [private-image-upload.test.js](private-image-upload.test.js).

## PRIVATE-IMG-02_read

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/private-image-read.test.js --verbose
```

3 ca: 3 Passed, 0 Failed. File [private-image-read.test.js](private-image-read.test.js).

## AVATAR-01_get

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/avatar-get.test.js --verbose
```

3 ca: 3 Passed, 0 Failed. File [avatar-get.test.js](avatar-get.test.js).

## AVATAR-02_change

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/avatar-change.test.js --verbose
```

2 ca: 2 Passed, 0 Failed. File [avatar-change.test.js](avatar-change.test.js).

## JOB-ASSIGN-01_runOnce

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/job-auto-assignment-run-once.test.js --verbose
```

3 ca: 3 Passed, 0 Failed. File [job-auto-assignment-run-once.test.js](job-auto-assignment-run-once.test.js).

## JOB-SWEEP-01_calculateOfferDead

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/job-calculate-offer-deadline.test.js --verbose
```

4 ca: 2 Passed, 2 Failed. File [job-calculate-offer-deadline.test.js](job-calculate-offer-deadline.test.js).

## JOB-SWEEP-02_canAcceptOfferAt

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/job-can-accept-offer.test.js --verbose
```

3 ca: 3 Passed, 0 Failed. File [job-can-accept-offer.test.js](job-can-accept-offer.test.js).

## JOB-SWEEP-03_runOnce

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/job-operational-run-once.test.js --verbose
```

3 ca: 3 Passed, 0 Failed. File [job-operational-run-once.test.js](job-operational-run-once.test.js).

## JOB-VISIT-01_isEligibleVisitRem

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/job-eligible-visit-reminder.test.js --verbose
```

4 ca: 3 Passed, 1 Failed. File [job-eligible-visit-reminder.test.js](job-eligible-visit-reminder.test.js).

## JOB-VISIT-02_visitReminderKey

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/job-visit-reminder-key.test.js --verbose
```

2 ca: 2 Passed, 0 Failed. File [job-visit-reminder-key.test.js](job-visit-reminder-key.test.js).

## JOB-VISIT-03_runOnce

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/job-visit-reminder-run-once.test.js --verbose
```

3 ca: 3 Passed, 0 Failed. File [job-visit-reminder-run-once.test.js](job-visit-reminder-run-once.test.js).

## JOB-PAY-01_runOnce

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/job-payment-reminder-run-once.test.js --verbose
```

5 ca: 4 Passed, 1 Failed. File [job-payment-reminder-run-once.test.js](job-payment-reminder-run-once.test.js).

## EMP-DISPATCH-01_previewCandidat

```powershell
npm run test:unit -- --runTestsByPath tests/unit/report5-functions/employee-dispatch-preview-candidates.test.js --verbose
```

3 ca: 3 Passed, 0 Failed. File [employee-dispatch-preview-candidates.test.js](employee-dispatch-preview-candidates.test.js).
