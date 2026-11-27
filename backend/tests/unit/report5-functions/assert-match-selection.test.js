import { test, expect, jest } from '@jest/globals';
import { assertMatchSelection } from '../../../src/services/booking-proposals/match-selection.service.js';

// Ánh xạ UC-25 bước 3 và GBR-12 vào tính nhất quán của tham chiếu đề xuất.
// SRS không đặt tên entity MATCH/cache, code lỗi, TTL hoặc feature snapshot.
// Các dữ liệu eligibility/lịch sử chăm pet trong fixture đã được caller xác minh;
// test không chứng minh thuật toán ranking, phân công hoặc query Mongo thật.
const IDS = {
  owner: '111111111111111111111111', other: '222222222222222222222222',
  match: '333333333333333333333333', service: '444444444444444444444444',
  pet: '555555555555555555555555', address: '666666666666666666666666',
  formerSitter: '777777777777777777777777', otherSitter: '888888888888888888888888',
  changed: '999999999999999999999999',
};
function fixture() {
  const at = new Date('2026-11-12T03:00:00.000Z');
  const startAt = new Date('2026-11-14T01:00:00.000Z');
  const endAt = new Date('2026-11-14T02:00:00.000Z');
  const record = { _id: IDS.match, kind: 'MATCH', ownerId: IDS.owner,
    expiresAt: new Date('2026-11-12T04:00:00.000Z'),
    snapshot: {
      input: { serviceId: IDS.service, petIds: [IDS.pet], addressId: IDS.address,
        startAt: startAt.toISOString(), endAt: endAt.toISOString() },
      result: { candidates: [{ sitterId: IDS.formerSitter }, { sitterId: IDS.otherSitter }] },
      petVersions: [{ id: IDS.pet, version: 1 }], addressVersion: 1,
    } };
  const query = { select: jest.fn(), session: jest.fn(), lean: jest.fn() };
  query.select.mockReturnValue(query);
  query.session.mockReturnValue(query);
  const DecisionSnapshot = { findOne: jest.fn(filter => {
    // Double thực sự lọc bản ghi; không trả dữ liệu bất kể ownerId của query.
    const matches = Object.entries(filter).every(([key, value]) => {
      if (key === 'expiresAt') return record.expiresAt > value.$gt;
      if (['_id', 'kind', 'ownerId'].includes(key)) return String(record[key]) === String(value);
      throw new Error('Query double chưa hỗ trợ trường ' + key);
    });
    query.lean.mockResolvedValue(matches ? record : null);
    return query;
  }) };
  const args = { DecisionSnapshot, actor: { userId: IDS.owner },
    row: { matchId: IDS.match, bookingMode: 'SYSTEM', location: 'HOME',
      addressId: IDS.address, startAt },
    selection: { serviceId: IDS.service, petIds: [IDS.pet] },
    pets: [{ _id: IDS.pet, version: 1 }], address: { version: 1 },
    endAt, at, session: {} };
  return { args, record, DecisionSnapshot };
}

// SRS: UC-25 bước 3; III.7.1 Preferred pet sitter — optional; ánh xạ không ép đề xuất trước Confirm.
test("MATCH-SEL-01-UTCID01 [N] Không bắt buộc có tham chiếu khi không yêu cầu người chăm sóc", async () => {
  const { args, DecisionSnapshot } = fixture();
  delete args.row.matchId;

  await expect(assertMatchSelection(args)).resolves.toBeUndefined();
  expect(DecisionSnapshot.findOne).not.toHaveBeenCalled();
});

// SRS: UC-25 bước 3/8 và Postconditions; GBR-12 — tham chiếu tư vấn, việc offer/assign thuộc quy trình sau.
test("MATCH-SEL-01-UTCID02 [N] Lựa chọn khớp trả tham chiếu ứng viên để quy trình sau xử lý", async () => {
  const { args, record } = fixture();
  const before = globalThis.structuredClone({ row: args.row, selection: args.selection, record });

  const actual = await assertMatchSelection(args);

  expect(actual).toEqual({ candidateIds: [IDS.formerSitter, IDS.otherSitter] });
  expect({ row: args.row, selection: args.selection, record }).toEqual(before);
});

