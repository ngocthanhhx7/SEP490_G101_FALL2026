import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';
import { GroomingBookingPage } from '../../src/pages/customer/GroomingBookingPage.jsx';
import { ApiError } from '../../src/services/api-client.js';

const customer = { resolve: async () => ({ status: 'authenticated', user: { id: 'synthetic-customer', roles: ['CUSTOMER'] } }) };
const guest = { resolve: async () => ({ status: 'guest' }) };
const ADDRESS = 'Cửa hàng Paw World, 25 Láng Hạ, Đống Đa';
const questions = [
  { code: 'biteOrScratch', text: 'Có cắn hoặc cào khi bị giữ không?', answers: [['NO', 'Không'], ['SOMETIMES', 'Đôi khi'], ['YES', 'Có']], blocking: ['YES'] },
  { code: 'skinCondition', text: 'Có bệnh da hoặc vết thương không?', answers: [['NO', 'Không'], ['YES', 'Có']], blocking: [] }
];
const makeOptions = (hotline = null) => ({
  shop: { address: ADDRESS, hotline }, window: { slotMinutes: 60, firstDate: '2026-11-05', lastDate: '2026-11-11', minLeadMinutes: 60 }, questions,
  services: [
    { id: 'bath', code: 'pet-bathing', name: 'Tắm và vệ sinh thú cưng', durationMinutes: 60, fromPriceVnd: 100000, species: ['DOG', 'CAT'], bookable: true },
    { id: 'trim', code: 'hair-trimming', name: 'Cắt tỉa lông', durationMinutes: 90, fromPriceVnd: 200000, species: ['DOG'], bookable: true },
    { id: 'nail', code: 'nail-trimming', name: 'Cắt móng', durationMinutes: 15, fromPriceVnd: 50000, species: ['DOG', 'CAT'], bookable: true },
    { id: 'ear', code: 'ear-eye-cleaning', name: 'Vệ sinh tai', durationMinutes: 20, fromPriceVnd: 30000, species: ['DOG', 'CAT'], bookable: false }
  ]
});
const pets = [{ id: 'milo', name: 'Milo', species: 'DOG', weightKg: 12 }, { id: 'bo', name: 'Bơ', species: 'DOG', weightKg: 4 }, { id: 'muop', name: 'Mướp', species: 'CAT', weightKg: 4 }];
const slotRows = [
  { startAt: '2026-11-05T01:00:00.000Z', time: '08:00', state: 'AVAILABLE' }, { startAt: '2026-11-05T02:00:00.000Z', time: '09:00', state: 'FULL' },
  { startAt: '2026-11-05T03:00:00.000Z', time: '10:00', state: 'AVAILABLE' }
];
const PRICES = { bath: ['Tắm và vệ sinh thú cưng', 'chó 5–15 kg', 150000], nail: ['Cắt móng', 'chó 5–15 kg', 50000], trim: ['Cắt tỉa lông', 'chó dưới 5 kg', 200000] };
const quoteFor = (body, discountVnd = 0, code = null, blockedReason = null) => {
  const rows = body.pets.map(row => {
    const lines = row.serviceIds.map(id => ({ serviceId: id, label: PRICES[id][0], sizeLabel: PRICES[id][1], amountVnd: PRICES[id][2] }));
    return { petId: row.petId, name: pets.find(item => item.id === row.petId).name, lines, priceVnd: lines.reduce((sum, line) => sum + line.amountVnd, 0) };
  });
  const subtotalVnd = rows.reduce((sum, row) => sum + row.priceVnd, 0);
  return { currency: 'VND', pets: rows, subtotalVnd, tier: { code, discountBps: discountVnd ? 500 : 0, discountVnd, applied: discountVnd > 0, blockedReason }, totalVnd: subtotalVnd - discountVnd };
};
const booked = { id: 'appt-1', code: 'GR-0001', status: 'BOOKED', slot: { startAt: '2026-11-05T03:00:00.000Z', endAt: '2026-11-05T04:00:00.000Z', localDate: '2026-11-05', startLocalTime: '10:00' },
  pets: [{ petId: 'milo', name: 'Milo', status: 'BOOKED', finalPriceVnd: 200000, services: [{ serviceId: 'bath', name: 'Tắm và vệ sinh thú cưng', priceVnd: 150000 }, { serviceId: 'nail', name: 'Cắt móng', priceVnd: 50000 }] }],
  pricing: { subtotalVnd: 200000, tierDiscountVnd: 0, totalVnd: 200000, currency: 'VND' }, shop: { address: ADDRESS } };

