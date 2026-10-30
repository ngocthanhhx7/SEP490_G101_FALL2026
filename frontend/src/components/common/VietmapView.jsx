import { useEffect, useRef, useState } from 'react';
import { loadVietmap, loadVietmapStyle, mapRequest } from '../../services/vietmap-display.js';
import './vietmap-view.css';

const valid = point => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite) && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90;
const hanoiCenter = [105.85, 21.03];

export function VietmapView({ coordinates, onSelect, disabled = false, label = 'Bản đồ địa chỉ', loadSdk = loadVietmap, loadStyle = loadVietmapStyle }) {
  const container = useRef(null), map = useRef(null), marker = useRef(null), latest = useRef({});
  const [error, setError] = useState(false), [ready, setReady] = useState(false);
  latest.current = { coordinates, onSelect, disabled };
  useEffect(() => {
    let cancelled = false;
    let instance;
    const select = point => {
      const current = latest.current;
      if (!current.disabled && current.onSelect && valid(point)) current.onSelect(point);
    };
    Promise.all([loadSdk(), loadStyle()]).then(([sdk, style]) => {
      if (cancelled) return;
      instance = new sdk.Map({ container: container.current, style,
        center: valid(latest.current.coordinates) ? latest.current.coordinates : hanoiCenter, zoom: valid(latest.current.coordinates) ? 15 : 11,
        minZoom: 5, maxZoom: 18, attributionControl: true, vietmapLogo: true, transformRequest: mapRequest });
      map.current = instance;
      instance.addControl(new sdk.NavigationControl({ showCompass: false }), 'top-right');
      marker.current = new sdk.Marker({ color: '#c33f52', draggable: Boolean(latest.current.onSelect) && !latest.current.disabled });
      if (valid(latest.current.coordinates)) marker.current.setLngLat(latest.current.coordinates).addTo(instance);
      marker.current.on('dragend', () => { const point = marker.current.getLngLat(); select([point.lng, point.lat]); });
      instance.on('click', event => select([event.lngLat.lng, event.lngLat.lat]));
      instance.on('load', () => { if (!cancelled) { setReady(true); setError(false); instance.resize(); } });
      instance.on('error', () => { if (!cancelled) setError(true); });
    }).catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; instance?.remove(); map.current = null; marker.current = null; };
  }, [loadSdk, loadStyle]);
  const longitude = coordinates?.[0], latitude = coordinates?.[1];
  useEffect(() => {
    if (!marker.current || !map.current) return;
    marker.current.setDraggable(Boolean(onSelect) && !disabled);
    if (valid([longitude, latitude])) {
      marker.current.setLngLat([longitude, latitude]).addTo(map.current);
      map.current.easeTo({ center: [longitude, latitude], zoom: Math.max(map.current.getZoom?.() ?? 11, 15), duration: 300 });
    } else marker.current.remove();
  }, [longitude, latitude, disabled, onSelect, ready]);
  return <div className="pwc-vietmap">
    <div ref={container} className="pwc-vietmap__canvas" role="region" aria-label={label} />
    {error ? <p role="status">Chưa tải được bản đồ Vietmap.</p> : !ready && <p role="status">Đang tải bản đồ…</p>}
  </div>;
}
