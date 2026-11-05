import { createHmac } from 'node:crypto';
import { beforeAll, afterAll, test, expect } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { createEmploymentDocumentService } from '../../src/services/payroll/employment-document.service.js';
import { employmentDocumentModels } from '../../src/models/employment-document.model.js';
import { createContactCrypto } from '../../src/services/contact-crypto.service.js';
import { createPayrollService } from '../../src/services/payroll/payroll.service.js';
import { employeePayrollPolicyResolver } from '../../src/constants/employee-payroll-policy.js';
import { employmentTerms } from '../fixtures/employment-terms.js';
import { employmentTermsInput } from '../../src/validators/employment-document.validator.js';
let replica, connection, service, appId, admin, crypto;
const oid = () => new mongoose.Types.ObjectId(), clock = () => Date.parse('2026-11-05T03:00:00Z');
beforeAll(async () => {
  replica=await MongoMemoryReplSet.create({binary:{version:'8.0.34'},replSet:{count:1}});
  connection=await mongoose.createConnection(replica.getUri(),{dbName:'synthetic_contract_lifecycle'}).asPromise();
  crypto=createContactCrypto({lookupSecret:'synthetic-contract-lookup-secret-32-chars',encryptionKey:'0123456789abcdef0123456789abcdef'});
  service=createEmploymentDocumentService({connection,crypto,lookupSecret:'synthetic-contract-lookup-secret-32-chars',clock}); appId=oid();admin={userId:String(oid()),roles:['ADMIN'],state:'ACTIVE',authEpoch:0};
  await connection.collection('users').insertOne({_id:new mongoose.Types.ObjectId(admin.userId),roles:['ADMIN'],state:'ACTIVE',synthetic:false,authEpoch:0});
  await connection.collection('sitterapplications').insertOne({_id:appId,state:'INTERVIEW',version:2,displayName:'Synthetic employee',identityLookupKey:createHmac('sha256','synthetic-contract-lookup-secret-32-chars').update('applicant-identity\0'+'012345678901').digest('hex')});
  for(const model of Object.values(connection.models)){await model.createCollection();await model.createIndexes();}
},180000);
afterAll(async()=>{await connection?.close();await replica?.stop();});
test('immutable encrypted document is issued, actually signed then activated atomically as payroll source',async()=>{
  const terms=employmentTerms({effectiveOn:'2026-11-06',plannedSigningOn:'2026-11-05'}),body={applicationVersion:2,expectedRevision:0,terms};
  const draft=await service.save(admin,String(appId),body,'synthetic-contract-save');
  expect(draft).toMatchObject({state:'DRAFT',revision:1});expect(draft.employeeCode).toMatch(/^NV-/);expect(draft.reference).toMatch(/^HDLD-/);
  const raw=await employmentDocumentModels(connection).EmploymentDocument.findById(draft.id).select('+encryptedTerms').lean();
  expect(JSON.stringify(raw)).not.toContain(terms.identityNumber);expect(JSON.stringify(raw)).not.toContain('Synthetic residence');
  expect((await service.save(admin,String(appId),body,'synthetic-contract-save')).id).toBe(draft.id);
  await expect(service.save(admin,String(appId),{...body,terms:{...terms,monthlyBaseVnd:11000000}},'synthetic-contract-save')).rejects.toMatchObject({code:'IDEMPOTENCY_CONFLICT'});
  await expect(service.decide(admin,String(appId),draft.id,{action:'SIGN',termsHash:draft.termsHash,signedOn:'2026-11-05',archiveReference:'Synthetic paper archive',bothPartiesSigned:true},'synthetic-early-sign')).rejects.toMatchObject({code:'VERSION_CONFLICT'});
  await service.decide(admin,String(appId),draft.id,{action:'ISSUE',termsHash:draft.termsHash},'synthetic-contract-issue');
  await expect(service.decide(admin,String(appId),draft.id,{action:'SIGN',termsHash:draft.termsHash,signedOn:'2026-11-07',archiveReference:'Synthetic archive',bothPartiesSigned:true},'synthetic-future-sign')).rejects.toMatchObject({code:'VALIDATION_FAILED',details:{fields:{signedOn:'SIGNING_DATE'}}});
  await service.decide(admin,String(appId),draft.id,{action:'SIGN',termsHash:draft.termsHash,signedOn:'2026-11-05',archiveReference:'Synthetic paper archive',bothPartiesSigned:true},'synthetic-contract-sign');
  const employeeId=oid();
  await connection.transaction(async session=>{const application=await connection.collection('sitterapplications').findOne({_id:appId},{session});await service.activate(application,employeeId,admin,session);});
  const contract=await connection.models.EmploymentContract.findOne({employeeId}).lean();
  expect(contract).toMatchObject({employeeCode:draft.employeeCode,monthlyBaseVnd:10000000,workScheduleMode:'SELF_REGISTERED',minimumWeeklyMinutes:2400,weeklyMinutes:2400,version:1});
  expect((await service.get(admin,String(appId))).current.state).toBe('ACTIVATED');
  await expect(service.get({...admin,roles:['STAFF']},String(appId))).rejects.toMatchObject({code:'FORBIDDEN'});
});
test('contract legal bounds reject missing terms, below-floor pay, excess hours and overlong fixed term',()=>{
  for(const over of [{employerName:''},{monthlyBaseVnd:1000000},{weekdays:[1,2,3,4,5]},{termType:'FIXED',effectiveOn:'2026-11-06',endsOn:'2030-11-06'}])
    expect(()=>employmentTermsInput(employmentTerms(over),clock())).toThrow();
});
test('payroll derives calendar and allowances without treating absent service work as absent attendance; source changes conflict',async()=>{
  const payroll=createPayrollService({connection,clock:()=>new Date('2026-12-01T03:00:00Z'),policy:employeePayrollPolicyResolver});
  const employeeId=oid();await connection.collection('users').insertOne({_id:employeeId,roles:['PET_SITTER'],state:'ACTIVE',displayName:'Synthetic payroll employee'});
  await payroll.models.EmploymentContract.create({employeeId,version:1,employmentType:'FULL_TIME',salaryBasis:'GROSS',monthlyBaseVnd:10000000,monthlyAllowanceVnd:1000000,payCycle:'MONTHLY',weeklyMinutes:2400,
    effectiveAt:new Date('2026-10-01'),signedAt:new Date('2026-09-30'),contractReference:'SYNTHETIC-PAYROLL',workplaceRegion:1,workplaceReference:'Synthetic I',verifiedBy:admin.userId,recordedAt:new Date(),schedule:{weekdays:[1,2,3,4,5],dailyMinutes:480}});
  for(const model of Object.values(payroll.models)){await model.createCollection();await model.createIndexes();}
  const input={employeeId:String(employeeId),periodStart:'2026-11-01',periodEnd:'2026-12-01',dueAt:'2026-12-05',unpaidMinutes:0,attendanceReference:'synthetic-timecard',attendanceConfirmed:true,
    statutoryReference:'synthetic-statutes',statutoryConfirmed:true,overtimeVnd:0,employeeInsuranceVnd:1050000,incomeTaxVnd:0,otherLawfulDeductionsVnd:0,deductionConsentReference:'synthetic-none'};
  const preview=await payroll.previewStatement(admin,input);
  expect(preview.breakdown).toMatchObject({baseVnd:10000000,allowanceVnd:1000000,commissionVnd:0,payableVnd:9950000});
  expect(preview.serviceCredits).toBe(0);expect(preview.scheduledMonthMinutes).toBe(preview.paidPeriodMinutes);
  const saved=await payroll.prepareAutomaticStatement(admin,{input,sourceHash:preview.sourceHash},'synthetic-auto-payroll');
  expect(saved.status).toBe('PREPARED');expect(saved.reference).toMatch(/^PL-/);
  await payroll.models.PayrollServiceCredit.create({employeeId,visitId:oid(),bookingId:oid(),completedAt:new Date('2026-11-10'),serviceNetVnd:100000,careMinutes:60,onTime:true,reportsComplete:true,sourceVersion:1,policyVersion:'synthetic'});
  expect(await payroll.prepareAutomaticStatement(admin,{input,sourceHash:preview.sourceHash},'synthetic-auto-payroll')).toEqual(saved);
  await expect(payroll.prepareAutomaticStatement(admin,{input,sourceHash:preview.sourceHash},'synthetic-stale-payroll')).rejects.toMatchObject({code:'PAYROLL_SOURCE_CHANGED'});
  await expect(payroll.previewStatement(admin,{...input,statutoryConfirmed:false})).rejects.toMatchObject({code:'PAYROLL_EVIDENCE_REQUIRED'});
});

