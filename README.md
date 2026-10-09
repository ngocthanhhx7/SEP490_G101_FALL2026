# Paw World Care

**SEP490_G101_FALL2026** — Ứng dụng web cung cấp dịch vụ chăm sóc thú cưng tại nhà.

Repository chung của nhóm SEP490 G101, học kỳ Fall 2026. Project Leader: **Nguyễn Ngọc Thành** ([@ngocthanhhx7](https://github.com/ngocthanhhx7)).

Paw World Care hỗ trợ đặt lịch chăm sóc chó/mèo, quản lý từng buổi chăm sóc, phân công pet sitter, báo cáo chăm sóc, xử lý sự cố và thanh toán sau khi hoàn thành dịch vụ. Phạm vi sản phẩm tham chiếu Report 1; công nghệ và quy trình quản lý tham chiếu Report 2.

## Trạng thái

Repository đang phát triển các luồng đăng ký/đăng nhập OTP cho Customer và nộp đơn Pet Sitter. Backend có REST API Node.js/Express, MongoDB replica set và bộ unit/integration test; frontend React/Vite có các màn đăng ký, OTP và trang chủ. Production deployment chưa được cấu hình.

## Công nghệ

| Thành phần | Công nghệ |
| --- | --- |
| Frontend | React |
| Backend | Node.js >=22, ES modules, Express 5, Mongoose 8 |
| Database | MongoDB 7+ / MongoDB Atlas; replica set bắt buộc cho transaction |
| Kiểm thử backend | Node.js test runner; `mongodb-memory-server` replica set cho integration test |
| Kiểm thử frontend | React Testing Library (dự kiến) |
| Triển khai dự kiến | Vercel cho frontend; Render / AWS cho backend |

Backend dùng npm, có `package.json` và `package-lock.json`. Xem `backend/README.md` để chạy MongoDB local, tạo `.env` và khởi động server.

## Chạy branch tính năng local

Yêu cầu Node.js `>=22`. Từ thư mục repository, mở hai terminal:

```powershell
# Terminal 1: MongoDB replica set và backend
docker compose -f backend/docker-compose.yml up -d
if (-not (Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }
Set-Location backend
npm ci
npm run dev
```

```powershell
# Terminal 2: frontend
Set-Location frontend
npm ci
npm run dev
```

Backend dùng mock OTP provider khi `OTP_EMAIL_PROVIDER` và `OTP_SMS_PROVIDER` trong `.env` giữ giá trị `mock`. Không commit `backend/.env`; chỉ chuyển sang Gmail/eSMS sau khi đã điền credentials trong file local. Chi tiết biến môi trường và cấu hình provider ở [backend README](backend/README.md).

## Đưa branch lên GitHub

Tính năng được phát triển trên `feature/*`: commit thay đổi, push branch lên `origin`, rồi mở Pull Request với base `develop`. Cần ít nhất một thành viên khác tác giả approve; Project Leader review và merge cuối cùng. Không push trực tiếp vào `develop`/`main` và không triển khai branch tính năng trực tiếp lên production. Hiện repository chưa có cấu hình production deployment; việc deploy sẽ cần cấu hình riêng sau khi PR được merge, gồm MongoDB replica set và các biến môi trường secrets trên môi trường đích.

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
