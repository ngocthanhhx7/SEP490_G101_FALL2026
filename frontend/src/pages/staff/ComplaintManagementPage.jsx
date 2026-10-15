import { useCallback, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, Input, Notice, Select } from '../../components/ui/index.js';
import { useSession } from '../../contexts/SessionContext.jsx';
import { useApiResource } from '../../hooks/useApiResource.js';
import { complaintApi } from '../../services/complaint-api.js';
import '../customer/review-complaint.css';

const labels = { OPEN: 'Äang má»Ÿ', UNDER_REVIEW: 'Äang xem xÃ©t', RESOLVED: 'ÄÃ£ pháº£n há»“i', CLOSED: 'ÄÃ£ Ä‘Ã³ng', SERVICE_QUALITY: 'Cháº¥t lÆ°á»£ng dá»‹ch vá»¥', PET_SAFETY: 'An toÃ n thÃº cÆ°ng', SITTER_CONDUCT: 'HÃ nh vi Pet Sitter', ACCESS: 'Ra vÃ o / bÃ n giao', BILLING: 'Thanh toÃ¡n', OTHER: 'KhÃ¡c' };
const label = value => labels[value] || value || 'ChÆ°a cáº­p nháº­t';
function date(value) { const parsed = new Date(value); return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(parsed) : 'ChÆ°a cÃ³ thá»i Ä‘iá»ƒm'; }

function CommandForm({ api, item, onComplete }) {
  const [mode, setMode] = useState(item.state === 'OPEN' ? 'review' : 'resolve');
  const [summary, setSummary] = useState(''); const [notes, setNotes] = useState(''); const [hold, setHold] = useState(false); const [status, setStatus] = useState({ state: 'idle' });
  const submit = async event => {
    event.preventDefault(); if (!summary.trim()) return; setStatus({ state: 'saving' });
    try {
      const result = mode === 'review' ? await api.review({ complaintId: item.id, expectedVersion: item.version, summary, staffNotes: notes || undefined }) : await api.resolve({ complaintId: item.id, expectedVersion: item.version, summary, staffNotes: notes || undefined, financialHold: hold });
      if (result?.pending) { setStatus({ state: 'pending', message: 'YÃªu cáº§u Ä‘ang chá» mÃ¡y chá»§ xÃ¡c nháº­n.' }); return; }
      setStatus({ state: 'success', message: 'MÃ¡y chá»§ Ä‘Ã£ xÃ¡c nháº­n cáº­p nháº­t xá»­ lÃ½.' }); setSummary(''); setNotes(''); onComplete?.(result);
    } catch (error) { setStatus({ state: error?.status === 403 ? 'forbidden' : 'error', message: error?.code === 'VERSION_CONFLICT' ? 'Complaint Ä‘Ã£ thay Ä‘á»•i bá»Ÿi ngÆ°á»i khÃ¡c. HÃ£y táº£i láº¡i.' : 'KhÃ´ng thá»ƒ cáº­p nháº­t complaint.' }); }
  };
  if (item.state === 'CLOSED') return null;
  return <form className="review-complaint-card review-complaint-form" onSubmit={submit}><h2>Ghi nháº­n xá»­ lÃ½</h2>{status.state !== 'idle' && <Notice state={status.state} title={status.state === 'success' ? 'ÄÃ£ xÃ¡c nháº­n' : 'Tráº¡ng thÃ¡i yÃªu cáº§u'}>{status.message}</Notice>}{item.state === 'OPEN' && <Select label="BÆ°á»›c xá»­ lÃ½" value={mode} onChange={event => setMode(event.target.value)} disabled={status.state === 'saving'}><option value="review">Chuyá»ƒn sang Ä‘ang xem xÃ©t</option><option value="resolve">Giáº£i quyáº¿t ngay</option></Select>}<Input label="TÃ³m táº¯t xá»­ lÃ½" value={summary} onChange={event => setSummary(event.target.value)} maxLength={4000} required disabled={status.state === 'saving'} /><label className="review-complaint-field"><span>Ghi chÃº ná»™i bá»™ Staff</span><textarea rows={4} value={notes} onChange={event => setNotes(event.target.value)} maxLength={8000} disabled={status.state === 'saving'} /></label>{mode === 'resolve' && <label className="review-complaint-field"><span><input type="checkbox" checked={hold} onChange={event => setHold(event.target.checked)} disabled={status.state === 'saving'} /> Giá»¯ settlement Ä‘á»ƒ chá» quyáº¿t Ä‘á»‹nh tÃ i chÃ­nh</span></label>}<Button type="submit" loading={status.state === 'saving'}>LÆ°u cáº­p nháº­t</Button></form>;
}

