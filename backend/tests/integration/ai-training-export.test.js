import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { beforeAll, afterAll, test, expect } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { createTrainingDatasetExporter } from '../../src/services/ai-training/dataset-export.service.js';
import { matchingModels } from '../../src/models/sitter-matching.model.js';
import { customerReviewModels } from '../../src/models/customer-review.model.js';
import { financeSourceModels } from '../../src/models/finance-source.model.js';
import { payrollModels } from '../../src/models/payroll.model.js';

let replica, connection, exporter, fixtures;
const oid = () => new mongoose.Types.ObjectId(), features = { fit: 0.6, travel: 0.8, quality: 0.9, reliability: 0.9, workload: 0.7 };
beforeAll(async () => {
  replica = await MongoMemoryReplSet.create({ binary: { version: '8.0.34' }, replSet: { count: 1 } });
  connection = await mongoose.createConnection(replica.getUri(), { dbName: 'synthetic_training_export' }).asPromise();
  exporter = createTrainingDatasetExporter({ connection });
  const { SitterVisitOutcome: Outcome } = matchingModels(connection), { CustomerVisitReview: Review } = customerReviewModels(connection);
  const { FinanceSourceEvent: Event } = financeSourceModels(connection), { PayrollServiceCredit: Credit } = payrollModels(connection);
  const customerId = oid(), sitterId = oid(), serviceId = oid();
  await connection.collection('users').insertMany([{ _id: customerId, displayName: 'Synthetic private customer' }, { _id: sitterId }]);
  fixtures = Array.from({ length: 240 }, (_, index) => {
    const bookingId = oid(), visitId = oid(), creditId = oid(), reviewId = `synthetic-review-${index}`, eventId = `synthetic-completion-${index}`;
    const decisionAt = new Date(Date.parse('2025-01-01T00:00:00Z') + index * 86400000), completedAt = new Date(decisionAt.getTime() + 3600000), occurredAt = new Date(decisionAt.getTime() + 7200000);
    const provenance = { bookingId: String(bookingId), creditId: String(creditId), completionEventId: eventId, reviewVersion: 0, visitVersion: 2, completedAt, labelVersion: 'VERIFIED_CUSTOMER_SATISFACTION_V1', trainingEligible: false };
    return { booking: { _id: bookingId, customerId, state: 'COMPLETED', completedAt, visitIds: [visitId] },
      visit: { _id: visitId, bookingId, sitterId, serviceId, state: 'COMPLETED', completedAt, startAt: new Date(decisionAt.getTime() + 60000), endAt: completedAt,
        snapshots: { serviceAddress: 'Synthetic private home; must never export' }, recommendationRef: { featureSnapshot: { version: 'PWC_MATCH_FEATURES_V1', decisionAt, slotStartAt: new Date(decisionAt.getTime() + 60000), slotEndAt: completedAt,
          featuresAsOf: Object.fromEntries(Object.keys(features).map(key => [key, decisionAt])), candidates: [{ sitterId: String(sitterId), features }] } } },
      credit: { _id: creditId, bookingId, visitId, employeeId: sitterId, completedAt, sourceVersion: 2 },
      event: { _id: eventId, bookingId: String(bookingId), type: 'BookingCompleted', at: completedAt },
      review: { _id: reviewId, visitId: String(visitId), customerId: String(customerId), sitterId: String(sitterId), state: 'SUBMITTED', direction: 'CUSTOMER_TO_SITTER',
        version: 0, rating: 1 + index % 5, createdAt: occurredAt, verifiedSource: provenance },
      outcome: { _id: oid(), visitId, sitterId, serviceId, resolution: 'COMPLETED', rating: 1 + index % 5, occurredAt, sourceRef: `customer-review:${reviewId}:0`, provenance } };
  });
  for (const [collection, field] of [[connection.collection('bookings'), 'booking'], [connection.collection('visits'), 'visit'],
    [Outcome.collection, 'outcome'], [Review.collection, 'review'], [Credit.collection, 'credit'], [Event.collection, 'event']])
    await collection.insertMany(fixtures.map(item => item[field]));
}, 180000);
afterAll(async () => { await connection?.close(); await replica?.stop(); });

