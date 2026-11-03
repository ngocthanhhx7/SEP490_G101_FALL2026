import { PawPrint } from 'lucide-react';

// Shows the first photo when one exists, otherwise the brand placeholder from the mockups.
export function ProductPhoto({ product, size = 'card' }) {
  const photo = product?.photos?.[0];
  return <div className={`pwc-shop-photo pwc-shop-photo--${size}`}>
    {photo ? <img src={photo} alt={product?.name ?? ''} loading="lazy" /> : <PawPrint aria-hidden="true" />}
  </div>;
}