function ComplaintRow({ item }) {
  return <li className="review-complaint-list__item"><div className="review-complaint-list__meta"><span className="review-complaint-pill">{label(item.state)}</span><span>{label(item.category)}</span><span>Visit {item.visitId}</span></div><h2>{item.summary || 'Complaint cáº§n xem chi tiáº¿t'}</h2><p>{date(item.createdAt)}</p><Link className="pwc-button pwc-button--secondary" to={`/staff/complaints/${item.id}`}>Má»Ÿ há»“ sÆ¡</Link></li>;
}

function AdminDecisionForm({ api, item, onComplete }) {
  const [summary, setSummary] = useState(''); const [releaseHold, setReleaseHold] = useState(item.settlement?.state === 'ON_HOLD'); const [status, setStatus] = useState({ state: 'idle' });
  if (!['UNDER_REVIEW', 'RESOLVED'].includes(item.state)) return null;
  const submit = async event => {
    event.preventDefault(); if (!summary.trim()) return; setStatus({ state: 'saving' });
    try {
      const result = await api.decide({ complaintId: item.id, expectedVersion: item.version, summary,
        financialHold: releaseHold ? false : undefined });
      if (result?.pending) { setStatus({ state: 'pending', message: 'Quyáº¿t Ä‘á»‹nh Ä‘ang chá» mÃ¡y chá»§ xÃ¡c nháº­n.' }); return; }
      setStatus({ state: 'success', message: 'Admin Ä‘Ã£ ghi nháº­n quyáº¿t Ä‘á»‹nh cuá»‘i.' }); onComplete?.(result);
    } catch (error) { setStatus({ state: error?.status === 403 ? 'forbidden' : 'error', message: error?.code === 'VERSION_CONFLICT' ? 'Complaint Ä‘Ã£ thay Ä‘á»•i. HÃ£y táº£i láº¡i trÆ°á»›c khi quyáº¿t Ä‘á»‹nh.' : 'KhÃ´ng thá»ƒ ghi nháº­n quyáº¿t Ä‘á»‹nh cuá»‘i.' }); }
  };
  return <form className="review-complaint-card review-complaint-form" onSubmit={submit}><h2>Quyáº¿t Ä‘á»‹nh cuá»‘i cá»§a Admin</h2>{status.state !== 'idle' && <Notice state={status.state} title={status.state === 'success' ? 'ÄÃ£ xÃ¡c nháº­n' : 'Tráº¡ng thÃ¡i quyáº¿t Ä‘á»‹nh'}>{status.message}</Notice>}<Input label="Quyáº¿t Ä‘á»‹nh" value={summary} onChange={event => setSummary(event.target.value)} maxLength={4000} required disabled={status.state === 'saving'} />{item.settlement?.state === 'ON_HOLD' && <label className="review-complaint-field"><span><input type="checkbox" checked={releaseHold} onChange={event => setReleaseHold(event.target.checked)} disabled={status.state === 'saving'} /> Gá»­i yÃªu cáº§u giáº£i phÃ³ng settlement hold</span><small>Chá»‰ chá»n khi quyáº¿t Ä‘á»‹nh tÃ i chÃ­nh Ä‘Ã£ Ä‘Æ°á»£c duyá»‡t; mÃ¡y chá»§ cáº§n cá»•ng tÃ i chÃ­nh xÃ¡c nháº­n.</small></label>}<Button type="submit" loading={status.state === 'saving'}>ÄÃ³ng complaint</Button></form>;
}

