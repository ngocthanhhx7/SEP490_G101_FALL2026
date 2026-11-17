import { useState } from 'react';
import { BOARD_ERROR_MESSAGES, formatPhone } from '../../../utils/visit-board-format.js';

// "Call": the number is asked for only now, shown for this row, and never written into the list.
export function ContactCell({ row, label, party, api }) {
  const [state, setState] = useState({ status: 'idle' });
  async function reveal() {
    setState({ status: 'loading' });
    try {
      const result = await api.visitContact(row.id, party);
      setState({ status: 'done', phone: result.data.phone });
    } catch (error) {
      setState({ status: 'error', message: BOARD_ERROR_MESSAGES[error.code] ?? 'Chưa lấy được số điện thoại. Thử lại.' });
    }
  }
  if (state.status === 'done') {
    return state.phone
      ? <a href={`tel:${state.phone}`} className="visit-board__phone">{formatPhone(state.phone)}</a>
      : <span className="ops-muted">Chưa có số điện thoại đã xác minh</span>;
  }
  return <>
    <button type="button" disabled={state.status === 'loading'} onClick={reveal}>{state.status === 'loading' ? 'Đang lấy số…' : label}</button>
    {state.status === 'error' && <small role="alert" className="visit-board__error">{state.message}</small>}
  </>;
}
