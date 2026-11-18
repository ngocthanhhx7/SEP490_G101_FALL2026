import { useCallback, useMemo, useState } from 'react';
import { useApiResource } from '../../hooks/useApiResource.js';
import { useSchedulingCommand } from '../../hooks/useSchedulingCommand.js';
import { createServiceWorkflowApi } from '../../services/service-workflow-api.js';
import { Button } from '../../components/ui/index.js';
import '../../styles/care-workflow.css';

const phases = { CHECK_IN: 'Tiếp nhận', EXECUTION: 'Thực hiện', CHECK_OUT: 'Bàn giao' };
const makeStep = () => ({
  stepId: `step-${globalThis.crypto.randomUUID().slice(0, 8)}`,
  title: '',
  instructions: '',
  phase: 'EXECUTION',
  scope: 'PER_PET',
  inputType: 'CONFIRMATION',
  required: true,
  canSkip: false,
  safetyCritical: false,
  customerVisible: true,
  photoSlots: [],
  fields: [],
  species: [],
  locations: []
});
export function ServiceWorkflowBuilder({ service, request }) {
  const api = useMemo(() => createServiceWorkflowApi(request), [request]);
  const load = useCallback((options) => api.read(service.id, options), [api, service.id]),
    resource = useApiResource(load);
  const [editing, setEditing] = useState(null),
    [preview, setPreview] = useState(false),
    [history, setHistory] = useState(null);
  const command = useSchedulingCommand(() => {
    setEditing(null);
    setHistory(null);
    resource.retry();
  });
  const row = resource.data,
    definition = editing ??
      row?.draft ??
      row?.published?.definition ?? { title: `${service.name} — quy trình chăm sóc`, steps: [] };
  const locked = command.busy || command.pending;
  const change = (value) => setEditing(value),
    step = (i, patch) =>
      change({
        ...definition,
        steps: definition.steps.map((item, index) => (index === i ? { ...item, ...patch } : item))
      });
  const move = (i, offset) => {
    const steps = [...definition.steps];
    [steps[i], steps[i + offset]] = [steps[i + offset], steps[i]];
    change({ ...definition, steps });
  };
  if (resource.status !== 'success')
    return (
      <div role="status">
        Chưa tải được quy trình. <Button onClick={resource.retry}>Tải lại quy trình</Button>
      </div>
    );
  function mutate(action) {
    const body = {
      expectedVersion: row.revision,
      ...(action === 'draft' ? { definition: JSON.parse(JSON.stringify(definition)) } : {})
    };
    command.execute((key) => api.template(service.id, action, body, key));
  }
  return (
    <section className="care-workflow" aria-label="Quy trình thực hiện dịch vụ">
      <header>
        <h3>{service.name}</h3>
        <p>
          {row.published ? `Đang áp dụng phiên bản ${row.published.revision}` : 'Chưa publish quy trình'} · Bản nháp có
          thể chỉnh sửa
        </p>
      </header>
      <Button variant="ghost" disabled={locked} onClick={resource.retry}>
        Tải lại quy trình
      </Button>
      <p>
        Publish áp dụng cho booking mới. Lịch đã xác nhận giữ nguyên snapshot. Các bước an toàn và ảnh tiếp nhận/bàn
        giao không được bỏ qua.
      </p>
      <fieldset disabled={locked}>
        <legend>Bản nháp quy trình</legend>
        <label>
          Tên quy trình
          <input
            maxLength={120}
            value={definition.title}
            onChange={(event) => change({ ...definition, title: event.target.value })}
          />
        </label>
        {definition.steps.map((item, i) => (
          <article className="care-workflow-card" key={item.stepId}>
            <h4>
              Bước {i + 1}: {item.title || 'Nhiệm vụ mới'}
            </h4>
            <div className="care-workflow-actions">
              <Button variant="ghost" disabled={!i} onClick={() => move(i, -1)} aria-label={`Đưa bước ${i + 1} lên`}>
                ↑ Lên
              </Button>
              <Button
                variant="ghost"
                disabled={i === definition.steps.length - 1}
                onClick={() => move(i, 1)}
                aria-label={`Đưa bước ${i + 1} xuống`}
              >
                ↓ Xuống
              </Button>
              <Button
                variant="ghost"
                onClick={() => change({ ...definition, steps: definition.steps.filter((_, index) => index !== i) })}
              >
                Xóa bước {i + 1}
              </Button>
            </div>
            <label>
              Tên bước {i + 1}
              <input maxLength={120} value={item.title} onChange={(event) => step(i, { title: event.target.value })} />
            </label>
            <label>
              Hướng dẫn bước {i + 1}
              <textarea
                maxLength={2000}
                value={item.instructions}
                onChange={(event) => step(i, { instructions: event.target.value })}
              />
            </label>
            <div className="care-workflow-grid">
              <label>
                Giai đoạn
                <select value={item.phase} onChange={(event) => step(i, { phase: event.target.value })}>
                  {Object.entries(phases).map(([key, label]) => (
                    <option value={key} key={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Phạm vi
                <select value={item.scope} onChange={(event) => step(i, { scope: event.target.value })}>
                  <option value="PER_PET">Từng thú cưng</option>
                  <option value="PER_VISIT">Chung cả ca</option>
                </select>
              </label>
              <label>
                Loại thao tác
                <select value={item.inputType} onChange={(event) => step(i, { inputType: event.target.value })}>
                  {[
                    ['CONFIRMATION', 'Xác nhận'],
                    ['PHOTO', 'Ảnh'],
                    ['NOTE', 'Ghi chú'],
                    ['CHECKLIST', 'Checklist'],
                    ['STRUCTURED', 'Dữ liệu có cấu trúc']
                  ].map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="care-workflow-actions">
              {[
                ['required', 'Bắt buộc'],
                ['canSkip', 'Cho phép bỏ qua có lý do'],
                ['safetyCritical', 'Quan trọng về an toàn'],
                ['customerVisible', 'Cho khách xem kết quả']
              ].map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={item[key]}
                    onChange={(event) => step(i, { [key]: event.target.checked })}
                  />
                  {label}
                </label>
              ))}
            </div>
            <fieldset>
              <legend>Loài áp dụng (bỏ trống: tất cả)</legend>
              {[
                ['DOG', 'Chó'],
                ['CAT', 'Mèo']
              ].map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={item.species.includes(key)}
                    onChange={(event) =>
                      step(i, {
                        species: event.target.checked
                          ? [...item.species, key]
                          : item.species.filter((value) => value !== key)
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            <fieldset>
              <legend>Địa điểm (bỏ trống: tất cả)</legend>
              {[
                ['HOME', 'Tại nhà'],
                ['FACILITY', 'Cơ sở'],
                ['OUTDOOR', 'Ngoài trời'],
                ['SHOP', 'Cửa hàng'],
                ['TRANSPORT', 'Vận chuyển']
              ].map(([key, label]) => (
                <label key={key}>
                  <input
                    type="checkbox"
                    checked={item.locations.includes(key)}
                    onChange={(event) =>
                      step(i, {
                        locations: event.target.checked
                          ? [...item.locations, key]
                          : item.locations.filter((value) => value !== key)
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </fieldset>
            <h5>Ảnh cần chụp</h5>
            {item.photoSlots.map((slot, j) => (
              <fieldset key={slot.photoSlotId}>
                <legend>Ảnh {j + 1}</legend>
                <label>
                  Tên vị trí ảnh
                  <input
                    maxLength={120}
                    value={slot.title}
                    onChange={(event) =>
                      step(i, {
                        photoSlots: item.photoSlots.map((value, k) =>
                          k === j ? { ...value, title: event.target.value } : value
                        )
                      })
                    }
                  />
                </label>
                <label>
                  Góc chụp/hướng dẫn
                  <textarea
                    maxLength={1000}
                    value={slot.instructions}
                    onChange={(event) =>
                      step(i, {
                        photoSlots: item.photoSlots.map((value, k) =>
                          k === j ? { ...value, instructions: event.target.value } : value
                        )
                      })
                    }
                  />
                </label>
                {['minPhotos', 'maxPhotos'].map((key) => (
                  <label key={key}>
                    {key === 'minPhotos' ? 'Số ảnh tối thiểu' : 'Số ảnh tối đa'}
                    <input
                      type="number"
                      min={key === 'minPhotos' ? 0 : 1}
                      max={3}
                      value={slot[key]}
                      onChange={(event) =>
                        step(i, {
                          photoSlots: item.photoSlots.map((value, k) =>
                            k === j ? { ...value, [key]: Number(event.target.value) } : value
                          )
                        })
                      }
                    />
                  </label>
                ))}
                <Button
                  variant="ghost"
                  onClick={() => step(i, { photoSlots: item.photoSlots.filter((_, k) => k !== j) })}
                >
                  Xóa vị trí ảnh {j + 1}
                </Button>
              </fieldset>
            ))}
            <Button
              variant="secondary"
              disabled={item.photoSlots.length >= 4}
              onClick={() =>
                step(i, {
                  photoSlots: [
                    ...item.photoSlots,
                    {
                      photoSlotId: `photo-${globalThis.crypto.randomUUID().slice(0, 8)}`,
                      title: '',
                      instructions: '',
                      minPhotos: 1,
                      maxPhotos: 1
                    }
                  ]
                })
              }
            >
              Thêm vị trí ảnh
            </Button>
            {['CHECKLIST', 'STRUCTURED'].includes(item.inputType) && (
              <fieldset>
                <legend>Các trường cần ghi nhận</legend>
                {item.fields.map((field, j) => (
                  <div key={field.fieldId}>
                    <label>
                      Nhãn trường
                      <input
                        maxLength={120}
                        value={field.label}
                        onChange={(event) =>
                          step(i, {
                            fields: item.fields.map((value, k) =>
                              k === j ? { ...value, label: event.target.value } : value
                            )
                          })
                        }
                      />
                    </label>
                    <label>
                      Kiểu dữ liệu
                      <select
                        value={field.type}
                        onChange={(event) =>
                          step(i, {
                            fields: item.fields.map((value, k) =>
                              k === j ? { ...value, type: event.target.value } : value
                            )
                          })
                        }
                      >
                        <option value="TEXT">Văn bản</option>
                        <option value="NUMBER">Số</option>
                      </select>
                    </label>
                    {field.type === 'NUMBER' &&
                      ['min', 'max'].map((key) => (
                        <label key={key}>
                          {key === 'min' ? 'Giá trị nhỏ nhất' : 'Giá trị lớn nhất'}
                          <input
                            type="number"
                            value={field[key]}
                            onChange={(event) =>
                              step(i, {
                                fields: item.fields.map((value, k) =>
                                  k === j ? { ...value, [key]: Number(event.target.value) } : value
                                )
                              })
                            }
                          />
                        </label>
                      ))}
                    <label>
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(event) =>
                          step(i, {
                            fields: item.fields.map((value, k) =>
                              k === j ? { ...value, required: event.target.checked } : value
                            )
                          })
                        }
                      />
                      Trường bắt buộc
                    </label>
                    <Button variant="ghost" onClick={() => step(i, { fields: item.fields.filter((_, k) => k !== j) })}>
                      Xóa trường
                    </Button>
                  </div>
                ))}
                <Button
                  disabled={item.fields.length >= 8}
                  variant="secondary"
                  onClick={() =>
                    step(i, {
                      fields: [
                        ...item.fields,
                        {
                          fieldId: `field-${globalThis.crypto.randomUUID().slice(0, 8)}`,
                          label: '',
                          type: 'TEXT',
                          required: true,
                          min: 0,
                          max: 1000
                        }
                      ]
                    })
                  }
                >
                  Thêm trường
                </Button>
              </fieldset>
            )}
          </article>
        ))}
        <Button
          variant="secondary"
          disabled={definition.steps.length >= 24}
          onClick={() => change({ ...definition, steps: [...definition.steps, makeStep()] })}
        >
          Thêm bước
        </Button>
        <div className="care-workflow-actions">
          <Button onClick={() => mutate('draft')}>Lưu bản nháp</Button>
          <Button variant="secondary" disabled={editing !== null || !row.draft} onClick={() => mutate('validation')}>
            Kiểm tra bản nháp
          </Button>
          <Button disabled={editing !== null || !row.draft} onClick={() => mutate('publications')}>
            Publish cho booking mới
          </Button>
          <Button variant="ghost" disabled={!row.published} onClick={() => mutate('retirements')}>
            Ngừng dùng cho booking mới
          </Button>
        </div>
      </fieldset>
      {command.message && <p role="status">{command.message}</p>}
      {command.pending && (
        <Button disabled={command.busy} onClick={command.retry}>
          Kiểm tra lại cùng yêu cầu
        </Button>
      )}
      <Button variant="ghost" onClick={() => setPreview(!preview)}>
        Xem trước cho Pet Sitter
      </Button>
      {preview && (
        <ol>
          {definition.steps.map((item) => (
            <li key={item.stepId}>
              <strong>
                {phases[item.phase]} · {item.title}
              </strong>
              <p>{item.instructions}</p>
              {item.photoSlots.map((slot) => (
                <p key={slot.photoSlotId}>
                  {slot.title}: {slot.minPhotos}–{slot.maxPhotos} ảnh · {slot.instructions}
                </p>
              ))}
            </li>
          ))}
        </ol>
      )}
      <h4>Lịch sử xuất bản</h4>
      {(history?.history ?? row.history).map((item) => (
        <article key={item.revision}>
          <p>
            Phiên bản {item.revision} · {item.action === 'PUBLISHED' ? 'Đã xuất bản' : 'Đã ngừng dùng'}
          </p>
          <Button
            variant="ghost"
            disabled={locked}
            onClick={() => setEditing(JSON.parse(JSON.stringify(item.definition)))}
          >
            Sao chép phiên bản {item.revision} thành bản nháp
          </Button>
        </article>
      ))}
      {(history?.nextCursor ?? row.nextCursor) && (
        <Button
          variant="ghost"
          disabled={locked}
          onClick={async () => {
            const result = await api.read(service.id, {}, history?.nextCursor ?? row.nextCursor);
            setHistory(result.data);
          }}
        >
          Xem phiên bản cũ hơn
        </Button>
      )}
    </section>
  );
}
