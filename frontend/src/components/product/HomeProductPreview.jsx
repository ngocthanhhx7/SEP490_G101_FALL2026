import { useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { createProductSalesApi } from '../../services/product-sales-api.js';
import { useApiResource } from '../../hooks/useApiResource.js';
import { ProductCard } from './ProductCard.jsx';
import { Button, Notice } from '../ui/index.js';

// Mounted only after Products is selected, so the default service view keeps its existing request lifecycle.
export function HomeProductPreview({ api: apiOverride }) {
  const api = useMemo(() => apiOverride ?? createProductSalesApi(), [apiOverride]);
  const load = useCallback(async ({ signal }) => {
    const result = await api.listProducts({ limit: 50 }, { signal });
    const withPhotos = result.data.filter(product => product.photos?.length);
    return { ...result, data: (withPhotos.length ? withPhotos : result.data).slice(0, 3) };
  }, [api]);
  const resource = useApiResource(load);
  return <div className="pwc-shop pwc-home-products">
    {resource.status === 'loading' && <Notice state="loading" title="Đang tải sản phẩm…" />}
    {resource.status === 'error' && <Notice state="error" title="Chưa tải được sản phẩm"
      action={<Button variant="secondary" onClick={resource.retry}>Thử lại</Button>} />}
    {resource.status === 'empty' && <Notice state="empty" title="Sản phẩm đang được cập nhật"
      action={<Link to="/products">Khám phá cửa hàng</Link>} />}
    {resource.status === 'success' && <div className="pwc-shop-grid">{resource.data.map(product => <ProductCard key={product.id} product={product} />)}</div>}
  </div>;
}
