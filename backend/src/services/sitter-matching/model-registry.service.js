import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import { exact, fail, id, number, weights, digest, instant } from '../../validators/pet-care.validator.js';
import { createUnitOfWork } from '../unit-of-work.service.js';

const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
function content(model) {
  return { version: model.version, weights: Object.fromEntries(['fit', 'travel', 'quality', 'reliability', 'workload'].map(key => [key, model.weights[key]])),
    trainingRows: model.trainingRows, testMae: model.testMae, baselineMae: model.baselineMae, testGroups: model.testGroups,
    trainedUntil: new Date(model.trainedUntil).toISOString() };
}
function validateArtifact(artifact, clock) {
  exact(artifact, ['version', 'weights', 'trainingRows', 'testMae', 'baselineMae', 'testGroups', 'trainedUntil', 'state'],
    ['version', 'weights', 'trainingRows', 'testMae', 'baselineMae', 'testGroups', 'trainedUntil', 'state']);
  if (!text(artifact.version, 80) || artifact.state !== 'DRAFT' || instant(artifact.trainedUntil) > clock()) fail('VALIDATION_FAILED', 'A past DRAFT trainer artifact is required');
  weights(artifact.weights); number(artifact.trainingRows, 100, 100000000, true); number(artifact.testGroups, 10, 10000000, true);
  number(artifact.testMae, 0, 100); number(artifact.baselineMae, 0, 100);
}
function evidenceFor(artifactJson, artifact, evidence, clock) {
  const hash = createHash('sha256').update(artifactJson).digest('hex');
  exact(evidence, ['labelVersion', 'datasetSha256', 'artifactSha256', 'trainingRows', 'testRows', 'testGroups', 'purgedRows', 'latestTrainingOutcome', 'earliestTestDecision', 'sourceVerification', 'state'],
    ['labelVersion', 'datasetSha256', 'artifactSha256', 'trainingRows', 'testRows', 'testGroups', 'purgedRows', 'latestTrainingOutcome', 'earliestTestDecision', 'sourceVerification', 'state']);
  if (evidence.artifactSha256 !== hash || !/^[a-f0-9]{64}$/.test(evidence.datasetSha256) ||
    evidence.labelVersion !== 'VERIFIED_CUSTOMER_SATISFACTION_V1' || evidence.sourceVerification !== 'OPERATOR_ATTESTED_REQUIRES_INDEPENDENT_REVIEW' ||
    evidence.state !== 'DRAFT' || evidence.trainingRows !== artifact.trainingRows || evidence.testGroups !== artifact.testGroups)
    fail('MODEL_EVIDENCE_INVALID', 'Trainer artifact and evidence do not match', 409);
  number(evidence.testRows, evidence.testGroups, 100000000, true); number(evidence.purgedRows, 0, 100000000, true);
  if (evidence.trainingRows + evidence.testRows + evidence.purgedRows < 200 ||
    instant(evidence.latestTrainingOutcome) >= instant(evidence.earliestTestDecision) || instant(evidence.earliestTestDecision) > instant(artifact.trainedUntil) ||
    instant(evidence.latestTrainingOutcome) > clock()) fail('MODEL_EVIDENCE_INVALID', 'Chronological source evidence required', 409);
  return hash;
}
export function createModelRegistry({ repository, clock = Date.now }) {
  const { models, connection } = repository, Model = models.SitterRankModel, Audit = models.SitterRankModelReview;
  const uow = createUnitOfWork(connection);
  const authorized = actor => { if (actor?.state !== 'ACTIVE' || !actor.roles?.includes('ADMIN')) fail('FORBIDDEN', 'Admin required', 403); };
  const view = model => ({ id: String(model._id), version: model.version, state: model.state, reviewVersion: model.reviewVersion ?? 0,
    weights: Object.fromEntries(['fit', 'travel', 'quality', 'reliability', 'workload'].map(key => [key, model.weights?.[key] ?? null])), trainingRows: model.trainingRows, testMae: model.testMae, baselineMae: model.baselineMae,
    testGroups: model.testGroups, trainedUntil: model.trainedUntil, approvedAt: model.approvedAt ?? null,
    artifactSha256: model.artifactSha256 ?? null, evidenceAttached: Boolean(model.artifactSha256), improved: model.testMae < model.baselineMae });
  return {
    async status(actor) {
      authorized(actor);
      const now = new Date(clock());
      const [latest, totalModels, outcomes, verifiedCandidates, capturedVisits, policy, active] = await Promise.all([
        Model.find().sort({ createdAt: -1, _id: -1 }).limit(20).lean(), Model.countDocuments(),
        models.SitterVisitOutcome.countDocuments(), models.SitterVisitOutcome.countDocuments({ 'provenance.labelVersion': 'VERIFIED_CUSTOMER_SATISFACTION_V1', sourceRef: /^customer-review:/ }),
        connection.collection('visits').countDocuments({ $or: [{ 'recommendationRef.featureSnapshot.version': 'PWC_MATCH_FEATURES_V1' }, { 'assignedFeatureSnapshot.version': 'PWC_MATCH_FEATURES_V1' }] }),
        models.SitterRankingPolicy.findOne({ status: 'APPROVED', effectiveAt: { $lte: now }, approvedAt: { $lte: now, $ne: null } }).sort({ version: -1 }).lean(),
        Model.findOne({ state: 'APPROVED', approvedAt: { $lte: now, $ne: null }, trainedUntil: { $lte: now } }).sort({ approvedAt: -1 }).lean()
      ]);
      let usable = false;
      try { usable = !!active && digest(content(active)) === active.sha256 && active.testMae < active.baselineMae; if (usable) weights(active.weights); }
      catch { usable = false; }
      return { rankingSource: usable ? 'APPROVED_ADDITIVE_MODEL' : 'EXPLAINABLE_RULES', activeModel: usable ? view(active) : null,
        fallbackReason: active && !usable ? 'MODEL_VALIDATION_FAILED' : !active ? 'NO_APPROVED_MODEL' : null,
        policyVersion: policy?.version ?? null, policyWeights: policy?.weights ?? null, models: latest.map(view), totalModels, historyTruncated: totalModels > latest.length,
        data: { outcomes, verifiedCandidates, capturedVisits, minimumObservations: 200, minimumBookingGroups: 50, requiresSourceJoinAudit: true }, asOf: now };
    },
    async importArtifact(actor, body) {
      authorized(actor); exact(body, ['artifactJson', 'evidence'], ['artifactJson', 'evidence']);
      if (typeof body.artifactJson !== 'string' || Buffer.byteLength(body.artifactJson) > 32000) fail('VALIDATION_FAILED', 'Artifact JSON must be at most 32 KB');
      let artifact; try { artifact = JSON.parse(body.artifactJson); } catch { fail('VALIDATION_FAILED', 'Invalid artifact JSON'); }
      validateArtifact(artifact, clock);
      const artifactSha256 = evidenceFor(body.artifactJson, artifact, body.evidence, clock);
      for (let attempt = 0; ; attempt++) {
        const prior = await Model.findOne({ version: artifact.version }).select('+trainingEvidence').lean();
        if (prior) { if (prior.artifactSha256 !== artifactSha256 || digest(prior.trainingEvidence) !== digest(body.evidence)) fail('VERSION_CONFLICT', 'Model version already has different bytes or evidence', 409); return view(prior); }
        try {
          const saved = await Model.create({ ...content(artifact), state: 'DRAFT', sha256: digest(content(artifact)), importedBy: actor.userId,
            artifactJson: body.artifactJson, artifactSha256, trainingEvidence: body.evidence, reviewVersion: 0 });
          return view(saved.toObject());
        } catch (error) { if (error.code !== 11000 || attempt >= 2) throw error; }
      }
    },
    async review(actor, modelId, body, key) {
      authorized(actor); id(modelId);
      exact(body, ['expectedVersion', 'action', 'reason', 'reviewReference'], ['expectedVersion', 'action', 'reason', 'reviewReference']);
      number(body.expectedVersion, 0, 1000000, true);
      if (!['APPROVE', 'RETIRE'].includes(body.action) || !text(body.reason, 1000) || !text(body.reviewReference, 500) || !text(key, 128) || key.length < 8)
        fail('VALIDATION_FAILED', 'Review action, source-review reference, reason and operation key required');
      const commandId = digest([actor.userId, 'MODEL_REVIEW', key]), fingerprint = digest([modelId, body]);
      for (let attempt = 0; ; attempt++) {
        try { return await uow.run(async session => {
          await Audit.findOneAndUpdate({ _id: 'activation-guard' }, { $inc: { guardVersion: 1 } }, { session, upsert: true });
          const user = await connection.collection('users').findOneAndUpdate({ _id: new Types.ObjectId(actor.userId), state: 'ACTIVE', roles: 'ADMIN', synthetic: { $ne: true },
            ...(actor.authEpoch !== undefined ? { authEpoch: actor.authEpoch } : {}) }, { $inc: { modelReviewGuard: 1 } }, { session, returnDocument: 'after' });
          if (!user) fail('FORBIDDEN', 'Current Admin account required', 403);
          const prior = await Audit.findById(commandId).session(session).lean();
          if (prior) { if (prior.fingerprint !== fingerprint) fail('IDEMPOTENCY_CONFLICT', 'Review key reused for different input', 409); return prior.result; }
          const model = await Model.findById(modelId).select('+artifactJson +trainingEvidence').session(session).lean();
          if (!model || (model.reviewVersion ?? 0) !== body.expectedVersion) fail('VERSION_CONFLICT', 'Reload model history before reviewing', 409);
          if (body.action === 'APPROVE') {
            if (!model.artifactJson || !model.trainingEvidence) fail('MODEL_EVIDENCE_REQUIRED', 'Import the original trainer artifact and evidence before approval', 409);
            const artifact = JSON.parse(model.artifactJson); validateArtifact(artifact, clock);
            if (evidenceFor(model.artifactJson, artifact, model.trainingEvidence, clock) !== model.artifactSha256)
              fail('MODEL_EVIDENCE_INVALID', 'Stored artifact checksum differs', 409);
            if (digest(content(model)) !== model.sha256 || digest(content(artifact)) !== model.sha256) fail('MODEL_EVIDENCE_INVALID', 'Stored weights differ from imported artifact', 409);
            if (model.testMae >= model.baselineMae) fail('MODEL_NOT_IMPROVED', 'Held-out error must beat baseline', 409);
            // Serialize activation across Admin accounts, retaining prior models
            // for explicit reviewed rollback instead of ambiguous timestamp ties.
            await Model.updateMany({ _id: { $ne: model._id }, state: 'APPROVED' },
              { $set: { state: 'RETIRED' }, $inc: { reviewVersion: 1 } }, { session });
          }
          const changed = await Model.findOneAndUpdate({ _id: model._id, $or: [{ reviewVersion: body.expectedVersion }, ...(body.expectedVersion === 0 ? [{ reviewVersion: { $exists: false } }] : [])] },
            { $set: { state: body.action === 'APPROVE' ? 'APPROVED' : 'RETIRED', ...(body.action === 'APPROVE' ? { approvedBy: actor.userId, approvedAt: new Date(clock()) } : {}) },
              $inc: { reviewVersion: 1 } }, { session, returnDocument: 'after' }).lean();
          if (!changed) fail('VERSION_CONFLICT', 'Model changed', 409);
          const result = view(changed);
          await Audit.create([{ _id: commandId, modelId: model._id, actorId: actor.userId, action: body.action, reason: body.reason,
            reviewReference: body.reviewReference, fingerprint, result }], { session });
          return result;
        }); } catch (error) { if (error.code !== 11000 || attempt >= 2) throw error; }
      }
    }
  };
}
