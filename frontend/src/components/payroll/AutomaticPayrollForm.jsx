import { createPayrollDraftApi } from '../../services/payroll-draft-api.js';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useSession } from '../../contexts/SessionContext.jsx';
import { createApiClient } from '../../services/api-client.js';
import { useApiResource } from '../../hooks/useApiResource.js';
import { money } from './PayrollDetails.jsx';
const amounts=[['unpaidMinutes','Phút nghỉ không lương đã đối chiếu'],['overtimeVnd','Làm thêm / ban đêm theo bảng công (VND)'],['employeeInsuranceVnd','Phần bảo hiểm NLĐ theo hồ sơ đóng (VND)'],['incomeTaxVnd','Thuế TNCN theo hồ sơ thuế (VND)'],['otherLawfulDeductionsVnd','Khấu trừ hợp pháp khác (VND)']];
export function AutomaticPayrollForm({ onSaved, request: suppliedRequest }) {
  const { getCsrfToken }=useSession(), request=useMemo(()=>suppliedRequest??createApiClient({getCsrfToken}),[suppliedRequest,getCsrfToken]);
  const api=useMemo(()=>createPayrollDraftApi(request),[request]);
  const load=useCallback(({ signal })=>api.employees({ signal }),[api]),employees=useApiResource(load);
  const [draft,setDraft]=useState(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[pending,setPending]=useState(false);
  const operation=useRef(null),lock=useRef(false);
  async function preview(event){
    event.preventDefault();if(lock.current||pending)return;const data=new window.FormData(event.currentTarget),input={employeeId:data.get('employeeId'),periodStart:data.get('periodStart'),periodEnd:data.get('periodEnd'),dueAt:data.get('dueAt'),
      ...Object.fromEntries(amounts.map(([key])=>[key,Number(data.get(key))])),attendanceReference:data.get('attendanceReference'),statutoryReference:data.get('statutoryReference'),deductionConsentReference:data.get('deductionConsentReference'),
      attendanceConfirmed:data.get('attendanceConfirmed')==='on',statutoryConfirmed:data.get('statutoryConfirmed')==='on'};
    lock.current=true;setBusy(true);setDraft(null);setNotice('');
    try{const result=await api.preview(input);setDraft({...result.data,input});}
    catch(error){setNotice(`Chưa lập được bản nháp (${error.code}). Hợp đồng cần có lịch làm việc và kỳ công đã kết thúc.`);}finally{lock.current=false;setBusy(false);}
  }
  async function save(){
    if(lock.current)return;if(!operation.current&&draft)operation.current={body:{input:draft.input,sourceHash:draft.sourceHash},key:'payroll:'+globalThis.crypto.randomUUID()};if(!operation.current)return;
    lock.current=true;setBusy(true);setNotice('');
    try{await api.prepare(operation.current.body,operation.current.key);
      operation.current=null;setPending(false);setDraft(null);setNotice('Đã lập phiếu chờ duyệt từ nguồn đã kiểm tra.');onSaved?.();}
    catch(error){const unknown=!error.status||error.status>=500||error.code==='INVALID_RESPONSE';setPending(unknown);if(!unknown){operation.current=null;setDraft(null);}setNotice(unknown?'Chưa xác nhận được. Chỉ gửi lại cùng yêu cầu, không lập phiếu mới.':`Chưa lưu (${error.code}). Xem lại nguồn và tạo bản nháp mới.`);}finally{lock.current=false;setBusy(false);}
  }
  return <section className="automatic-payroll"><h2>Lập phiếu từ hợp đồng và dữ liệu công</h2>
    <p>Hệ thống tự tính công chuẩn theo lịch đã ký, lương cơ bản, phụ cấp và hoa hồng từ ca hoàn tất. Nghỉ phép/lễ có lương và thời gian chưa được bố trí ca không tự bị trừ lương.</p>
    {notice&&<p role="status">{notice}</p>}{pending&&<button type="button" disabled={busy} onClick={save}>Kiểm tra lại cùng yêu cầu phiếu lương</button>}
    {employees.status==='loading'&&<p>Đang tải nhân viên có hợp đồng…</p>}{['error','forbidden'].includes(employees.status)&&<p role="alert">Chưa tải được danh sách nhân viên. <button type="button" onClick={employees.retry}>Tải lại nhân viên</button></p>}
    <form onSubmit={preview} onChange={()=>{if(!pending)setDraft(null);}}><fieldset className="payroll-form" disabled={busy||pending}><legend>Chọn kỳ và đối chiếu ngoại lệ</legend>
      <label className="payroll-field"><span>Nhân viên</span><select aria-label="Nhân viên" name="employeeId" required defaultValue=""><option value="">Chọn nhân viên</option>{employees.data?.items?.map(row=><option key={row.id} value={row.id} disabled={!row.automaticReady}>{row.displayName} · {row.employeeCode??'Hợp đồng cũ cần bổ sung lịch'}</option>)}</select></label>
      {[['periodStart','Từ ngày'],['periodEnd','Đến trước ngày'],['dueAt','Ngày trả theo thỏa thuận']].map(([key,label])=><label key={key} className="payroll-field"><span>{label}</span><input required name={key} type="date"/></label>)}
      {amounts.map(([key,label])=><label key={key} className="payroll-field"><span>{label}</span><input required name={key} type="number" min="0" step="1" placeholder="Nhập sau khi đối chiếu, kể cả 0"/></label>)}
      {[['attendanceReference','Căn cứ bảng công đã chốt'],['statutoryReference','Căn cứ thuế, bảo hiểm và làm thêm'],['deductionConsentReference','Căn cứ khấu trừ / xác nhận không phát sinh']].map(([key,label])=><label key={key} className="payroll-field"><span>{label}</span><input required name={key} maxLength={70}/></label>)}
      <label className="payroll-check"><input required name="attendanceConfirmed" type="checkbox"/>Đã đối chiếu công; chỉ nhập nghỉ không lương có căn cứ, không dùng số ca dịch vụ thay công làm việc.</label>
      <label className="payroll-check"><input required name="statutoryConfirmed" type="checkbox"/>Đã xác minh nghĩa vụ thuế, bảo hiểm, làm thêm/ban đêm và khấu trừ; số 0 chỉ dùng khi có căn cứ.</label>
      <button type="submit">Tạo bản nháp và xem cách tính</button></fieldset></form>
    {draft&&<section><h3>Kiểm tra trước khi lập phiếu</h3><p>Công chuẩn tháng: {draft.scheduledMonthMinutes/60} giờ · Công theo lịch kỳ này: {draft.plannedPeriodMinutes/60} giờ · Công trả lương: {draft.paidPeriodMinutes/60} giờ · {draft.serviceCredits} ca hoàn tất.</p>
      <dl>{[['baseVnd','Lương cơ bản'],['allowanceVnd','Phụ cấp'],['commissionVnd','Hoa hồng'],['grossVnd','Tổng gross'],['employeeInsuranceVnd','Bảo hiểm NLĐ'],['incomeTaxVnd','Thuế TNCN'],['payableVnd','Dự kiến thực nhận']].map(([key,label])=><div key={key}><dt>{label}</dt><dd>{money(draft.breakdown[key]??0)}</dd></div>)}</dl>
      <p>Hẹn trả theo hợp đồng: {draft.contract.paySchedule??'Đối chiếu bản ký'}.</p>{draft.warnings.map(warning=><p key={warning}>{warning}</p>)}
      <details><summary>Xem lịch công chuẩn</summary><ul>{draft.calendar.filter(row=>row.inPeriod).map(row=><li key={row.date}>{row.date}: {row.minutes/60} giờ theo hợp đồng</li>)}</ul></details>
      <button type="button" disabled={busy||pending} onClick={save}>Lập phiếu chờ duyệt từ bản này</button></section>}
  </section>;
}
