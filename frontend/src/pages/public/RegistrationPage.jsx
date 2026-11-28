import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useSession } from '../../contexts/SessionContext.jsx';
import { useApiResource } from '../../hooks/useApiResource.js';
import { CustomerRegistrationPage } from './CustomerRegistrationPage.jsx';
import { SitterApplicationPage } from './SitterApplicationPage.jsx';
import { sitterApplicationApi } from '../../services/sitter-application-api.js';
import './auth-public.css';

function ApplicationEntryState({ resource }) {
  if (resource.status === 'loading') return <p className="pwc-registration-state" role="status">Đang tải thông tin ứng tuyển…</p>;
  return <div className="pwc-registration-state" role="alert">
    <h2>Chưa thể mở hồ sơ ứng tuyển</h2>
    <p>Chưa tải được biểu mẫu. Vui lòng thử lại.</p>
    <button type="button" onClick={resource.retry}>Thử lại</button>
  </div>;
}

function GuestSitterApplication({ api }) {
  const load = useCallback(({ signal }) => api.loadIntake({ signal }), [api]);
  const resource = useApiResource(load);
  if (resource.status !== 'success') return <ApplicationEntryState resource={resource} />;
  return <SitterApplicationPage api={api} uploadsAvailable={resource.data.uploadsAvailable} />;
}

function SignedInSitterApplication({ api }) {
  const load = useCallback(({ signal }) => api.getMine({ signal }), [api]);
  const resource = useApiResource(load);
  if (resource.status !== 'success') return <ApplicationEntryState resource={resource} />;
  const application = resource.data.application;
  if (['PENDING', 'UNDER_REVIEW', 'INTERVIEW', 'APPROVED'].includes(application?.state)) {
    return <Navigate to="/sitter/application-status" replace />;
  }
  if (application?.state === 'REJECTED' && application.canReapply === false) {
    return <SitterApplicationPage api={api} reapplyBlocked reapplyDate={application.reapplyDate}
      onRefreshApplication={resource.retry} />;
  }
  return <GuestSitterApplication api={api} />;
}

function SitterApplicationEntry({ api, session }) {
  if (session.status === 'loading') return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;
  if (session.status === 'authenticated'
    && ['CUSTOMER', 'PET_SITTER'].includes(session.user.roles?.[0] ?? session.user.role)) {
    return <SignedInSitterApplication key={session.user.id} api={api} />;
  }
  return <GuestSitterApplication api={api} />;
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
      {sitter ? <ol className="pwc-registration-steps" aria-label="Các bước ứng tuyển">
        <li className="is-current"><span>1</span>Nộp hồ sơ</li>
        <li><span>2</span>Xét duyệt và phỏng vấn</li>
        <li><span>3</span>Cấp tài khoản khi được duyệt</li>
      </ol> : <ol className="pwc-registration-steps" aria-label="Các bước đăng ký">
        <li className={authenticated || phase === 'otp' ? 'is-done' : 'is-current'}><span>1</span>Thông tin tài khoản</li>
        <li className={authenticated ? 'is-done' : phase === 'otp' ? 'is-current' : ''}><span>2</span>Xác minh email</li>
      </ol>}
      {sitter ? <SitterApplicationEntry api={applicationApi} session={session} />
          : authenticated ? <div className="pwc-registration-state">
            <h2>{sitter ? 'Bạn đã có tài khoản PawWorld' : `Xin chào, ${session.user.displayName}`}</h2>
            <p>{sitter ? 'Tài khoản hiện tại không cần tạo thêm hồ sơ ứng tuyển Pet Sitter.' : 'Tài khoản của bạn đã sẵn sàng. Hãy bắt đầu chăm sóc bé yêu cùng PawWorld.'}</p>
            <Link className="registration-submit" to="/">Về trang chủ</Link>
          </div>
            : <CustomerRegistrationPage key={sitter ? 'sitter' : 'customer'} intent={sitter ? 'PET_SITTER' : 'CUSTOMER'} api={registrationApi} onPhaseChange={setPhase} />}
      {sitter && <p className="pwc-registration-fineprint">Bạn có thể ứng tuyển khi chưa có tài khoản. Tài khoản Pet Sitter được tạo sau khi Admin duyệt hồ sơ.</p>}
      {sitter && <Link className="pwc-application-lookup" to="/sitter/application-status">Đã nộp hồ sơ? Tra cứu trạng thái →</Link>}
    </div>
  </div>;
}
