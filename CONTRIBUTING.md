# Hướng dẫn đóng góp

Nguyễn Ngọc Thành là Project Leader, phụ trách tích hợp và merge cuối cùng. Tất cả thành viên, kể cả Leader khi là tác giả, tuân thủ quy trình review độc lập.

## Quy trình cho một công việc

1. Nhận hoặc tạo GitHub Issue với phạm vi và tiêu chí chấp nhận rõ ràng.
2. Cập nhật `develop`, rồi tạo `feature/<issue-id>-<short-name>`.
3. Thay đổi đúng phạm vi; đặt mã nguồn trong `frontend/` hoặc `backend/`, tài liệu trong `doc/`.
4. Chạy lint, kiểm tra kiểu nếu có, unit/integration test phù hợp và build của phần bị ảnh hưởng khi các công cụ này đã được cấu hình. Ghi rõ bước chưa chạy và lý do; thay đổi chỉ tài liệu/thư mục có thể ghi N/A kèm lý do.
5. Commit theo `<type>: <short description>`, ví dụ `feat: add pet profile`.
6. Push nhánh và mở PR với base `develop`; điền mẫu PR, liên kết issue, ghi bằng chứng kiểm tra.
7. Một thành viên khác tác giả review và approve. Giải quyết các vấn đề hiệu năng/bảo mật và các yêu cầu sửa trước khi merge.
8. Leader kiểm tra approval và kết quả kiểm tra, thực hiện merge. Sau khi merge, cập nhật nhánh tích hợp trước khi bắt đầu công việc khác.

```bash
git switch develop
git pull --ff-only origin develop
git switch -c feature/123-pet-profile
# Chỉnh sửa và kiểm tra các tệp thuộc công việc.
git add frontend/src/pages/customer/PetProfilePage.jsx
git commit -m "feat: add pet profile"
git push -u origin feature/123-pet-profile
```

Đường dẫn và issue trong ví dụ chỉ minh họa; stage đúng tệp đã sửa. Không commit `.env`, credential, dữ liệu khách hàng, `node_modules` hoặc kết quả build.

Trước khi commit, kiểm tra `git diff --cached --name-only`: chỉ đưa vào mã nguồn, tài nguyên cần thiết, tài liệu và cấu hình dùng chung của dự án. Không version `.vscode/`, `.idea/`, `.vs/`, tệp workspace hoặc cấu hình AI cục bộ ở bất kỳ cấp thư mục nào. Không dùng `git add -f` để bỏ qua `.gitignore`. Tệp đã được Git theo dõi cần được bỏ khỏi index; chỉ thêm ignore rule không tự gỡ tệp đã track. `.github/` chứa cấu hình review/workflow dùng chung của repository và được giữ trong Git.

## Quy định cần đọc

- [Gitflow và xử lý release/hotfix](doc/source-code-management/branching-strategy.md)
- [Conventional Commits](doc/source-code-management/commit-conventions.md)
- [Review và merge](doc/source-code-management/code-review-process.md)
- [Cấu trúc và quy ước đặt tên](doc/source-code-management/coding-conventions.md)
- [Thiết lập GitHub](doc/source-code-management/github-settings.md)

Hiện repository chỉ có cấu trúc và tài liệu. Không có lệnh `npm install`, `npm test` hoặc `npm run build` hoạt động cho đến khi PR khởi tạo runtime thêm manifest, lockfile và script thực tế.