function fixture(over = {}) {
  return { options: jest.fn(async () => makeOptions()), pets: jest.fn(async () => pets),
    slots: jest.fn(async () => ({ date: '2026-11-05', slots: slotRows })), quote: jest.fn(async body => quoteFor(body)), book: jest.fn(async () => booked), ...over };
}
function show(api, { path = '/grooming-booking', adapter = customer } = {}) {
  const createApi = () => api;
  render(<MemoryRouter initialEntries={[path]}><SessionProvider adapter={adapter}><GroomingBookingPage createApi={createApi} /></SessionProvider></MemoryRouter>);
}
const check = async name => fireEvent.click(await screen.findByRole('checkbox', { name }));
const pickServices = (pet, ...names) => names.forEach(name => fireEvent.click(within(screen.getByRole('group', { name: `Dịch vụ cho ${pet}` })).getByRole('checkbox', { name })));
const answerAll = (index = 0, bite = 'Không', skin = 'Không') => {
  fireEvent.click(within(screen.getAllByRole('group', { name: questions[0].text })[index]).getByRole('radio', { name: bite }));
  fireEvent.click(within(screen.getAllByRole('group', { name: questions[1].text })[index]).getByRole('radio', { name: skin }));
};
const confirmButton = () => screen.getByRole('button', { name: /Xác nhận đặt lịch|Đang đặt lịch/ });
const summary = () => screen.getByRole('complementary', { name: 'Giá cuối' });
async function fillMilo(api, api2 = api) {
  show(api2);
  await check(/Milo/);
  pickServices('Milo', 'Tắm và vệ sinh thú cưng', 'Cắt móng');
  answerAll(0);
  fireEvent.click(await screen.findByRole('radio', { name: '10:00' }));
}

test('shows the three steps and the final price panel, then books and shows MSG65 with the appointment', async () => {
  const api = fixture({ quote: jest.fn(async body => quoteFor(body, 25000, 'SILVER')) });
  show(api);
  expect(await screen.findByRole('heading', { name: '1. Thú cưng và dịch vụ' })).toBeVisible();
  expect(screen.getByRole('heading', { name: '2. Câu hỏi về từng thú' })).toBeVisible();
  expect(screen.getByRole('heading', { name: '3. Chọn giờ hẹn' })).toBeVisible();
  expect(within(summary()).getByText('Chọn dịch vụ và trả lời câu hỏi để xem giá cuối.')).toBeVisible();
  expect(confirmButton()).toBeDisabled();

  await check(/Milo/); await check(/Bơ/);
  pickServices('Milo', 'Tắm và vệ sinh thú cưng', 'Cắt móng');
  pickServices('Bơ', 'Tắm và vệ sinh thú cưng', 'Cắt tỉa lông');
  answerAll(0); answerAll(1, 'Đôi khi');
  fireEvent.click(await screen.findByRole('radio', { name: '10:00' }));

  const price = within(summary());
  expect(await price.findByRole('region', { name: 'Giá của Milo' })).toBeVisible();
  expect(price.getAllByText('Tắm và vệ sinh thú cưng (chó 5–15 kg)')).toHaveLength(2);
  expect(price.getByText('Giá của Milo').closest('div')).toHaveTextContent('200.000 đ');
  expect(price.getByText('Giá của Bơ').closest('div')).toHaveTextContent('350.000 đ');
  expect(price.getByText('Ưu đãi hạng Bạc').closest('div')).toHaveTextContent('− 25.000 đ');
  expect(price.getByText('Tổng').closest('div')).toHaveTextContent('525.000 đ');
  expect(price.getByText('Thứ Năm 05/11/2026 · 10:00')).toBeVisible();
  expect(price.getByText(ADDRESS)).toBeVisible();
  expect(price.getByText(/Không cần đặt cọc/)).toBeVisible();
  expect(confirmButton()).toBeEnabled();

  fireEvent.click(confirmButton());
  expect(await screen.findByText('Lịch hẹn ngày 05/11/2026 lúc 10:00 đã được đặt. Bạn thanh toán tại cửa hàng khi nhận thú cưng.')).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Lịch hẹn GR-0001' })).toBeVisible();
  expect(api.book).toHaveBeenCalledTimes(1);
  const [body, key] = api.book.mock.calls[0];
  expect(body).toEqual({ startAt: '2026-11-05T03:00:00.000Z', expectedTotalVnd: 525000, pets: [
    { petId: 'milo', serviceIds: ['bath', 'nail'], answers: { biteOrScratch: 'NO', skinCondition: 'NO' } },
    { petId: 'bo', serviceIds: ['bath', 'trim'], answers: { biteOrScratch: 'SOMETIMES', skinCondition: 'NO' } }] });
  expect(key).toMatch(/^grooming:/);
});

