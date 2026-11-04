import { money } from './PayrollDetails.jsx';
export function EmploymentContractPrint({ document }) {
  const t = document.terms;
  return <article className="employment-contract-print" aria-label="Bản hợp đồng lao động">
    <header><strong>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</strong><p>Độc lập – Tự do – Hạnh phúc</p><h1>HỢP ĐỒNG LAO ĐỘNG</h1><p>Số: {document.reference} · Mã nhân viên: {document.employeeCode}</p></header>
    {document.state === 'DRAFT' && <p className="contract-watermark">BẢN NHÁP – CHƯA CHỐT ĐỂ KÝ</p>}
    <p>Căn cứ Bộ luật Lao động số 45/2019/QH14, các văn bản sửa đổi, hướng dẫn đang có hiệu lực và nhu cầu, thỏa thuận tự nguyện của hai bên.</p>
    <h2>Bên A – Người sử dụng lao động</h2><p><strong>{t.employerName}</strong> · Mã đăng ký/MST: {t.registrationNumber}.</p>
    <p>Địa chỉ: {t.employerAddress}. Đại diện: {t.representativeName}, chức danh: {t.representativeTitle}. Căn cứ thẩm quyền ký: {t.authorityBasis}.</p>
    <h2>Bên B – Người lao động</h2><p>Họ tên: <strong>{t.employeeName}</strong>. Quốc tịch: {t.nationality}. Ngày sinh: {t.dateOfBirth}. Giới tính: {t.gender}.</p>
    <p>Nơi cư trú: {t.residence}. Căn cước/hộ chiếu: {t.identityNumber}, cấp ngày {t.identityIssuedOn}, nơi cấp: {t.identityIssuedBy}.</p>
    <h2>Điều 1. Công việc, nơi làm việc và thời hạn</h2>
    <p>Chức danh: {t.jobTitle}. Công việc: {t.duties}</p><p>Địa điểm/phạm vi làm việc: {t.workplace}. Vùng lương: {t.workplaceRegion}; căn cứ địa bàn: {t.workplaceReference}.</p>
    <p>Hợp đồng {t.termType === 'FIXED' ? `xác định thời hạn từ ${t.effectiveOn} đến trước ngày ${t.endsOn}` : `không xác định thời hạn, hiệu lực từ ${t.effectiveOn}`}. Làm việc {t.employmentType === 'FULL_TIME' ? 'toàn thời gian' : 'không trọn thời gian'}.</p>
    <h2>Điều 2. Thời giờ làm việc và nghỉ ngơi</h2>
    <p>{t.dailyMinutes / 60} giờ/ngày, {t.weeklyMinutes / 60} giờ/tuần; các ngày theo tuần: {t.weekdays.map(day => day === 7 ? 'Chủ nhật' : `Thứ ${day + 1}`).join(', ')}. Giờ bắt đầu, kết thúc và bố trí ca: {t.restRules}</p>
    <p>Bảo đảm nghỉ giữa giờ, nghỉ hằng tuần, nghỉ lễ và nghỉ phép theo luật. Làm thêm chỉ khi có sự đồng ý của người lao động và trong giới hạn pháp luật; làm thêm, làm ban đêm được trả riêng theo mức luật định. Không mặc nhiên coi thời gian công ty chưa bố trí ca là nghỉ không lương.</p>
    <h2>Điều 3. Tiền lương và thanh toán</h2>
    <p>Lương theo công việc: <strong>{money(t.monthlyBaseVnd)}/tháng (GROSS)</strong>. Phụ cấp cố định: {money(t.monthlyAllowanceVnd)}/tháng. Hai khoản này chưa trừ phần bảo hiểm, thuế thuộc trách nhiệm người lao động; nghĩa vụ của người sử dụng lao động không được trừ vào lương người lao động.</p>
    <p>Hình thức trả: {t.payMethod}. Kỳ trả: hằng tháng. Thời điểm trả: {t.paySchedule}. Bên A cung cấp bảng kê từng kỳ, thể hiện lương, làm thêm/ban đêm và từng nội dung khấu trừ.</p>
    <p>Hoa hồng dịch vụ trực tiếp thực hiện: 5% giá trị dịch vụ sau giảm combo, trước thuế, không gồm viện phí/chi hộ, căn cứ ca hoàn tất được xác minh. Thưởng KPI tháng theo mức hoàn thành mục tiêu chăm sóc đã duyệt: 90% / 100% / 110%, tương ứng toàn thời gian 500.000 / 1.000.000 / 1.500.000 VND, không trọn thời gian 150.000 / 300.000 / 450.000 VND; điều kiện đúng giờ ít nhất 95%, báo cáo đầy đủ 100% và không có vi phạm nghiêm trọng đã kết luận. Mục tiêu được điều chỉnh cho nghỉ hợp lệ và thời gian công ty không bố trí việc; thưởng không thay thế mức lương tối thiểu. Tạm ứng theo thỏa thuận, không tính lãi. Không phạt tiền hoặc cắt lương thay kỷ luật; khấu trừ và đối trừ phải có căn cứ, giới hạn và thủ tục hợp pháp.</p>
    <p>Chế độ xét nâng lương: {t.salaryReview}</p>
    <h2>Điều 4. Bảo hiểm, an toàn và đào tạo</h2><p>{t.insurance}</p><p>Trang bị, an toàn: {t.protection}</p><p>Đào tạo: {t.training}</p>
    <p>Bên A không giữ bản chính giấy tờ tùy thân, văn bằng; không yêu cầu đặt cọc để thực hiện hợp đồng. Trang bị và hướng dẫn xử lý thú cưng, phòng cắn/cào, vệ sinh và báo cáo sự cố trước khi giao việc; không giao hành vi chuyên môn thú y khi không đủ điều kiện.</p>
    <h2>Điều 5. Quyền và nghĩa vụ</h2><p>Bên B thực hiện đúng phạm vi chăm sóc, quy trình an toàn, bảo vệ tài sản và thông tin khách hàng; báo cáo trung thực, không tự nhận thêm công việc ngoài thỏa thuận. Bên A bố trí công việc, trả lương đầy đủ, bảo đảm điều kiện làm việc và quyền của người lao động. Trách nhiệm bồi thường, xử lý vi phạm phải căn cứ thiệt hại và thủ tục pháp luật; không tự khấu trừ theo khiếu nại chưa kết luận.</p>
    <h2>Điều 6. Thực hiện và chấm dứt</h2><p>Thay đổi nội dung bằng thỏa thuận hợp pháp, phụ lục hoặc hợp đồng mới. Tạm hoãn, chấm dứt, thời hạn báo trước, thanh toán quyền lợi và giải quyết tranh chấp theo pháp luật lao động; ưu tiên trao đổi, hòa giải, không hạn chế quyền yêu cầu cơ quan có thẩm quyền giải quyết.</p>
    <p>Hợp đồng lập thành 02 bản có giá trị như nhau, mỗi bên giữ 01 bản. Hai bên đọc, hiểu và tự nguyện ký tại {t.signingPlace}, ngày {t.plannedSigningOn}.</p>
    <div className="employment-contract-signatures"><section><strong>ĐẠI DIỆN BÊN A</strong><p>(Ký, ghi rõ họ tên, chức danh; đóng dấu nếu áp dụng)</p><br /><br /><p>{t.representativeName}</p></section><section><strong>NGƯỜI LAO ĐỘNG – BÊN B</strong><p>(Ký và ghi rõ họ tên)</p><br /><br /><p>{t.employeeName}</p></section></div>
    <footer>Mẫu {document.templateVersion} · Bản {document.revision} · Đối chiếu: {document.termsHash}</footer>
  </article>;
}
