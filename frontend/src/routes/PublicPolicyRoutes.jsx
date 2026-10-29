import {
  PolicyIndexPage,
  PolicyArticlePage
} from '../pages/public/policies/PolicyPages.jsx';
import { Link, Route, useParams } from 'react-router-dom';

function PublicPolicyUnavailable() {
  const { slug } = useParams();
  return (
    <section aria-labelledby="policy-unavailable-title">
      <h1 id="policy-unavailable-title">
        {slug ? 'Chính sách chưa được xuất bản' : 'Chính sách & hướng dẫn'}
      </h1>
      <p role="status">
        Chưa có phiên bản chính sách được phê duyệt để công khai. Bạn chưa cần
        xác nhận đồng ý ở bước này.
      </p>
      {slug ? (
        <Link to="/policies">Danh sách chính sách</Link>
      ) : (
        <>
          <Link to="/policies/terms">Điều khoản dịch vụ</Link>
          {' · '}
          <Link to="/policies/privacy">Chính sách quyền riêng tư</Link>
        </>
      )}
    </section>
  );
}

// P45 supplies its real publicPolicyRouteElements through App's integration port.
// These fail-closed routes keep direct public links reachable before publication.
export const publicPolicyFallbackRoutes = (
  <>
    <Route path="policies" element={<PublicPolicyUnavailable />} />
    <Route path="policies/:slug" element={<PublicPolicyUnavailable />} />
    <Route
      path="policies/:slug/:version"
      element={<PublicPolicyUnavailable />}
    />
  </>
);

// App mounts this fragment inside the public Routes tree. Keep it outside session guards.
export const publicPolicyRouteElements = (
  <>
    <Route path="/policies" element={<PolicyIndexPage />} />
    <Route path="/policies/:slug" element={<PolicyArticlePage />} />
    <Route path="/policies/:slug/:version" element={<PolicyArticlePage />} />
  </>
);