test('source join exports actual captured features with opaque IDs and trainer v1 contract, dry-run reveals counts only', async () => {
  const dry = await exporter.collect(); expect(dry.summary).toMatchObject({ eligibleRows: 240, bookingGroups: 240, readyForTraining: true });
  expect(dry.rows.every(row => row === null)).toBe(true);
  const result = await exporter.collect({ key: 'synthetic-private-export-key-at-least-32-characters' });
  expect(result.rows).toHaveLength(240);
  expect(result.rows[0]).toMatchObject({ features, verified: true, rating: 1, targetScore: 0, labelVersion: 'VERIFIED_CUSTOMER_SATISFACTION_V1' });
  expect(result.rows[0].groupId).toMatch(/^[a-f0-9]{64}$/);
  const bytes = JSON.stringify(result.rows);
  expect(bytes).not.toContain(String(fixtures[0].booking._id)); expect(bytes).not.toContain('Synthetic private');
  expect(Object.keys(result.rows[0]).sort()).toEqual(['groupId', 'observationId', 'decisionAt', 'occurredAt', 'featuresAsOf', 'features', 'rating', 'targetScore', 'labelVersion', 'verified'].sort());
  expect((await exporter.collect({ limit: 20 })).summary).toMatchObject({ truncated: true, readyForTraining: false });
  // Cross-language contract proof in a temporary synthetic database/artifact only.
  const directory = await mkdtemp(join(tmpdir(), 'pwc-synthetic-export-'));
  try {
    const dataset = join(directory, 'synthetic.jsonl'), output = join(directory, 'model.json');
    await writeFile(dataset, result.rows.map(row => JSON.stringify(row)).join('\n') + '\n');
    const trained = spawnSync('python', [resolve('scripts/ai/train_model.py'), dataset, '--version', 'synthetic-export-contract', '--output', output], { encoding: 'utf8', timeout: 30000, windowsHide: true });
    expect(trained.status).toBe(0);
    const artifact = JSON.parse(await readFile(output, 'utf8')), evidence = JSON.parse(await readFile(output + '.evidence.json', 'utf8'));
    expect(artifact.state).toBe('DRAFT'); expect(artifact.trainingRows).toBeGreaterThanOrEqual(100);
    expect(evidence.testGroups).toBeGreaterThanOrEqual(10);
    expect(evidence.labelVersion).toBe('VERIFIED_CUSTOMER_SATISFACTION_V1');
  } finally { await rm(directory, { recursive: true, force: true }); }

});

test('withheld ratings, late features, changed assignee and demo accounts cannot become verified training labels', async () => {
  const { CustomerVisitReview: Review } = customerReviewModels(connection);
  await Review.collection.updateOne({ _id: fixtures[0].review._id }, { $set: { state: 'WITHHELD' } });
  await connection.collection('visits').updateOne({ _id: fixtures[1].visit._id }, { $set: { 'recommendationRef.featureSnapshot.featuresAsOf.fit': '2026-01-01T00:00:00Z' } });
  await connection.collection('visits').updateOne({ _id: fixtures[2].visit._id }, { $set: { sitterId: oid() } });
  const result = await exporter.collect(); expect(result.summary.eligibleRows).toBe(237);
  expect(result.summary.excluded).toMatchObject({ REVIEW_SOURCE_CHANGED_OR_WITHHELD: 1, INVALID_OR_LATE_FEATURES: 1, DEMO_OR_MISSING_ACCOUNT: 1 });
  await connection.collection('users').updateOne({ _id: fixtures[0].booking.customerId }, { $set: { fixtureKey: 'synthetic-demo-only' } });
  const demo = await exporter.collect(); expect(demo.summary.eligibleRows).toBe(0); expect(demo.summary.readyForTraining).toBe(false);
});
