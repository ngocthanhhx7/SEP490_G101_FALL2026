import { useEffect, useRef, useState } from 'react';
import { Plus, Syringe, Trash2 } from 'lucide-react';
import { Button, Input } from '../../components/ui/index.js';
import { vaccinationNote, vaccinationRows } from '../../utils/pet-vaccinations.js';

export function PetVaccinations({ value = '', onChange, disabled }) {
  const [rows, setRows] = useState(() => vaccinationRows(value).length ? vaccinationRows(value) : [{ name: '', date: '' }]);
  const emitted = useRef(value);
  useEffect(() => {
    if (value !== emitted.current) {
      emitted.current = value;
      setRows(vaccinationRows(value).length ? vaccinationRows(value) : [{ name: '', date: '' }]);
    }
  }, [value]);
  function update(next) { setRows(next); emitted.current = vaccinationNote(next); onChange(emitted.current); }
  return <div className="pet-vaccinations"><p>Thêm từng vaccine hoặc mũi tiêm. Nếu chưa nhớ ngày, bạn có thể để trống ngày và bổ sung sau.</p>
    {rows.map((row, index) => <div className="pet-vaccine-row" key={index}>
      <span className="pet-vaccine-number"><Syringe size={17} aria-hidden="true" />Mũi {index + 1}</span>
      <Input label={`Tên vaccine ${index + 1}`} value={row.name} required maxLength={200} disabled={disabled} placeholder="Tên trên sổ tiêm của bé" onChange={e => update(rows.map((r, i) => i === index ? { ...r, name: e.target.value } : r))} />
      <Input label={`Ngày tiêm ${index + 1}`} type="date" value={row.date} disabled={disabled} onChange={e => update(rows.map((r, i) => i === index ? { ...r, date: e.target.value } : r))} />
      {rows.length > 1 && <Button variant="ghost" disabled={disabled} aria-label={`Xóa mũi ${index + 1}`} onClick={() => update(rows.filter((_, i) => i !== index))}><Trash2 size={17} /></Button>}
    </div>)}
    <Button variant="secondary" disabled={disabled || rows.length >= 20} onClick={() => update([...rows, { name: '', date: '' }])}><Plus size={16} />Thêm mũi tiêm</Button>
    <input className="pet-validation-value" tabIndex={-1} aria-label="Thông tin vaccine" value={value} onChange={() => {}} required ref={node => node?.setCustomValidity(value.length > 2000 ? 'Thông tin vaccine tối đa 2.000 ký tự.' : '')} />
    {value.length > 2000 && <p role="alert">Thông tin vaccine tối đa 2.000 ký tự. Rút gọn tên hoặc ghi chú trước khi tiếp tục.</p>}
  </div>;
}
