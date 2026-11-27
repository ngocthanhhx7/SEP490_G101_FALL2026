import { Types } from 'mongoose';
import { AppError } from '../../utils/app-error.js';
import { createProductPricingEligibility } from '../product-sales/product-pricing-eligibility.service.js';
import { GROOMING_CATEGORIES } from '../../constants/grooming.js';

// The public catalog and pet-care management are the authoritative sources.
// Counter booking never stores its own copies of service price or customer pets.
export function createCounterDirectoryService({ connection, customers, petCare, catalog }) {
  const tiers = createProductPricingEligibility({ connection });
  const grooming = new Set(GROOMING_CATEGORIES);

  async function detail(customer) {
    if (!customer?.id || !Types.ObjectId.isValid(customer.id)) {
      throw new AppError(422, 'VALIDATION_FAILED', 'Customer identity is invalid');
    }
    const [pets, addresses, tier] = await Promise.all([
      petCare.listPets(customer.id),
      petCare.listAddresses(customer.id, true),
      tiers.read(customer.id)
    ]);
    return {
      customer: {
        ...customer,
        tierCode: tier.tierCode,
        pets: pets.map(row => ({
          id: String(row.id ?? row._id),
          name: row.name, species: row.species, breedCode: row.breedCode,
          weightKg: row.weightKg
        })),
        addresses: addresses.map(row => ({
          id: String(row.id ?? row._id), label: row.label, areaCode: row.areaCode,
          pointConfirmedAt: row.pointConfirmedAt ?? null
        }))
      }
    };
  }
  return Object.freeze({
    async lookup(actor, body) {
      const result = await customers.lookup(actor, body);
      return result.customer ? detail(result.customer) : { customer: null };
    },
    async createCustomer(actor, body) {
      const result = await customers.createCustomer(actor, body);
      return detail(result.customer);
    },
    async addPet(actor, customerId, body, key) {
      const created = await customers.createPet(actor, customerId, body, key);
      const pets = await customers.listPets(actor, customerId);
      const row = pets.find(pet => String(pet.id ?? pet._id) === String(created.id));
      if (!row) throw new AppError(409, 'RELOAD_REQUIRED', 'Pet was created; reload the list');
      return {
        id: String(created.id),
        name: row.name, species: row.species, breedCode: row.breedCode,
        weightKg: row.weightKg
      };
    },
    async addAddress(actor, customerId, body, key) {
      await customers.listPets(actor, customerId); // verifies owner is an active Customer
      const created = await petCare.createAddress(customerId, body, key);
      const addresses = await petCare.listAddresses(customerId, true);
      const row = addresses.find(address => String(address.id) === String(created.id));
      if (!row) throw new AppError(409, 'RELOAD_REQUIRED', 'Address created; reload the list');
      return { id: String(row.id), label: row.label, areaCode: row.areaCode,
        pointConfirmedAt: row.pointConfirmedAt };
    },
    petCatalog: () => petCare.catalog(),
    async services() {
      const data = await catalog.publicList();
      const rows = (data.services ?? []).filter(row => row.details?.locations?.length);
      return { available: data.available, services: rows.map(row => ({
        id: row.id, name: row.name, locations: row.details.locations,
        priceVnd: row.price?.amountVnd ?? null, unitLabel: row.price?.unitLabel ?? null,
        spa: row.details.locations.includes('FACILITY') && grooming.has(row.details.category)
      })) };
    }
  });
}
