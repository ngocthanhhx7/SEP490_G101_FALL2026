import { test, expect } from '@jest/globals';
import { employmentTermsInput } from '../../src/validators/employment-document.validator.js';
import { employmentTerms } from '../fixtures/employment-terms.js';
const now=Date.parse('2026-11-05T03:00:00Z');
function rejected(overrides){try{employmentTermsInput(employmentTerms(overrides),now);}catch(error){return error;}throw Error('Expected rejection');}
test('reports all invalid fields without echoing private values',()=>{
 const error=rejected({employerName:'',identityNumber:'secret invalid identity',dateOfBirth:'2026-02-30',identityIssuedOn:'2030-01-01',plannedSigningOn:'2026-11-08',effectiveOn:'2026-11-06',monthlyAllowanceVnd:-1});
 expect(error).toMatchObject({status:422,code:'CONTRACT_INFORMATION_REQUIRED',details:{fields:{employerName:'REQUIRED_TEXT',identityNumber:'IDENTITY_NUMBER',dateOfBirth:'CALENDAR_DATE',identityIssuedOn:'IDENTITY_DATE',plannedSigningOn:'SIGN_BEFORE_EFFECTIVE',monthlyAllowanceVnd:'WHOLE_NUMBER'}}});
 expect(JSON.stringify(error.details)).not.toContain('secret invalid identity');
});
test.each([['endsOn',{termType:'FIXED',effectiveOn:'2026-11-06',endsOn:'2030-11-07'},'FIXED_TERM_RANGE'],['monthlyBaseVnd',{monthlyBaseVnd:1000000},'BELOW_MINIMUM_WAGE'],['workplaceRegion',{workplaceRegion:0},'WHOLE_NUMBER']])('identifies %s', (key,input,reason)=>{
 expect(rejected(input).details.fields[key]).toBe(reason);
});
test('identity normalization is consistent with saved terms',()=>{
 expect(employmentTermsInput(employmentTerms({identityNumber:' 012345678901 '}),now).identityNumber).toBe('012345678901');
});