test('minimum-only contracts fix 40/20 hours without weekday requirements or caller overrides',()=>{
  for(const [employmentType,minutes] of [['FULL_TIME',2400],['PART_TIME',1200]]) {
    const terms=employmentTermsInput(employmentTerms({employmentType,monthlyBaseVnd:employmentType==='FULL_TIME'?10000000:3000000}),clock());
    expect(terms).toMatchObject({workScheduleMode:'SELF_REGISTERED',minimumWeeklyMinutes:minutes,weeklyMinutes:minutes});
    expect(terms.weekdays).toBeUndefined();expect(terms.dailyMinutes).toBeUndefined();
  }
  expect(()=>employmentTermsInput(employmentTerms({minimumWeeklyMinutes:1}),clock())).toThrow();
});
test('minimum-hours payroll pays whole month without registration; partial/unpaid time requires a verified assessment',async()=>{
  const payroll=createPayrollService({connection,clock:()=>new Date('2026-12-01T03:00:00Z'),policy:employeePayrollPolicyResolver});
  const employeeId=oid();await connection.collection('users').insertOne({_id:employeeId,roles:['PET_SITTER'],state:'ACTIVE',displayName:'Synthetic self registration'});
  await payroll.models.EmploymentContract.create({employeeId,version:1,employmentType:'PART_TIME',salaryBasis:'GROSS',monthlyBaseVnd:3000000,monthlyAllowanceVnd:100000,payCycle:'MONTHLY',weeklyMinutes:1200,
    minimumWeeklyMinutes:1200,workScheduleMode:'SELF_REGISTERED',effectiveAt:new Date('2026-10-01'),signedAt:new Date('2026-09-30'),contractReference:'SYNTHETIC-MINIMUM',workplaceRegion:1,workplaceReference:'Synthetic I',verifiedBy:admin.userId,recordedAt:new Date()});
  const input={employeeId:String(employeeId),periodStart:'2026-11-01',periodEnd:'2026-12-01',dueAt:'2026-12-05',unpaidMinutes:0,attendanceReference:'synthetic-timecard',attendanceConfirmed:true,
    statutoryReference:'synthetic-statutes',statutoryConfirmed:true,overtimeVnd:0,employeeInsuranceVnd:0,incomeTaxVnd:0,otherLawfulDeductionsVnd:0,deductionConsentReference:'synthetic-none'};
  const preview=await payroll.previewStatement(admin,input);
  expect(preview).toMatchObject({scheduleBasis:'MONTHLY_MINIMUM_COMMITMENT',minimumWeeklyMinutes:1200,calendar:[],breakdown:{baseVnd:3000000,allowanceVnd:100000,payableVnd:3100000}});
  expect((await payroll.payrollEmployees(admin)).items.find(row=>row.id===String(employeeId)).automaticReady).toBe(true);
  await connection.collection('employeeavailabilities').insertOne({_id:String(employeeId),workingWindows:[],version:0});
  expect((await payroll.previewStatement(admin,input)).sourceHash).toBe(preview.sourceHash);
  await expect(payroll.previewStatement(admin,{...input,unpaidMinutes:1})).rejects.toMatchObject({code:'PAYROLL_ATTENDANCE_REVIEW_REQUIRED'});
  await expect(payroll.previewStatement(admin,{...input,periodStart:'2026-11-02'})).rejects.toMatchObject({code:'PAYROLL_ATTENDANCE_REVIEW_REQUIRED'});
  expect((await payroll.prepareAutomaticStatement(admin,{input,sourceHash:preview.sourceHash},'synthetic-minimum-payroll')).status).toBe('PREPARED');
});

