import { beforeAll, beforeEach, afterAll, test, expect } from '@jest/globals';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
import { Types } from 'mongoose';
import { connectDatabase } from '../../src/config/database.js';
import { pricingModels } from '../../src/models/pricing.model.js';
import { applyCareTraitDecision } from '../../src/services/pricing/care-trait-policy.service.js';
import { careTraitPriceRules } from '../../src/constants/care-trait-price-rules.js';
import { demoPricingPolicy, demoServiceCatalog } from '../../src/constants/demo-service-catalog.js';
import { calculateQuote } from '../../src/services/pricing/pricing-calculation.service.js';
let replica,connection,Policy;const clock=()=>Date.parse('2026-11-06T00:00:00Z');
const original=item=>{const policy=demoPricingPolicy(item);return {...policy,rules:policy.rules.filter(r=>!careTraitPriceRules.some(t=>t.code===r.code)),serviceId:new Types.ObjectId(),version:2,status:'APPROVED',approvedAt:new Date('2026-10-30'),effectiveAt:new Date('2026-10-30'),approvalSource:'SYNTHETIC_APPROVAL',reason:'Synthetic policy preserving reviewed fees'};};
beforeAll(async()=>{replica=await MongoMemoryReplSet.create({binary:{version:'8.0.34'},replSet:{count:1}});connection=await connectDatabase({mongoUri:replica.getUri(),database:'pwc_care_trait_policy_test',connectTimeoutMs:3000});Policy=pricingModels(connection).PricingPolicy;await Policy.syncIndexes();},600000);
beforeEach(async()=>{await Policy.deleteMany({});});afterAll(async()=>{await connection?.close();await replica?.stop();});
test('all 13 services get additive approved versions; old policies, fees and selected-duration prices stay unchanged',async()=>{
 await Policy.create(demoServiceCatalog.map(original));const before=await Policy.find({}).sort({_id:1}).lean();
 const plan=await applyCareTraitDecision({connection,clock});expect(plan.changed).toBe(13);expect(await Policy.countDocuments()).toBe(13);
 await applyCareTraitDecision({connection,clock,apply:true,expectedPlanHash:plan.planHash});
 expect(await Policy.find({version:2}).sort({_id:1}).lean()).toEqual(before);
 const after=await Policy.find({version:3}).lean();expect(after).toHaveLength(13);
 for(const policy of after){const old=before.find(p=>String(p.serviceId)===String(policy.serviceId));expect(policy.rules.slice(0,old.rules.length)).toEqual(old.rules);
  expect(policy.approvalSource).toBe('OWNER_CARE_TRAITS_2026_11_05_V1');expect(policy.rules.slice(-4).every(r=>r.bps===0&&r.flatVnd===0)).toBe(true);
 }
 const next=await applyCareTraitDecision({connection,clock});expect(next).toMatchObject({changed:0,skipped:13});
 await applyCareTraitDecision({connection,clock,apply:true,expectedPlanHash:next.planHash});expect(await Policy.countDocuments()).toBe(26);
 const item=demoServiceCatalog.find(x=>x.code==='dog-walking');const policy=demoPricingPolicy(item),pet={_id:'synthetic',species:'DOG',breedCode:'mixed',weightKg:2,traits:careTraitPriceRules.map(r=>r.code)};
 const quote=durationMinutes=>calculateQuote({policy,priceVersion:1,baseAmountVnd:item.amountVnd,pets:[pet],durationMinutes,visitCount:1});
 expect(quote(30).totalVnd).toBe(79200);expect(quote(60).totalVnd).toBe(158400);
 expect(quote(30).lines.filter(l=>careTraitPriceRules.some(r=>r.code===l.code)).every(l=>l.amountVnd===0)).toBe(true);
});
test('a charged/conditional existing rule, future/draft policy or stale reviewed plan stops the migration without partial writes',async()=>{
 const first=original(demoServiceCatalog[0]),second=original(demoServiceCatalog[1]);await Policy.create([first,second]);
 const plan=await applyCareTraitDecision({connection,clock});await Policy.updateOne({serviceId:second.serviceId},{$set:{reason:'Changed by another Admin'}});
 await expect(applyCareTraitDecision({connection,clock,apply:true,expectedPlanHash:plan.planHash})).rejects.toMatchObject({code:'PRICING_REVIEW_REQUIRED'});expect(await Policy.countDocuments()).toBe(2);
 await Policy.updateOne({serviceId:second.serviceId},{$push:{rules:{...careTraitPriceRules[0],when:{...careTraitPriceRules[0].when},bps:500}}});
 await expect(applyCareTraitDecision({connection,clock})).rejects.toMatchObject({code:'PRICING_REVIEW_REQUIRED'});expect(await Policy.countDocuments()).toBe(2);
 await Policy.deleteMany({});await Policy.create({...first,status:'DRAFT'});await expect(applyCareTraitDecision({connection,clock})).rejects.toMatchObject({code:'PRICING_REVIEW_REQUIRED'});
});


test('failure after all candidate versions were staged rolls the whole transaction back',async()=>{
 await Policy.create([original(demoServiceCatalog[0]),original(demoServiceCatalog[1])]);const plan=await applyCareTraitDecision({connection,clock});
 const originalCreate=Policy.create;
 Policy.create=async function(...args){await originalCreate.apply(this,args);throw new Error('Synthetic storage acknowledgement failure');};
 try{await expect(applyCareTraitDecision({connection,clock,apply:true,expectedPlanHash:plan.planHash})).rejects.toThrow();}
 finally{Policy.create=originalCreate;}
 expect(await Policy.countDocuments()).toBe(2);expect(await Policy.countDocuments({version:3})).toBe(0);
});
