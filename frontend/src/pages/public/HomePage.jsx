import { Link } from 'react-router-dom';
import { useApiResource } from '../../hooks/useApiResource.js';
import { PublicServiceCards, CatalogState, CatalogEmpty } from './PublicCatalog.jsx';
import { loadPublicCatalog } from './public-catalog-adapter.js';

export function HomePage({ loadCatalog = loadPublicCatalog }) {
  const catalog = useApiResource(loadCatalog);
  const hasServices = catalog.status === 'success'
    && catalog.data?.available === true
    && catalog.data.services.length > 0;
  const catalogUnavailable = catalog.status === 'success' && catalog.data?.available === false;

  return <div className="pwc-page pwc-home-page">
    <section className="pwc-home-hero" aria-labelledby="pwc-home-title">
      <div className="pwc-home-hero-copy">
        <p className="pwc-eyebrow">Paw World Care</p>
        <h1 id="pwc-home-title">Chăm pet<br />tận nhà,<br />pet khỏe<br />sen vui</h1>
        <p className="pwc-lead">Khám phá dịch vụ chăm sóc chó mèo theo lịch trình phù hợp với gia đình bạn.</p>
        <div className="pwc-actions">
          <Link className="pwc-button pwc-button-primary" to="/sign-in">Đặt dịch vụ ngay</Link>
          <Link className="pwc-button pwc-button-light" to="/services">Khám phá dịch vụ</Link>
        </div>
      </div>
      <figure className="pwc-home-hero-art">
        <img
          src="/assets/cat/image 651.png"
          alt="Nhóm mèo đang nghỉ cùng nhau ngoài trời"
          fetchPriority="high"
        />
        <figcaption>Ở nhà thân quen, bé luôn thoải mái.</figcaption>
      </figure>
    </section>

    <section className="pwc-home-benefits pwc-section" aria-labelledby="pwc-benefits-title">
      <div className="pwc-section-heading">
        <p className="pwc-eyebrow">Chăm sóc phù hợp</p>
        <h2 id="pwc-benefits-title">Bé ở nhà quen thuộc, bạn yên tâm hơn</h2>
        <p>Chọn dịch vụ theo danh mục đang được công bố và lịch trình của gia đình.</p>
      </div>
      <div className="pwc-benefit-grid">
        <article className="pwc-benefit-card pwc-benefit-lavender">
          <span className="pwc-benefit-number" aria-hidden="true">01</span>
          <h3>Không gian quen thuộc</h3>
          <p>Bé được chăm sóc tại nhà theo thông tin và lưu ý bạn cung cấp.</p>
        </article>
        <figure className="pwc-benefit-photo">
          <img src="/assets/cat/image 649.png" alt="Mèo lông trắng đang ngồi yên trong nhà" loading="lazy" />
        </figure>
        <article className="pwc-benefit-card pwc-benefit-peach">
          <span className="pwc-benefit-number" aria-hidden="true">02</span>
          <h3>Dịch vụ theo nhu cầu</h3>
          <p>Danh mục hiển thị các lựa chọn hiện được công bố cho chó và mèo.</p>
        </article>
        <article className="pwc-benefit-card pwc-benefit-mint">
          <span className="pwc-benefit-number" aria-hidden="true">03</span>
          <h3>Theo dõi từng lượt</h3>
          <p>Xem cập nhật chăm sóc theo những thông tin được ghi nhận trong lượt dịch vụ.</p>
        </article>
      </div>
    </section>

    <section className="pwc-home-steps pwc-section" aria-labelledby="pwc-steps-title">
      <div className="pwc-section-heading pwc-section-heading-inverse">
        <p className="pwc-eyebrow">Bắt đầu thật dễ dàng</p>
        <h2 id="pwc-steps-title">Ba bước để chăm sóc bé</h2>
      </div>
      <ol className="pwc-step-list">
        <li><span>1</span><h3>Chọn dịch vụ & thú cưng</h3><p>Xem mô tả, phạm vi và đối tượng được hỗ trợ trong danh mục.</p></li>
        <li><span>2</span><h3>Chọn lịch và gửi lưu ý</h3><p>Tiếp tục quy trình đặt lịch với thông tin cần thiết cho lượt chăm sóc.</p></li>
        <li><span>3</span><h3>Theo dõi cập nhật</h3><p>Xem thông tin của lượt chăm sóc theo trạng thái được ghi nhận.</p></li>
      </ol>
    </section>

    <section className="pwc-home-services pwc-section" id="services" aria-labelledby="pwc-services-title">
      <div className="pwc-section-heading pwc-services-heading">
        <div>
          <p className="pwc-eyebrow">Danh mục hiện hành</p>
          <h2 id="pwc-services-title">Dịch vụ có sẵn</h2>
          <p>Thông tin dịch vụ và giá được lấy từ danh mục công khai.</p>
        </div>
        <Link className="pwc-inline-link" to="/services">Xem tất cả dịch vụ</Link>
      </div>
      {hasServices
        ? <PublicServiceCards services={catalog.data.services.slice(0, 3)} />
        : catalogUnavailable
          ? <CatalogEmpty title="Danh mục đang được cập nhật"
            body="Vui lòng quay lại sau để xem các dịch vụ hiện hành." />
          : <CatalogState
            resource={catalog}
            emptyTitle="Chưa có dịch vụ được công bố"
            emptyBody="Danh mục sẽ hiển thị tại đây khi có dịch vụ công khai."
          />}
      {catalog.status === 'success' && catalog.data?.available && catalog.data.services.length > 3
        && <p className="pwc-more-link"><Link className="pwc-inline-link" to="/services">Xem thêm dịch vụ</Link></p>}
    </section>

    <section className="pwc-home-about pwc-section" aria-labelledby="pwc-about-title">
      <figure className="pwc-about-art">
        <img src="/assets/cat/image 650.png" alt="Ba chú mèo nằm cùng nhau trong chiếc hộp quen thuộc" loading="lazy" />
      </figure>
      <div className="pwc-about-copy">
        <p className="pwc-eyebrow">Đồng hành cùng thú cưng</p>
        <h2 id="pwc-about-title">Người chăm sóc đồng hành cùng bé</h2>
        <p>Paw World Care kết nối chủ nuôi với Pet Sitter để chọn dịch vụ chăm sóc chó mèo. Bạn cung cấp thông tin cần thiết, còn người chăm sóc thực hiện lượt theo lịch đã xác nhận.</p>
        <p>Hãy xem phạm vi dịch vụ và khu vực phục vụ trước khi bắt đầu đặt lịch.</p>
        <Link className="pwc-button pwc-button-primary" to="/service-areas">Tìm hiểu khu vực phục vụ</Link>
      </div>
    </section>

    <section className="pwc-home-contact pwc-section" id="contact" aria-labelledby="pwc-contact-title">
      <div>
        <p className="pwc-eyebrow">Cùng bắt đầu</p>
        <h2 id="pwc-contact-title">Bạn cần tìm dịch vụ phù hợp?</h2>
        <p>Khám phá danh mục hoặc đăng nhập để tiếp tục quy trình đặt dịch vụ.</p>
      </div>
      <div className="pwc-actions">
        <Link className="pwc-button pwc-button-primary" to="/services">Xem dịch vụ</Link>
        <Link className="pwc-button pwc-button-light" to="/sign-in">Đăng nhập</Link>
      </div>
    </section>
  </div>;
}