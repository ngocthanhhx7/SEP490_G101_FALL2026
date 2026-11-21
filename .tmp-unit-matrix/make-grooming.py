import json, pathlib, sys
method=sys.argv[1]
code={'options':'GRM-CTL-01','slots':'GRM-CTL-02','quote':'GRM-CTL-03','book':'GRM-CTL-04'}[method]
pet={'petId':'abcdef0123456789abcdef01','serviceIds':['abcdef0123456789abcdef02']}
if method!='slots': pet['answers']={'biteOrScratch':'NO','skinCondition':'NO'}
body={'pets':[pet]}
if method=='slots': body['date']='2026-11-19'
if method=='book': body.update(startAt='2026-11-19T02:00:00.000Z',expectedTotalVnd=100000)
data={'options':{'shop':{'address':'Test shop','hotline':None},'window':{'slotMinutes':60,'firstDate':'2026-11-18','lastDate':'2026-11-24','minLeadMinutes':60},'services':[],'questions':[]},'slots':{'date':'2026-11-19','slots':[{'startAt':'2026-11-19T02:00:00.000Z','time':'09:00','state':'AVAILABLE'},{'startAt':'2026-11-19T03:00:00.000Z','time':'10:00','state':'FULL'}]},'quote':{'currency':'VND','pets':[{'petId':pet['petId'],'name':'Milo','priceVnd':100000,'lines':[]}],'subtotalVnd':100000,'tier':{'code':None,'discountBps':0,'discountVnd':0,'applied':False,'blockedReason':None},'totalVnd':100000},'book':{'id':'abcdef0123456789abcdef03','code':'GR000001','status':'BOOKED','depositRequired':False,'pricing':{'subtotalVnd':100000,'tierDiscountVnd':0,'totalVnd':100000,'currency':'VND'}}}[method]
cases=[['N','maps request and preserves service DTO',{}]]
if method=='book':
 cases += [['B','passes missing Idempotency-Key unchanged',{'noKey':True,'error':[422,'VALIDATION_FAILED','Idempotency-Key of 8 to 200 characters required']}],['B','passes empty Idempotency-Key unchanged',{'key':'','error':[422,'VALIDATION_FAILED','Idempotency-Key of 8 to 200 characters required']}],['A','does not trim whitespace Idempotency-Key',{'key':'   ','error':[422,'VALIDATION_FAILED','Idempotency-Key of 8 to 200 characters required']}]]
else:
 empty={'options':{'services':[],'questions':[]},'slots':{'date':'2026-11-19','slots':[]},'quote':{'currency':'VND','pets':[],'subtotalVnd':0,'totalVnd':0}}[method]
 cases += [['B','preserves empty result collection or zero quote unchanged',{'data':empty}],['A','preserves null service result',{'data':None}],['A','preserves undefined service result at json boundary',{'noData':True}]]
