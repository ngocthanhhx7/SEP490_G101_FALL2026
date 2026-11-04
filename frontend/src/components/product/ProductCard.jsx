import { Link } from 'react-router-dom';
import { PRODUCT_CATEGORY_LABELS, PRODUCT_PET_LABELS } from '../../constants/product-labels.js';
import { formatVnd } from '../../utils/product-format.js';
import { ProductPhoto } from './ProductPhoto.jsx';
import './product-shop.css';

export function ProductCard({ product }) {
  return <article className="pwc-shop-card">
    <Link className="pwc-shop-photo-link" to={`/products/${encodeURIComponent(product.id)}`} aria-label={`Ảnh ${product.name}`}><ProductPhoto product={product} /></Link>
    <p className="pwc-shop-eyebrow">{PRODUCT_CATEGORY_LABELS[product.category]} · {PRODUCT_PET_LABELS[product.petType]}</p>
    <h2 className="pwc-shop-card-title"><Link to={`/products/${encodeURIComponent(product.id)}`}>{product.name}</Link></h2>
    <p className="pwc-shop-card-caption">{product.category === 'FOOD' ? 'Cho bữa ăn mỗi ngày của bé' : 'Đồ dùng cho những ngày bên nhau'}</p>
    <div className="pwc-shop-card-meta">
      <strong className="pwc-shop-price">{formatVnd(product.sellingPrice)}</strong>
      <span className={`pwc-shop-badge ${product.inStock ? 'is-in' : 'is-out'}`}>{product.inStock ? 'Còn hàng' : 'Hết hàng'}</span>
    </div>
    <Link className="pwc-shop-outline-button" to={`/products/${encodeURIComponent(product.id)}`}
      aria-label={`Xem chi tiết ${product.name}`}>Xem chi tiết</Link>
  </article>;
}
