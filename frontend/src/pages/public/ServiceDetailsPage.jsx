import { Link, useParams } from 'react-router-dom';
import { useState } from 'react';
import { useApiResource } from '../../hooks/useApiResource.js';
import { CatalogEmpty, CatalogState } from './PublicCatalog.jsx';
import { loadPublicCatalog } from '../../services/public-catalog-api.js';
import {
  formatCatalogPrice,
  formatPolicyDate
} from '../../utils/catalog-format.js';
import { serviceVisual } from './service-visuals.js';
import './service-catalog.css';

const SPECIES_LABELS = { DOG: 'Chó', CAT: 'Mèo' };

export function ServiceDetailsPage({ loadCatalog = loadPublicCatalog }) {
  const { serviceId } = useParams();
  const [section, setSection] = useState('scope');
  const catalog = useApiResource(loadCatalog);
  const service = catalog.data?.services?.find((item) => item.id === serviceId);

  if (catalog.status !== 'success') {
    return (
      <div className="pwc-page pwc-service-details-page">
        <CatalogState
          resource={catalog}
          emptyTitle="Dịch vụ chưa sẵn sàng"
          emptyBody="Hãy quay lại danh mục để xem dịch vụ đang được công bố."
        />
        <p className="pwc-back-link">
          <Link to="/services">Về danh mục dịch vụ</Link>
        </p>
      </div>
    );
  }
  if (!catalog.data?.available) {
    return (
      <div className="pwc-page pwc-service-details-page">
        <CatalogEmpty
          title="Danh mục đang được cập nhật"
          body="Thông tin dịch vụ hiện chưa sẵn sàng."
        />
        <p className="pwc-back-link">
          <Link to="/services">Về danh mục dịch vụ</Link>
        </p>
      </div>
    );
  }
  if (!service) {
    return (
      <div className="pwc-page pwc-service-details-page">
        <div className="pwc-state-card" role="status">
          <h1>Không tìm thấy dịch vụ</h1>
          <p>Dịch vụ này không nằm trong danh mục đang được công bố.</p>
          <Link className="pwc-button pwc-button-primary" to="/services">
            Xem danh mục dịch vụ
          </Link>
        </div>
      </div>
    );
  }

  const price = formatCatalogPrice(service.price);
  const effectiveDate = formatPolicyDate(service.policy.effectiveAt);
  const visual = serviceVisual(service);
  const details = service.details;
  const scope = service.scope
    .split(/\n+/)
    .map((value) => value.trim())
    .filter(Boolean);

  return (
    <div className="pwc-page pwc-service-details-page">
      <nav className="pwc-service-breadcrumb" aria-label="Đường dẫn trang">
        <Link to="/">Trang chủ</Link>
        <span>›</span>
        <Link to="/services">Dịch vụ</Link>
        <span>›</span>
        <span>{service.name}</span>
      </nav>
      <section
        className="pwc-service-detail-hero"
        aria-labelledby="pwc-service-title"
      >
        <img
          className="pwc-service-detail-photo"
          src={visual.src}
          alt={visual.alt}
        />
        <div className="pwc-service-detail-intro">
          <p className="pwc-eyebrow">
            {service.species.map((item) => SPECIES_LABELS[item]).join(' · ')}
          </p>
          <h1 id="pwc-service-title">{service.name}</h1>
          <p className="pwc-lead">{service.description}</p>
          <p className="pwc-service-detail-price">
            <strong>{price || 'Giá chưa được công bố'}</strong>
          </p>
          <div className="pwc-service-detail-actions">
            <Link
              className="pwc-button pwc-button-primary"
              to={'/sign-in?serviceId=' + encodeURIComponent(service.id)}
            >
              Đặt dịch vụ này
            </Link>
            <a className="pwc-button pwc-button-light" href="#pricing">
              Xem giá dịch vụ
            </a>
          </div>
        </div>
      </section>

      <div className="pwc-service-highlights">
        {[
          ['Đặt lịch theo nhu cầu', 'Chọn thời gian phù hợp cho bé.'],
          ['Thông tin rõ ràng', 'Xem giá và phạm vi trước khi tiếp tục.'],
          ['Chăm sóc theo lời dặn', 'Ghi rõ nhu cầu và thói quen của bé.'],
          ['Kết nối hỗ trợ', 'Gửi câu hỏi khi cần làm rõ thông tin.']
        ].map(([title, body]) => (
          <div key={title}>
            <h2>{title}</h2>
            <p>{body}</p>
          </div>
        ))}
      </div>

      <section
        className="pwc-service-work"
        aria-labelledby="pwc-service-work-title"
      >
        <h2 id="pwc-service-work-title">Phạm vi chăm sóc chi tiết</h2>
        <p>Những việc cần thống nhất trước lượt chăm sóc của bé.</p>
        <div className="pwc-service-work-layout">
          <div
            className="pwc-service-section-controls"
            aria-label="Nội dung dịch vụ"
          >
            <button
              type="button"
              aria-pressed={section === 'scope'}
              onClick={() => setSection('scope')}
            >
              Công việc thực hiện
            </button>
            {details?.preparation?.length > 0 && (
              <button
                type="button"
                aria-pressed={section === 'preparation'}
                onClick={() => setSection('preparation')}
              >
                Chủ nuôi cần chuẩn bị
              </button>
            )}
          </div>
          <div className="pwc-service-work-body">
            <div>
              <h3>
                {section === 'scope'
                  ? 'Công việc thực hiện'
                  : 'Chủ nuôi cần chuẩn bị'}
              </h3>
              <ul className="pwc-service-inclusions">
                {(section === 'preparation' && details
                  ? details.preparation
                  : scope
                ).map((text) => (
                  <li key={text}>{text}</li>
                ))}
              </ul>
            </div>
            {details?.exclusions?.length > 0 && (
              <aside>
                <h3>Dịch vụ không bao gồm</h3>
                <ul>
                  {details.exclusions.map((text) => (
                    <li key={text}>{text}</li>
                  ))}
                </ul>
              </aside>
            )}
          </div>
        </div>
      </section>

      <section
        className="pwc-service-pricing"
        id="pricing"
        aria-labelledby="pwc-service-pricing-title"
      >
        <h2 id="pwc-service-pricing-title">Giá dịch vụ hiện hành</h2>
        <p>
          Giá theo danh mục đang công bố. Kiểm tra thông tin trước khi xác nhận
          đặt lịch.
        </p>
        <article>
          <p>{service.name}</p>
          <strong>{price || 'Giá chưa được công bố'}</strong>
          <p>
            {service.species.map((item) => SPECIES_LABELS[item]).join(' · ')}
          </p>
          <Link
            className="pwc-button pwc-button-primary"
            to={'/sign-in?serviceId=' + encodeURIComponent(service.id)}
          >
            Chọn dịch vụ này
          </Link>
        </article>
      </section>

      <section
        className="pwc-service-process"
        aria-labelledby="pwc-service-process-title"
      >
        <h2 id="pwc-service-process-title">Các bước chăm sóc cùng PawWorld</h2>
        <ol>
          {[
            ['Chọn dịch vụ', 'Xem thông tin và nhu cầu của bé.'],
            ['Gửi lịch mong muốn', 'Cung cấp địa chỉ và lời dặn.'],
            ['Xác nhận lịch', 'Theo dõi trạng thái và người chăm sóc.'],
            ['Thực hiện chăm sóc', 'Xem cập nhật của lượt chăm sóc.'],
            ['Xem báo cáo', 'Kiểm tra checklist, ảnh và ghi chú.']
          ].map(([title, text], index) => (
            <li key={title}>
              <span>{index + 1}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section
        className="pwc-policy-card"
        id="policy"
        aria-labelledby="pwc-policy-title"
      >
        <p className="pwc-eyebrow">Thông tin hiện hành</p>
        <h2 id="pwc-policy-title">{service.policy.title}</h2>
        {effectiveDate && (
          <p className="pwc-policy-meta">
            Hiệu lực từ {effectiveDate} · Phiên bản {service.policy.version}
          </p>
        )}
        <p className="pwc-policy-body">{service.policy.body}</p>
      </section>

      {details?.faq?.length > 0 && (
        <section
          className="pwc-service-faq"
          aria-labelledby="pwc-service-faq-title"
        >
          <h2 id="pwc-service-faq-title">Câu hỏi thường gặp</h2>
          {details.faq.map((item) => (
            <details key={item.question}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
          <p>
            Cần hỗ trợ thêm? <Link to="/contact">Liên hệ PawWorld</Link>
          </p>
        </section>
      )}

      <section
        className="pwc-service-next"
        aria-labelledby="pwc-service-next-title"
      >
        <div>
          <h2 id="pwc-service-next-title">Kiểm tra khu vực phục vụ</h2>
          <p>Xem khu vực hiện được công bố trước khi tiếp tục đặt lịch.</p>
        </div>
        <Link className="pwc-button pwc-button-light" to="/service-areas">
          Khu vực phục vụ
        </Link>
      </section>
    </div>
  );
}