test('"Đặt lịch khác" starts a new booking', async () => {
  const api = fixture();
  await fillMilo(api);
  await waitFor(() => expect(confirmButton()).toBeEnabled());
  fireEvent.click(confirmButton());
  fireEvent.click(await screen.findByRole('button', { name: 'Đặt lịch khác' }));
  expect(await screen.findByRole('heading', { name: '1. Thú cưng và dịch vụ' })).toBeVisible();
  expect(screen.getByRole('checkbox', { name: /Milo/ })).not.toBeChecked();
  expect(confirmButton()).toBeDisabled();
});

test('the confirm button waits for a pet, a service, both answers and a time slot', async () => {
  const api = fixture();
  show(api);
  await check(/Milo/);
  expect(confirmButton()).toBeDisabled();
  pickServices('Milo', 'Tắm và vệ sinh thú cưng');
  fireEvent.click(within(screen.getAllByRole('group', { name: questions[0].text })[0]).getByRole('radio', { name: 'Không' }));
  expect(confirmButton()).toBeDisabled();
  expect(api.quote).not.toHaveBeenCalled();
  fireEvent.click(within(screen.getAllByRole('group', { name: questions[1].text })[0]).getByRole('radio', { name: 'Không' }));
  expect(await within(summary()).findByRole('region', { name: 'Giá của Milo' })).toBeVisible();
  expect(confirmButton()).toBeDisabled();
  fireEvent.click(await screen.findByRole('radio', { name: '10:00' }));
  expect(confirmButton()).toBeEnabled();
  pickServices('Milo', 'Tắm và vệ sinh thú cưng');
  expect(confirmButton()).toBeDisabled();
});

test('a full slot is greyed out and cannot be chosen', async () => {
  const api = fixture();
  show(api);
  await check(/Milo/);
  pickServices('Milo', 'Cắt móng');
  const full = await screen.findByRole('radio', { name: '09:00 · đã kín' });
  expect(full).toBeDisabled();
  expect(screen.getByRole('radio', { name: '08:00' })).toBeEnabled();
  expect(screen.getAllByRole('radio', { name: /T\d · \d\d\/11|CN · \d\d\/11/ })).toHaveLength(7);
  expect(screen.getByRole('radio', { name: 'T5 · 05/11' })).toBeChecked();
});

