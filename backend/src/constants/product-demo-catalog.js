// Synthetic demo products for the customer shop. Stock levels of SP-0016, SP-0021 and SP-0037 are sample numbers.
export const PRODUCT_DEMO_CATALOG = Object.freeze([
  { code: 'SP-0012', photos: ['/assets/products/dog-kibble.webp'], name: 'Thức ăn hạt cho chó trưởng thành, túi 2 kg', category: 'FOOD', petType: 'DOG', sellingPrice: 250000, stockOnHand: 15,
    description: 'Hạt khô dành cho chó trưởng thành, đóng túi 2 kg. Sau khi mở, đóng kín túi và để nơi khô ráo, thoáng mát.' },
  { code: 'SP-0014', photos: ['/assets/products/cat-kibble.webp'], name: 'Thức ăn hạt cho mèo trưởng thành, 1,5 kg', category: 'FOOD', petType: 'CAT', sellingPrice: 210000, stockOnHand: 6,
    description: 'Hạt khô dành cho mèo trưởng thành, gói 1,5 kg. Bảo quản nơi khô ráo, đóng kín sau khi mở.' },
  { code: 'SP-0016', photos: ['/assets/products/cat-wet-food.webp'], name: 'Pate gà cho mèo, lon 85 g', category: 'FOOD', petType: 'CAT', sellingPrice: 25000, stockOnHand: 40,
    description: 'Pate gà dạng lon 85 g cho mèo. Dùng hết trong ngày sau khi mở nắp.' },
  { code: 'SP-0020', photos: ['/assets/products/dog-chew.webp'], name: 'Xương gặm sạch răng cho chó', category: 'FOOD', petType: 'DOG', sellingPrice: 45000, stockOnHand: 32,
    description: 'Xương gặm giúp chó làm sạch răng. Nên có người trông khi chó gặm.' },
  { code: 'SP-0021', photos: ['/assets/products/steel-bowl.webp'], name: 'Bát ăn inox chống trượt', category: 'ACCESSORY', petType: 'DOG', sellingPrice: 70000, stockOnHand: 12,
    description: 'Bát ăn bằng inox, đế cao su chống trượt, dễ vệ sinh.' },
  { code: 'SP-0031', photos: ['/assets/products/dog-leash.webp'], name: 'Dây dắt chó, dài 1,2 m', category: 'ACCESSORY', petType: 'DOG', sellingPrice: 100000, stockOnHand: 9,
    description: 'Dây dắt dài 1,2 m, quai cầm êm tay.' },
  { code: 'SP-0035', photos: ['/assets/products/dog-collar.webp'], name: 'Vòng cổ có chuông, cỡ M', category: 'ACCESSORY', petType: 'DOG', sellingPrice: 60000, stockOnHand: 0,
    description: 'Vòng cổ có gắn chuông nhỏ, cỡ M.' },
  { code: 'SP-0036', photos: ['/assets/products/dog-raincoat.webp'], name: 'Áo mưa cho chó, cỡ S', category: 'ACCESSORY', petType: 'DOG', sellingPrice: 120000, stockOnHand: 0, visible: false,
    description: 'Áo mưa cỡ S cho chó nhỏ. Đang ẩn khỏi cửa hàng.' },
  { code: 'SP-0037', photos: ['/assets/products/cat-litter.webp'], name: 'Cát vệ sinh cho mèo, túi 5 lít', category: 'ACCESSORY', petType: 'CAT', sellingPrice: 120000, stockOnHand: 8,
    description: 'Cát vệ sinh cho mèo, túi 5 lít, vón cục tốt.' }
]);
