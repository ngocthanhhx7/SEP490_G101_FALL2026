# Paw World Care

**SEP490_G101_FALL2026** — Ứng dụng web cung cấp dịch vụ chăm sóc thú cưng tại nhà.

Repository chung của nhóm SEP490 G101, học kỳ Fall 2026. Project Leader: **Nguyễn Ngọc Thành** ([@ngocthanhhx7](https://github.com/ngocthanhhx7)).

Paw World Care hỗ trợ đặt lịch chăm sóc chó/mèo, quản lý từng buổi chăm sóc, phân công pet sitter, báo cáo chăm sóc, xử lý sự cố và thanh toán sau khi hoàn thành dịch vụ. Phạm vi sản phẩm tham chiếu Report 1; công nghệ và quy trình quản lý tham chiếu Report 2.

## Trạng thái

Repository đang ở bước khởi tạo cấu trúc và quy ước làm việc. Chưa có ứng dụng chạy được, dependency, cấu hình build, kiểm thử tự động hay deployment. Các thư mục trống được giữ bằng `.gitkeep`; xóa tệp này khi thư mục có nội dung thực tế.

## Công nghệ theo kế hoạch

| Thành phần | Công nghệ |
| --- | --- |
| Frontend | React |
| Backend | Node.js, Express |
| Database | MongoDB 7+ / MongoDB Atlas; Mongoose |
| Kiểm thử dự kiến | Jest, Supertest, React Testing Library |
| Triển khai dự kiến | Vercel cho frontend; Render / AWS cho backend |

Phiên bản runtime, build tool và dependency sẽ được chốt trong PR khởi tạo ứng dụng và ghi vào README tương ứng cùng lockfile.

## Cấu trúc

```text
SEP490_G101_FALL2026/
├── frontend/                  # Giao diện React
│   ├── public/
│   ├── src/
│   │   ├── app/               # Khởi tạo ứng dụng và providers
│   │   ├── assets/            # images, icons, fonts
│   │   ├── components/        # ui, common
│   │   ├── layouts/
│   │   ├── pages/             # public, customer, sitter, admin
│   │   ├── routes/
│   │   ├── contexts/
│   │   ├── hooks/
│   │   ├── services/          # Gọi API
│   │   ├── constants/
│   │   ├── utils/
│   │   └── styles/
│   └── tests/                 # unit, integration, e2e
├── backend/                   # REST API Node.js / Express
│   ├── src/
│   │   ├── config/
│   │   ├── routes/
│   │   ├── controllers/
│   │   ├── services/          # Nghiệp vụ
│   │   ├── models/            # MongoDB / Mongoose
│   │   ├── middlewares/
│   │   ├── validators/
│   │   ├── constants/
│   │   ├── utils/
│   │   └── jobs/
│   ├── scripts/
│   │   ├── seeds/
│   │   └── migrations/
│   └── tests/                 # unit, integration, fixtures
├── doc/
│   ├── source-code-management/ # Gitflow, commit, review, quy ước code
│   ├── requirements/
│   ├── architecture/
│   ├── api/
│   ├── database/
│   ├── ui-ux/
│   ├── testing/
│   ├── deployment/
│   ├── meetings/
│   ├── reports/
│   └── references/
├── .github/                   # CODEOWNERS, mẫu PR và issue
├── AGENTS.md                  # Hướng dẫn cho coding agents
└── CONTRIBUTING.md            # Hướng dẫn tham gia dự án
```

## Bắt đầu làm việc

```bash
git clone https://github.com/ngocthanhhx7/SEP490_G101_FALL2026.git
cd SEP490_G101_FALL2026
git switch develop
git pull --ff-only origin develop
git switch -c feature/123-pet-profile
```

`123` là ví dụ mã GitHub Issue; thay bằng mã công việc thực tế. Thành viên phát triển trên `feature/*` và mở PR vào `develop`. `main` dành cho bản ổn định. Mỗi PR cần ít nhất một thành viên khác tác giả approve; Leader thực hiện merge cuối cùng.

Đọc [hướng dẫn đóng góp](CONTRIBUTING.md), [quy tắc quản lý source code](doc/source-code-management/README.md), [hướng dẫn frontend](frontend/README.md), [hướng dẫn backend](backend/README.md) và [mục lục tài liệu](doc/README.md) trước khi thêm mã nguồn.

Đợt khởi tạo đầu tiên tạo cùng một baseline trên `main` và `develop` theo yêu cầu của Leader. Quy trình PR áp dụng cho các thay đổi tiếp theo.