test('choosing another day asks for that day and clears the chosen time', async () => {
  const api = fixture();
  await fillMilo(api);
  await waitFor(() => expect(confirmButton()).toBeEnabled());
  fireEvent.click(screen.getByRole('radio', { name: 'T6 · 06/11' }));
  await waitFor(() => expect(api.slots).toHaveBeenLastCalledWith(expect.objectContaining({ date: '2026-11-06' }), expect.anything()));
  expect(confirmButton()).toBeDisabled();
});

describe('MSG63: a pet that bites or scratches', () => {
  test('shows the message in line without a hotline and keeps that pet out of slots and price', async () => {
    const api = fixture();
    show(api);
    await check(/Milo/); await check(/Bơ/);
    pickServices('Milo', 'Cắt móng'); pickServices('Bơ', 'Tắm và vệ sinh thú cưng');
    answerAll(0);
    answerAll(1, 'Có');
    expect(screen.getByText('Vui lòng gọi cửa hàng để đặt lịch tắm và cắt tỉa cho thú này.')).toBeVisible();
    expect(screen.getByText(/Thú rất hung dữ hoặc dễ hoảng sợ không đặt được trên web/)).toBeVisible();
    await waitFor(() => expect(api.quote).toHaveBeenLastCalledWith({ pets: [{ petId: 'milo', serviceIds: ['nail'], answers: { biteOrScratch: 'NO', skinCondition: 'NO' } }] }, expect.anything()));
    expect(api.slots).toHaveBeenLastCalledWith({ date: '2026-11-05', pets: [{ petId: 'milo', serviceIds: ['nail'] }] }, expect.anything());
    fireEvent.click(await screen.findByRole('radio', { name: '10:00' }));
    await waitFor(() => expect(confirmButton()).toBeEnabled());
    fireEvent.click(confirmButton());
    await waitFor(() => expect(api.book).toHaveBeenCalled());
    expect(api.book.mock.calls[0][0].pets.map(row => row.petId)).toEqual(['milo']);
  });

  test('names the hotline only when the shop has one, and cannot book when every pet is referred', async () => {
    const api = fixture({ options: jest.fn(async () => makeOptions('1900 1234')) });
    show(api);
    await check(/Bơ/);
    pickServices('Bơ', 'Tắm và vệ sinh thú cưng');
    await waitFor(() => expect(api.slots).toHaveBeenCalledTimes(1));
    answerAll(0, 'Có');
    expect(screen.getByText('Vui lòng gọi cửa hàng theo số 1900 1234 để đặt lịch tắm và cắt tỉa cho thú này.')).toBeVisible();
    expect(confirmButton()).toBeDisabled();
    expect(api.quote).not.toHaveBeenCalled();
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(api.slots).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('radio', { name: '10:00' })).not.toBeInTheDocument();
  });

  test('a server referral answer marks the pet and shows the message', async () => {
    const api = fixture({ book: jest.fn(async () => { throw Object.assign(new ApiError('GROOMING_PET_REFERRAL_REQUIRED', 422), { details: { petId: 'milo' } }); }) });
    await fillMilo(api);
    await waitFor(() => expect(confirmButton()).toBeEnabled());
    fireEvent.click(confirmButton());
    expect(await screen.findByText('Vui lòng gọi cửa hàng để đặt lịch tắm và cắt tỉa cho thú này.')).toBeVisible();
    expect(confirmButton()).toBeDisabled();
  });
});

