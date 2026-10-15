import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSession } from '../../contexts/SessionContext.jsx';
import { CustomerRegistrationPage } from './CustomerRegistrationPage.jsx';
import { SitterApplicationPage } from './SitterApplicationPage.jsx';
import './auth-public.css';
import { sitterApplicationApi } from '../../services/sitter-application-api.js';

export function RegistrationPage({ initialSitter = false, registrationApi }) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const sitter = initialSitter || params.get('role') === 'sitter';
  const [verified, setVerified] = useState(null);
  const session = useSession();
  return <div className="pwc-registration-hub">
    <header className="pwc-auth-welcome"><img src="/assets/figma-public/header-Vector.svg" alt="" />
      <h1>Tham gia PawWorld Care</h1><p>Chăm sóc bé yêu, hoặc cùng chúng mình trở thành người chăm sóc tận tâm.</p></header>
    <div className="pwc-registration-role-picker" aria-label="Bạn muốn đăng ký với vai trò nào?">
      <button type="button" aria-pressed={!sitter} onClick={() => { if (initialSitter) navigate('/register'); else setParams({}); setVerified(null); }}>Khách hàng</button>
      <button type="button" aria-pressed={sitter} onClick={() => setParams({ role: 'sitter' })}>Ứng tuyển Pet Sitter</button>
    </div>
    {sitter && sitterApplicationApi.uploadsAvailable === false && <p className="pwc-sitter-intake-notice" role="status">Bạn có thể đăng ký và xác thực email. Phần nộp giấy tờ ứng tuyển chưa mở; PawWorld sẽ tiếp nhận hồ sơ khi hệ thống lưu trữ riêng tư sẵn sàng.</p>}
    {sitter && (verified || session.status === 'authenticated')
      ? <SitterApplicationPage initialValues={verified ? { displayName: verified.displayName, contactValue: verified.contact } : undefined} />
      : <CustomerRegistrationPage key={sitter ? 'sitter' : 'customer'} intent={sitter ? 'PET_SITTER' : 'CUSTOMER'}
          api={registrationApi} onVerified={sitter ? setVerified : undefined} />}
  </div>;
}
