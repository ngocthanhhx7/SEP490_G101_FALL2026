import { VisitEvidencePreview } from './VisitEvidencePreview.jsx';
import '../../styles/care-workflow.css';
export const workflowStatusLabels = {
  PENDING: 'Chưa thực hiện',
  IN_PROGRESS: 'Đang thực hiện',
  COMPLETED: 'Đã thực hiện',
  SKIPPED: 'Đã bỏ qua có lý do',
  BLOCKED: 'Bị chặn',
  NEEDS_REVIEW: 'Cần điều phối xử lý'
};
export function CareWorkflowReport({ workflow, readEvidence }) {
  if (!workflow || workflow.mode === 'LEGACY')
    return <p>Ca legacy: chưa có workflow snapshot; áp dụng checklist đã lưu của ca.</p>;
  return (
    <section className="care-workflow" aria-label="Kết quả quy trình chăm sóc">
      <h4>
        {workflow.title} · v{workflow.revision}
      </h4>
      <p>
        {workflow.completed}/{workflow.total} nhiệm vụ đã ghi nhận
      </p>
      <progress value={workflow.completed} max={workflow.total || 1} aria-label="Tiến độ quy trình" />
      {workflow.tasks.map((task) => (
        <article className="care-workflow-card" key={task.taskKey}>
          <h5>
            {task.step.title}
            {task.petName ? ` · ${task.petName}` : ''}
          </h5>
          <p>{workflowStatusLabels[task.status]}</p>
          {task.note && <p>{task.note}</p>}
          {task.skipReason && <p>Lý do bỏ qua: {task.skipReason}</p>}
          {Object.entries(task.values ?? {}).map(([key, value]) => (
            <p key={key}>
              {task.step.fields.find((field) => field.fieldId === key)?.label ?? key}: {String(value)}
            </p>
          ))}
          {task.updatedAt && (
            <p>Ghi nhận: {new Date(task.updatedAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</p>
          )}
          <div className="visit-evidence-gallery">
            {task.evidence.map((photo) => (
              <VisitEvidencePreview
                key={photo.mediaId}
                mediaId={photo.mediaId}
                read={readEvidence}
                label={
                  task.step.photoSlots.find((slot) => slot.photoSlotId === photo.photoSlotId)?.title ?? 'Ảnh nhiệm vụ'
                }
              />
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}
