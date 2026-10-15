import { Link } from 'react-router-dom';
import './about.css';

const assets = '/assets/figma-public/';
const team = [
  ['Nguyễn Ngọc Thành', 'Trưởng nhóm dự án', 'about-Group1321314349.svg'],
  ['Đoàn Tiến Đạt', 'Thành viên phát triển', 'about-Group1321314350.svg'],
  ['Phạm Thành Chung', 'Thành viên phát triển', 'about-Group1321314351.svg'],
  ['Đặng Văn Hải', 'Thành viên phát triển', 'about-Group1321314352.svg'],
  ['Nguyễn Hữu Anh Nhật', 'Thành viên phát triển', 'about-Group1321314353.svg'],
];

export function AboutPage() {
  return <div className="pwc-about-page">
    <section className="pwc-about-intro" aria-labelledby="pwc-about-heading">
      <div className="pwc-about-collage">
        <img className="pwc-about-photo-main" src={assets + 'about-Image168.png'} alt="Những chú mèo thư giãn dưới bầu trời xanh" fetchPriority="high" />
        <img className="pwc-about-photo-small" src={assets + 'about-Image154.png'} alt="Chú mèo trắng trong khung ảnh nhỏ" />
      </div>
      <div className="pwc-about-intro-copy"><h1 id="pwc-about-heading">Về<br />PawWorld Care</h1>
        <p>Paw World Care kết nối người nuôi chó, mèo với dịch vụ chăm sóc thú cưng tại nhà. Khi bạn bận rộn hoặc vắng nhà, bé vẫn cần được quan tâm trong không gian quen thuộc.</p>
        <p>Dự án hướng đến việc giúp bạn tìm dịch vụ phù hợp, đặt lịch chăm sóc và theo dõi từng lượt thực hiện — từ ghé thăm, chơi cùng bé đến dắt chó đi dạo và đưa bé đến lịch hẹn thú y.</p>
      </div>
    </section>

    <section className="pwc-about-band pwc-about-values" aria-labelledby="pwc-about-values-title">
      <div><h2 id="pwc-about-values-title">GIÁ TRỊ</h2><div>
        <p>Đặt sự an tâm của người nuôi và nhu cầu của thú cưng ở trung tâm mỗi lượt chăm sóc. Mỗi bé có thói quen riêng; thông tin hồ sơ và lời dặn của bạn giúp người chăm sóc hiểu bé hơn.</p>
        <p>Minh bạch từ thông tin dịch vụ, phạm vi phục vụ và chính sách đến quá trình thực hiện. Checklist, hình ảnh và ghi chú giúp bạn nắm được những gì diễn ra trong lượt chăm sóc.</p>
      </div></div>
    </section>
    <section className="pwc-about-band pwc-about-goals" aria-labelledby="pwc-about-goals-title">
      <img src={assets + 'home-Image659.webp'} alt="" loading="lazy" />
      <div><h2 id="pwc-about-goals-title">MỤC TIÊU</h2><div>
        <p>Xây dựng một nền tảng chăm sóc chó, mèo tại nhà, nơi khách hàng có thể quản lý hồ sơ thú cưng, lựa chọn dịch vụ và sắp xếp lịch phù hợp.</p>
        <p>Kết nối khách hàng với người chăm sóc, hỗ trợ theo dõi trạng thái và báo cáo sau mỗi lượt. Thông tin dịch vụ, giá và khu vực phục vụ được đối chiếu theo danh mục đang công bố.</p>
      </div></div>
    </section>

    <section className="pwc-about-team" aria-labelledby="pwc-about-team-title">
      <h2 id="pwc-about-team-title">Gặp gỡ đội ngũ dự án</h2>
      <p className="pwc-about-team-caption">Paw World Care — SEP490_G101_FALL2026</p>
      <ul>{team.map(([name, role, image]) => <li key={name}>
        <div><img src={assets + image} alt="" loading="lazy" /></div>
        <h3>{name}</h3><p>{role}</p>
      </li>)}</ul>
    </section>

    <section className="pwc-about-care" aria-labelledby="pwc-about-care-title">
      <figure><img src={assets + 'home-Image657.webp'} alt="Người chăm sóc dắt chó đi dạo ngoài trời" loading="lazy" /></figure>
      <div><h2 id="pwc-about-care-title">Chăm sóc tại nhà,<br />an tâm từng bước</h2>
        <p>Mỗi lượt chăm sóc bắt đầu từ việc hiểu nhu cầu của bé và những điều bạn muốn gửi gắm.</p>
        <ul><li>Lưu thông tin chó, mèo và các lưu ý chăm sóc.</li>
          <li>Chọn dịch vụ, thời gian và địa chỉ trong khu vực phục vụ.</li>
          <li>Theo dõi tiến trình cùng checklist, ảnh và ghi chú.</li>
          <li>Đọc chính sách dịch vụ và gửi phản hồi sau lượt chăm sóc.</li></ul>
        <Link className="pwc-design-button" to="/services">Khám phá dịch vụ</Link>
      </div>
    </section>
    <section className="pwc-about-explore" aria-labelledby="pwc-about-explore-title">
      <h2 id="pwc-about-explore-title">Cùng PawWorld chăm bé mỗi ngày</h2>
      <nav aria-label="Khám phá Paw World Care"><Link to="/services">Dịch vụ chăm sóc</Link>
        <Link to="/service-areas">Khu vực phục vụ</Link><Link to="/policies">Chính sách dịch vụ</Link>
        <Link to="/sitter/apply">Trở thành người chăm sóc</Link></nav>
    </section>
  </div>;
}
