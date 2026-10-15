// Initial prices authorized by the project owner; normal Admin versioning supersedes them.
export const initialServiceCatalog = Object.freeze([
  { code: 'home-visit', name: 'Ghé thăm & chơi cùng Pet',
    description: 'Ghé nhà kiểm tra tình hình và chơi cùng chó hoặc mèo của bạn.',
    scope: 'Ghé thăm thú cưng tại nhà theo lịch hẹn\nQuan tâm và chơi cùng bé theo lời dặn của chủ nuôi\nCập nhật ghi chú sau lượt chăm sóc',
    species: ['DOG', 'CAT'], amountVnd: 80000, unitLabel: '30 phút',
    policy: 'Dịch vụ ghé thăm và chơi cùng chó, mèo tại nhà theo thông tin chủ nuôi cung cấp. Vui lòng chuẩn bị hồ sơ thú cưng, địa chỉ và lời dặn trước lượt chăm sóc. Thời lượng cơ bản: 30 phút. Điều kiện đặt lịch, thanh toán và hủy lịch được đối chiếu theo chính sách hiện hành khi đặt.' },
  { code: 'dog-walking', name: 'Dắt chó đi dạo',
    description: 'Cho chó đi dạo cùng người chăm sóc của PawWorld.',
    scope: 'Dắt chó đi dạo theo lịch đã thống nhất\nThực hiện theo lưu ý của chủ nuôi về bé\nCập nhật ghi chú sau lượt đi dạo',
    species: ['DOG'], amountVnd: 80000, unitLabel: '30 phút',
    policy: 'Dịch vụ dành cho chó, với thời lượng cơ bản 30 phút. Chủ nuôi cung cấp thông tin sức khỏe, thói quen và lưu ý khi ra ngoài của bé. Lịch và địa điểm thực hiện cần được xác nhận trong quá trình đặt dịch vụ. Điều kiện thanh toán và hủy lịch được đối chiếu theo chính sách hiện hành khi đặt.' },
  { code: 'vet-escort', name: 'Đưa thú cưng đến lịch hẹn thú y',
    description: 'Đưa thú cưng đến lịch hẹn thú y theo thông tin khách cung cấp.',
    scope: 'Tiếp nhận thông tin lịch hẹn thú y từ chủ nuôi\nHỗ trợ đưa chó hoặc mèo đến điểm hẹn đã thống nhất\nCập nhật thông tin bàn giao theo lời dặn',
    species: ['DOG', 'CAT'], amountVnd: 150000, unitLabel: 'lượt',
    policy: 'Dịch vụ hỗ trợ đưa chó, mèo đến lịch hẹn thú y do chủ nuôi cung cấp; không phải dịch vụ khám, chẩn đoán hoặc điều trị. Giá khởi tạo là phí hỗ trợ đưa đến lịch hẹn, không bao gồm chi phí khám, thuốc hay điều trị của cơ sở thú y. Chủ nuôi và người chăm sóc xác nhận lịch hẹn, điểm đến và thông tin bàn giao trước khi thực hiện.' },
]);
