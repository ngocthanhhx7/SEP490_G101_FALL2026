import { Link } from 'react-router-dom';
import { useApiResource } from '../../hooks/useApiResource.js';
import { CatalogState, CatalogEmpty } from './PublicCatalog.jsx';
import { loadPublicCatalog } from '../../services/public-catalog-api.js';
import { formatCatalogPrice } from '../../utils/catalog-format.js';
import { serviceVisual } from './service-visuals.js';

const a = '/assets/figma-public/';
const illustrations = [
  {
    image: 'home-Image659.webp',
    title: 'Ghé thăm & chơi cùng Pet',
    description:
      'Ghé nhà kiểm tra tình hình và chơi cùng chú hoặc mèo của bạn.',
    species: 'Chó & mèo',
    term: 'chăm sóc'
  },
  {
    image: 'home-Image658.webp',
    title: 'Dắt chó đi dạo',
    description: 'Cho chó đi dạo cùng người chăm sóc của PawWorld.',
    species: 'Chỉ dành cho chó',
    term: 'dắt chó'
  },
  {
    image: 'home-Image660.webp',
    title: 'Đưa thú cưng đến lịch hẹn thú y',
    description:
      'Đưa thú cưng đến lịch hẹn thú y theo thông tin khách cung cấp.',
    species: 'Chó & mèo',
    term: 'thú y'
  }
];
const benefits = [
  [
    'home-Margin.svg',
    'Ghé thăm & chơi cùng bé',
    'Cho bé thêm sự quan tâm khi bạn bận hoặc vắng nhà.',
    'cream'
  ],
  [
    'home-Margin1.svg',
    'Đưa bé đến lịch hẹn thú y',
    'Hỗ trợ đưa chó, mèo đến lịch hẹn theo thông tin bạn cung cấp.',
    'mint'
  ],
  [
    'home-Margin2.svg',
    'Dắt chó đi dạo',
    'Giúp cún vận động và thư giãn với một buổi đi dạo đã đặt lịch.',
    'mint'
  ],
  [
    'home-Margin3.svg',
    'Theo dõi từng lượt chăm sóc',
    'Xem trạng thái, báo cáo sau mỗi lượt với checklist, hình ảnh và ghi chú.',
    'cream'
  ]
];
const stories = [
  [
    'home-Image661.webp',
    'Những ngày bận rộn, mình mong bé vẫn được đi dạo và có người quan tâm đúng giờ.',
    'Chị Lan & Bơ',
    'Quận 7, HCM',
    'pink'
  ],
  [
    'home-Image662.webp',
    'Miu thích ở trong không gian quen thuộc. Mình muốn gửi lời dặn riêng cho người chăm sóc.',
    'Anh Minh & Miu',
    'Đống Đa, HN',
    'green'
  ],
  [
    'home-Image663.webp',
    'Một vài tấm ảnh và ghi chú sau lượt chăm sóc giúp mình yên tâm hơn khi xa bé.',
    'Bạn Vy & Sữa',
    'Thủ Đức, HCM',
    'purple'
  ]
];
function Paw({ className = '', file = 'home-Frame2147225474.svg' }) {
  return (
    <img
      className={'pwc-design-paw ' + className}
      src={a + file}
      alt=""
      loading="lazy"
    />
  );
}
export function HomePage({ loadCatalog = loadPublicCatalog }) {
  const catalog = useApiResource(loadCatalog);
  const services =
    catalog.status === 'success' && catalog.data?.available
      ? catalog.data.services
      : [];
  return (
    <div className="pwc-home-design">
      <section
        className="pwc-design-hero-wrap"
        aria-labelledby="pwc-home-title"
      >
        <div className="pwc-design-hero">
          <div className="pwc-design-hero-copy">
            <h1 id="pwc-home-title">
              Chăm pet
              <br />
              tận nhà,
              <br />
              pet khỏe
              <br />
              sen vui.
            </h1>
            <p>
              Đặt lịch dắt chó đi dạo, ghé thăm và chơi cùng bé, hoặc đưa bé đến
              lịch hẹn thú y — linh hoạt theo thời gian của bạn.
            </p>
            <div className="pwc-design-actions">
              <Link className="pwc-design-button" to="/sign-in">
                Đặt dịch vụ ngay
              </Link>
              <Link
                className="pwc-design-button pwc-design-button-white"
                to="/services"
              >
                Khám phá dịch vụ
              </Link>
            </div>
          </div>
          <figure className="pwc-design-hero-art">
            <div className="pwc-design-hero-frame">
              <img
                src={a + 'home-Image656.webp'}
                alt="Chú chó vàng giơ chân, đội mũ và mặc áo đen"
                fetchPriority="high"
              />
            </div>
            <figcaption>
              <span>
                <img src={a + 'home-Container3.svg'} alt="" />
              </span>
              <div>
                <strong>Uy tín</strong>
                <small>Linh hoạt theo thời gian của bạn</small>
              </div>
            </figcaption>
          </figure>
        </div>
      </section>
      <section
        className="pwc-design-benefits pwc-design-section"
        aria-labelledby="pwc-benefits-title"
      >
        <header className="pwc-design-section-heading">
          <h2 id="pwc-benefits-title">Bé được chăm tại nhà, bạn an tâm hơn</h2>
          <p>
            Đặt lịch chăm sóc phù hợp với bé và lịch trình của bạn — ngay tại
            nhà.
            <br />
            Ghé thăm & chơi cùng bé
          </p>
        </header>
        <div className="pwc-design-benefit-grid">
          <div className="pwc-design-benefit-side">
            {benefits.slice(0, 2).map(([icon, title, text, color]) => (
              <article
                key={title}
                className={'pwc-design-benefit pwc-design-benefit-' + color}
              >
                <img src={a + icon} alt="" loading="lazy" />
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
          <img
            className="pwc-design-benefit-photo"
            src={a + 'home-Image657.webp'}
            alt="Chó vàng được dắt đi dạo cạnh người chăm sóc"
            loading="lazy"
          />
          <div className="pwc-design-benefit-side">
            {benefits.slice(2).map(([icon, title, text, color]) => (
              <article
                key={title}
                className={'pwc-design-benefit pwc-design-benefit-' + color}
              >
                <img src={a + icon} alt="" loading="lazy" />
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section
        className="pwc-design-steps pwc-design-section"
        aria-labelledby="pwc-steps-title"
      >
        <Paw />
        <Paw className="pwc-design-paw-lower" file="home-Frame2147225471.svg" />
        <h2 id="pwc-steps-title">Đặt lịch chăm sóc bé thật dễ dàng</h2>
        <ol>
          {[
            [
              'Chọn dịch vụ & thú cưng',
              'Ghé thăm, chơi cùng bé, dắt chó đi dạo hoặc đưa bé đến lịch hẹn thú y.'
            ],
            [
              'Chọn lịch & gửi dặn dò',
              'Nhập địa chỉ, thời gian và lưu ý chăm sóc riêng cho bé.'
            ],
            [
              'Theo dõi & nhận báo cáo',
              'Xem trạng thái lượt chăm sóc xem checklist, ảnh và ghi chú sau khi hoàn tất.'
            ]
          ].map(([title, text], i) => (
            <li key={title}>
              <span>{i + 1}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </section>
      <section
        className="pwc-design-services pwc-design-section"
        id="services"
        aria-labelledby="pwc-services-title"
      >
        <header>
          <div>
            <h2 id="pwc-services-title">Dịch vụ có sẵn</h2>
            <p>Chọn theo nhu cầu đặc biệt của bé yêu.</p>
          </div>
          <Link to="/services">Xem tất cả dịch vụ</Link>
        </header>
        <div className="pwc-design-service-grid">
          {(services.length ? services.slice(0, 3) : illustrations).map(
            (service, i) => {
              const visual = service.id
                ? {
                    image: serviceVisual(service).src.slice(a.length),
                    title: serviceVisual(service).alt
                  }
                : illustrations[i];
              return (
                <article
                  className="pwc-design-service-card"
                  key={service.id ?? service.title}
                >
                  <img
                    src={a + visual.image}
                    alt={visual.title}
                    loading="lazy"
                  />
                  <h3>
                    {service.id ? (
                      <Link to={'/services/' + encodeURIComponent(service.id)}>
                        {service.name}
                      </Link>
                    ) : (
                      service.title
                    )}
                  </h3>
                  <p>{service.description}</p>
                  <div>
                    <strong>
                      {service.id
                        ? service.species
                            .map((value) => (value === 'DOG' ? 'Chó' : 'Mèo'))
                            .join(' & ')
                        : service.species}
                    </strong>
                    <Link
                      to={
                        service.id
                          ? '/services/' + encodeURIComponent(service.id)
                          : '/services?q=' + encodeURIComponent(service.term)
                      }
                    >
                      {service.id ? 'Đặt ngay' : 'Khám phá'}
                    </Link>
                  </div>
                  {service.id && (
                    <small>{formatCatalogPrice(service.price)}</small>
                  )}
                </article>
              );
            }
          )}
        </div>
        {!services.length && (
          <div className="pwc-design-catalog-state">
            {catalog.status === 'success' && !catalog.data?.available ? (
              <CatalogEmpty
                title="Danh mục đang được cập nhật"
                body="Hình ảnh gợi ý ở trên; xem danh mục để kiểm tra dịch vụ hiện hành."
              />
            ) : (
              <CatalogState
                resource={catalog}
                emptyTitle="Chưa có dịch vụ được công bố"
                emptyBody="Các thẻ trên giới thiệu nhu cầu chăm sóc; chỉ dịch vụ được công bố mới có thể đặt."
              />
            )}
          </div>
        )}
      </section>
      <section
        className="pwc-design-about pwc-design-section"
        id="about"
        aria-labelledby="pwc-about-title"
      >
        <figure>
          <img
            src={a + 'home-Image650.webp'}
            alt="Ba chú mèo nằm trong chiếc hộp ở nhà"
            loading="lazy"
          />
          <span>
            <img src={a + 'home-Container4.svg'} alt="" />
          </span>
        </figure>
        <div>
          <h2 id="pwc-about-title">
            “Bé ở nhà thân quen,
            <br />
            bạn yên tâm chăm lo”
          </h2>
          <p>
            PawWorld giúp bạn đặt lịch ghé thăm và chơi cùng bé, dắt chó đi dạo
            hoặc đưa thú cưng đến lịch hẹn thú y. Bạn dễ dàng chọn dịch vụ phù
            hợp với nhu cầu của bé và lịch trình của mình.
          </p>
          <div className="pwc-design-about-points">
            <div>
              <h3>Thân quen</h3>
              <p>Bé ở trong không gian quen thuộc.</p>
            </div>
            <div>
              <h3>Uy tín</h3>
              <p>Xem checklist, ảnh và ghi chú của người chăm sóc.</p>
            </div>
          </div>
          <Link className="pwc-design-button" to="/about">
            Tìm hiểu về chúng tôi
          </Link>
        </div>
        <Paw file="home-Frame2147225477.svg" />
      </section>
      <section
        className="pwc-design-stories pwc-design-section"
        id="stories"
        aria-labelledby="pwc-stories-title"
      >
        <h2 id="pwc-stories-title">Chia sẻ từ cộng đồng PawWorld</h2>
        <div className="pwc-design-story-grid">
          {stories.map(([image, quote, name, place, color]) => (
            <article
              key={name}
              className={'pwc-design-story pwc-design-story-' + color}
            >
              <img
                src={a + image}
                alt={'Thú cưng trong câu chuyện của ' + name}
                loading="lazy"
              />
              <blockquote>“{quote}”</blockquote>
              <div>
                <span aria-hidden="true" />
                <p>
                  <strong>{name}</strong>
                  <small>{place}</small>
                </p>
              </div>
            </article>
          ))}
        </div>
        <div
          className="pwc-design-tape pwc-design-tape-left"
          aria-hidden="true"
        >
          <img src={a + 'home-Vector2.svg'} alt="" />
          <span>
            <img src={a + 'home-Group3.svg'} alt="" />
          </span>
        </div>
        <div
          className="pwc-design-tape pwc-design-tape-right"
          aria-hidden="true"
        >
          <img src={a + 'home-Vector1.svg'} alt="" />
          <span>
            <img src={a + 'home-Group1.svg'} alt="" />
          </span>
        </div>
        <p className="pwc-design-story-note">
          Câu chuyện minh họa từ PawWorld.
        </p>
      </section>
    </div>
  );
}
