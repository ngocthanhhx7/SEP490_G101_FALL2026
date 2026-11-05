import {render,screen} from '@testing-library/react';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import {SignInPage} from '../../src/pages/public/SignInPage.jsx';
import {sitterApplicationApi} from '../../src/services/sitter-application-api.js';
jest.mock('../../src/contexts/SessionContext.jsx',()=>({useSession:()=>({status:'authenticated',user:{id:'a'.repeat(24),roles:['CUSTOMER'],displayName:'Synthetic'}})}));
jest.mock('../../src/services/sitter-application-api.js',()=>({sitterApplicationApi:{getMine:jest.fn()}}));
test('verified applicant login lands directly in their application without a second challenge',async()=>{
 sitterApplicationApi.getMine.mockResolvedValue({data:{application:{state:'PENDING'}}});
 render(<MemoryRouter initialEntries={['/sign-in']}><Routes><Route path="/sign-in" element={<SignInPage/>}/><Route path="/sitter/application-status" element={<h1>Owned application landing</h1>}/></Routes></MemoryRouter>);
 expect(await screen.findByRole('heading',{name:'Owned application landing'})).toBeVisible();expect(sitterApplicationApi.getMine).toHaveBeenCalledTimes(1);
});
