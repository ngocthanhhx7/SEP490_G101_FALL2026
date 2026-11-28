import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { VisitExecution } from '../../src/pages/sitter/VisitExecution.jsx';
import { DirectedBookingProposalPage } from '../../src/pages/customer/DirectedBookingProposalPage.jsx';
import { createEmployeeSchedulingApi } from '../../src/services/employee-scheduling-api.js';

beforeEach(() => {
  globalThis.URL.createObjectURL = jest.fn(() => 'blob:synthetic-care');
  globalThis.URL.revokeObjectURL = jest.fn();
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () { this.open = false; };
});
afterEach(cleanup);
test('lost check-in acknowledgement retries the same version and image without uploading again', async () => {
  const row = { visitId: 'visit', version: 2, state: 'ASSIGNED', checklistItemIds: ['service-scope'], checklist: [] };
  const api = { execution: jest.fn().mockResolvedValue({ data: row }), uploadEvidence: jest.fn().mockResolvedValue({ id: 'a'.repeat(64), state: 'READY' }),
    executeVisit: jest.fn().mockRejectedValueOnce({ code: 'TIMEOUT' }).mockResolvedValue({ data: { visitId: 'visit', version: 3, state: 'IN_PROGRESS' } }) };
  render(<VisitExecution api={api} visitId="visit" />);
  fireEvent.change(await screen.findByLabelText('Ảnh tại ca chăm sóc'), { target: { files: [new globalThis.File(['synthetic'], 'care.png', { type: 'image/png' })] } });
  fireEvent.click(screen.getByRole('button', { name: 'Check-in bắt đầu ca' }));
  const retry = await screen.findByRole('button', { name: 'Kiểm tra lại thao tác ca' });
  expect(screen.getByLabelText('Ảnh tại ca chăm sóc')).toBeDisabled();
  fireEvent.click(retry);
  await waitFor(() => expect(api.executeVisit).toHaveBeenCalledTimes(2));
  expect(api.executeVisit.mock.calls[0]).toEqual(api.executeVisit.mock.calls[1]);
  expect(api.uploadEvidence).toHaveBeenCalledTimes(1);
});

