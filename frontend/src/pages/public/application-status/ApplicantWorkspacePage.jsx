import { APPLICATION_DOCUMENT_LABELS, REQUIRED_APPLICATION_IMAGES } from '../../../constants/application-documents.js';
import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSession } from '../../../contexts/SessionContext.jsx';
import { useApiResource } from '../../../hooks/useApiResource.js';
import { sitterApplicationApi } from '../../../services/sitter-application-api.js';
import { ApplicationStatusPage } from './ApplicationStatusPage.jsx';
import './applicant-workspace.css';
const labels={PENDING:'Chờ xử lý',UNDER_REVIEW:'Đang thẩm định',INTERVIEW:'Phỏng vấn và hợp đồng',APPROVED:'Đã duyệt',REJECTED:'Chưa được duyệt'};
const date=value=>new Date(value).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'});
const list=value=>value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);

function ApplicantEditor({application,api,onSaved,onCancel}) {
  const [busy,setBusy]=useState(false),[pending,setPending]=useState(false),[notice,setNotice]=useState('');
  const operation=useRef(null),lock=useRef(false);
  const [documents,setDocuments]=useState(application.documents.map(d=>({...d,storageRef:d.documentId}))),[uploading,setUploading]=useState(false);
  async function upload(event,type){
    const files=[...event.target.files];event.target.value='';if(!files.length)return;
    setUploading(true);setNotice('');
    try {const next=[];for(const file of files){const row=await api.uploadDocument(file,{documentType:type});next.push({...row,documentType:type});}
      setDocuments(old=>REQUIRED_APPLICATION_IMAGES.includes(type)?[...old.filter(d=>d.documentType!==type && d.documentType!=='IDENTITY'),...next]:[...old,...next]);
    }catch(error){setNotice(`Chưa tải được giấy tờ (${error.code}). Dùng ảnh JPG/PNG tối đa 5 MB.`);}finally{setUploading(false);}
  }
  async function save(event){
    event?.preventDefault();if(lock.current)return;
    if (!operation.current && REQUIRED_APPLICATION_IMAGES.some(type=>documents.filter(d=>d.documentType===type).length!==1)) {setNotice('Bổ sung đủ mặt trước CCCD, mặt sau CCCD và ảnh chân dung trước khi lưu.');return;}
    if(!operation.current){const data=new window.FormData(event.currentTarget);operation.current={key:api.createIdempotencyKey(),body:{applicationId:application.id,expectedVersion:application.version,
      ...Object.fromEntries(['displayName','dateOfBirth','identityNumber','employmentType','experience'].map(k=>[k,data.get(k)])),requestedServices:list(data.get('requestedServices')),workAreas:list(data.get('workAreas')),documents}};}
    lock.current=true;setBusy(true);setNotice('');
    try{await api.updateMine(operation.current.body,{key:operation.current.key});operation.current=null;onSaved();}
    catch(error){const uncertain=!error.status||error.status>=500||error.code==='INVALID_RESPONSE';setPending(uncertain);if(!uncertain)operation.current=null;
      setNotice(uncertain?'Chưa nhận xác nhận lưu. Thử lại đúng yêu cầu, không tạo hồ sơ mới.':['VERSION_CONFLICT','APPLICATION_EDIT_CLOSED'].includes(error.code)?'Hồ sơ đã thay đổi hoặc bắt đầu được xử lý. Đóng bản sửa và tải lại để xem trạng thái mới.':`Chưa lưu được (${error.code}). Kiểm tra thông tin và giấy tờ.`);
    }finally{lock.current=false;setBusy(false);}
  }
  return <form onSubmit={save} className="applicant-edit"><h2>Sửa hồ sơ ứng tuyển</h2><p>Giữ nguyên email đã xác minh: {application.contact.value}. Thay đổi sẽ cập nhật hồ sơ này, không tạo hồ sơ mới.</p>
    {notice&&<p role="status">{notice}</p>}{pending&&<button type="button" disabled={busy} onClick={()=>save()}>Kiểm tra lại cùng yêu cầu</button>}
    <fieldset disabled={busy||pending||uploading}><legend>Thông tin ứng tuyển</legend>
      {[['displayName','Họ và tên','text'],['dateOfBirth','Ngày sinh','date'],['identityNumber','Số CCCD hoặc giấy tờ định danh','text']].map(([key,label,type])=><label key={key}>{label}<input required name={key} type={type} maxLength={key==='displayName'?100:20} defaultValue={application[key]}/></label>)}
      <label>Hình thức làm việc<select name="employmentType" required defaultValue={application.employmentType}><option value="">Chọn hình thức</option><option value="FULL_TIME">Full time · tối thiểu 40 giờ/tuần</option><option value="PART_TIME">Part time · tối thiểu 20 giờ/tuần</option></select></label>
      <label>Kinh nghiệm<textarea required minLength={10} maxLength={2000} name="experience" defaultValue={application.experience}/></label>
      <label>Dịch vụ muốn thực hiện (mỗi dòng một dịch vụ)<textarea required name="requestedServices" defaultValue={application.requestedServices.join('\n')}/></label>
      <label>Khu vực muốn làm việc (mỗi dòng một khu vực)<textarea required name="workAreas" defaultValue={application.workAreas.join('\n')}/></label>
      <h3>Giấy tờ đã gửi</h3><p>Các ảnh đã gửi được giữ lại; chỉ tải ảnh mới nếu muốn thay đổi.</p><ul>{documents.map(d=><li key={d.documentId}>{APPLICATION_DOCUMENT_LABELS[d.documentType] ?? 'Tài liệu bổ sung'}<img className="applicant-document-thumbnail" src={`/api/v1/applicant-documents/${encodeURIComponent(d.documentId)}/content`} alt={APPLICATION_DOCUMENT_LABELS[d.documentType] ?? 'Tài liệu bổ sung'} />{!REQUIRED_APPLICATION_IMAGES.includes(d.documentType)&&<button type="button" onClick={()=>setDocuments(rows=>rows.filter(x=>x.documentId!==d.documentId))}>Bỏ giấy tờ bổ sung</button>}</li>)}</ul>
      <p>Hồ sơ mới hoặc sửa cần đủ hai mặt CCCD và ảnh chân dung. Ảnh cũ chưa ghi rõ mặt cần được thay bằng ảnh đúng loại.</p>
      {REQUIRED_APPLICATION_IMAGES.map(type=><label key={type}>{APPLICATION_DOCUMENT_LABELS[type]}<input type="file" accept="image/jpeg,image/png" onChange={event=>upload(event,type)}/></label>)}
      <label>Thêm giấy tờ bổ sung<input type="file" accept="image/jpeg,image/png" multiple onChange={event=>upload(event,'CERTIFICATE')}/></label>
      <button type="submit">Lưu thay đổi hồ sơ</button>
    </fieldset><button type="button" disabled={busy||uploading||pending} onClick={onCancel}>Đóng bản sửa</button>
    {pending&&<p>Giữ trang này để đối soát yêu cầu đang chưa nhận xác nhận.</p>}
  </form>;
}
export function ApplicantWorkspacePage({api=sitterApplicationApi,legacyApi}) {
  const session=useSession();
  if(session.status==='loading')return <p role="status">Đang kiểm tra phiên đăng nhập…</p>;
  if(session.status!=='authenticated')return <section className="applicant-workspace"><h1>Hồ sơ ứng tuyển của bạn</h1><p>Đăng nhập bằng tài khoản đã nộp hồ sơ để xem trực tiếp và chỉnh sửa khi hồ sơ chưa được xử lý.</p><Link to="/sign-in" state={{from:'/sitter/application-status'}}>Đăng nhập để xem hồ sơ</Link><details><summary>Tra cứu hồ sơ cũ không có tài khoản</summary><ApplicationStatusPage api={legacyApi}/></details></section>;
  if(!session.user.roles.some(role=>['CUSTOMER','PET_SITTER'].includes(role))||session.user.roles.some(role=>['ADMIN','STAFF'].includes(role)))return <section className="applicant-workspace"><h1>Hồ sơ ứng tuyển</h1><p>Tài khoản này không phải tài khoản ứng viên.</p><Link to="/">Về trang chủ</Link></section>;
  return <OwnedApplication api={api} key={session.user.id}/>;
}
function OwnedApplication({api}) {
  const load=useCallback(({signal})=>api.getMine({signal}),[api]),resource=useApiResource(load),[editing,setEditing]=useState(false);
  if(resource.status==='loading')return <p role="status">Đang tải hồ sơ của bạn…</p>;
  if(resource.status!=='success')return <section className="applicant-workspace" role="alert"><h1>Chưa tải được hồ sơ</h1><button onClick={resource.retry}>Thử lại</button></section>;
  const a=resource.data.application;
  if(!a)return <section className="applicant-workspace"><h1>Bạn chưa có hồ sơ ứng tuyển</h1><p>Tài khoản này chưa có hồ sơ. Nếu đã nộp, hãy đăng nhập bằng đúng email đã đăng ký.</p><Link to="/sitter/apply">Đăng ký làm Pet Sitter</Link></section>;
  return <section className="applicant-workspace"><header><p>PAW WORLD CARE · HỒ SƠ CỦA BẠN</p><h1>Hồ sơ ứng tuyển Pet Sitter</h1><span className="applicant-status">{labels[a.state]}</span><p>Nộp ngày {date(a.submittedAt)} · Cập nhật {date(a.updatedAt)}</p></header>
    <ol className="applicant-progress" aria-label="Tiến trình hồ sơ">{['PENDING','UNDER_REVIEW','INTERVIEW','APPROVED'].map(state=><li key={state} aria-current={state===a.state?'step':undefined}>{labels[state]}</li>)}</ol>
    {a.rejectionReason&&<div role="status"><h2>Lý do chưa được duyệt</h2><p>{a.rejectionReason}</p>{a.reapplyAt&&<p>Có thể nộp lại từ {date(a.reapplyAt)}.</p>}<Link to="/sitter/apply">Xem điều kiện nộp lại</Link></div>}
    {editing?<ApplicantEditor application={a} api={api} onCancel={()=>setEditing(false)} onSaved={()=>{setEditing(false);resource.retry();}}/>:<><div className="applicant-summary"><h2>Thông tin đã gửi</h2><dl><dt>Họ và tên</dt><dd>{a.displayName}</dd><dt>Liên hệ đã xác minh</dt><dd>{a.contact.value}</dd><dt>Ngày sinh</dt><dd>{a.dateOfBirth?new Date(a.dateOfBirth+'T00:00:00+07:00').toLocaleDateString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'}):'Chưa lưu giá trị gốc'}</dd><dt>Giấy tờ định danh</dt><dd>{a.identityNumber?'••••'+a.identityNumber.slice(-4):'Chưa lưu giá trị gốc'}</dd><dt>Hình thức</dt><dd>{a.employmentType==='FULL_TIME'?'Full time':a.employmentType==='PART_TIME'?'Part time':'Chưa chọn'}</dd><dt>Kinh nghiệm</dt><dd>{a.experience}</dd><dt>Dịch vụ</dt><dd>{a.requestedServices.join(', ')}</dd><dt>Khu vực</dt><dd>{a.workAreas.join(', ')}</dd><dt>Giấy tờ</dt><dd>{a.documents.length} ảnh đã gửi</dd></dl></div>
    {a.canEdit?<><p>Bạn có thể sửa thông tin và giấy tờ cho đến khi PawWorld bắt đầu thẩm định.</p><button onClick={()=>setEditing(true)}>Sửa hồ sơ</button></>:<p>{a.state==='APPROVED'?'Hồ sơ đã được duyệt. Bạn có thể mở khu vực Pet Sitter.':'Hồ sơ đã được xử lý nên không thể sửa trực tiếp. Nếu cần đính chính, hãy liên hệ PawWorld.'}</p>}
    <button onClick={resource.retry}>Cập nhật trạng thái</button></>}
    {a.timeline?.length>0&&<details><summary>Lịch sử xử lý hồ sơ</summary><ul>{a.timeline.map((t,index)=><li key={index}>{date(t.at)} · {t.action==='APPLICATION_UPDATED'?'Bạn cập nhật hồ sơ':labels[t.state]??t.state}</li>)}</ul></details>}
    {a.state==='APPROVED'&&<Link to="/sitter">Mở khu vực Pet Sitter</Link>}<Link to="/account">Tài khoản khách hàng</Link>
  </section>;
}
