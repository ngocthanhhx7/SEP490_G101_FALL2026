# Commit Conventions

Dự án dùng [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/).

```text
<type>: <short description>
```

| Type | Sử dụng | Ví dụ |
| --- | --- | --- |
| `feat` | Tính năng mới | `feat: add pet profile` |
| `fix` | Sửa lỗi | `fix: prevent overlapping sitter assignments` |
| `docs` | Chỉ thay đổi tài liệu | `docs: describe booking workflow` |
| `refactor` | Cải thiện cấu trúc, không thêm tính năng hoặc sửa lỗi | `refactor: extract booking validation` |
| `test` | Thêm hoặc chỉnh sửa kiểm thử | `test: cover payment callback verification` |
| `chore` | Cấu hình, công cụ và công việc hỗ trợ | `chore: initialize project structure and source code rules` |

Có thể thêm scope khi cần: `feat(frontend): add booking form`, `fix(backend): validate sitter availability`. Dùng `!` hoặc footer `BREAKING CHANGE:` để nêu thay đổi không tương thích khi thực tế có thay đổi như vậy.

Mô tả ngắn bằng tiếng Anh, nêu việc thay đổi cụ thể. Tránh `update`, `fix bug`, `done` hoặc gộp nhiều việc không liên quan trong một commit. Không dùng dấu hai chấm kép như `feat::`.

Body có thể giải thích lý do và tác động. Ghi `Refs #123` để liên hệ công việc; dùng closing keyword trong PR khi muốn issue được đóng theo quy tắc của GitHub. Không sửa lại lịch sử của `main` hoặc `develop` để đổi commit đã được chia sẻ.

Tiêu đề PR cũng dùng định dạng trên để squash commit có thông điệp rõ ràng.
