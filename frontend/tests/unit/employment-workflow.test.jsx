import { createEmploymentDocumentApi } from '../../src/services/employment-document-api.js';
import { EmploymentContractPrint } from '../../src/components/payroll/EmploymentContractPrint.jsx';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EmploymentContractEditor } from '../../src/components/payroll/EmploymentContractEditor.jsx';
import { AutomaticPayrollForm } from '../../src/components/payroll/AutomaticPayrollForm.jsx';
jest.mock('../../src/contexts/SessionContext.jsx', () => ({ useSession: () => ({ getCsrfToken: () => 'synthetic-csrf' }) }));
const application={id:'a'.repeat(24),version:2,state:'INTERVIEW',displayName:'Synthetic employee',employmentType:'FULL_TIME'};
const terms={employerName:'Synthetic employer',employerPhone:'0900000001',employerEmail:'employer@example.test',employeePhone:'0900000002',employeeEmail:'employee@example.test',employerAddress:'Synthetic address',registrationNumber:'SYNTHETIC',representativeName:'Synthetic representative',representativeTitle:'Director',authorityBasis:'Synthetic authority',employeeName:'Synthetic employee',nationality:'Việt Nam',dateOfBirth:'1990-04-12',gender:'Nam',residence:'Synthetic residence',identityNumber:'012345678901',identityIssuedOn:'2020-01-01',identityIssuedBy:'Synthetic authority',jobTitle:'Pet care',duties:'Synthetic care',workplace:'Synthetic Hanoi',workplaceRegion:1,workplaceReference:'Synthetic I',signingPlace:'Hanoi',plannedSigningOn:'2026-11-05',effectiveOn:'2026-11-06',termType:'INDEFINITE',employmentType:'FULL_TIME',dailyMinutes:480,weeklyMinutes:2400,weekdays:[1,2,3,4,5],monthlyBaseVnd:10000000,monthlyAllowanceVnd:0,payMethod:'Bank',paySchedule:'05 next month',salaryReview:'Annual',restRules:'08–17; rest1h',protection:'Synthetic safety',insurance:'Statutory',training:'Before work'};
test('issued contract prints complete terms and requires actual dual signature before reporting verified',async()=>{
  const doc={id:'b'.repeat(24),terms,reference:'HDLD-SYNTHETIC',employeeCode:'NV-SYNTHETIC',revision:1,termsHash:'c'.repeat(64),templateVersion:'synthetic-v1',state:'ISSUED'};
  const api={get:jest.fn().mockResolvedValue({current:doc,history:[]}),decide:jest.fn().mockResolvedValue({...doc,state:'SIGNED'})},onVerified=jest.fn();
  render(<EmploymentContractEditor application={application} api={api} onVerified={onVerified}/>);
  await screen.findByRole('button',{name:'In hợp đồng / Lưu PDF'});
  expect(screen.getAllByText(/HDLD-SYNTHETIC/).length).toBeGreaterThan(0);
  fireEvent.change(screen.getByLabelText('Ngày hai bên đã ký'),{target:{value:'2026-11-05'}});
  fireEvent.change(screen.getByLabelText('Vị trí lưu bản gốc / hồ sơ ký'),{target:{value:'Synthetic physical archive'}});
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button',{name:'Xác nhận hợp đồng hai bên đã ký'}));
  await waitFor(()=>expect(onVerified).toHaveBeenCalledWith(true));
  expect(api.decide.mock.calls[0][2]).toMatchObject({action:'SIGN',termsHash:doc.termsHash,bothPartiesSigned:true});
});
test('unknown signing acknowledgement keeps original payload and key and locks inputs',async()=>{
  const doc={id:'b'.repeat(24),terms,reference:'HDLD-SYNTHETIC',revision:1,termsHash:'c'.repeat(64),state:'DRAFT'};
  const api={get:jest.fn().mockResolvedValue({current:doc,history:[]}),decide:jest.fn().mockRejectedValueOnce({code:'NETWORK_ERROR'}).mockResolvedValue({...doc,state:'ISSUED'})};
  render(<EmploymentContractEditor application={application} api={api}/>);
  fireEvent.click(await screen.findByRole('button',{name:'Chốt nội dung bản in để ký'}));
  fireEvent.click(await screen.findByRole('button',{name:'Kiểm tra lại cùng yêu cầu hợp đồng'}));
  await waitFor(()=>expect(api.decide).toHaveBeenCalledTimes(2));expect(api.decide.mock.calls[0]).toEqual(api.decide.mock.calls[1]);
});
test('automatic payroll chooses employees by name, derives preview and preserves uncertain save',async()=>{
  const draft={sourceHash:'a'.repeat(64),breakdown:{baseVnd:10000000,payableVnd:8950000},scheduledMonthMinutes:10080,plannedPeriodMinutes:10080,paidPeriodMinutes:10080,serviceCredits:0,contract:{paySchedule:'05 next month'},warnings:[],calendar:[]};
  let saves=0;
  const request=jest.fn(async(path)=>{
    if(path==='/payroll/employees')return {data:{items:[{id:application.id,displayName:'Synthetic employee',employeeCode:'NV-SYNTHETIC',automaticReady:true}]}};
    if(path.endsWith('/preview'))return {data:draft};
    if(++saves===1)throw {code:'TIMEOUT'};
    return {data:{id:'b'.repeat(24),status:'PREPARED'}};
  });
  render(<AutomaticPayrollForm request={request}/>);
  await screen.findByRole('option',{name:/Synthetic employee/});
  fireEvent.change(screen.getByLabelText('Nhân viên'),{target:{value:application.id}});
  fireEvent.submit(screen.getByRole('button',{name:'Tạo bản nháp và xem cách tính'}).closest('form'));
  fireEvent.click(await screen.findByRole('button',{name:'Lập phiếu chờ duyệt từ bản này'}));
  fireEvent.click(await screen.findByRole('button',{name:'Kiểm tra lại cùng yêu cầu phiếu lương'}));
  await screen.findByText('Đã lập phiếu chờ duyệt từ nguồn đã kiểm tra.');
  const writes=request.mock.calls.filter(([path])=>path.endsWith('/from-sources'));expect(writes[0]).toEqual(writes[1]);
});