test('contract prefill decrypts the applicant snapshot and only the current Admin and owned verified contacts',async()=>{
  const applicantId=oid(),owner=oid(),identity='123456789012';
  await connection.collection('users').updateOne({_id:new mongoose.Types.ObjectId(admin.userId)},{$set:{displayName:'Synthetic signing Admin'}});
  await connection.collection('sitterapplications').insertOne({_id:applicantId,submissionKeyDigest:'synthetic-prefill-'+String(applicantId),state:'INTERVIEW',version:2,displayName:'Synthetic applicant',ownerUserId:owner,
    contactChannel:'EMAIL',contactCiphertext:crypto.encrypt('application@example.test'),
    identityLookupKey:createHmac('sha256','synthetic-contract-lookup-secret-32-chars').update('applicant-identity\0'+identity).digest('hex'),
    applicantParticularsCiphertext:crypto.encrypt(JSON.stringify({dateOfBirth:'1994-03-02',identityNumber:identity}))});
  for(const [userId,channel,value] of [[admin.userId,'EMAIL','admin@example.test'],[admin.userId,'PHONE','0900000001'],[String(owner),'PHONE','0900000002'],[String(oid()),'PHONE','0900000099']])
    await connection.models.Contact.create({userId,channel,canonicalCiphertext:crypto.encrypt(value),lookupKey:'synthetic-'+String(oid()),state:'VERIFIED',verifiedAt:new Date(clock())});
  const result=await service.get(admin,String(applicantId));
  expect(result.prefill.terms).toEqual({employeeName:'Synthetic applicant',dateOfBirth:'1994-03-02',identityNumber:identity,employeeEmail:'application@example.test',employeePhone:'0900000002',
    representativeName:'Synthetic signing Admin',employerEmail:'admin@example.test',employerPhone:'0900000001'});
  expect(result.prefill.terms.employerName).toBeUndefined();expect(result.prefill.terms.authorityBasis).toBeUndefined();
  expect(result.prefill.sources.identityNumber).toBe('APPLICATION_PRIVATE');expect(result.prefill.warnings).toEqual([]);
  await expect(service.get({...admin,roles:['STAFF']},String(applicantId))).rejects.toMatchObject({code:'FORBIDDEN'});
  await expect(service.get({...admin,userId:String(oid())},String(applicantId))).rejects.toMatchObject({code:'FORBIDDEN'});
  await connection.collection('sitterapplications').updateOne({_id:applicantId},{$set:{applicantParticularsCiphertext:crypto.encrypt(JSON.stringify({dateOfBirth:'1994-03-02',identityNumber:'999999999999'}))}});
  await expect(service.get(admin,String(applicantId))).rejects.toMatchObject({code:'CONTRACT_PREFILL_UNAVAILABLE'});
  await connection.collection('sitterapplications').updateOne({_id:applicantId},{$unset:{applicantParticularsCiphertext:''}});
  const legacy=await service.get(admin,String(applicantId));expect(legacy.prefill.terms.identityNumber).toBeUndefined();expect(legacy.prefill.terms.dateOfBirth).toBeUndefined();expect(legacy.prefill.warnings).toHaveLength(1);
});
