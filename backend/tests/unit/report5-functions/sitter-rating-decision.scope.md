# SITTER-REVIEW-01 — ratingDecision

GBR-48, dòng 6715–6718: Pet sitters do not rate customers.

ratingDecision là helper nội bộ, không export hoặc trả từ service; policy SITTER_TO_CUSTOMER không được SRS hiện tại cho phép. Không trích code ra để giả lập gọi trực tiếp hoặc thêm policy test từ implementation. Chặn hành vi Sitter đánh giá Customer được kiểm trong SITTER-REVIEW-02.

Không có ca thực thi; không tạo test rỗng hoặc ca giả. Không có lệnh Jest cho hàm này.