test.each([['FULL_TIME',2400,'40'],['PART_TIME',1200,'20']])('minimum contract %s prints hours without a fixed daily calendar', (employmentType,minimumWeeklyMinutes,hours)=>{
  const {container}=render(<EmploymentContractPrint document={{reference:'HDLD-SYNTHETIC',employeeCode:'NV-SYNTHETIC',termsHash:'c'.repeat(64),state:'ISSUED',terms:{...terms,weekdays:undefined,dailyMinutes:undefined,employmentType,workScheduleMode:'SELF_REGISTERED',minimumWeeklyMinutes}}}/>);
  expect(container.textContent).toContain(hours+' giờ/tuần');
  expect(container.textContent).toContain('tự đăng ký ngày, giờ làm cụ thể');
  expect(container.textContent).not.toContain('các ngày theo tuần:');
});
test('new draft editor has no weekday or daily-hours input',async()=>{
  render(<EmploymentContractEditor application={application} api={{get:jest.fn().mockResolvedValue({current:null,history:[]})}}/>);
  fireEvent.click(await screen.findByRole('button',{name:'Soạn hợp đồng'}));
  expect(screen.queryByLabelText('Phút làm việc/ngày')).not.toBeInTheDocument();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(screen.getByText(/Tối thiểu 40 giờ/)).toBeInTheDocument();
});

