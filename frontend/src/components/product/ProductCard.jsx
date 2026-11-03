import { Link } from 'react-router-dom';
import { PRODUCT_CATEGORY_LABELS, PRODUCT_PET_LABELS } from '../../constants/product-labels.js';
import { formatVnd } from '../../utils/product-format.js';
import { ProductPhoto } from './ProductPhoto.jsx';
import './product-shop.css';

export function ProductCard({ product }) {
  return <article className="pwc-shop-card">
    <ProductPhoto product={product} />
    <p className="pwc-shop-eyebrow">{PRODUCT_CATEGORY_LABELS[product.category]} · {PRODUCT_PET_LABELS[product.petType]}</p>
    <h2 className="pwc-shop-card-title">{product.name}</h2>
    <div className="pwc-shop-card-meta">
      <strong className="pwc-shop-price">{formatVnd(product.sellingPrice)}</strong>
      <span className={`pwc-shop-badge ${product.inStock ? 'is-in' : 'is-out'}`}>{product.inStock ? 'Còn hàng' : 'Hết hàng'}</span>
    </div>
    <Link className="pwc-shop-outline-button" to={`/products/${encodeURIComponent(product.id)}`}
      aria-label={`Xem chi tiết ${product.name}`}>Xem chi tiết</Link>
  </article>;
}
