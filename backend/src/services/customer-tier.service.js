import { randomUUID } from 'node:crypto';
import { CUSTOMER_TIERS } from '../models/customer-tier.model.js';

const VIETNAM_OFFSET_MS = 7 * 3600000;
const PAGE_SIZE = 100;
const validMoney = value => Number.isSafeInteger(value) && value >= 0;
const validDate = value => value instanceof Date && Number.isFinite(value.getTime());

export function customerTierDay(asOf) {
  return new Date(asOf.getTime() + VIETNAM_OFFSET_MS).toISOString().slice(0, 10);
}

export function customerTierWindow(asOf) {
  const local = new Date(asOf.getTime() + VIETNAM_OFFSET_MS);
  const day = local.getUTCDate();
  local.setUTCFullYear(local.getUTCFullYear() - 1, local.getUTCMonth() + 1, 0);
  local.setUTCDate(Math.min(day, local.getUTCDate()));
  return { from: new Date(local.getTime() - VIETNAM_OFFSET_MS), asOf };
}

function assertPolicy(policy) {
  const thresholds = policy?.thresholds;
  if (!Number.isSafeInteger(policy?.version) || policy.version < 1
    || CUSTOMER_TIERS.some(tier => !validMoney(thresholds?.[tier]) || !validMoney(policy.discountsBps?.[tier]) || policy.discountsBps[tier] > 10000)
    || thresholds.MEMBER !== 0 || thresholds.SILVER <= 0 || thresholds.GOLD <= thresholds.SILVER) {
    throw new Error('Invalid customer tier policy');
  }
}

export function chooseCustomerTier({ totalVnd, currentTier, incomplete = false, policy }) {
  const { SILVER, GOLD } = policy.thresholds;
  const tier = totalVnd >= GOLD ? 'GOLD' : totalVnd >= SILVER ? 'SILVER' : 'MEMBER';
  const held = incomplete && CUSTOMER_TIERS.indexOf(tier) <= CUSTOMER_TIERS.indexOf(currentTier);
  return { tier: held ? currentTier : tier, held };
}

function collectSpend(totals, rows, { from, asOf }) {
  for (const row of rows) {
    const total = totals.get(String(row.customerId));
    if (!total) throw new Error('Customer tier source returned an unexpected customer');
    if (!validDate(row.recordedAt)) {
      total.incomplete = true;
      continue;
    }
    if (row.recordedAt < from || row.recordedAt >= asOf) continue;
    if (!validMoney(row.amountVnd) || !validMoney(total.totalVnd + row.amountVnd)) {
      throw new Error('Invalid customer tier source amount');
    }
    total.totalVnd += row.amountVnd;
  }
}

function productSpend(orders, { from, asOf }) {
  return orders.map(order => {
    let recordedAt;
    if (order.paymentMethod === 'COD' && order.status === 'DELIVERED') recordedAt = order.deliveredAt;
    // A pickup already paid in the snapshot was collected no earlier than creation.
    // Creation inside the window proves inclusion without asserting it is the payment time.
    if (order.paymentMethod === 'PAY_AT_SHOP' && validDate(order.createdAt) && order.createdAt >= from) {
      recordedAt = order.createdAt;
    }
    if (validDate(order.createdAt) && order.createdAt >= asOf) recordedAt = order.createdAt;
    return { customerId: order.customerId, amountVnd: order.total, recordedAt };
  });
}

