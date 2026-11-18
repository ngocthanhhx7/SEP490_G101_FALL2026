import { render as rtlRender, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
const render = (ui) => rtlRender(ui, { wrapper: MemoryRouter });
import { ServiceWorkflowBuilder } from '../../src/pages/admin/ServiceWorkflowBuilder.jsx';
import { VisitWorkflowExecution } from '../../src/pages/sitter/VisitWorkflowExecution.jsx';
import { CareWorkflowReport } from '../../src/components/common/CareWorkflowReport.jsx';
import { VisitWorkflowReview } from '../../src/components/common/VisitWorkflowReview.jsx';
import { createServiceWorkflowApi } from '../../src/services/service-workflow-api.js';

const visitId = 'a'.repeat(24),
  serviceId = 'b'.repeat(24),
  petId = 'c'.repeat(24);
const step = {
  stepId: 'ears',
  title: 'Kiểm tra tai',
  instructions: 'Chụp từng bên riêng biệt',
  phase: 'EXECUTION',
  scope: 'PER_PET',
  inputType: 'PHOTO',
  required: true,
  canSkip: false,
  safetyCritical: true,
  customerVisible: true,
  fields: [],
  species: [],
  locations: [],
  photoSlots: [
    { photoSlotId: 'left', title: 'Tai trái', instructions: 'Chụp rõ bên trái', minPhotos: 1, maxPhotos: 1 },
    { photoSlotId: 'right', title: 'Tai phải', instructions: 'Chụp rõ bên phải', minPhotos: 1, maxPhotos: 1 }
  ]
};
const task = {
  taskKey: `ears:${petId}`,
  stepId: 'ears',
  petId,
  petName: 'Milo',
  step,
  status: 'PENDING',
  note: '',
  values: {},
  evidence: []
};
const workflow = {
  mode: 'VERSIONED',
  title: 'Quy trình vệ sinh tai',
  revision: 2,
  tasks: [task],
  completed: 0,
  total: 1
};
const row = { visitId, version: 3, state: 'IN_PROGRESS', workflow };
beforeEach(() => {
  globalThis.URL.createObjectURL = jest.fn(() => 'blob:synthetic-workflow');
  globalThis.URL.revokeObjectURL = jest.fn();
  window.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  window.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
});
afterEach(cleanup);

test('builder saves configurable draft, keyboard order and published history copying', async () => {
  const definition = {
    title: 'Workflow',
    steps: [
      { ...step, stepId: 'first', title: 'Bước một' },
      { ...step, stepId: 'second', title: 'Bước hai' }
    ]
  };
  const request = jest.fn().mockResolvedValue({
    status: 200,
    data: { serviceId, revision: 0, draft: definition, published: null, history: [], nextCursor: null }
  });
  render(<ServiceWorkflowBuilder service={{ id: serviceId, name: 'Dịch vụ' }} request={request} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Đưa bước 2 lên' }));
  expect(screen.getByLabelText('Tên bước 1')).toHaveValue('Bước hai');
  fireEvent.click(screen.getByRole('button', { name: 'Lưu bản nháp' }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      `/services/admin/${serviceId}/workflow/draft`,
      expect.objectContaining({
        method: 'PUT',
        body: { expectedVersion: 0, definition: { ...definition, steps: [definition.steps[1], definition.steps[0]] } },
        idempotencyKey: expect.any(String)
      })
    )
  );
});
test('named slots show counts, review selected photo, lost save retries same version/media without second upload', async () => {
  const api = {
    uploadEvidence: jest.fn().mockResolvedValue({ id: 'd'.repeat(64), state: 'READY' }),
    saveWorkflowTask: jest
      .fn()
      .mockRejectedValueOnce({ code: 'TIMEOUT' })
      .mockResolvedValue({ data: { visitId, version: 4, state: 'IN_PROGRESS' } })
  };
  render(<VisitWorkflowExecution row={row} api={api} visitId={visitId} />);
  expect(screen.getByText(/Tai trái/, { selector: 'strong' })).toBeInTheDocument();
  expect(screen.getByText(/Tai phải/, { selector: 'strong' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Chụp hoặc chọn ảnh'), {
    target: { files: [new globalThis.File(['synthetic'], 'care.png', { type: 'image/png' })] }
  });
  fireEvent.click(screen.getByRole('button', { name: 'Lưu tiến độ và ảnh' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Kiểm tra lại cùng thao tác' }));
  await waitFor(() => expect(api.saveWorkflowTask).toHaveBeenCalledTimes(2));
  expect(api.saveWorkflowTask.mock.calls[0]).toEqual(api.saveWorkflowTask.mock.calls[1]);
  expect(api.uploadEvidence).toHaveBeenCalledTimes(1);
  expect(api.saveWorkflowTask.mock.calls[0][1]).toMatchObject({
    expectedVersion: 3,
    taskKey: task.taskKey,
    photoSlotId: 'left',
    mediaId: 'd'.repeat(64)
  });
});
test('blocked task renders escalation and no fake completion button', () => {
  render(
    <VisitWorkflowExecution
      row={{ ...row, workflow: { ...workflow, tasks: [{ ...task, status: 'BLOCKED', note: 'Không hợp tác' }] } }}
      api={{}}
      visitId={visitId}
    />
  );
  expect(screen.getByRole('alert')).toHaveTextContent('Đã chuyển điều phối xử lý');
  expect(screen.queryByRole('button', { name: 'Xác nhận đã thực hiện bước này' })).not.toBeInTheDocument();
});
test('pre-check-in execution steps cannot upload or claim completion', () => {
  render(<VisitWorkflowExecution row={{ ...row, state: 'ASSIGNED' }} api={{}} visitId={visitId} />);
  expect(screen.getByLabelText('Chụp hoặc chọn ảnh')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Xác nhận đã thực hiện bước này' })).toBeDisabled();
});
test('report renders only the authorized projected tasks and legacy is explicit', () => {
  const { rerender } = render(<CareWorkflowReport workflow={workflow} />);
  expect(screen.getByLabelText('Kết quả quy trình chăm sóc')).toHaveTextContent('Milo');
  rerender(<CareWorkflowReport workflow={{ mode: 'LEGACY' }} />);
  expect(screen.getByText(/Ca legacy/)).toBeInTheDocument();
});
test('staff review sends reason/current version and never fabricates completion', async () => {
  const api = {
    visitWorkflow: jest.fn().mockResolvedValue({
      data: { ...workflow, version: 4, state: 'IN_PROGRESS', tasks: [{ ...task, status: 'BLOCKED' }] }
    }),
    reviewWorkflow: jest.fn().mockResolvedValue({ data: { visitId, version: 5, state: 'IN_PROGRESS' } })
  };
  render(<VisitWorkflowReview visitId={visitId} api={api} onClose={() => {}} />);
  const button = await screen.findByRole('button', { name: 'Cho phép thử lại: Kiểm tra tai' });
  expect(button).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Lý do cho phép thử lại'), { target: { value: 'Đã đối chiếu với chủ nuôi' } });
  fireEvent.click(button);
  await waitFor(() =>
    expect(api.reviewWorkflow).toHaveBeenCalledWith(
      visitId,
      { expectedVersion: 4, taskKey: task.taskKey, reason: 'Đã đối chiếu với chủ nuôi' },
      expect.any(String)
    )
  );
});
test('transport rejects incomplete acknowledgement instead of reporting saved progress', async () => {
  const request = jest.fn().mockResolvedValue({ status: 200, data: {} }),
    api = createServiceWorkflowApi(request);
  await expect(api.saveTask(visitId, { expectedVersion: 3 }, 'operation-key')).rejects.toMatchObject({
    code: 'INVALID_RESPONSE'
  });
  await expect(api.template(serviceId, 'publications', { expectedVersion: 2 }, 'operation-key')).rejects.toMatchObject({
    code: 'INVALID_RESPONSE'
  });
});

test('version history stops on the final page instead of reusing the first cursor', async () => {
  const definition = { title: 'History workflow', steps: [] };
  const request = jest
    .fn()
    .mockResolvedValueOnce({
      status: 200,
      data: { serviceId, revision: 22, draft: definition, published: null, history: [], nextCursor: '3' }
    })
    .mockResolvedValueOnce({
      status: 200,
      data: {
        serviceId,
        revision: 22,
        draft: definition,
        published: null,
        history: [{ revision: 2, action: 'PUBLISHED', definition }],
        nextCursor: null
      }
    });
  render(<ServiceWorkflowBuilder service={{ id: serviceId, name: 'Dịch vụ' }} request={request} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Xem phiên bản cũ hơn' }));
  await screen.findByRole('button', { name: 'Sao chép phiên bản 2 thành bản nháp' });
  expect(screen.queryByRole('button', { name: 'Xem phiên bản cũ hơn' })).not.toBeInTheDocument();
});
