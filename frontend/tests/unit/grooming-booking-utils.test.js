import { GROOMING_TIERS, MSG64, msg63, msg65 } from '../../src/constants/grooming-messages.js';
import {
  appointmentLabel, dayChipLabel, isAnswered, isReferred, orderReady, orderedPets, petKindLabel, quotePets, slotPets, windowDates
} from '../../src/utils/grooming-booking.js';

const answers = (biteOrScratch, skinCondition) => ({ biteOrScratch, skinCondition });
const choice = (serviceIds, biteOrScratch = 'NO', skinCondition = 'NO') => ({ serviceIds, answers: answers(biteOrScratch, skinCondition) });

describe('dates', () => {
  test('day chips and the appointment label use the Vietnam local date as given', () => {
    expect(dayChipLabel('2026-11-05')).toBe('T5 · 05/11');
    expect(dayChipLabel('2026-11-08')).toBe('CN · 08/11');
    expect(dayChipLabel('2026-11-07')).toBe('T7 · 07/11');
    expect(appointmentLabel('2026-11-05', '10:00')).toBe('Thứ Năm 05/11/2026 · 10:00');
    expect(appointmentLabel('2026-11-08', '08:00')).toBe('Chủ nhật 08/11/2026 · 08:00');
  });

  test('the window lists every day from the first to the last, across a month end', () => {
    expect(windowDates('2026-11-05', '2026-11-11')).toHaveLength(7);
    expect(windowDates('2026-11-28', '2026-12-02')).toEqual(['2026-11-28', '2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02']);
    expect(windowDates('2026-11-05', '2026-11-04')).toEqual([]);
  });
});

describe('the pets of the order', () => {
  const picked = { milo: choice(['bath', 'nail']), bo: choice(['bath'], 'YES'), muop: choice([], 'NO', null) };

  test('a pet that bites or scratches is referred and leaves slots, price and booking', () => {
    expect(isReferred(picked.bo)).toBe(true);
    expect(isReferred(picked.milo)).toBe(false);
    expect(orderedPets(picked).map(([petId]) => petId)).toEqual(['milo', 'muop']);
    expect(slotPets(picked)).toEqual([{ petId: 'milo', serviceIds: ['bath', 'nail'] }]);
    expect(quotePets({ milo: picked.milo })).toEqual([{ petId: 'milo', serviceIds: ['bath', 'nail'], answers: answers('NO', 'NO') }]);
  });

  test('the price is asked only when every pet of the order has a service and both answers', () => {
    expect(isAnswered(picked.milo)).toBe(true);
    expect(isAnswered(picked.muop)).toBe(false);
    expect(orderReady({ milo: picked.milo })).toBe(true);
    expect(orderReady({ milo: picked.milo, muop: picked.muop })).toBe(false);
    expect(orderReady({ milo: choice([]) })).toBe(false);
    expect(orderReady({ milo: choice(['bath'], 'YES') })).toBe(false);
    expect(orderReady({})).toBe(false);
  });

  test('the pet line names the kind and the weight when known', () => {
    expect(petKindLabel({ species: 'DOG', weightKg: 12 })).toBe('Chó · 12 kg');
    expect(petKindLabel({ species: 'CAT', weightKg: 4 })).toBe('Mèo · 4 kg');
    expect(petKindLabel({ species: 'CAT' })).toBe('Mèo');
    expect(petKindLabel({ species: 'DOG', breedName: 'Corgi', weightKg: 12 })).toBe('Chó Corgi · 12 kg');
    expect(petKindLabel({ species: 'DOG', breedCode: 'dog-mixed', weightKg: 12 })).toBe('Chó · 12 kg');
    expect(petKindLabel({ species: 'CAT', breedName: '  ', weightKg: 4 })).toBe('Mèo · 4 kg');
  });
});

describe('messages', () => {
  test('MSG63 names the hotline only when the shop has one', () => {
    expect(msg63('1900 1234')).toBe('Vui lòng gọi cửa hàng theo số 1900 1234 để đặt lịch tắm và cắt tỉa cho thú này.');
    expect(msg63(null)).toBe('Vui lòng gọi cửa hàng để đặt lịch tắm và cắt tỉa cho thú này.');
    expect(msg63('')).toBe('Vui lòng gọi cửa hàng để đặt lịch tắm và cắt tỉa cho thú này.');
  });

  test('MSG64 and MSG65', () => {
    expect(MSG64).toBe('Giờ hẹn này không còn trống. Vui lòng chọn giờ khác.');
    expect(msg65('2026-11-05', '10:00')).toBe('Lịch hẹn ngày 05/11/2026 lúc 10:00 đã được đặt. Bạn thanh toán tại cửa hàng khi nhận thú cưng.');
  });

  test('tier names', () => {
    expect(GROOMING_TIERS).toEqual({ MEMBER: 'Thành viên', SILVER: 'Bạc', GOLD: 'Vàng' });
  });
});
