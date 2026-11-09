import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SessionProvider } from '../../src/contexts/SessionContext.jsx';
import { PetRecordImport } from '../../src/pages/customer/PetRecordImport.jsx';
const session={ resolve:async()=>({status:'authenticated',user:{id:'a'.repeat(24),roles:['CUSTOMER']}}) };
function setup(enabled=true) {
  const api={metadata:jest.fn().mockResolvedValue({data:{enabled}}),extract:jest.fn().mockResolvedValue({requiresReview:true,entries:[{field:'vaccination',status:'KNOWN',value:'Ngày ghi trong sổ: 01/11/2026',sourceText:'01/11/2026',page:1}],warnings:[]})},onApply=jest.fn();
  render(<MemoryRouter><SessionProvider adapter={session}><PetRecordImport api={api} onApply={onApply}/></SessionProvider></MemoryRouter>);return{api,onApply};
}
test('disabled provider keeps manual-entry explanation and never asks for a file',async()=>{setup(false);expect(await screen.findByText(/Chức năng đọc sổ AI chưa được bật/)).toBeInTheDocument();expect(screen.queryByLabelText(/Chọn sổ JPG/)).not.toBeInTheDocument();});
test('requires explicit Google consent, per-field review and confirmation; applying updates only draft',async()=>{
  const {api,onApply}=setup();fireEvent.click(screen.getByText('Điền nhanh từ ảnh hoặc PDF sổ thú cưng'));
  const file=await screen.findByLabelText(/Chọn sổ JPG/);fireEvent.change(file,{target:{files:[new globalThis.File(['%PDF-synthetic'],'sample.pdf',{type:'application/pdf'})]}});
  expect(screen.getByRole('button',{name:'Đọc sổ bằng Gemini'})).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox',{name:/Tôi đồng ý gửi/}));fireEvent.click(screen.getByRole('button',{name:'Đọc sổ bằng Gemini'}));
  await screen.findByText('Kiểm tra bản trích xuất');expect(api.extract).toHaveBeenCalledTimes(1);expect(onApply).not.toHaveBeenCalled();
  const apply=screen.getByRole('button',{name:'Đưa mục đã chọn vào bản sửa'});expect(apply).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox',{name:'Vaccine và ngày tiêm'}));
  fireEvent.click(screen.getByRole('checkbox',{name:/Tôi đã đối chiếu/}));
  fireEvent.change(screen.getByLabelText('Bản nháp Vaccine và ngày tiêm'),{target:{value:'Đã đối chiếu ngày tiêm'}});expect(apply).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox',{name:/Tôi đã đối chiếu/}));fireEvent.click(apply);
  await waitFor(()=>expect(onApply).toHaveBeenCalledWith({vaccination:{status:'KNOWN',value:'Đã đối chiếu ngày tiêm'}}));
  expect(screen.getByText(/Đã đưa mục được chọn vào bản sửa/)).toBeInTheDocument();
});
test('a reviewed unknown is applied as UNKNOWN without turning it into a known negative fact',async()=>{
  const {onApply}=setup();fireEvent.click(screen.getByText('Điền nhanh từ ảnh hoặc PDF sổ thú cưng'));
  fireEvent.change(await screen.findByLabelText(/Chọn sổ JPG/),{target:{files:[new globalThis.File(['synthetic'],'sample.pdf',{type:'application/pdf'})]}});
  fireEvent.click(screen.getByRole('checkbox',{name:/Tôi đồng ý gửi/}));fireEvent.click(screen.getByRole('button',{name:'Đọc sổ bằng Gemini'}));
  await screen.findByText('Kiểm tra bản trích xuất');fireEvent.click(screen.getByRole('checkbox',{name:'Vaccine và ngày tiêm'}));
  fireEvent.change(screen.getByLabelText('Trạng thái Vaccine và ngày tiêm'),{target:{value:'UNKNOWN'}});
  fireEvent.click(screen.getByRole('checkbox',{name:/Tôi đã đối chiếu/}));fireEvent.click(screen.getByRole('button',{name:'Đưa mục đã chọn vào bản sửa'}));
  expect(onApply).toHaveBeenCalledWith({vaccination:{status:'UNKNOWN'}});
});
