import { test, expect, jest } from '@jest/globals';
import { createBookingCheckoutService } from '../../../src/services/booking-proposals/booking-checkout.service.js';

// CHECKOUT-01: mỗi test khớp một UTCID trong CHECKOUT-01_options.
// Chỉ tình huống SRS ghi bên cạnh test; không kiểm tra các nhánh kỹ thuật ngoài SRS.
// Model/provider/index/transaction giả. Không chứng minh MongoDB, rollback hoặc payOS thật.

const OWNER = '111111111111111111111111';
function subject() {
  // Port trả danh sách đã lọc; ca này không chứng minh pipeline Mongo hoặc lịch sử chăm pet.
  const sitters = [{ id: '222222222222222222222222', displayName: 'Người chăm sóc mẫu' }];
  const aggregate = jest.fn(() => ({ toArray: async () => sitters }));
  const names = ['DecisionSnapshot', 'Pet', 'CustomerAddress', 'PetCareCommand', 'PetTrait', 'PetBreed',
    'Notification', 'NotificationEvent', 'FinanceSourceCommand', 'FinanceSourceEvent', 'EarningAccrualTask',
    'CareMediaBinding', 'ServiceVersion', 'ServicePolicyVersion', 'ServicePriceVersion', 'ServicePresentation',
    'SystemSettingVersion', 'PricingPolicy'];
  const models = Object.fromEntries(names.map(modelName => [modelName, {
    modelName, collection: { name: modelName.toLowerCase() },
  }]));
  const connection = { models, db: { collection: () => ({ aggregate }) } };
  const options = createBookingCheckoutService({ connection }).options;
  return { options, aggregate, sitters };
}

// SRS: UC-25 Preconditions; III.7.1 Booking — Customer mở lựa chọn.
test("CHECKOUT-01-UTCID01 [N] Customer hợp lệ nhận lựa chọn từ port", async () => {
  const { options, sitters } = subject();
  const actor = { userId: OWNER, state: 'ACTIVE', roles: ['CUSTOMER'] };

  const actual = await options(actor);

  expect(actual.sitters).toEqual(sitters);
});

// SRS: GBR-01; UC-25 Preconditions.
test("CHECKOUT-01-UTCID02 [A] Guest không được mở lựa chọn checkout", async () => {
  const { options, aggregate } = subject();

  await expect(options(null)).rejects.toMatchObject({ name: 'AppError', status: 401, code: 'UNAUTHENTICATED' });
  expect(aggregate).not.toHaveBeenCalled();
});

// SRS: I.4.4 Booking — Create: Customer; GBR-02.
test("CHECKOUT-01-UTCID03 [A] Staff không được tạo checkout qua cổng Customer", async () => {
  const { options, aggregate } = subject();

  await expect(options({ userId: OWNER, state: 'ACTIVE', roles: ['STAFF'] })).rejects.toMatchObject({
    name: 'AppError', status: 403, code: 'FORBIDDEN',
  });
  expect(aggregate).not.toHaveBeenCalled();
});
