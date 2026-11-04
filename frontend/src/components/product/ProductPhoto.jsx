import { PawPrint } from 'lucide-react';
import { useState } from 'react';

// Shows the first photo when one exists, otherwise the brand placeholder from the mockups.
export function ProductPhoto({ product, size = 'card' }) {
  const photo = product?.photos?.[0];
  const [failed, setFailed] = useState(null);
  return <div className={`pwc-shop-photo pwc-shop-photo--${size}`}>
    {photo && failed !== photo ? <img src={photo} alt={product?.name ?? ''} loading="lazy" onError={() => setFailed(photo)} /> : <PawPrint aria-hidden="true" />}
  </div>;
}
