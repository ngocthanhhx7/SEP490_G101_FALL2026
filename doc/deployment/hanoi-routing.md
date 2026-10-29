# Định tuyến cho gợi ý sitter tại Hà Nội

AI chỉ gợi ý sitter; OSRM cung cấp ma trận thời gian đi đường tĩnh. Không dùng
đường chim bay thay cho ETA, không tự gọi demo công khai bằng tọa độ khách.
Giá, phí và lời mời/assignment vẫn do backend nghiệp vụ quyết định.

## Dữ liệu và phạm vi

Nguồn công khai: [Geofabrik Vietnam](https://download.geofabrik.de/asia/vietnam.html),
SHA256 nguồn đã tải `7b902e2b1912ed67188fd01e1c3032c79062dfc3708dd356a71203a9467b90c9`.
Dữ liệu được cắt thành rectangle có buffer `105.15,20.45,106.15,21.55`, không
khẳng định đây là địa giới hay toàn bộ khu vực phục vụ Hà Nội. Khu vực được phép
phục vụ vẫn do service/work-area policy kiểm tra riêng.

Cut: 28,114,986 bytes, SHA256
`1889c71f0c94c139a20f6e73a28445f8df35e07b32592bb5b1e39a3b58add285`,
3,257,696 nodes, 500,576 ways, 1,206 restriction relations, không thiếu node
reference. `extract-hanoi-routing.py` giữ tags và referenced objects; nếu chỉ
lọc đường rồi bỏ restriction relations sẽ làm sai rẽ/cấm rẽ. Dữ liệu và graph
sinh ra ở thư mục storage riêng, không commit vào Git. Ghi attribution
OpenStreetMap contributors/ODbL và ngày/hash khi cập nhật dữ liệu.

## Chuẩn bị graph

Image chính thức [OSRM v26.10.0](https://github.com/Project-OSRM/osrm-backend/tree/v26.10.0).
EC2 dùng ARM64 manifest:

```text
ghcr.io/project-osrm/osrm-backend:v26.10.0-debian@sha256:b0045097b8b4ad5e72dce6b900326cd6ee0e98c729709214e674d0472b463f49
```

Dùng cùng version/profile cho extract, partition, customize và routed. Pipeline:

```bash
osrm-extract -t 2 -p /opt/car.lua /data/hanoi-buffered.osm.pbf
osrm-partition -t 2 /data/hanoi-buffered.osrm
osrm-customize -t 2 /data/hanoi-buffered.osrm
```

Lần dựng trên EC2 giới hạn 768 MiB bị OOM (exit 137) ở extract, trước khi chạy
runtime. Không tăng RAM/giá máy hoặc thay ứng dụng production để dựng graph.
Đã chuyển preprocessing sang WSL local nhiều RAM hơn; chỉ graph đã kiểm tra mới
được chuyển lại EC2. Cross-architecture graph phải được mở/thử với image ARM64
thật trước khi công bố thành công; không suy từ bước build AMD64.

Runtime chỉ bind `127.0.0.1:5000`, một thread, `--algorithm mld --mmap`, table tối
đa 50 điểm, `--default-radius 1000` để không snap vị trí ngoài coverage quá xa.
Giới hạn radius là lựa chọn vận hành của provider, không phải bán kính dịch vụ.
Không mở cổng 5000 trong security group hoặc proxy public.

### Kiểm tra EC2 ngày 30/10/2026

Graph MLD dựng trên WSL bằng cùng OSRM v26.10.0 đã mở thành công trên ARM64.
Archive SHA256 `194e0d67671c4199024b40b5f18a9ff1373051318f5e57b893e89982ebace262`;
26 tệp ở `/opt/pawworldcare/routing/hanoi-mld-v2610` được mount read-only.
Container `pwc-osrm-hanoi` dùng một thread, CPU 0.5, RAM 384 MiB, không swap,
restart unless-stopped và chỉ publish loopback. Table API giữa hai điểm công khai
`105.85,21.03` và `105.82,21.02` trả `Ok`, ETA hai chiều 517.7 và 523.8 giây.
Docker báo running, OOM=false và khoảng 12.42 MiB tại mẫu đo sau truy vấn.
Đây là smoke test hai điểm, chưa xác nhận tải đồng thời hay toàn bộ coverage.

## Cấu hình backend

```dotenv
AI_ENABLED=true
AI_ROUTING_URL=http://127.0.0.1:5000/
AI_ROUTING_BOUNDS=105.15,20.45,106.15,21.55
```

Chỉ bật sau khi provider thật trả Table API hợp lệ và ngân sách RAM chung đạt.
Backend từ chối điểm ngoài rectangle trước cả cache, giữ null unreachable,
không chấp nhận fallback_speed. Response có deadline toàn bộ 8 giây và giới hạn
1 MB kể cả khi thiếu Content-Length. Client chỉ nhận lý do/điểm/ETA tăng thêm,
không nhận tọa độ nhà khách hoặc tuyến riêng của sitter khác.

Cần seed danh mục/ranking policy đúng phiên bản và có sitter được duyệt, lịch
nguồn, địa chỉ đã xác nhận. Không chèn sitter/rating giả để đủ 5 kết quả. Thiếu
lịch sử vẫn ghi LIMITED_HISTORY; model học máy chỉ import khi quality gate đạt.
Không tạo data huấn luyện giả rồi báo model production đã được huấn luyện.

## Trạng thái release

PR #83/#87 đã merge; production đã lên SHA
`4b0932f7248e1770ec0ad5f1e5b3f87ca230292c`, health/ready và asset mới đã kiểm tra.
Provider R2 đã qua signed PUT/GET và API trên Mongo cách ly/session thật; cleanup
đã xóa ảnh thử. User chốt retention demo: giữ đến khi chủ ảnh yêu cầu xóa, quota
20 ảnh/người, không auto-delete theo ngày. Xóa/reconcile và evidence vẫn cần
command riêng; không dùng lifecycle xóa R2 đơn độc bỏ lại metadata/quota Mongo.
R2 và AI runtime đang tắt trong lúc hoàn thiện những acceptance này; SMS đã bật
theo cấu hình và provider delivery test được người dùng xác nhận.