describe('errors when confirming', () => {
  test('MSG64 when the slot was just taken: the time is cleared and the slots are reloaded', async () => {
    const api = fixture({ book: jest.fn(async () => { throw new ApiError('GROOMING_SLOT_TAKEN', 409); }) });
    await fillMilo(api);
    await waitFor(() => expect(confirmButton()).toBeEnabled());
    const loads = api.slots.mock.calls.length;
    fireEvent.click(confirmButton());
    expect(await within(summary()).findByText('Giờ hẹn này không còn trống. Vui lòng chọn giờ khác.')).toBeVisible();
    expect(confirmButton()).toBeDisabled();
    await waitFor(() => expect(api.slots.mock.calls.length).toBeGreaterThan(loads));
    expect(screen.getByRole('radio', { name: '10:00' })).not.toBeChecked();
  });

  test.each([
    ['GROOMING_PET_ALREADY_BOOKED', 'Milo đã có lịch tại cửa hàng vào giờ này. Vui lòng chọn giờ khác.'],
    ['GROOMING_PRICE_CHANGED', 'Giá vừa thay đổi. Vui lòng xem lại giá cuối trước khi xác nhận.']
  ])('%s shows the sentence the server sent', async (code, sentence) => {
    const api = fixture({ book: jest.fn(async () => { throw Object.assign(new ApiError(code, 409), { serverMessage: sentence }); }) });
    await fillMilo(api);
    await waitFor(() => expect(confirmButton()).toBeEnabled());
    const quotes = api.quote.mock.calls.length;
    fireEvent.click(confirmButton());
    expect(await within(summary()).findByText(sentence)).toBeVisible();
    if (code === 'GROOMING_PRICE_CHANGED') await waitFor(() => expect(api.quote.mock.calls.length).toBeGreaterThan(quotes));
  });

  test('an unknown conflict falls back to the general text', async () => {
    const api = fixture({ book: jest.fn(async () => { throw new ApiError('SERVICE_UNAVAILABLE', 409); }) });
    await fillMilo(api);
    await waitFor(() => expect(confirmButton()).toBeEnabled());
    fireEvent.click(confirmButton());
    expect(await within(summary()).findByText(/Dữ liệu hoặc trạng thái đã thay đổi/)).toBeVisible();
  });

  test('after an uncertain reply the retry sends the same Idempotency-Key, and a changed request gets a new one', async () => {
    const book = jest.fn().mockRejectedValueOnce(new ApiError('NETWORK_ERROR')).mockResolvedValueOnce(booked);
    const api = fixture({ book });
    await fillMilo(api);
    await waitFor(() => expect(confirmButton()).toBeEnabled());
    fireEvent.click(confirmButton());
    expect(await within(summary()).findByText(/Chưa nhận được xác nhận lịch hẹn/)).toBeVisible();
    await waitFor(() => expect(confirmButton()).toBeEnabled());
    fireEvent.click(confirmButton());
    expect(await screen.findByRole('heading', { name: 'Lịch hẹn GR-0001' })).toBeVisible();
    expect(book.mock.calls[0][1]).toBe(book.mock.calls[1][1]);
    expect(book.mock.calls[0][0]).toEqual(book.mock.calls[1][0]);
  });

  test('a changed request after an uncertain reply uses a new key', async () => {
    const book = jest.fn().mockRejectedValueOnce(new ApiError('TIMEOUT')).mockResolvedValueOnce(booked);
    const api = fixture({ book });
    await fillMilo(api);
    await waitFor(() => expect(confirmButton()).toBeEnabled());
    fireEvent.click(confirmButton());
    await within(summary()).findByText(/Chưa nhận được xác nhận lịch hẹn/);
    fireEvent.click(screen.getByRole('radio', { name: '08:00' }));
    await waitFor(() => expect(confirmButton()).toBeEnabled());
    fireEvent.click(confirmButton());
    await screen.findByRole('heading', { name: 'Lịch hẹn GR-0001' });
    expect(book.mock.calls[0][1]).not.toBe(book.mock.calls[1][1]);
  });
});

