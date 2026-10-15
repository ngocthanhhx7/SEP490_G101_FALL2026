const root = '/assets/figma-public/';
// Local illustrations only; published names, scope and prices remain catalog-owned.
export function serviceVisual(service) {
  const name = service.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase();
  if (service.code === 'dog-walking' || /di dao|walk/.test(name)) return { src: root + 'home-Image658.webp', alt: 'Người chăm sóc dắt chó đi dạo' };
  if (service.code === 'vet-escort' || /thu y|vet/.test(name)) return { src: root + 'home-Image660.webp', alt: 'Thú cưng tại phòng khám thú y' };
  if (service.species.length === 1 && service.species[0] === 'CAT') return { src: root + 'home-Image650.webp', alt: 'Những chú mèo trong không gian quen thuộc' };
  return { src: root + 'home-Image659.webp', alt: 'Chăm sóc và chơi cùng chó, mèo tại nhà' };
}