// SRS: UC-25 bước 3; III.7.1 Preferred pet sitter; GBR-12 — giả định caller đã xác minh former carer/eligibility.
test("MATCH-SEL-01-UTCID03 [N] Giữ tham chiếu khi người chăm sóc mong muốn có trong danh sách", async () => {
  const { args } = fixture();
  args.row.requestedSitterId = IDS.formerSitter;
  args.row.bookingMode = 'DIRECT';

  const actual = await assertMatchSelection(args);

  expect(actual).toEqual({ candidateIds: [IDS.formerSitter, IDS.otherSitter] });
  expect(args.row.requestedSitterId).toBe(IDS.formerSitter);
});

// SRS: I.4.4 dữ liệu riêng Customer; GBR-02 — áp dụng giới hạn owner cho tham chiếu của Customer.
test("MATCH-SEL-01-UTCID04 [A] Không dùng tham chiếu của Customer khác", async () => {
  const { args, record } = fixture();
  record.ownerId = IDS.other;

  await expect(assertMatchSelection(args)).rejects.toMatchObject({
    name: 'AppError', status: 409, code: 'MATCH_EXPIRED',
    message: 'Recommendation unavailable or expired; search again',
  });
});

// SRS: UC-25 bước 1/3; GBR-12 — áp dụng đề xuất cho đúng dịch vụ đang xác nhận.
test("MATCH-SEL-01-UTCID05 [A] Không dùng đề xuất của dịch vụ cũ sau khi đổi dịch vụ", async () => {
  const { args } = fixture();
  args.selection.serviceId = IDS.changed;

  await expect(assertMatchSelection(args)).rejects.toMatchObject({
    name: 'AppError', status: 409, code: 'MATCH_CHANGED',
    message: 'Recommendation does not match the confirmed service, care or schedule',
  });
});

// SRS: UC-25 bước 3; III.7.1 Pets / Preferred pet sitter; GBR-12 — đúng các pet đã chọn.
test("MATCH-SEL-01-UTCID06 [A] Không dùng đề xuất của nhóm pet cũ sau khi đổi pet", async () => {
  const { args } = fixture();
  args.selection.petIds = [IDS.changed];
  args.pets = [{ _id: IDS.changed, version: 1 }];

  await expect(assertMatchSelection(args)).rejects.toMatchObject({
    name: 'AppError', status: 409, code: 'MATCH_CHANGED',
    message: 'Recommendation does not match the confirmed service, care or schedule',
  });
});

// SRS: UC-25 bước 3; III.7.1 Address; GBR-10/12 — đúng khu vực của lượt đang xác nhận.
test("MATCH-SEL-01-UTCID07 [A] Không dùng đề xuất tại địa chỉ cũ sau khi đổi địa chỉ", async () => {
  const { args } = fixture();
  args.row.addressId = IDS.changed;

  await expect(assertMatchSelection(args)).rejects.toMatchObject({
    name: 'AppError', status: 409, code: 'MATCH_CHANGED',
    message: 'Recommendation does not match the confirmed service, care or schedule',
  });
});

// SRS: UC-25 bước 3; III.7.1 Visit time; GBR-12 — eligibility phụ thuộc lịch làm việc và bận/rảnh.
test("MATCH-SEL-01-UTCID08 [A] Không dùng đề xuất của khung giờ cũ sau khi đổi giờ", async () => {
  const { args } = fixture();
  args.row.startAt = new Date(args.row.startAt.getTime() + 3600000);
  args.endAt = new Date(args.endAt.getTime() + 3600000);

  await expect(assertMatchSelection(args)).rejects.toMatchObject({
    name: 'AppError', status: 409, code: 'MATCH_CHANGED',
    message: 'Recommendation does not match the confirmed service, care or schedule',
  });
});