describe('the page around the form', () => {
  test('a customer without pets is told to add one, with a link to the pets page', async () => {
    show(fixture({ pets: jest.fn(async () => []) }));
    expect(await screen.findByText(/Bạn chưa có hồ sơ thú cưng nào/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Thêm thú cưng' })).toHaveAttribute('href', '/account/pets');
    expect(confirmButton()).toBeDisabled();
  });

  test('a service id in the link is preselected for each pet that is chosen, only if the pet can have it', async () => {
    const api = fixture();
    show(api, { path: '/grooming-booking?serviceId=trim' });
    await check(/Milo/); await check(/Mướp/);
    expect(within(screen.getByRole('group', { name: 'Dịch vụ cho Milo' })).getByRole('checkbox', { name: 'Cắt tỉa lông' })).toBeChecked();
    expect(screen.queryByRole('checkbox', { name: 'Cắt tỉa lông' , checked: true })).toBeInTheDocument();
    expect(within(screen.getByRole('group', { name: 'Dịch vụ cho Mướp' })).queryByRole('checkbox', { name: 'Cắt tỉa lông' })).not.toBeInTheDocument();
  });

  test('a service the shop has paused is listed but cannot be chosen', async () => {
    show(fixture());
    await check(/Milo/);
    const paused = within(screen.getByRole('group', { name: 'Dịch vụ cho Milo' })).getByRole('checkbox', { name: 'Vệ sinh tai · tạm ngưng' });
    expect(paused).toBeDisabled();
  });

  test('says the shop booking is not open when the API is off, and offers a retry for other failures', async () => {
    const off = fixture({ options: jest.fn(async () => { throw new ApiError('HTTP_ERROR', 404); }) });
    show(off);
    expect(await screen.findByRole('heading', { name: 'Đặt lịch tại cửa hàng chưa mở' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
  });

  test('a failed load can be retried', async () => {
    const options = jest.fn().mockRejectedValueOnce(new ApiError('NETWORK_ERROR')).mockResolvedValue(makeOptions());
    show(fixture({ options }));
    expect(await screen.findByRole('heading', { name: 'Chưa tải được thông tin đặt lịch' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(await screen.findByRole('heading', { name: '1. Thú cưng và dịch vụ' })).toBeVisible();
  });

  test('slots and price failures can be retried in place', async () => {
    const slots = jest.fn().mockRejectedValueOnce(new ApiError('NETWORK_ERROR')).mockResolvedValue({ date: '2026-11-05', slots: slotRows });
    const quote = jest.fn().mockRejectedValueOnce(new ApiError('NETWORK_ERROR')).mockImplementation(async body => quoteFor(body));
    show(fixture({ slots, quote }));
    await check(/Milo/);
    pickServices('Milo', 'Cắt móng');
    answerAll(0);
    fireEvent.click(await screen.findByRole('button', { name: 'Thử lại', description: '' }).catch(() => screen.getAllByRole('button', { name: 'Thử lại' })[0]));
    for (const button of await screen.findAllByRole('button', { name: 'Thử lại' })) fireEvent.click(button);
    expect(await screen.findByRole('radio', { name: '10:00' })).toBeVisible();
    expect(await within(summary()).findByRole('region', { name: 'Giá của Milo' })).toBeVisible();
  });

  test('a day with no free slot says so', async () => {
    show(fixture({ slots: jest.fn(async () => ({ date: '2026-11-05', slots: [] })) }));
    await check(/Milo/);
    pickServices('Milo', 'Cắt móng');
    expect(await screen.findByText('Không còn giờ hẹn nào trong ngày này. Hãy chọn ngày khác.')).toBeVisible();
  });

  test('a guest is invited to sign in and no booking data is requested', async () => {
    const api = fixture();
    show(api, { adapter: guest });
    expect(await screen.findByRole('heading', { name: 'Đăng nhập để đặt lịch' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Đăng nhập' })).toHaveAttribute('href', '/sign-in');
    expect(api.options).not.toHaveBeenCalled();
  });

  test('the price panel shows a held discount instead of hiding it', async () => {
    const api = fixture({ quote: jest.fn(async body => quoteFor(body, 0, 'GOLD', 'OVERDUE')) });
    await fillMilo(api);
    expect(await within(summary()).findByText('chưa áp dụng')).toBeVisible();
    expect(within(summary()).getByText('Ưu đãi hạng Vàng')).toBeVisible();
  });
});