cases += [['A','passes missing auth and propagates service forbidden error',{'noAuth':True,'error':[403,'FORBIDDEN','Customer required']}],['A','passes null '+('auth' if method=='options' else 'body')+' to service without defaulting', {('nullAuth' if method=='options' else 'nullBody'):True,'error':([403,'FORBIDDEN','Customer required'] if method=='options' else [422,'VALIDATION_FAILED','Invalid fields'])}],['A','propagates synchronous service Error unchanged',{'sync':True,'error':'offline'}],['A','propagates rejected service Promise unchanged',{'error':'offline'}],['A','maps duplicate key to 409 VERSION_CONFLICT',{'raw':{'code':11000},'mapped':[409,'VERSION_CONFLICT','Record already exists']}],['A','maps ValidationError to 422 VALIDATION_FAILED',{'raw':{'name':'ValidationError'},'mapped':[422,'VALIDATION_FAILED','Data does not match the schema']}],['A','maps StrictModeError to 422 VALIDATION_FAILED',{'raw':{'name':'StrictModeError'},'mapped':[422,'VALIDATION_FAILED','Data does not match the schema']}],['N','waits for service before sending HTTP response',{'deferred':True}]]
if method=='book': cases += [['A','preserves null booking result',{'data':None}],['A','preserves undefined booking result at json boundary',{'noData':True}]]
else: cases += [['N','does not fabricate missing correlation ID',{'noRequestId':True}],['N','preserves synchronously returned service DTO',{'syncResult':True}]]
cases += [['A','preserves domain error status code message and details',{'error':([409,'GROOMING_SLOT_TAKEN','The time slot is no longer available'] if method=='book' else [404,'RESOURCE_NOT_FOUND','Owned pet unavailable'])}]]
assert len(cases)==15
cases=[[f'UTCID{i:02}',*c] for i,c in enumerate(cases,1)]
args='[req.auth'+(', req.body' if method!='options' else '')+(', key' if method=='book' else '')+']'
unused=['params','query','headers']+(['body'] if method=='options' else [])
template='''import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { createGroomingBookingController } from '../../src/controllers/grooming-booking.controller.js';
import { AppError } from '../../src/utils/app-error.js';

const now = '2026-11-18T10:00:00.000Z';

describe('__CODE__ - __METHOD__', () => {
  beforeEach(() => jest.useFakeTimers().setSystemTime(new Date(now)));
  afterEach(() => jest.useRealTimers());
  const cases = __CASES__;

  test.each(cases)('%s [%s] - %s', async (_utc, _type, _title, scenario) => {
    const auth = Object.freeze({ userId: 'customer-1', state: 'ACTIVE', roles: ['CUSTOMER'] });
    const req = { auth, requestId: 'controller-test'__BODY__ };
    if (scenario.noAuth) delete req.auth;
    if (scenario.nullAuth) req.auth = null;
    if (scenario.nullBody) req.body = null;
    if (scenario.noRequestId) delete req.requestId;
    __KEY__
    // Unused request fields must never influence this service call.
    for (const field of __UNUSED__) {
      Object.defineProperty(req, field, { get() { throw new Error(`Unexpected ${field} access`); } });
    }
    const data = scenario.noData ? undefined : Object.hasOwn(scenario, 'data') ? scenario.data : __DATA__;
    const beforeData = structuredClone(data);
    __BEFOREBODY__
    const error = scenario.raw ? Object.assign(new Error('private database detail'), scenario.raw)
      : Array.isArray(scenario.error) ? new AppError(...scenario.error, { reason: 'synthetic' }) : new Error(scenario.error ?? 'unused');
    const port = jest.fn().mockResolvedValue(data);
    if (scenario.syncResult) port.mockReturnValue(data);
    let resolve;
    if (scenario.deferred) port.mockReturnValue(new Promise(done => { resolve = done; }));
    if (scenario.error || scenario.raw) {
      if (scenario.sync) port.mockImplementation(() => { throw error; });
      else port.mockRejectedValue(error);
    }
    const controller = createGroomingBookingController({ __METHOD__: port });
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };

    const pending = controller.__METHOD__(req, res);

    expect(port.mock.calls).toEqual([__ARGS__]);
    expect(port.mock.calls[0][0]).toBe(req.auth);
    __BODYASSERT__
    __KEYASSERT__
    if (scenario.error || scenario.raw) {
      if (scenario.mapped) {
        const [status, code, message] = scenario.mapped;
        await expect(pending).rejects.toMatchObject({ name: 'AppError', status, code, message, details: {} });
      } else await expect(pending).rejects.toBe(error);
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
      return;
    }
    if (scenario.deferred) {
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
      resolve(data);
    }
    await expect(pending).resolves.toBe(res);
    expect(res.status.mock.calls).toEqual([[__STATUS__]]);
    expect(res.json.mock.calls).toEqual([[{ data, meta: { schemaVersion: 1, serverNow: now, correlationId: req.requestId } }]]);
    expect(res.json.mock.calls[0][0].data).toBe(data);
    expect(data).toEqual(beforeData);
    expect(res.status.mock.invocationCallOrder[0]).toBeLessThan(res.json.mock.invocationCallOrder[0]);
  });
});
'''
replacements={'CODE':code,'METHOD':method,'CASES':json.dumps(cases,indent=2),'BODY':(', body: '+json.dumps(body) if method!='options' else ''),'KEY':("const key = scenario.noKey ? undefined : Object.hasOwn(scenario, 'key') ? scenario.key : 'booking-key-001';\n    req.get = jest.fn().mockImplementation(name => name === 'Idempotency-Key' ? key : undefined);" if method=='book' else ''),'UNUSED':json.dumps(unused),'DATA':json.dumps(data),'ARGS':args,'BEFOREBODY':('const beforeBody = structuredClone(req.body);' if method!='options' else ''),'BODYASSERT':('expect(port.mock.calls[0][1]).toBe(req.body);\n    expect(req.body).toEqual(beforeBody);' if method!='options' else ''),'KEYASSERT':("expect(req.get.mock.calls).toEqual([['Idempotency-Key']]);" if method=='book' else ''),'STATUS':str(201 if method=='book' else 200)}
for k,v in replacements.items(): template=template.replace('__'+k+'__',v)
p=pathlib.Path('backend/tests/unit/grooming-booking.'+method+'.test.js')
assert not p.exists(),p
p.write_text(template,encoding='utf-8')
pathlib.Path('.tmp-unit-matrix/'+code+'-design.json').write_text(json.dumps({'method':method,'code':code,'body':body,'data':data,'cases':cases}),encoding='utf-8')