test('checklist requires a reason for skipped work and sends only the current visit version', async () => {
  const api = { execution: jest.fn().mockResolvedValue({ data: { visitId: 'visit', version: 5, state: 'IN_PROGRESS', checklistItemIds: ['pet-condition'], checklist: [] } }),
    executeVisit: jest.fn().mockResolvedValue({ data: {} }) };
  render(<VisitExecution api={api} visitId="visit" />);
  fireEvent.change(await screen.findByLabelText('Kiểm tra tình trạng thú cưng'), { target: { value: 'SKIPPED' } });
  expect(screen.getByRole('button', { name: 'Lưu nội dung chăm sóc' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Lý do không thực hiện: Kiểm tra tình trạng thú cưng'), { target: { value: 'Cần bác sĩ kiểm tra theo yêu cầu chủ nuôi' } });
  fireEvent.click(screen.getByRole('button', { name: 'Lưu nội dung chăm sóc' }));
  await waitFor(() => expect(api.executeVisit).toHaveBeenCalledWith('visit', 'checklists', { expectedVersion: 5,
    items: [{ itemId: 'pet-condition', status: 'SKIPPED', reason: 'Cần bác sĩ kiểm tra theo yêu cầu chủ nuôi' }] }, expect.any(String)));
});

test('ST-BKG-08 sends the optional customer note with the checklist save', async () => {
  const api = { execution: jest.fn().mockResolvedValue({ data: { visitId: 'visit', version: 5, state: 'IN_PROGRESS',
    checklistItemIds: ['pet-condition'], checklist: [], customerNote: 'Ghi chú đã lưu' } }),
  executeVisit: jest.fn().mockResolvedValue({ data: {} }) };
  render(<VisitExecution api={api} visitId="visit" />);
  const note = await screen.findByLabelText('Ghi chú cho khách');
  expect(note).toHaveValue('Ghi chú đã lưu');
  fireEvent.change(note, { target: { value: 'Milo uống đủ nước.' } });
  fireEvent.change(screen.getByLabelText('Kiểm tra tình trạng thú cưng'), { target: { value: 'DONE' } });
  fireEvent.click(screen.getByRole('button', { name: 'Lưu nội dung chăm sóc' }));
  await waitFor(() => expect(api.executeVisit).toHaveBeenCalledWith('visit', 'checklists', { expectedVersion: 5,
    items: [{ itemId: 'pet-condition', status: 'DONE' }], customerNote: 'Milo uống đủ nước.' }, expect.any(String)));
});

test('sitter saves a customer note independently of versioned workflow tasks', async () => {
  const api = {
    execution: jest.fn().mockResolvedValue({ data: {
      visitId: 'visit', version: 5, state: 'IN_PROGRESS', checklist: [],
      workflow: { mode: 'VERSIONED', title: 'Quy trình chăm sóc', tasks: [], completed: 0 },
      customerNote: 'Ghi chú đã lưu'
    } }),
    executeVisit: jest.fn().mockResolvedValue({ data: {} })
  };
  render(<VisitExecution api={api} visitId="visit" />);
  const note = await screen.findByLabelText('Ghi chú cho khách');
  expect(note).toHaveValue('Ghi chú đã lưu');
  fireEvent.change(note, { target: { value: 'Milo uống đủ nước.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Lưu ghi chú' }));
  await waitFor(() => expect(api.executeVisit).toHaveBeenCalledWith('visit', 'checklists',
    { expectedVersion: 5, customerNote: 'Milo uống đủ nước.' }, expect.any(String)));
});

test('the note field and save action are locked after the versioned execution window', async () => {
  const api = {
    execution: jest.fn().mockResolvedValue({ data: {
      visitId: 'visit', version: 5, state: 'IN_PROGRESS', checklist: [],
      workflow: { mode: 'VERSIONED', title: 'Quy trình chăm sóc', tasks: [], completed: 0 },
      serverNow: '2026-11-27T08:00:01Z', checkOutClosesAt: '2026-11-27T08:00:00Z',
      customerNote: 'Ghi chú đã lưu'
    } }),
    executeVisit: jest.fn()
  };
  render(<VisitExecution api={api} visitId="visit" />);
  expect(await screen.findByLabelText('Ghi chú cho khách')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Lưu ghi chú' })).toBeDisabled();
  expect(api.executeVisit).not.toHaveBeenCalled();
});

test('proposal route identity changes discard prior selection and confirmation operation', async () => {
  const proposal = id => ({ id, bookingId: 'booking', version: 0, state: 'PENDING_CUSTOMER_CONFIRMATION', slots: [{ startAt: '2026-11-20T02:00:00Z', endAt: '2026-11-20T03:00:00Z' }] });
  const api = { confirmProposal: jest.fn().mockRejectedValue({ code: 'TIMEOUT' }) };
  const { rerender } = render(<MemoryRouter><DirectedBookingProposalPage api={api} proposal={proposal('one')} /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('radio'));
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận lịch và gửi lời mời' }));
  await screen.findByRole('button', { name: 'Kiểm tra lại xác nhận lịch' });
  rerender(<MemoryRouter><DirectedBookingProposalPage api={api} proposal={proposal('two')} /></MemoryRouter>);
  expect(await screen.findByRole('radio')).not.toBeChecked();
  expect(screen.getByRole('button', { name: 'Xác nhận lịch và gửi lời mời' })).toBeDisabled();
});

test('transport does not report success for partial visit or proposal acknowledgements', async () => {
  const request = jest.fn().mockResolvedValue({ status: 200, data: {} });
  const api = createEmployeeSchedulingApi(request);
  await expect(api.executeVisit('visit', 'check-ins', { expectedVersion: 2, mediaId: 'a'.repeat(64) }, 'key')).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  await expect(api.confirmProposal('proposal', { expectedVersion: 0, selectedSlot: {}, idempotencyKey: 'key' })).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
});

test('confirmed proposal preserves its loaded sitter name and summary', async () => {
  const proposal = { id: 'one', bookingId: 'booking', version: 0, state: 'PENDING_CUSTOMER_CONFIRMATION',
    sitter: { displayName: 'Sitter đã chọn' }, slots: [{ startAt: '2026-11-20T02:00:00Z', endAt: '2026-11-20T03:00:00Z' }] };
  const api = { confirmProposal: jest.fn().mockResolvedValue({ data: { proposal: { id: 'one', state: 'CONFIRMED' } } }) };
  render(<MemoryRouter><DirectedBookingProposalPage api={api} proposal={proposal} /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('radio'));
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận lịch và gửi lời mời' }));
  await screen.findByRole('heading', { name: 'Đã gửi lời mời nhận ca' });
  expect(screen.getByText('Sitter đã chọn')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Xác nhận lịch và gửi lời mời' })).not.toBeInTheDocument();
});

test('leaving the visit during upload prevents a later care command', async () => {
  let finishUpload;
  const api = { execution: jest.fn().mockResolvedValue({ data: { visitId: 'visit', version: 0, state: 'ASSIGNED', checklistItemIds: [], checklist: [] } }),
    uploadEvidence: jest.fn(() => new Promise(resolve => { finishUpload = resolve; })), executeVisit: jest.fn() };
  const { unmount } = render(<VisitExecution api={api} visitId="visit" />);
  fireEvent.change(await screen.findByLabelText('Ảnh tại ca chăm sóc'), { target: { files: [new globalThis.File(['synthetic'], 'care.png', { type: 'image/png' })] } });
  fireEvent.click(screen.getByRole('button', { name: 'Check-in bắt đầu ca' }));
  await waitFor(() => expect(api.uploadEvidence).toHaveBeenCalledTimes(1));
  unmount();
  finishUpload({ id: 'a'.repeat(64), state: 'READY' });
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(api.executeVisit).not.toHaveBeenCalled();
});

test('check-out stays disabled until the checklist is saved on the server', async () => {
  const row = { visitId: 'visit', version: 2, state: 'IN_PROGRESS', checklistItemIds: ['pet-condition'], checklist: [] };
  const api = { execution: jest.fn().mockResolvedValue({ data: row }), uploadEvidence: jest.fn(), executeVisit: jest.fn() };
  render(<VisitExecution api={api} visitId="visit" />);
  fireEvent.change(await screen.findByLabelText('Kiểm tra tình trạng thú cưng'), { target: { value: 'DONE' } });
  fireEvent.change(screen.getByLabelText('Ảnh tại ca chăm sóc'), { target: { files: [new globalThis.File(['synthetic'], 'care.png', { type: 'image/png' })] } });
  expect(screen.getByRole('button', { name: 'Check-out hoàn tất ca' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Lưu nội dung chăm sóc' })).toBeEnabled();
  expect(api.uploadEvidence).not.toHaveBeenCalled();
});

test('server clock blocks early check-in before upload and opens at its exact boundary', async () => {
  const row = {visitId:'visit',version:2,state:'ASSIGNED',checklistItemIds:[],checklist:[],serverNow:'2026-11-12T13:29:59Z',
    startAt:'2026-11-12T14:00:00Z',endAt:'2026-11-12T14:15:00Z',checkInOpensAt:'2026-11-12T13:30:00Z',checkInClosesAt:'2026-11-12T14:15:00Z'};
  const api={execution:jest.fn().mockResolvedValue({data:row}),uploadEvidence:jest.fn(),executeVisit:jest.fn()};
  render(<VisitExecution api={api} visitId="visit"/>);
  fireEvent.change(await screen.findByLabelText('Ảnh tại ca chăm sóc'),{target:{files:[new globalThis.File(['sample'],'care.png',{type:'image/png'})]}});
  const button=screen.getByRole('button',{name:'Check-in bắt đầu ca'});
  expect(button).toBeDisabled();fireEvent.click(button);expect(api.uploadEvidence).not.toHaveBeenCalled();
  expect(screen.getByText(/Chưa đến giờ check-in/)).toHaveTextContent('12/11/2026');
  await waitFor(()=>expect(button).toBeEnabled(),{timeout:2500});
});

test('selected evidence has a removable preview and revokes its private blob URL',async()=>{
  const api={execution:jest.fn().mockResolvedValue({data:{visitId:'visit',version:0,state:'ASSIGNED',checklistItemIds:[],checklist:[]}}),uploadEvidence:jest.fn()};
  render(<VisitExecution api={api} visitId="visit"/>);
  fireEvent.change(await screen.findByLabelText('Ảnh tại ca chăm sóc'),{target:{files:[new globalThis.File(['sample'],'care.png',{type:'image/png'})]}});
  fireEvent.click(await screen.findByRole('button',{name:'Xem trước Ảnh bằng chứng đã chọn'}));
  expect(screen.getByRole('dialog',{name:'Ảnh bằng chứng đã chọn'})).toBeVisible();
  fireEvent.click(screen.getByRole('button',{name:'Đóng'}));
  fireEvent.click(screen.getByRole('button',{name:'Bỏ ảnh đã chọn'}));
  await waitFor(()=>expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:synthetic-care'));
  expect(api.uploadEvidence).not.toHaveBeenCalled();
});

test('stored check-in photo is fetched through the authenticated port and checklist uses saved service scope',async()=>{
  const api={execution:jest.fn().mockResolvedValue({data:{visitId:'visit',version:1,state:'IN_PROGRESS',checklistItemIds:['service-scope'],checklist:[],
    checklistItems:[{itemId:'service-scope',label:'Cắt móng an toàn cho bé'}],evidence:[{kind:'CHECK_IN',mediaId:'a'.repeat(64)}]}}),readEvidence:jest.fn().mockResolvedValue({blob:new globalThis.Blob(['sample'],{type:'image/png'})})};
  const {unmount}=render(<VisitExecution api={api} visitId="visit"/>);
  expect(await screen.findByLabelText('Cắt móng an toàn cho bé')).toBeVisible();
  expect(await screen.findByRole('button',{name:'Xem trước Ảnh check-in đã lưu'})).toBeVisible();
  expect(api.readEvidence).toHaveBeenCalledWith('a'.repeat(64),expect.objectContaining({signal:expect.anything()}));
  unmount();expect(URL.revokeObjectURL).toHaveBeenCalled();
});

test('ST-BKG-42 shows MSG82 toast with saved Vietnam check-in time after check-in', async () => {
  const api = {
    execution: jest.fn()
      .mockResolvedValueOnce({ data: { visitId: 'visit', version: 2, state: 'ASSIGNED', checklistItemIds: [], checklist: [] } })
      .mockResolvedValueOnce({ data: { visitId: 'visit', version: 3, state: 'IN_PROGRESS', checkInAt: '2026-11-28T02:05:00.000Z', checklistItemIds: [], checklist: [] } }),
    uploadEvidence: jest.fn().mockResolvedValue({ id: 'a'.repeat(64), state: 'READY' }),
    executeVisit: jest.fn().mockResolvedValue({ data: { visitId: 'visit', version: 3, state: 'IN_PROGRESS' } })
  };
  render(<VisitExecution api={api} visitId="visit" />);
  fireEvent.change(await screen.findByLabelText('Ảnh tại ca chăm sóc'), { target: { files: [new globalThis.File(['sample'], 'in.png', { type: 'image/png' })] } });
  fireEvent.click(screen.getByRole('button', { name: 'Check-in bắt đầu ca' }));
  expect(await screen.findByText('Bạn đã check-in lúc 09:05.')).toBeVisible();
});

test('ST-BKG-42 preserves MSG82 toast when parent page unmounts and remounts VisitExecution on onChanged', async () => {
  const api = {
    execution: jest.fn()
      .mockResolvedValueOnce({ data: { visitId: 'visit-remount', version: 2, state: 'ASSIGNED', checklistItemIds: [], checklist: [] } })
      .mockResolvedValue({ data: { visitId: 'visit-remount', version: 3, state: 'IN_PROGRESS', checkInAt: '2026-11-28T02:15:00.000Z', checklistItemIds: [], checklist: [] } }),
    uploadEvidence: jest.fn().mockResolvedValue({ id: 'a'.repeat(64), state: 'READY' }),
    executeVisit: jest.fn().mockResolvedValue({ data: { visitId: 'visit-remount', version: 3, state: 'IN_PROGRESS' } })
  };
  let remount;
  const { rerender } = render(<VisitExecution key="1" api={api} visitId="visit-remount" onChanged={() => remount()} />);
  remount = () => rerender(<VisitExecution key="2" api={api} visitId="visit-remount" onChanged={() => {}} />);
  fireEvent.change(await screen.findByLabelText('Ảnh tại ca chăm sóc'), { target: { files: [new globalThis.File(['sample'], 'in.png', { type: 'image/png' })] } });
  fireEvent.click(screen.getByRole('button', { name: 'Check-in bắt đầu ca' }));
  expect(await screen.findByText('Bạn đã check-in lúc 09:15.')).toBeVisible();
});

test('ST-BKG-42 does not show toast when follow-up execution reload fails', async () => {
  const api = {
    execution: jest.fn()
      .mockResolvedValueOnce({ data: { visitId: 'visit', version: 2, state: 'ASSIGNED', checklistItemIds: [], checklist: [] } })
      .mockRejectedValueOnce({ code: 'NETWORK_ERROR' }),
    uploadEvidence: jest.fn().mockResolvedValue({ id: 'a'.repeat(64), state: 'READY' }),
    executeVisit: jest.fn().mockResolvedValue({ data: { visitId: 'visit', version: 3, state: 'IN_PROGRESS' } })
  };
  render(<VisitExecution api={api} visitId="visit" />);
  fireEvent.change(await screen.findByLabelText('Ảnh tại ca chăm sóc'), { target: { files: [new globalThis.File(['sample'], 'in.png', { type: 'image/png' })] } });
  fireEvent.click(screen.getByRole('button', { name: 'Check-in bắt đầu ca' }));
  expect(await screen.findByText(/Chưa tải được tiến độ ca/)).toBeVisible();
  expect(screen.queryByText(/Bạn đã check-in lúc/)).not.toBeInTheDocument();
});

test('ST-BKG-44 shows MSG83 toast with saved Vietnam check-out time after check-out', async () => {
  const api = {
    execution: jest.fn()
      .mockResolvedValueOnce({ data: { visitId: 'visit', version: 3, state: 'IN_PROGRESS', checkInAt: '2026-11-28T02:05:00.000Z',
        checklistItemIds: ['pet-condition'], checklist: [{ itemId: 'pet-condition', status: 'DONE' }], customerNote: 'Milo ăn ngoan.' } })
      .mockResolvedValueOnce({ data: { visitId: 'visit', version: 4, state: 'COMPLETED', checkInAt: '2026-11-28T02:05:00.000Z',
        checkOutAt: '2026-11-28T03:35:00.000Z', checklistItemIds: ['pet-condition'], checklist: [{ itemId: 'pet-condition', status: 'DONE' }], customerNote: 'Milo ăn ngoan.' } }),
    uploadEvidence: jest.fn().mockResolvedValue({ id: 'b'.repeat(64), state: 'READY' }),
    executeVisit: jest.fn().mockResolvedValue({ data: { visitId: 'visit', version: 4, state: 'COMPLETED' } })
  };
  render(<VisitExecution api={api} visitId="visit" />);
  fireEvent.change(await screen.findByLabelText('Ảnh tại ca chăm sóc'), { target: { files: [new globalThis.File(['sample'], 'out.png', { type: 'image/png' })] } });
  fireEvent.click(screen.getByRole('button', { name: 'Check-out hoàn tất ca' }));
  expect(await screen.findByText('Bạn đã check-out lúc 10:35. Báo cáo chăm sóc đã được gửi cho khách.')).toBeVisible();
});

test('ST3-31 blocks check-out when customer note is empty or whitespace and shows MSG01 under note field', async () => {
  const api = {
    execution: jest.fn().mockResolvedValue({ data: { visitId: 'visit', version: 3, state: 'IN_PROGRESS',
      checklistItemIds: ['pet-condition'], checklist: [{ itemId: 'pet-condition', status: 'DONE' }] } }),
    uploadEvidence: jest.fn().mockResolvedValue({ id: 'b'.repeat(64), state: 'READY' }),
    executeVisit: jest.fn().mockResolvedValue({ data: { visitId: 'visit', version: 4, state: 'COMPLETED' } })
  };
  render(<VisitExecution api={api} visitId="visit" />);
  const noteInput = await screen.findByLabelText('Ghi chú cho khách');
  fireEvent.change(noteInput, { target: { value: '   ' } });
  fireEvent.change(screen.getByLabelText('Ảnh tại ca chăm sóc'), { target: { files: [new globalThis.File(['sample'], 'out.png', { type: 'image/png' })] } });
  fireEvent.click(screen.getByRole('button', { name: 'Check-out hoàn tất ca' }));
  const errorEl = document.getElementById('visit-customer-note-error');
  expect(errorEl).toBeVisible();
  expect(errorEl).toHaveTextContent('Trường này là bắt buộc.');
  expect(noteInput).toHaveAttribute('aria-invalid', 'true');
  expect(api.uploadEvidence).not.toHaveBeenCalled();
  expect(api.executeVisit).not.toHaveBeenCalled();

  fireEvent.change(noteInput, { target: { value: 'Bé đã ăn đủ và ngủ ngoan.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Check-out hoàn tất ca' }));
  await waitFor(() => expect(api.executeVisit).toHaveBeenCalledWith('visit', 'check-outs', {
    expectedVersion: 3,
    mediaId: 'b'.repeat(64),
    customerNote: 'Bé đã ăn đủ và ngủ ngoan.'
  }, expect.any(String)));
});