export function createCustomerTierService({ repository, clock = Date.now, logger = () => {}, additionalSources = [] }) {
  const now = () => new Date(clock());

  return Object.freeze({
    async read(customerId) {
      return repository.withSnapshot(async session => {
        if (!await repository.isCustomer(customerId, session)) return null;
        const policy = await repository.readPolicy(session);
        assertPolicy(policy);
        const tier = (await repository.readTiers([customerId], session))[0]?.tier ?? 'MEMBER';
        if (!CUSTOMER_TIERS.includes(tier)) throw new Error('Invalid stored customer tier');
        return { tier, discountBps: policy.discountsBps[tier] };
      });
    },

    async run({ resume = false, day = customerTierDay(now()) } = {}) {
      let lease;
      let phase = 'storage';
      let collecting = false;
      try {
        await repository.assertStorage();
        phase = 'lease';
        lease = await repository.acquireLease(randomUUID(), now());
        if (!lease) return { status: 'BUSY', day };
        const existing = await repository.readRun(day);
        if (existing?.status === 'COMPLETED') return existing.summary;
        if (existing && !(resume && existing.status === 'READY')) return { status: existing.status, day };
        if (existing && await repository.hasNewerResults(day)) return { status: 'SUPERSEDED', day };
        if (!existing && day !== customerTierDay(now())) throw new Error('Historical customer tier snapshot is unavailable');

        let run = existing;
        if (!run) {
          phase = 'snapshot';
          run = await repository.withSnapshot(async session => {
            const policy = await repository.readPolicy(session);
            assertPolicy(policy);
            const window = customerTierWindow(now());
            const record = { _id: day, ...window, policyVersion: policy.version };
            await repository.beginRun(record, lease, now());
            collecting = true;
            let after = null, customers = 0, held = 0;
            const expiresAt = new Date(Date.now() + 7 * 86400000);
            for (;;) {
              phase = 'customers';
              const ids = await repository.listCustomers(after, PAGE_SIZE, session);
              if (!ids.length) break;
              const previous = new Map((await repository.readTiers(ids, session)).map(row => [String(row._id), row.tier]));
              const totals = new Map(ids.map(id => [String(id), { totalVnd: 0, incomplete: false }]));
              phase = 'booking_payments';
              collectSpend(totals, await repository.readReceipts(ids, window, session), window);
              phase = 'product_orders';
              collectSpend(totals, productSpend(await repository.readOrders(ids, session), window), window);
              for (const readSource of additionalSources) {
                phase = 'additional_sources';
                collectSpend(totals, await readSource(ids, window, session), window);
              }
              phase = 'stage';
              const rows = ids.map(customerId => {
                const spend = totals.get(String(customerId));
                const result = chooseCustomerTier({ ...spend, currentTier: previous.get(String(customerId)) ?? 'MEMBER', policy });
                if (result.held) held += 1;
                return { runId: day, customerId, ...spend, ...result, expiresAt };
              });
              await repository.stage(rows, lease, now());
              customers += rows.length;
              after = ids.at(-1);
            }
            phase = 'ready';
            const ready = { ...record, status: 'READY', customers, held, expiresAt };
            await repository.markReady(ready, lease, now());
            collecting = false;
            return ready;
          });
        }

        phase = 'apply';
        await repository.assertResults(run);
        let after = null, applied = 0, processed = 0;
        for (;;) {
          const rows = await repository.listResults(day, after, PAGE_SIZE);
          if (!rows.length) break;
          applied += await repository.applyResults(run, rows, lease, now());
          processed += rows.length;
          after = rows.at(-1).customerId;
        }
        if (processed !== run.customers) throw new Error('Customer tier results are incomplete');
        const summary = { status: 'COMPLETED', day, asOf: run.asOf.toISOString(), policyVersion: run.policyVersion, customers: run.customers, applied, held: run.held };
        await repository.complete(day, summary, lease, now());
        logger({ event: 'customer_tier_run_completed', ...summary });
        return summary;
      } catch (error) {
        logger({ event: 'customer_tier_run_failed', day, phase, code: error.code ?? 'CUSTOMER_TIER_RUN_FAILED' });
        if (collecting) await repository.markFailed(day, phase, lease, now())
          .catch(() => logger({ event: 'customer_tier_failure_state_unavailable', day }));
        throw error;
      } finally {
        if (lease) await repository.releaseLease(lease)
          .catch(() => logger({ event: 'customer_tier_release_failed', day }));
      }
    }
  });
}
