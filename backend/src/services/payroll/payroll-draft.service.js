import { createHash } from 'node:crypto';
import { payrollModels } from '../../models/payroll.model.js';
import { exact, id, number, fail } from '../../validators/pet-care.validator.js';
import { contractDate } from '../../validators/employment-document.validator.js';
import { calculateEmployeePayroll } from './payroll-calculation.service.js';
import { createCommissionSources } from './commission-source.service.js';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const DAY = 86400000;
export function createPayrollDraftService({ connection, clock = Date.now }) {
  const { EmploymentContract: Contract, PayrollServiceCredit: Credit, SalaryAdvance: Advance } = payrollModels(connection);
  const commissionSources = createCommissionSources({ connection });
  const admin = actor => { if (actor?.state !== 'ACTIVE' || !actor.roles?.includes('ADMIN')) fail('FORBIDDEN', 'Admin required', 403); };
  return {
    async employees(actor) {
      admin(actor);
      const contracts = await Contract.aggregate([{ $sort: { employeeId: -1, version: -1 } }, { $group: { _id: '$employeeId', contract: { $first: '$$ROOT' } } }, { $limit: 201 }]);
      if (contracts.length > 200) fail('PAYROLL_REVIEW_REQUIRED', 'Employee directory requires paged review', 409);
      const users = await connection.collection('users').find({ _id: { $in: contracts.map(row => row._id) }, roles: 'PET_SITTER' }, { projection: { displayName: 1 } }).toArray();
      return { items: users.map(user => { const c = contracts.find(row => String(row._id) === String(user._id)).contract;
        return { id: String(user._id), displayName: user.displayName, employeeCode: c.employeeCode ?? null, automaticReady: c.workScheduleMode === 'SELF_REGISTERED' || Boolean(c.schedule?.weekdays?.length), monthlyBaseVnd: c.monthlyBaseVnd, payCycle: c.payCycle }; }) };
    },
    async preview(actor, input, session) {
      admin(actor); exact(input, ['employeeId','periodStart','periodEnd','dueAt','unpaidMinutes','attendanceReference','attendanceConfirmed',
        'overtimeVnd','employeeInsuranceVnd','incomeTaxVnd','otherLawfulDeductionsVnd','statutoryReference','statutoryConfirmed','deductionConsentReference'],
      ['employeeId','periodStart','periodEnd','dueAt','unpaidMinutes','attendanceReference','attendanceConfirmed','overtimeVnd','employeeInsuranceVnd','incomeTaxVnd','otherLawfulDeductionsVnd','statutoryReference','statutoryConfirmed','deductionConsentReference']);
      id(input.employeeId);
      const start = contractDate(input.periodStart), end = contractDate(input.periodEnd), due = contractDate(input.dueAt);
      if (end <= start || end > new Date(clock()) || due < end || end - start > 31 * DAY || input.periodStart.slice(0,7) !== new Date(end.getTime() - 1 + 7 * 3600000).toISOString().slice(0,7)) fail('VALIDATION_FAILED', 'Completed single-month period required');
      const contract = await Contract.findOne({ employeeId: input.employeeId, supersededAt: null, effectiveAt: { $lte: start } }).sort({ version: -1 }).session(session ?? null).lean();
      const selfRegistered = contract?.workScheduleMode === 'SELF_REGISTERED';
      if (selfRegistered && ![1200,2400].includes(contract.minimumWeeklyMinutes)) fail('CONTRACT_SCHEDULE_REQUIRED','Verified minimum weekly commitment required',409);
      if (!(selfRegistered || contract?.schedule?.weekdays?.length) || contract.endsAt && contract.endsAt < end || await Contract.exists({ employeeId: input.employeeId, supersededAt: null, effectiveAt: { $gt: start, $lt: end } }).session(session ?? null)) fail('CONTRACT_SCHEDULE_REQUIRED', 'Signed contract schedule must cover period; split contract changes', 409);
      // Legacy contracts stay readable but are never assigned an invented workweek.
      const month = input.periodStart.slice(0,7), monthStart = contractDate(month + '-01'), [year, monthNumber] = month.split('-').map(Number), next = new Date(Date.UTC(year, monthNumber, 1) - 7*3600000);
      const days = [];
      for (let at = monthStart.getTime(); !selfRegistered && at < next.getTime(); at += DAY) {
        const local = new Date(at + 7*3600000), weekday = local.getUTCDay() || 7;
        if (contract.schedule.weekdays.includes(weekday)) days.push({ date: local.toISOString().slice(0,10), minutes: contract.schedule.dailyMinutes, inPeriod: at >= start && at < end });
      }
      // A monthly salary remains whole without inventing weekdays or treating availability as attendance.
      // This normalized denominator cancels (paid === scheduled); it must never price unpaid time.
      if (selfRegistered && (start.getTime() !== monthStart.getTime() || end.getTime() !== next.getTime() || input.unpaidMinutes !== 0))
        fail('PAYROLL_ATTENDANCE_REVIEW_REQUIRED', 'Use verified advanced attendance for partial months or unpaid exceptions; minimum hours are not a timecard', 409);
      const scheduledMonthMinutes = selfRegistered ? Math.round(contract.minimumWeeklyMinutes * 52 / 12) : days.reduce((sum,row)=>sum+row.minutes,0),
        plannedPeriodMinutes = selfRegistered ? scheduledMonthMinutes : days.filter(row=>row.inPeriod).reduce((sum,row)=>sum+row.minutes,0);
      number(input.unpaidMinutes,0,plannedPeriodMinutes,true);
      for (const field of ['overtimeVnd','employeeInsuranceVnd','incomeTaxVnd','otherLawfulDeductionsVnd']) number(input[field],0,1000000000,true);
      for (const field of ['attendanceReference','statutoryReference','deductionConsentReference']) if (typeof input[field] !== 'string' || !input[field].trim() || input[field].length>160 || /[\x00-\x1f\x7f]/.test(input[field])) fail('PAYROLL_EVIDENCE_REQUIRED', 'Attendance and statutory assessment references required', 422);
      if (input.attendanceConfirmed !== true || input.statutoryConfirmed !== true) fail('PAYROLL_EVIDENCE_REQUIRED', 'Verify attendance, overtime/night pay, tax and insurance before preparing', 422);
      const credits = await Credit.find({ employeeId: input.employeeId, completedAt: { $gte:start,$lt:end } }).sort({ _id:1 }).limit(1001).session(session ?? null).lean();
      if (credits.length>1000) fail('PAYROLL_REVIEW_REQUIRED','Too many service credits',409);
      const commission = await commissionSources.payable(input.employeeId, end, session);
      const assessment = { employeeId:input.employeeId,periodStart:start.toISOString(),periodEnd:end.toISOString(),dueAt:due.toISOString(),
        scheduledMonthMinutes,paidPeriodMinutes:plannedPeriodMinutes-input.unpaidMinutes,kpiTargetMinutes:0,seriousViolationConfirmed:false,includeMonthlyBonus:false,
        overtimeVnd:input.overtimeVnd,employeeInsuranceVnd:input.employeeInsuranceVnd,incomeTaxVnd:input.incomeTaxVnd,otherLawfulDeductionsVnd:input.otherLawfulDeductionsVnd,
        assessmentReference:input.attendanceReference.trim()+' | '+input.statutoryReference.trim(),deductionConsentReference:input.deductionConsentReference.trim(),advanceRepayments:[] };
      if (assessment.assessmentReference.length>160) fail('VALIDATION_FAILED','Combined source references must fit 160 characters');
      const breakdown=calculateEmployeePayroll({contract,scheduledMinutes:scheduledMonthMinutes,paidMinutes:assessment.paidPeriodMinutes,
        serviceNetVnd:commission.payable.reduce((sum,row)=>sum+row.serviceNetVnd,0),kpi:{targetMinutes:0,completedMinutes:credits.reduce((sum,row)=>sum+row.careMinutes,0),onTimeBps:0,reportBps:0,seriousViolationConfirmed:false},
        overtimeVnd:input.overtimeVnd,employeeInsuranceVnd:input.employeeInsuranceVnd,incomeTaxVnd:input.incomeTaxVnd,otherLawfulDeductionsVnd:input.otherLawfulDeductionsVnd});
      const advances=await Advance.find({employeeId:input.employeeId,status:'PAID',settlementPeriod:{$lte:month}}).select('_id amountVnd').limit(100).session(session ?? null).lean();
      const sourceHash=hash({policyVersion:breakdown.policyVersion,contractId:String(contract._id),version:contract.version,schedule:contract.schedule,workScheduleMode:contract.workScheduleMode,minimumWeeklyMinutes:contract.minimumWeeklyMinutes,terms:[contract.monthlyBaseVnd,contract.monthlyAllowanceVnd],assessment,
        credits:credits.map(row=>[String(row._id),row.sourceVersion,row.serviceNetVnd,row.careMinutes]),
        payableCommission:commission.payable.map(row=>[String(row._id),row.sourceVersion,row.serviceNetVnd]),
        heldCommission:commission.held.map(row=>String(row._id)),advances:advances.map(row=>[String(row._id),row.amountVnd])});
      return {sourceHash,assessment,breakdown,contract:{reference:contract.employeeCode??String(contract._id),version:contract.version,payCycle:contract.payCycle,paySchedule:contract.paySchedule??null},
        scheduleBasis:selfRegistered?'MONTHLY_MINIMUM_COMMITMENT':'FIXED_CONTRACT_CALENDAR',minimumWeeklyMinutes:contract.minimumWeeklyMinutes??null,calendar:days,scheduledMonthMinutes,plannedPeriodMinutes,paidPeriodMinutes:assessment.paidPeriodMinutes,serviceCredits:credits.length,
        payableCommissionCredits:commission.payable.length,heldCommissionCredits:commission.held.length,
        carriedCommissionCredits:commission.payable.filter(row=>row.completedAt<start).length,
        warnings:[...(selfRegistered?['Hợp đồng chỉ ghi số giờ tối thiểu; lịch do nhân viên tự đăng ký sau. Lương cơ bản/phụ cấp đủ tháng không bị giảm do ít ca hoặc chưa đăng ký lịch. Kỳ lẻ và nghỉ không lương phải dùng bảng công đã xác minh tại đối soát nâng cao.']:[]),'Nghỉ lễ/phép có lương và thời gian công ty chưa bố trí việc không tự bị trừ. Lịch đăng ký chỉ phục vụ điều phối, không phải bảng công.',
          'Thưởng KPI và đối trừ tạm ứng chỉ thêm sau khi có mục tiêu, đánh giá và thỏa thuận đã xác minh; bản nháp này không tự chốt hai khoản đó.',
          ...(advances.length?['Có khoản tạm ứng đã chi cần đối soát riêng; chưa tự đối trừ.']:[]),
          ...(commission.held.length?['Hoa hồng booking có khiếu nại/hoàn tiền chưa kết luận đang được giữ; lương cơ bản và phụ cấp không bị giảm.']:[])]};
    }
  };
}
