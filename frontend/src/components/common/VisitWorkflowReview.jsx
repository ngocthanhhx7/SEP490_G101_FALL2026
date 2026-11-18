import { Link } from 'react-router-dom';
import { useCallback, useState } from 'react';
import { useApiResource } from '../../hooks/useApiResource.js';
import { useSchedulingCommand } from '../../hooks/useSchedulingCommand.js';
import { Button, Dialog } from '../ui/index.js';
import { CareWorkflowReport } from './CareWorkflowReport.jsx';
export function VisitWorkflowReview({ visitId, api, onClose, onChanged }) {
  const load = useCallback((options) => api.visitWorkflow(visitId, options), [api, visitId]),
    resource = useApiResource(load);
  const [reason, setReason] = useState('');
  const command = useSchedulingCommand(() => {
    resource.retry();
    onChanged?.();
    setReason('');
  });
  return (
    <Dialog open title="Quy trình chăm sóc của buổi" onClose={onClose} className="visit-evidence-dialog">
      {resource.status !== 'success' ? (
        <p role="status">
          Chưa tải được tiến độ. <Button onClick={resource.retry}>Tải lại</Button>
        </p>
      ) : (
        <>
          <CareWorkflowReport workflow={resource.data} readEvidence={api.readEvidence} />
          {resource.data.incidents?.map((incident) => (
            <p key={incident.id}>
              <Link to={`/cases/${incident.id}`}>Xử lý sự cố: {incident.description}</Link> · {incident.state}
            </p>
          ))}
          {['ASSIGNED', 'IN_PROGRESS'].includes(resource.data.state) &&
            resource.data.tasks?.some((task) => ['BLOCKED', 'NEEDS_REVIEW'].includes(task.status)) && (
              <fieldset disabled={command.busy || command.pending}>
                <legend>Xử lý bước bị chặn</legend>
                <p>
                  Đối chiếu với người chăm sóc trước khi cho phép thử lại. Thao tác này không hoàn thành nhiệm vụ hoặc
                  thay thế bằng chứng an toàn.
                </p>
                <label>
                  Lý do cho phép thử lại
                  <textarea maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} />
                </label>
                {resource.data.tasks
                  .filter((task) => ['BLOCKED', 'NEEDS_REVIEW'].includes(task.status))
                  .map((task) => (
                    <Button
                      key={task.taskKey}
                      disabled={reason.trim().length < 3}
                      onClick={() => {
                        const body = { expectedVersion: resource.data.version, taskKey: task.taskKey, reason };
                        command.execute((key) => api.reviewWorkflow(visitId, body, key));
                      }}
                    >
                      Cho phép thử lại: {task.step.title}
                    </Button>
                  ))}
              </fieldset>
            )}
        </>
      )}
      {command.message && <p role="status">{command.message}</p>}
      {command.pending && (
        <Button disabled={command.busy} onClick={command.retry}>
          Kiểm tra lại cùng yêu cầu
        </Button>
      )}
    </Dialog>
  );
}
