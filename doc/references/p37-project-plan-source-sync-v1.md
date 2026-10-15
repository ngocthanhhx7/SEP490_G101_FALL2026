# P37-D — Đồng bộ kế hoạch, WBS và nguồn v1.0

**Ngày:** 15/10/2026 (Asia/Saigon)
**Trạng thái:** kế hoạch và source register cục bộ để nhóm review; không ghi nhận đã sửa workbook/SRS/diagram trên Drive.

## Phân rã P37 và ownership

| Work item | Phạm vi | Nhánh kế hoạch | Owner/author | Reviewer | Merge |
| --- | --- | --- | --- | --- | --- |
| P37-A | SRS, UC và crosswalk | `feature/p37-a-requirements-and-uc-synchronization` | Nguyễn Hữu Anh Nhật | Đặng Văn Hải | Nguyễn Ngọc Thành |
| P37-B | SDS, API và sơ đồ | `feature/p37-b-architecture-api-and-diagram-synchronization` | Đặng Văn Hải | Đoàn Tiến Đạt | Nguyễn Ngọc Thành |
| P37-C | Test traceability và evidence | `feature/p37-c-test-traceability-and-evidence-synchronization` | Phạm Thành Chung | Đoàn Tiến Đạt | Nguyễn Ngọc Thành |
| P37-D | WBS, lịch và source management | `feature/p37-d-project-plan-wbs-and-source-management-synchronization` | Nguyễn Ngọc Thành | Nguyễn Hữu Anh Nhật | Nguyễn Ngọc Thành |

Bảng trên là phân công, không phải bằng chứng contributor đã commit hoặc reviewer đã approve. Nhánh workspace hiện tại là P36; tài liệu này không tự đổi nhánh hoặc gộp diff chưa commit của phiên khác.

## Delta WBS và dependency cần ghi vào kế hoạch

| Deliverable | Mã giữ/cập nhật | Dependency | Estimate | Gate thực tế |
| --- | --- | --- | --- | --- |
| OTP, dual contact, read-only account settings | WBS 3/4/5/70 | P06/P09 | 1–2 pd delta | provider và second-contact decision |
| Public policy version/cutoff/prepay | WBS 11/19–21, N10 | P17/P45/P51 | 1–2 pd delta | approved legal content |
| Care-ready dog/cat profile and snapshot | WBS 14/15 | P50/P01 | 1–3 pd delta | schema, private files |
| Applicant status/reapply/scoped verification | WBS 16–18, N01 | P16/P46/P06 | 1–2 pd delta | OTP/media/runtime |
| Directed proposal and dispatch concurrency | WBS 24/30/61/63, N03/N04 | P18/P19/P21/P42 | 2–4 pd delta | availability, payment and atomic assignment |
| Selected visit change/cancel/refund | WBS 33/34/46, N10 | P25/P32/P51 | 2–4 pd delta | FIN-02…06 |
| Arrival/during/departure evidence | WBS 35–39 | P26/P27/P01 | 1–2 pd delta | private media and Staff-close |
| Prepay/postpay/reconcile/settlement | WBS 43–47/64/65, N05–N07 | P31/P32/P41/P51 | 3–5 pd delta | ledger/provider and booking integration |
| Two-way rating and sitter complaint projection | WBS 48–50, N08/N09 | P30/P47 | 1–2 pd delta | privacy/window/moderation |
| PWA, role shell and query performance | N11–N14 | P04/P43/P44/P48 | 2–4 pd delta | Figma, device and load evidence |

Estimates are planning deltas, not reported completion. The original 66 UC and 70 WBS counts are inventory references; they do not cap a corrected plan.

## Source register and proposed Drive patch

| Source | Version read | Use in P37 | Action |
| --- | --- | --- | --- |
| Report 3 SRS | change log 09/10; 66 UC | names, actors, rules, jobs/API | preserve original; apply reviewed crosswalk |
| UC workbook | 08/10; rows 5–70 | old UC IDs and WBS mapping | keep old→new aliases; do not shift IDs by row |
| Project tracking workbook | 70 functions, 67 committed/3 backlog | function, owner, iteration | update only after owner/estimate review |
| Report 2 / RACI | source planning version | responsibility provenance | distinguish RACI from GitHub review |
| P00/P01/P51 repository docs | v1.0, 14/10 | decisions and technical contracts | link as controlled repository baseline |
| Current code/test workspace | HEAD 9dfe6ed plus uncommitted files | execution audit | record as local evidence, not Drive completion |

Recommended Drive patch order: create versioned backups; update SRS overview/actors/rules/jobs/API; update UC and WBS sheets with old→new mapping; update SDS/API/screen and state diagrams; then update test matrix and schedule. Review crosswalk before renumbering. Do not copy private reports, credentials, customer data, or local prompt/auth files into Git.

## Handoff and open dependencies

- P34 must register export-only modules and own shared router/manifest wiring.
- P01/P51 must close money ordering, snapshot allocation, rounding, refund and settlement ledger decisions.
- P43/P48 need Figma frame IDs or explicit `PROVISIONAL` UI status; P36 needs real device/load evidence.
- P38 can consume these matrices for UAT, but must not treat local fixture tests as end-to-end acceptance.