export function ComplaintManagementPage({ api = complaintApi, complaintId: suppliedComplaintId, initialFilters = {} }) {
  const params = useParams(); const complaintId = suppliedComplaintId || params.complaintId;
  const session = useSession(); const roles = session.user?.roles || [session.user?.role]; const isAdmin = roles.includes('ADMIN');
  const [filters, setFilters] = useState({ state: '', category: '', ...initialFilters }); const [query, setQuery] = useState(filters);
  const listResource = useApiResource(useCallback(({ signal }) => api.list({ ...query, signal }), [api, query]));
  const detailResource = useApiResource(useCallback(({ signal }) => complaintId ? api.get({ complaintId, signal }) : Promise.resolve({ data: null }), [api, complaintId]));
  const apply = event => { event.preventDefault(); setQuery({ ...filters, cursor: '' }); };
  if (complaintId) {
    if (detailResource.status === 'loading') return <main className="review-complaint-page"><Notice state="loading" title="Äang táº£i complaint">Äang Ä‘á»c há»“ sÆ¡ theo pháº¡m vi Staff.</Notice></main>;
    if (detailResource.status === 'forbidden') return <main className="review-complaint-page"><Notice state="forbidden" title="KhÃ´ng cÃ³ quyá»n xem complaint">Há»“ sÆ¡ náº±m ngoÃ i pháº¡m vi Staff.</Notice></main>;
    if (detailResource.status === 'error' || !detailResource.data) return <main className="review-complaint-page"><Notice state="error" title="KhÃ´ng táº£i Ä‘Æ°á»£c complaint" action={<Button variant="secondary" onClick={detailResource.retry}>Thá»­ láº¡i</Button>}>Kiá»ƒm tra mÃ£ vÃ  quyá»n.</Notice></main>;
    const item = detailResource.data;
    return <main className="review-complaint-page" aria-labelledby="staff-complaint-title"><header className="review-complaint-page__header"><p className="review-complaint-page__eyebrow">STAFF Â· COMPLAINT {item.id}</p><h1 id="staff-complaint-title">Quáº£n lÃ½ complaint</h1><p>Visit {item.visitId} Â· {label(item.state)} Â· má»Ÿ lÃºc {date(item.createdAt)}</p></header><section className="review-complaint-card"><h2>{item.summary}</h2><p>{item.description}</p><dl className="review-complaint-facts"><div><dt>NhÃ³m</dt><dd>{label(item.category)}</dd></div><div><dt>Evidence</dt><dd>{item.evidenceRefs?.length || 0} mÃ£ riÃªng tÆ°</dd></div><div><dt>Settlement</dt><dd>{item.settlement?.state === 'ON_HOLD' ? 'Äang giá»¯' : 'KhÃ´ng giá»¯'}</dd></div></dl>{item.staffNotes && <><h3>Ghi chÃº ná»™i bá»™</h3><p>{item.staffNotes}</p></>}</section><CommandForm api={api} item={item} onComplete={detailResource.retry} />{isAdmin && <AdminDecisionForm api={api} item={item} onComplete={detailResource.retry} />}</main>;
  }
  const items = listResource.data?.items || []; const isEmpty = listResource.status === 'empty' || (listResource.status === 'success' && items.length === 0);
  return <main className="review-complaint-page" aria-labelledby="staff-complaints-title"><header className="review-complaint-page__header"><p className="review-complaint-page__eyebrow">PAW WORLD CARE Â· STAFF</p><h1 id="staff-complaints-title">Danh sÃ¡ch complaint</h1><p>Danh sÃ¡ch Ä‘Æ°á»£c mÃ¡y chá»§ giá»›i háº¡n theo pháº¡m vi Staff. Ghi chÃº ná»™i bá»™ khÃ´ng xuáº¥t hiá»‡n trong Customer projection.</p></header><form className="review-complaint-card review-complaint-form" onSubmit={apply}><Select label="Tráº¡ng thÃ¡i" value={filters.state} onChange={event => setFilters({ ...filters, state: event.target.value })}><option value="">Táº¥t cáº£</option><option value="OPEN">Äang má»Ÿ</option><option value="UNDER_REVIEW">Äang xem xÃ©t</option><option value="RESOLVED">ÄÃ£ pháº£n há»“i</option><option value="CLOSED">ÄÃ£ Ä‘Ã³ng</option></Select><Select label="NhÃ³m" value={filters.category} onChange={event => setFilters({ ...filters, category: event.target.value })}><option value="">Táº¥t cáº£</option><option value="SERVICE_QUALITY">Cháº¥t lÆ°á»£ng dá»‹ch vá»¥</option><option value="PET_SAFETY">An toÃ n thÃº cÆ°ng</option><option value="SITTER_CONDUCT">HÃ nh vi Pet Sitter</option><option value="ACCESS">Ra vÃ o / bÃ n giao</option><option value="BILLING">Thanh toÃ¡n</option><option value="OTHER">KhÃ¡c</option></Select><Button type="submit">Lá»c</Button><Button variant="secondary" type="button" onClick={listResource.retry}>Táº£i láº¡i</Button></form>{listResource.status === 'loading' && <Notice state="loading" title="Äang táº£i complaint">Äang Ä‘á»c projection.</Notice>}{listResource.status === 'pending' && <Notice state="pending" title="Äang chá» mÃ¡y chá»§">Dá»¯ liá»‡u chá» chÆ°a Ä‘Æ°á»£c coi lÃ  danh sÃ¡ch Ä‘Ã£ xÃ¡c nháº­n.</Notice>}{listResource.status === 'forbidden' && <Notice state="forbidden" title="KhÃ´ng cÃ³ quyá»n xem">PhiÃªn hiá»‡n táº¡i khÃ´ng cÃ³ quyá»n Staff.</Notice>}{listResource.status === 'error' && <Notice state="error" title="KhÃ´ng táº£i Ä‘Æ°á»£c danh sÃ¡ch" action={<Button variant="secondary" onClick={listResource.retry}>Thá»­ láº¡i</Button>}>Kiá»ƒm tra káº¿t ná»‘i.</Notice>}{isEmpty && <Notice state="empty" title="ChÆ°a cÃ³ complaint">KhÃ´ng cÃ³ há»“ sÆ¡ phÃ¹ há»£p.</Notice>}{listResource.status === 'success' && !isEmpty && <ol className="review-complaint-list" aria-label="CÃ¡c complaint">{items.map(item => <ComplaintRow key={item.id} item={item} />)}</ol>}</main>;
}

export const ComplaintListPage = ComplaintManagementPage;
export const StaffComplaintDetailsPage = ComplaintManagementPage;
