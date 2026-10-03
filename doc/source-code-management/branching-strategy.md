# Branching Strategy

## Vai trò của các nhánh

| Nhánh | Tạo từ | PR đích | Mục đích |
| --- | --- | --- | --- |
| `main` | Baseline ban đầu | Không làm tính năng trực tiếp | Mã ổn định để phát hành production |
| `develop` | `main` | `main` khi phát hành hoặc qua `release/*` | Tích hợp các tính năng của Sprint |
| `feature/<short-name>` | `develop` | `develop` | Một tính năng hoặc công việc riêng |
| `release/<version>` | `develop` | `main`, sau đó đồng bộ `main` về `develop` | Ổn định phiên bản trước phát hành khi cần |
| `hotfix/<short-name>` | `main` | `main`, sau đó PR `main` về `develop` | Sửa lỗi production khẩn cấp |

Tên nhánh dùng chữ thường, tiếng Anh và dấu `-`; có thể thêm mã issue, ví dụ `feature/123-pet-profile`, `hotfix/456-payment-callback`, `release/1.0.0`. Những tên này là ví dụ, chưa phải nhánh đã được tạo.

## Phát triển hằng ngày

```bash
git switch develop
git pull --ff-only origin develop
git switch -c feature/123-pet-profile
# Thực hiện công việc, kiểm tra, rồi commit.
git push -u origin feature/123-pet-profile
```

Mở PR với base `develop`; chỉ rõ issue, thay đổi, kiểm tra đã chạy và ảnh giao diện nếu có. Không push trực tiếp vào `develop` hoặc `main` sau bootstrap. Khi có xung đột, cập nhật nhánh công việc từ base, giải quyết, kiểm tra lại và yêu cầu review lại nếu cần.

## Phát hành

Leader tạo `release/<version>` từ `develop` khi cần thời gian ổn định; chỉ đưa sửa lỗi và tài liệu cần cho phiên bản vào nhánh release. PR vào `main` vẫn phải có review độc lập. Sau merge và kiểm tra phát hành, Leader tạo tag `vX.Y.Z` khi thực sự phát hành và mở PR `main → develop` để giữ các sửa đổi đồng bộ.

Khi không cần nhánh ổn định riêng, Leader có thể mở PR `develop → main`. Dùng **Create a merge commit** cho các PR giữa `develop`, `release/*`, `hotfix/*` và `main` để giữ quan hệ lịch sử. Nếu squash một PR tính năng, tiêu đề squash commit phải theo Conventional Commits.

## Hotfix

```bash
git switch main
git pull --ff-only origin main
git switch -c hotfix/456-payment-callback
```

Sau khi sửa, chạy kiểm tra phù hợp và mở PR vào `main`. Leader merge sau approval độc lập, thực hiện quy trình phát hành cần thiết, rồi mở PR `main → develop`. Nếu một nhánh release đang hoạt động, đưa bản sửa vào nhánh đó qua PR trước khi phát hành. Không bỏ qua bước review vì nhánh có tên hotfix.

Việc có nhánh `main` không tự tạo deployment. Vercel/Render và pipeline sẽ được cấu hình trong công việc triển khai riêng.
