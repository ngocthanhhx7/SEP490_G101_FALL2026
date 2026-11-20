import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownToLine, ArrowLeft, EllipsisVertical, ExternalLink, PlusSquare, Share, Smartphone } from 'lucide-react';
import { requestWebAppInstall, useWebAppInstall } from '../../hooks/useWebAppInstall.js';
import './install-app.css';

function initialPlatform() {
  const { userAgent, maxTouchPoints } = window.navigator;
  return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)
    ? 'ios'
    : 'android';
}

export function InstallAppPage() {
  const [platform, setPlatform] = useState(initialPlatform);
  const install = useWebAppInstall();
  const main = useRef(null);
  useEffect(() => {
    window.scrollTo(0, 0);
    main.current?.focus({ preventScroll: true });
  }, []);
  const ios = platform === 'ios';

  return <main className="pwc-install" ref={main} tabIndex={-1} aria-labelledby="install-title">
    <Link className="pwc-install-back" to="/"><ArrowLeft aria-hidden="true" /> Về trang chủ</Link>
    <div className="pwc-install-grid">
      <section className="pwc-install-hero" aria-labelledby="install-title">
        <img className="pwc-install-icon" src="/pwa/icon-192.png" width="64" height="64" alt="" />
        <h1 id="install-title">Paw World Care trên điện thoại</h1>
        <p>Mở ứng dụng từ màn hình chính để đặt lịch và theo dõi việc chăm sóc thú cưng.</p>
        <img className="pwc-install-photo" src="/assets/figma-public/home-Image659.webp" alt="" />
      </section>
      <section className="pwc-install-guide" aria-labelledby="install-guide-title">
        <h2 id="install-guide-title">{install === 'installed' ? 'Ứng dụng đã được thêm' : 'Cài ứng dụng'}</h2>
        {install === 'installed' ? <>
          <p>Mở Paw World Care từ biểu tượng trên màn hình chính hoặc danh sách ứng dụng.</p>
          <Link className="pwc-install-button" to="/">Tiếp tục vào Paw World Care</Link>
        </> : <>
          <div className="pwc-install-platform" role="group" aria-label="Thiết bị">
            <button type="button" aria-pressed={ios} onClick={() => setPlatform('ios')}>iPhone / iPad</button>
            <button type="button" aria-pressed={!ios} onClick={() => setPlatform('android')}>Android</button>
          </div>
          {!ios && install === 'available' && <button type="button" className="pwc-install-button" onClick={requestWebAppInstall}>
            <ArrowDownToLine aria-hidden="true" /> Cài Paw World Care
          </button>}
          <ol className="pwc-install-steps">
            <li>
              <span className="pwc-install-step-icon">{ios ? <Share aria-hidden="true" /> : <EllipsisVertical aria-hidden="true" />}</span>
              <div><strong>{ios ? 'Mở bằng Safari' : 'Mở bằng Chrome'}</strong>
                <p>{ios ? 'Nhấn Chia sẻ ở thanh công cụ hoặc trong menu Thêm.' : 'Nhấn nút ba chấm ở cạnh thanh địa chỉ.'}</p></div>
            </li>
            <li>
              <span className="pwc-install-step-icon"><PlusSquare aria-hidden="true" /></span>
              <div><strong>Thêm vào màn hình chính</strong>
                <p>{ios ? 'Chọn Thêm vào MH chính, bật Mở dưới dạng ứng dụng web nếu có, rồi nhấn Thêm.' : 'Chọn Thêm vào màn hình chính, sau đó chọn Cài đặt. Một số phiên bản hiển thị Cài đặt ứng dụng ngay trong menu.'}</p></div>
            </li>
            <li>
              <span className="pwc-install-step-icon"><Smartphone aria-hidden="true" /></span>
              <div><strong>Mở Paw World Care</strong><p>Chạm vào biểu tượng vừa thêm trên màn hình chính.</p></div>
            </li>
          </ol>
          <div className="pwc-install-tip">
            <ExternalLink aria-hidden="true" />
            <p>Đang xem trong Zalo hoặc Facebook? Dùng menu của ứng dụng đó để mở trang này bằng {ios ? 'Safari' : 'Chrome'}.</p>
          </div>
          <Link className="pwc-install-continue" to="/">Tiếp tục trên trình duyệt</Link>
        </>}
      </section>
    </div>
  </main>;
}
