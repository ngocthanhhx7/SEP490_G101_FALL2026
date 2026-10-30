import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useSession } from '../../contexts/SessionContext.jsx';
import { useApiResource } from '../../hooks/useApiResource.js';
import { CustomerRegistrationPage } from './CustomerRegistrationPage.jsx';
import { SitterApplicationPage } from './SitterApplicationPage.jsx';
import { sitterApplicationApi } from '../../services/sitter-application-api.js';
import './auth-public.css';

function VerifiedSitterApplication({ api, displayName }) {
  const load = useCallback(({ signal }) => api.loadIntake({ signal }), [api]);
  const resource = useApiResource(load);
  if (resource.status === 'loading') return <p className="pwc-registration-state" role="status">Đang tải thông tin ứng tuyển…</p>;
  if (resource.status !== 'success') return <div className="pwc-registration-state" role="alert">
    <h2>Chưa thể mở hồ sơ ứng tuyển</h2>
    <p>Vui lòng đăng nhập bằng email đã xác minh, rồi thử lại.</p>
    <button type="button" onClick={resource.retry}>Thử lại</button> <Link to="/sign-in">Đăng nhập</Link>
  </div>;
  const intake = resource.data;
  const previous = intake.application;
  const canReapply = previous?.state === 'REJECTED' && previous.reapplyAt && Date.parse(previous.reapplyAt) <= Date.now();
  return <SitterApplicationPage key={intake.contactValue} api={api}
    initialValues={{ displayName, contactChannel: 'EMAIL', contactValue: intake.contactValue }}
    uploadsAvailable={intake.uploadsAvailable} previousApplication={canReapply ? null : previous} />;
}

export function RegistrationPage({ initialSitter = false, registrationApi, applicationApi = sitterApplicationApi }) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const sitter = initialSitter || params.get('role') === 'sitter';
  const session = useSession();
  const [phase, setPhase] = useState('details');
  const authenticated = session.status === 'authenticated';
  useEffect(() => {
    if (authenticated && !sitter) navigate('/', { replace: true });
  }, [authenticated, sitter, navigate]);
  const eligible = authenticated && session.user.roles.includes('CUSTOMER')
    && !session.user.roles.some(role => ['ADMIN', 'STAFF', 'PET_SITTER'].includes(role));
  return <div className="pwc-registration-hub">
    <div className="pwc-registration-shell">
      <header className="pwc-auth-welcome">
        <img src="/assets/figma-public/header-Vector.svg" width="44" height="44" alt="" />
        <p className="pwc-auth-eyebrow">GẮN KẾT TỪ SỰ QUAN TÂM</p>
        <h1>Tham gia PawWorld</h1>
        <p>{sitter ? 'Biến tình yêu thú cưng thành những lượt chăm sóc tận tâm.' : 'Thêm một người bạn đồng hành, thêm an tâm cho bé yêu.'}</p>
      </header>
      <div className="pwc-registration-role-picker" role="group" aria-label="Bạn muốn đăng ký với vai trò nào?">
        <button type="button" aria-pressed={!sitter} onClick={() => initialSitter ? navigate('/register') : setParams({})}>Khách hàng</button>
        <button type="button" aria-pressed={sitter} onClick={() => setParams({ role: 'sitter' })}>Pet Sitter</button>
      </div>
      <ol className="pwc-registration-steps" aria-label="Các bước đăng ký">
        <li className={authenticated || phase === 'otp' ? 'is-done' : 'is-current'}><span>1</span>Thông tin tài khoản</li>
        <li className={authenticated ? 'is-done' : phase === 'otp' ? 'is-current' : ''}><span>2</span>Xác minh email</li>
        {sitter && <li className={authenticated ? 'is-current' : ''}><span>3</span>Hồ sơ ứng tuyển</li>}
      </ol>
      {sitter && eligible ? <VerifiedSitterApplication api={applicationApi} displayName={session.user.displayName} />
          : authenticated ? <div className="pwc-registration-state">
            <h2>{sitter ? 'Bạn đã có tài khoản PawWorld' : `Xin chào, ${session.user.displayName}`}</h2>
            <p>{sitter ? 'Tài khoản hiện tại không cần tạo thêm hồ sơ ứng tuyển Pet Sitter.' : 'Tài khoản của bạn đã sẵn sàng. Hãy bắt đầu chăm sóc bé yêu cùng PawWorld.'}</p>
            <Link className="registration-submit" to="/">Về trang chủ</Link>
          </div>
            : <CustomerRegistrationPage key={sitter ? 'sitter' : 'customer'} intent={sitter ? 'PET_SITTER' : 'CUSTOMER'} api={registrationApi} onPhaseChange={setPhase} />}
      {sitter && !authenticated && <p className="pwc-registration-fineprint">Xác minh email để tiếp tục hồ sơ. Quyền Pet Sitter được cấp sau khi PawWorld xét duyệt.</p>}
      {sitter && <Link className="pwc-application-lookup" to="/sitter/application-status">Đã nộp hồ sơ? Tra cứu trạng thái →</Link>}
    </div>
  </div>;
}
