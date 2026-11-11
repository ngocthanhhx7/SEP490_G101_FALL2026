import { act, renderHook } from '@testing-library/react';
import { usePetCreation } from '../../src/hooks/usePetCreation.js';
import { newCustomerPet } from '../../src/utils/customer-pet-profile.js';

test('an auth denial after a lost create acknowledgement never rotates its key/body',async()=>{
  const api={save:jest.fn().mockRejectedValueOnce({code:'NETWORK_ERROR'}).mockRejectedValueOnce({status:401}).mockResolvedValue({data:{id:'a'.repeat(24),version:0}})},onSaved=jest.fn();
  const {result}=renderHook(()=>usePetCreation({api,photoApi:{},onSaved}));
  const draft={...newCustomerPet(),name:'Mây',breedCode:'dog-test',weightKg:'4'};
  await act(()=>result.current.save(draft,null));expect(result.current.state).toBe('pending');
  await act(()=>result.current.save(draft,null));expect(result.current.state).toBe('pending');
  await act(()=>result.current.save({...draft,name:'Different draft'},null));
  expect(api.save.mock.calls[0]).toEqual(api.save.mock.calls[1]);expect(api.save.mock.calls[0]).toEqual(api.save.mock.calls[2]);expect(onSaved).toHaveBeenCalledTimes(1);
});
