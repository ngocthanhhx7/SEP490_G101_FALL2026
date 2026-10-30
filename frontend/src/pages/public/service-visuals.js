const root = '/assets/figma-public/';
// Local illustrations only; published names, scope and prices remain catalog-owned.
export function serviceVisual(service) {
  const photos = {
    'pet-bathing': ['bathing', 'Tắm và làm sạch lông cho chó'],
    'hair-trimming': ['grooming', 'Cắt tỉa lông cho chó Poodle'],
    'nail-trimming': ['nail-care', 'Người chăm sóc cắt móng cho chó bằng kìm chuyên dụng'],
    'ear-eye-cleaning': ['ear-care', 'Nhân viên kiểm tra và chăm sóc tai cho chó'],
    'coat-brushing': ['coat-care', 'Người chăm sóc chải lông cho chó'],
    'pet-boarding': ['boarding', 'Mèo nghỉ ngơi trên giường riêng', '50% 15%'],
    'pet-transport': ['transport', 'Lồng vận chuyển thú cưng'],
    'post-operative-care': ['recovery-care', 'Chó đeo vòng bảo vệ và nghỉ ngơi trên đệm trong thời gian hồi phục'],
    'basic-health-check': ['health', 'Kiểm tra thú cưng bằng ống nghe'],
    'basic-training': ['training', 'Huấn luyện chó ngoài trời'],
    'pet-massage': ['pet-massage', 'Người chăm sóc massage thư giãn vùng cổ và vai cho chó', '50% 65%']
  };
  if (photos[service.code]) {
    const [file, alt, position] = photos[service.code];
    return { src: '/assets/services/' + file + '.webp', alt, ...(position ? { position } : {}) };
  }
  if (service.code === 'home-care') return { src: root + 'home-Image659.webp', alt: 'Chăm sóc và chơi cùng chó, mèo tại nhà' };
  const name = service.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase();
  if (service.code === 'dog-walking' || /di dao|walk/.test(name)) return { src: root + 'home-Image658.webp', alt: 'Người chăm sóc dắt chó đi dạo' };
  if (service.code === 'vet-escort' || /thu y|vet/.test(name)) return { src: root + 'home-Image660.webp', alt: 'Thú cưng tại phòng khám thú y' };
  if (service.species.length === 1 && service.species[0] === 'CAT') return { src: root + 'home-Image650.webp', alt: 'Những chú mèo trong không gian quen thuộc' };
  return { src: root + 'home-Image659.webp', alt: 'Chăm sóc và chơi cùng chó, mèo tại nhà' };
}
