import { render, screen, fireEvent } from '@testing-library/react';
import { AiTrainingReadiness } from '../../src/components/common/AiTrainingReadiness.jsx';
import { createAiModelApi } from '../../src/services/ai-model-api.js';

test('training audit is explicit and reports missing observations without pretending to train', async () => {
  const api = {trainingReadiness:jest.fn().mockResolvedValue({data:{scanned:500,eligibleRows:0,bookingGroups:0,missingObservations:200,missingBookingGroups:50,scanLimit:500,truncated:true,readyForTraining:false,excluded:{UNVERIFIED_SOURCE:500}}})};
  render(<AiTrainingReadiness api={api}/>);
  expect(api.trainingReadiness).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Kiểm tra dữ liệu đủ điều kiện'}));
  expect(await screen.findByText(/Hợp lệ 0 mẫu/)).toBeInTheDocument();
  expect(screen.getByText(/Trong dữ liệu đã đối chiếu, còn thiếu 200 mẫu/)).toBeInTheDocument();
  expect(screen.getByText(/Đã chạm giới hạn/)).toBeInTheDocument();
});

test('audit failure permits retry and never fabricates readiness', async () => {
  const api={trainingReadiness:jest.fn().mockRejectedValue({code:'TRAINING_AUDIT_TIMEOUT'})};
  render(<AiTrainingReadiness api={api}/>);
  fireEvent.click(screen.getByRole('button',{name:'Kiểm tra dữ liệu đủ điều kiện'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('offline');
  expect(screen.getByRole('button',{name:'Kiểm tra dữ liệu đủ điều kiện'})).toBeEnabled();
});

test('audit transport rejects malformed counters', async () => {
  const api=createAiModelApi(jest.fn().mockResolvedValue({data:{eligibleRows:-1}}));
  await expect(api.trainingReadiness()).rejects.toMatchObject({code:'INVALID_RESPONSE'});
});
