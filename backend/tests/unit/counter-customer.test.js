import { expect, jest, test } from '@jest/globals';
import { createCounterCustomerService, maskCounterCustomerName } from '../../src/services/counter-booking/counter-customer.service.js';

const staff = { userId: 'aaaaaaaaaaaaaaaaaaaaaaaa', state: 'ACTIVE', roles: ['SALE_STAFF'] };
const customer = { _id: 'bbbbbbbbbbbbbbbbbbbbbbbb', displayName: 'Nguyễn Văn An' };
const phone = '0912345678';
function fixture({ ids = [], pending = [], existing = null, found = customer, createError } = {}) {
  const query = value => ({ select: () => ({ lean: async () => value }), session: () => ({ lean: async () => value }) });
  const session = { withTransaction: jest.fn(async execute => execute()), endSession: jest.fn() };
  const User = { findOne: jest.fn(() => query(found)), create: jest.fn(async () => [customer]) };
  const Contact = { find: jest.fn(() => query(pending)), findOne: jest.fn(() => query(existing)),
    create: jest.fn(async () => { if (createError) throw createError; }) };
  const contacts = { userIdsByPhone: jest.fn(async () => ids) };
  const contactCrypto = { lookup: jest.fn(() => ({ lookupKey: 'hash' })), encrypt: jest.fn(() => 'ciphertext') };
  const petCare = { listPets: jest.fn(async () => []), createPet: jest.fn(async () => ({ id: 'pet' })) };
  const service = createCounterCustomerService({ connection: { startSession: async () => session }, contacts, contactCrypto, petCare, User, Contact });
  return { service, User, Contact, contacts, contactCrypto, petCare, session };
}

test('creates an unverified customer/contact atomically using normalized identity and actor provenance', async () => {
  const f = fixture();
  await expect(f.service.createCustomer(staff, { displayName: ' Nguyễn  Văn An ', phone })).resolves.toEqual({ customer: { id: customer._id, displayName: customer.displayName } });
  expect(f.contacts.userIdsByPhone).toHaveBeenCalledWith('+84912345678');
  expect(f.User.create).toHaveBeenCalledWith([expect.objectContaining({ displayName: customer.displayName, roles: ['CUSTOMER'], createdChannel: 'COUNTER', createdBy: staff.userId })], { session: f.session });
  expect(f.Contact.create).toHaveBeenCalledWith([{ userId: customer._id, channel: 'PHONE', lookupKey: 'hash', canonicalCiphertext: 'ciphertext', state: 'UNVERIFIED' }], { session: f.session });
  expect(f.session.endSession).toHaveBeenCalledTimes(1);
});

test.each([{ ids: [customer._id] }, { existing: { userId: customer._id } }])('rejects existing global phone before inserting customer: %j', async options => {
  const f = fixture(options);
  await expect(f.service.createCustomer(staff, { displayName: customer.displayName, phone })).rejects.toMatchObject({ status: 409, code: 'CONTACT_ALREADY_LINKED' });
  expect(f.User.create).not.toHaveBeenCalled();
});

test('translates unique contact race and closes transaction session', async () => {
  const f = fixture({ createError: { code: 11000, keyPattern: { channel: 1, lookupKey: 1 } } });
  await expect(f.service.createCustomer(staff, { displayName: customer.displayName, phone })).rejects.toMatchObject({ status: 409, code: 'CONTACT_ALREADY_LINKED' });
  expect(f.session.endSession).toHaveBeenCalledTimes(1);
});

test('looks up pending and verified identities without revealing contact or non-customer data', async () => {
  const f = fixture({ ids: [customer._id], pending: [{ userId: customer._id }] });
  const masked = maskCounterCustomerName(customer.displayName);
  await expect(f.service.lookup(staff, { phone })).resolves.toEqual({ customer: { id: customer._id, displayName: masked } });
  const pending = fixture({ pending: [{ userId: customer._id }] });
  await expect(pending.service.lookup(staff, { phone })).resolves.toEqual({ customer: { id: customer._id, displayName: masked } });
  const nonCustomer = fixture({ ids: [customer._id], found: null });
  await expect(nonCustomer.service.lookup(staff, { phone })).rejects.toMatchObject({ status: 409 });
  await expect(fixture().service.lookup(staff, { phone })).resolves.toEqual({ customer: null });
});
test('counter name masks every earlier word but preserves the last word and single names', () => {
  expect(maskCounterCustomerName('Nguyễn Minh Khách')).toBe('N***** M*** Khách');
  expect(maskCounterCustomerName('An')).toBe('An');
  expect(maskCounterCustomerName('  Trần   Thị  Lan ')).toBe('T*** T** Lan');
});

test('rejects invalid actor/input and delegates pet commands only for active customers', async () => {
  const f = fixture();
  await expect(f.service.lookup({ ...staff, state: 'LOCKED' }, { phone })).rejects.toMatchObject({ status: 401 });
  await expect(f.service.lookup({ ...staff, roles: ['CUSTOMER'] }, { phone })).rejects.toMatchObject({ status: 403 });
  await expect(f.service.lookup(staff, { phone: '123' })).rejects.toMatchObject({ status: 422 });
  await expect(f.service.createCustomer(staff, { displayName: '123', phone })).rejects.toMatchObject({ status: 422 });
  const body = { name: 'Milo' };
  await expect(f.service.createPet(staff, customer._id, body, 'pet-key-001')).resolves.toEqual({ id: 'pet' });
  expect(f.petCare.createPet).toHaveBeenCalledWith(customer._id, body, 'pet-key-001');
  await expect(f.service.listPets(staff, customer._id)).resolves.toEqual([]);
  expect(f.petCare.listPets).toHaveBeenCalledWith(customer._id);
  await expect(f.service.createPet(staff, customer._id, body, '')).rejects.toMatchObject({ status: 422 });
  const inactive = fixture({ found: null });
  await expect(inactive.service.createPet(staff, customer._id, body, 'pet-key-001')).rejects.toMatchObject({ status: 404 });
  expect(inactive.petCare.createPet).not.toHaveBeenCalled();
});
