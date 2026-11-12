import { PawPrint } from 'lucide-react';
import { useState } from 'react';
import { ProductPhoto } from './ProductPhoto.jsx';
import './product-gallery.css';

// Product Details photos: one large photo with a row of thumbnails below it (D-249).
// No photo shows the brand placeholder, one photo shows no row, and the first photo is shown first.
// The chosen photo is kept by its URL, so a changed photo list falls back to the first photo.
export function ProductGallery({ product }) {
  const photos = product?.photos ?? [];
  const [chosen, setChosen] = useState(null);
  const [failed, setFailed] = useState([]);
  const selected = photos.includes(chosen) ? chosen : photos[0];
  if (photos.length < 2) return <ProductPhoto product={product} size="hero" />;
  return <div className="pwc-gallery">
    <ProductPhoto product={{ ...product, photos: [selected] }} size="hero" />
    <ul className="pwc-gallery-thumbs" aria-label="Ảnh sản phẩm">
      {photos.map((photo, index) => <li key={photo}>
        <button type="button" className="pwc-gallery-thumb" aria-pressed={photo === selected}
          aria-label={`Xem ảnh ${index + 1} của ${photos.length}`} onClick={() => setChosen(photo)}>
          {failed.includes(photo) ? <PawPrint aria-hidden="true" />
            : <img src={photo} alt="" loading="lazy" onError={() => setFailed((current) => [...current, photo])} />}
        </button>
      </li>)}
    </ul>
  </div>;
}
