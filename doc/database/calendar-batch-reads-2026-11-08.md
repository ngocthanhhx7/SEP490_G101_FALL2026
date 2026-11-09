# Calendar revision reads theo khoảng ngày

DB-05: calendar31ngày hiện đọc current availability và capability rồi gọi
revisionAt tuần tự31lần. Dữ liệu mỗi ngày có thể đến từ thời điểm khác nhau.
EmployeeAvailabilityRevision là authority lịch theo effectiveFrom/date-only;
current và matching capability bổ sung dayOffDates. Giữ riêng các authority,
không gộp collection, copy history vào parent hoặc tạo index/TTL mới.

Đích: một read-only snapshot session với tối đa4data reads (1ngày dùng3reads): current dayOffDates,
capability dayOffDates, baseline revision mới nhất tại đầu khoảng, rồi các bản
mới nhất theo mỗi effectiveFrom trong khoảng. Dùng index hiện có
{sitterId:1,effectiveFrom:-1,version:-1}; GROUP sau sort date/version DESC chọn
version lớn nhất cùng ngày. Không được bỏ version tie-break như catalog vì
revision uniqueness bao cả version và cho phép nhiều bản cùng effectiveFrom.

Projection chỉ lấy fields cần cho calendar. Nhóm theo ngày giúp payload tối đa
31bản thay vì fetch toàn bộ lịch sử hoặc mọi update cùng ngày. Range31ngày,
querymaxTimeMS5s/allowDiskUsefalse,32groups sentinel để từ chối dữ liệu ngày lạ
thay vì trả thiếu. Reads tuần tự trong session, không Promise.all. Session dùng snapshot:true và
causalConsistency:false; MongoDB5+ hỗ trợ pin atClusterTime qua find/aggregate,
không cần transaction/commit. Dự án đang chạy MongoDB8.x.
Calendar output/timezone/weekday/off-day/windows/state semantics và HTTP/auth/error
hợp lệ giữ nguyên. Guard và các command eligibility/occupancy không đổi.

Regression: baseline trước/from, transition cùng ngày nhiều version, future ngoài
range, không revision, weekday/overnight window và dayOffDates union. Test snapshot
với update concurrent sau read đầu để một response không trộn hai thời điểm.
Đo command count1/7/31ngày và sameDTO, explain range với nhiều update mỗi ngày.
Không suy diễn fixture thành production capacity hoặc tự thêm index.

Không có migration/backfill/validator hay quyết định retention. Review/CI/main,
backup/restore và readiness theo quy trình; rollback code tương thích nguyên data.

Tham chiếu primary: [MongoDB snapshot reads specification](https://github.com/mongodb/specifications/blob/master/source/sessions/snapshot-sessions.md).

## Bằng chứng trước rollout

Read-only live:1sitter/31ngày, cùngDTOhash,33→4find/aggregate/getMore.
SyntheticMongo8.0.34,100sitters,1k/10k/100krevisions,20samples/3warmup,
cùngDTO. Tại100k,rangeplan FETCH+DISTINCT_SCAN:31keys/30docs/30groups,
không phải tải mọi revision từng ngày. Không thêm index.

| Ngày | Data commands cũ→mới | p95ms cũ→mới | BSONdocument bytes cũ→mới |
| ---: | --- | --- | --- |
| 1 | 3→3 | 1.53→2.01 | 3430→716 |
| 7 | 9→4 | 6.52→4.09 | 6168→3238 |
| 31 | 33→4 | 21.95→5.01 | 16623→12829 |

Writer order old→new, warmcache,1client. Syntheticpayload có2KiB field không
dùng trên capability để đo projection; bytegain phụ thuộc shape thực tế. Khoảng
ngắn có overhead snapshot và không bảo đảm nhanh hơn. Snapshot session không
commit; không có claim productionlatency/RSS/capacity hoặc DBvolume savings.
