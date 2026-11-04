import { createHash, createHmac } from 'node:crypto';
import { Types } from 'mongoose';
import { employmentDocumentModels } from '../../models/employment-document.model.js';
import { payrollModels } from '../../models/payroll.model.js';
import { sitterApplicationModels } from '../../models/sitter-application.model.js';
import { employmentTermsInput, contractDate } from '../../validators/employment-document.validator.js';
import { exact, id, number, fail } from '../../validators/pet-care.validator.js';
import { createUnitOfWork } from '../unit-of-work.service.js';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const TEMPLATE = 'PWC-VN-LABOUR-2026-11-05-v1';
export function createEmploymentDocumentService({ connection, crypto, lookupSecret, clock = Date.now }) {
  if (typeof lookupSecret !== 'string' || lookupSecret.length < 32 || typeof crypto?.encrypt !== 'function' || typeof crypto?.decrypt !== 'function') throw new TypeError('Private crypto and identity lookup key required');
  const { EmploymentDocument: Document, EmploymentDocumentCounter: Counter, EmploymentDocumentCommand: Command } = employmentDocumentModels(connection);
  const { SitterApplication: Application } = sitterApplicationModels(connection), { EmploymentContract: Contract } = payrollModels(connection), uow = createUnitOfWork(connection);
  const admin = actor => { if (actor?.state !== 'ACTIVE' || !actor.roles?.includes('ADMIN')) fail('FORBIDDEN', 'Admin required', 403); id(actor.userId); };
  function view(row) {
    const terms = JSON.parse(crypto.decrypt(row.encryptedTerms));
    if (hash(terms) !== row.termsHash) fail('CONTRACT_INTEGRITY_FAILED', 'Contract integrity failed', 409);
    return { id: String(row._id), applicationId: String(row.applicationId), revision: row.revision, reference: row.reference, employeeCode: row.employeeCode,
      archiveReference: row.archiveReference ?? null, state: row.state, templateVersion: row.templateVersion, termsHash: row.termsHash, terms, signedAt: row.signedAt ?? null, createdAt: row.createdAt };
  }
  async function command(actor, applicationId, body, key, work) {
    admin(actor); id(applicationId);
    if (typeof key !== 'string' || !/^[A-Za-z0-9_:-]{8,128}$/.test(key)) fail('VALIDATION_FAILED', 'Operation key required');
    const commandId = hash([actor.userId, applicationId, key]), fingerprint = hash(body);
    for (let attempt = 0; ; attempt++) try {
      return await uow.run(async session => {
        const user = await connection.collection('users').findOneAndUpdate({ _id: new Types.ObjectId(actor.userId), roles: 'ADMIN', state: 'ACTIVE', synthetic: { $ne: true },
          ...(actor.authEpoch !== undefined ? { authEpoch: actor.authEpoch } : {}) }, { $inc: { contractGuard: 1 } }, { session, returnDocument: 'after' });
        if (!user) fail('FORBIDDEN', 'Current Admin required', 403);
        const prior = await Command.findById(commandId).session(session).lean();
        if (prior) { if (prior.fingerprint !== fingerprint) fail('IDEMPOTENCY_CONFLICT', 'Operation key reused', 409); return view(await Document.findById(prior.documentId).select('+encryptedTerms +archiveReference').session(session).lean()); }
        const application = await Application.findOneAndUpdate({ _id: applicationId, state: 'INTERVIEW' }, { $inc: { contractGuard: 1 } }, { session, returnDocument: 'after' }).select('+identityLookupKey').lean();
        if (!application) fail('APPLICATION_STAGE_REQUIRED', 'Contract preparation requires interview stage', 409);
        const result = await work(application, session);
        await Command.create([{ _id: commandId, fingerprint, documentId: result._id }], { session });
        return view(result);
      });
    } catch (error) { if (error.code !== 11000 || attempt >= 2) throw error; }
  }
  return {
    async get(actor, applicationId) {
      admin(actor); id(applicationId);
      if (!await Application.exists({ _id: applicationId })) fail('RESOURCE_NOT_FOUND', 'Application unavailable', 404);
      const rows = await Document.find({ applicationId }).sort({ revision: -1 }).limit(20).select('+encryptedTerms +archiveReference').lean();
      await payrollModels(connection).PayrollEvent.create({ actorId: actor.userId, resourceId: applicationId, type: 'CONTRACT_READ', at: new Date(clock()) });
      return { current: rows.length ? view(rows[0]) : null, history: rows.map(row => ({ id: String(row._id), reference: row.reference, state: row.state, revision: row.revision })) };
    },
    async save(actor, applicationId, body, key) {
      admin(actor); exact(body, ['expectedRevision', 'applicationVersion', 'terms'], ['expectedRevision', 'applicationVersion', 'terms']);
      number(body.expectedRevision, 0, 100000, true); number(body.applicationVersion, 0, 100000, true);
      const terms = employmentTermsInput(body.terms, clock());
      return command(actor, applicationId, body, key, async (application, session) => {
        if (createHmac('sha256', lookupSecret).update('applicant-identity\0' + terms.identityNumber.toUpperCase()).digest('hex') !== application.identityLookupKey) fail('CONTRACT_IDENTITY_MISMATCH', 'Identity must match the application verified by Admin', 409);
        if (application.version !== body.applicationVersion) fail('VERSION_CONFLICT', 'Application changed', 409);
        const prior = await Document.findOne({ applicationId }).sort({ revision: -1 }).session(session).lean();
        if ((prior?.revision ?? 0) !== body.expectedRevision || prior?.state === 'SIGNED') fail('VERSION_CONFLICT', 'Reload contract state', 409);
        const counter = await Counter.findOneAndUpdate({ _id: 'employment' }, { $inc: { value: 1 } }, { upsert: true, returnDocument: 'after', session }).lean();
        const sequence = String(counter.value).padStart(6, '0'), year = new Date(clock()).getUTCFullYear();
        const [row] = await Document.create([{ applicationId, applicationVersion: application.version, revision: body.expectedRevision + 1,
          reference: `HDLD-${year}-${sequence}`, employeeCode: prior?.employeeCode ?? `NV-${year}-${sequence}`, templateVersion: TEMPLATE,
          state: 'DRAFT', encryptedTerms: crypto.encrypt(JSON.stringify(terms)), termsHash: hash(terms), createdBy: actor.userId, createdAt: new Date(clock()) }], { session });
        return row.toObject();
      });
    },
    async decide(actor, applicationId, documentId, body, key) {
      admin(actor); id(documentId); exact(body, ['action', 'termsHash', 'signedOn', 'archiveReference', 'bothPartiesSigned'], ['action', 'termsHash']);
      if (!['ISSUE', 'SIGN'].includes(body.action)) fail('VALIDATION_FAILED', 'Invalid contract action');
      let signedAt;
      if (body.action === 'SIGN') {
        signedAt = contractDate(body.signedOn);
        if (signedAt > clock() || body.bothPartiesSigned !== true || typeof body.archiveReference !== 'string' || !body.archiveReference.trim() || body.archiveReference.length > 160 || /[\x00-\x1f\x7f]/.test(body.archiveReference)) fail('VALIDATION_FAILED', 'Both signatures, actual signing date and physical archive location required');
      } else if (body.signedOn || body.archiveReference || body.bothPartiesSigned !== undefined) fail('VALIDATION_FAILED', 'Unexpected signing data');
      return command(actor, applicationId, { documentId, ...body }, key, async (application, session) => {
        const row = await Document.findOne({ _id: documentId, applicationId }).select('+encryptedTerms +archiveReference').session(session).lean();
        const latest = await Document.findOne({ applicationId }).sort({ revision: -1 }).session(session).lean();
        if (!row || String(latest._id) !== documentId || row.applicationVersion !== application.version || row.termsHash !== body.termsHash || row.state !== (body.action === 'ISSUE' ? 'DRAFT' : 'ISSUED')) fail('VERSION_CONFLICT', 'Current contract revision required', 409);
        const terms = view(row).terms;
        if (signedAt && (body.signedOn !== terms.plannedSigningOn || signedAt < new Date(new Date(new Date(row.issuedAt).getTime() + 7 * 3600000).toISOString().slice(0,10) + 'T00:00:00+07:00') || signedAt > contractDate(terms.effectiveOn))) fail('VALIDATION_FAILED', 'Sign after issuing and before effective date');
        return Document.findByIdAndUpdate(documentId, { $set: body.action === 'ISSUE' ? { state: 'ISSUED', issuedAt: new Date(clock()) }
          : { state: 'SIGNED', signedAt, verifiedAt: new Date(clock()), verifiedBy: actor.userId, archiveReference: body.archiveReference.trim() } }, { session, returnDocument: 'after' }).select('+encryptedTerms +archiveReference').lean();
      });
    },
    async activate(application, employeeId, actor, session) {
      const row = await Document.findOne({ applicationId: application._id }).sort({ revision: -1 }).select('+encryptedTerms +archiveReference').session(session).lean();
      if (!row || row.state !== 'SIGNED' || row.applicationVersion !== application.version) fail('SIGNED_CONTRACT_REQUIRED', 'Prepare, print and verify signed contract before approval', 409);
      const terms = view(row).terms;
      if (await Contract.exists({ employeeId }).session(session)) fail('VERSION_CONFLICT', 'Employee already has a contract', 409);
      await Contract.create([{ employeeId, version: 1, employmentType: terms.employmentType, salaryBasis: 'GROSS', monthlyBaseVnd: terms.monthlyBaseVnd,
        monthlyAllowanceVnd: terms.monthlyAllowanceVnd, payCycle: terms.payCycle, weeklyMinutes: terms.weeklyMinutes, effectiveAt: contractDate(terms.effectiveOn),
        ...(terms.endsOn ? { endsAt: contractDate(terms.endsOn) } : {}), signedAt: row.signedAt, contractReference: row.reference,
        workplaceRegion: terms.workplaceRegion, workplaceReference: terms.workplaceReference, verifiedBy: row.verifiedBy, recordedAt: new Date(clock()),
        documentId: row._id, employeeCode: row.employeeCode, schedule: { weekdays: terms.weekdays, dailyMinutes: terms.dailyMinutes }, paySchedule: terms.paySchedule }], { session });
      await Document.updateOne({ _id: row._id, state: 'SIGNED' }, { $set: { state: 'ACTIVATED', employeeId } }, { session });
      await payrollModels(connection).PayrollEvent.create([{ actorId: actor.userId, employeeId, resourceId: row._id, type: 'CONTRACT_RECORDED', reason: 'Signed application contract activated', at: new Date(clock()) }], { session });
    }
  };
}
