import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {BookingVisitReport} from '../../src/components/common/BookingVisitReport.jsx';
beforeEach(()=>{
  globalThis.URL.createObjectURL=jest.fn(()=> 'blob:customer-care');globalThis.URL.revokeObjectURL=jest.fn();
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};window.HTMLDialogElement.prototype.close=function(){this.open=false;};
});
test('customer report lazily opens real saved checklist and bound photos, then discards image URLs on close',async()=>{
  const read=jest.fn().mockResolvedValue({blob:new globalThis.Blob(['sample'],{type:'image/png'})});
  const visit={id:'visit',startAt:'2026-11-12T14:00:00Z',endAt:'2026-11-12T14:15:00Z',sitterName:'Sitter1',checkInAt:'2026-11-12T13:58:00Z',
    checklist:[{itemId:'scope',label:'Cắt móng an toàn',status:'DONE'},{itemId:'condition',label:'Kiểm tra tình trạng',status:'SKIPPED',reason:'Chủ nuôi yêu cầu kiểm tra sau'}],
    evidence:[{kind:'CHECK_IN',mediaId:'a'.repeat(64)}]};
  render(<BookingVisitReport visit={visit} readEvidence={read}/>);expect(read).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Xem báo cáo và ảnh'}));
  expect(await screen.findByText('Cắt móng an toàn')).toBeVisible();expect(screen.getByText(/Chủ nuôi yêu cầu kiểm tra sau/)).toBeVisible();
  expect(await screen.findByRole('button',{name:'Xem trước Ảnh check-in'})).toBeVisible();
  fireEvent.click(screen.getByRole('button',{name:'Đóng'}));await waitFor(()=>expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:customer-care'));
});