test('new contract fills applicant and Admin fields while saved draft values take priority',async()=>{
  const api={get:jest.fn().mockResolvedValue({current:null,history:[],prefill:{terms:{identityNumber:'012345678901',dateOfBirth:'1990-04-12',representativeName:'Synthetic Admin',employerEmail:'admin@example.test'},sources:{},warnings:[]}})};
  const first=render(<EmploymentContractEditor application={application} api={api}/>);
  fireEvent.click(await screen.findByRole('button',{name:'Soạn hợp đồng'}));
  expect(screen.getByLabelText('Số căn cước/hộ chiếu')).toHaveValue('012345678901');
  expect(screen.getByLabelText('Ngày sinh')).toHaveValue('1990-04-12');expect(screen.getByLabelText('Người đại diện ký')).toHaveValue('Synthetic Admin');
  fireEvent.change(screen.getByLabelText('Người đại diện ký'),{target:{value:'Edited representative'}});
  expect(screen.getByLabelText('Người đại diện ký')).toHaveValue('Edited representative');
  expect(screen.getByLabelText('Tên pháp lý bên Paw World')).toHaveValue('');
  first.unmount();
  render(<EmploymentContractEditor application={application} api={{get:jest.fn().mockResolvedValue({current:{id:'b'.repeat(24),state:'DRAFT',terms,revision:1},history:[],prefill:{terms:{representativeName:'Other Admin'},warnings:[]}})}}/>);
  fireEvent.click(await screen.findByRole('button',{name:'Tạo bản sửa hợp đồng'}));
  expect(screen.getByLabelText('Người đại diện ký')).toHaveValue(terms.representativeName);
});

test('prefill transport rejects malformed private hints instead of rendering an invalid form',async()=>{
  const bad=createEmploymentDocumentApi(jest.fn().mockResolvedValue({data:{history:[],prefill:{terms:{identityNumber:123},sources:{},warnings:[]}}}));
  await expect(bad.get(application.id)).rejects.toMatchObject({code:'INVALID_RESPONSE'});
  const legacy=createEmploymentDocumentApi(jest.fn().mockResolvedValue({data:{current:null,history:[]}}));
  await expect(legacy.get(application.id)).resolves.toMatchObject({history:[]});
});

test('contract validation identifies fields and preserves entered values for correction',async()=>{
 const api={get:jest.fn().mockResolvedValue({current:null,history:[],prefill:{terms,sources:{},warnings:[]}}),save:jest.fn().mockRejectedValue({status:422,code:'VALIDATION_FAILED',fields:{plannedSigningOn:'SIGN_BEFORE_EFFECTIVE',identityNumber:'IDENTITY_NUMBER'}})};
 render(<EmploymentContractEditor application={application} api={api}/>);
 fireEvent.click(await screen.findByRole('button',{name:'Soạn hợp đồng'}));
 fireEvent.change(screen.getByLabelText('Người đại diện ký'),{target:{value:'Edited representative'}});
 fireEvent.submit(screen.getByRole('button',{name:'Lưu bản nháp hợp đồng'}).closest('form'));
 expect(await screen.findByRole('alert')).toHaveTextContent('Ngày ký ghi trên bản in');
 expect(screen.getByRole('alert')).toHaveFocus();
 fireEvent.click(screen.getByRole('link',{name:'Ngày ký ghi trên bản in',exact:true}));
 expect(screen.getByLabelText('Ngày ký ghi trên bản in')).toHaveFocus();
 expect(screen.getByLabelText('Ngày ký ghi trên bản in')).toHaveAttribute('aria-invalid','true');
 expect(screen.getByLabelText('Số căn cước/hộ chiếu')).toHaveAttribute('aria-invalid','true');
 expect(screen.getByLabelText('Người đại diện ký')).toHaveValue('Edited representative');
 expect(screen.queryByRole('button',{name:'Kiểm tra lại cùng yêu cầu hợp đồng'})).not.toBeInTheDocument();
});
test('draft print remains visibly unsigned and never issues a contract',async()=>{
 const doc={id:'b'.repeat(24),terms,reference:'HDLD-SYNTHETIC',state:'DRAFT',revision:1};
 const api={get:jest.fn().mockResolvedValue({current:doc,history:[]}),decide:jest.fn()};
 const print=jest.spyOn(window,'print').mockImplementation(()=>{});
 render(<EmploymentContractEditor application={application} api={api}/>);
 fireEvent.click(await screen.findByRole('button',{name:'In bản nháp / Lưu PDF'}));
 expect(print).toHaveBeenCalledTimes(1);expect(api.decide).not.toHaveBeenCalled();
 expect(screen.getAllByText('BẢN NHÁP – CHƯA CHỐT ĐỂ KÝ').length).toBeGreaterThan(0);print.mockRestore();
});
