import { jest, test, expect } from '@jest/globals';
import { createEmployeePayrollApi } from '../../src/services/employee-payroll-api.js';
import { createAdminSettlementApi } from '../../src/services/admin-settlement-api.js';
import { createSitterPublicProfileApi } from '../../src/services/sitter-public-profile-api.js';
const id = 'a'.repeat(24), body = { action:'APPROVE',decision:'APPROVE',expectedVersion:2 };
test.each([{pending:true},{data:{}},{data:{id:'wrong',version:3,status:'APPROVED'}},{data:{id,version:2,status:'APPROVED'}}])('financial decisions reject an unconfirmed response %j',async response=>{
  await expect(createEmployeePayrollApi(jest.fn().mockResolvedValue(response)).advanceDecision(id,body,'synthetic-key')).rejects.toMatchObject({code:'INVALID_RESPONSE'});
  await expect(createAdminSettlementApi(jest.fn().mockResolvedValue(response)).decide(id,body,'synthetic-key')).rejects.toMatchObject({code:'INVALID_RESPONSE'});
});
test('public profile review checks identity, state and new version',async()=>{
  const request=jest.fn().mockResolvedValueOnce({data:{userId:id,state:'APPROVED',version:3}}).mockResolvedValueOnce({data:{userId:'b'.repeat(24),state:'APPROVED',version:3}});
  const api=createSitterPublicProfileApi(request);
  await expect(api.review(id,body,'synthetic-key')).resolves.toMatchObject({userId:id,version:3});
  await expect(api.review(id,body,'synthetic-key')).rejects.toMatchObject({code:'INVALID_RESPONSE'});
});
