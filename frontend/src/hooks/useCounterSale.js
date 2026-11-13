import { useCallback, useEffect, useRef, useState } from 'react';
import { COUNTER_LIMITS } from '../constants/counter-sale.js';
import { isUncertainOutcome, productErrorText, productMessage } from '../utils/product-format.js';

const payloadLines = lines => lines.map(({ productId, quantity }) => ({ productId, quantity }));
export function useCounterSale({ api, orderId, selectOrder }) {
  const [lines, setLines] = useState([]), [preview, setPreview] = useState(null), [previewState, setPreviewState] = useState('loading');
  const [order, setOrder] = useState(null), [readState, setReadState] = useState('success'), [revision, setRevision] = useState(0);
  const [readRevision, setReadRevision] = useState(0);
  const [contact, setContact] = useState(''), [customer, setCustomer] = useState(null), [lookupText, setLookupText] = useState('');
  const [lookupBusy, setLookupBusy] = useState(false), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false);
  const [notice, setNotice] = useState(null);
  const lock = useRef(false), command = useRef(null), mounted = useRef(false), lookupGeneration = useRef(0), lookupController = useRef(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; lookupGeneration.current++; lookupController.current?.abort(); }; }, []);
  useEffect(() => {
    const controller = new AbortController();
    if (!orderId) { setReadState('success'); return () => controller.abort(); }
    setReadState('loading');
    api.read(orderId, { signal: controller.signal }).then(value => {
      if (!controller.signal.aborted) { setOrder(value); setReadState('success'); }
    }).catch(error => { if (!controller.signal.aborted) { setReadState(error.status === 403 ? 'forbidden' : 'error'); setNotice({ kind: 'error', text: productErrorText(error) }); } });
    return () => controller.abort();
  }, [api, orderId, readRevision]);
  const customerId = customer?.id;
  useEffect(() => {
    if (orderId) return;
    const controller = new AbortController();
    setPreviewState('loading');
    api.preview({ lines: payloadLines(lines), ...(customerId ? { customerId } : {}) }, { signal: controller.signal }).then(value => {
      if (!controller.signal.aborted) { setPreview(value); setPreviewState('success'); }
    }).catch(error => {
      if (!controller.signal.aborted) { setPreviewState('error'); setNotice({ kind: 'error', text: productErrorText(error, { available: error.available }) }); }
    });
    return () => controller.abort();
  }, [api, lines, orderId, revision, customerId]);
  const currentPreviewState = previewState === 'success' && (preview?.customerId ?? null) !== (customerId ?? null)
    ? 'loading' : previewState;
  const locked = busy || uncertain || Boolean(orderId);
  const errorText = useCallback(error => productErrorText(error, { available: error.available }), []);
  function limit(line) {
    setNotice({ kind: 'error', text: line.quantity >= COUNTER_LIMITS.quantity ? 'Mỗi dòng tối đa 99 sản phẩm.' : productMessage('MSG58', { n: line.available }) });
  }
  function add(product) {
    if (locked || lock.current) return;
    const found = lines.find(line => line.productId === product.id);
    if (found && (found.quantity >= product.available || found.quantity >= COUNTER_LIMITS.quantity)) return limit({ ...found, available: product.available });
    if (!found && lines.length >= COUNTER_LIMITS.lines) { setNotice({ kind: 'error', text: 'Mỗi đơn tối đa 30 sản phẩm khác nhau.' }); return; }
    if (product.available < 1) return;
    setNotice(null);
    setLines(old => found ? old.map(line => line.productId === product.id ? { ...line, quantity: line.quantity + 1, available: product.available } : line)
      : [...old, { productId: product.id, productCode: product.code, productName: product.name, available: product.available, quantity: 1 }]);
  }
  function change(line, quantity) { if (!locked && !lock.current) { setNotice(null); setLines(old => old.map(item => item.productId === line.productId ? { ...item, quantity } : item)); } }
  function remove(id) { if (!locked && !lock.current) setLines(old => old.filter(line => line.productId !== id)); }
  function changeContact(value) {
    if (locked || lock.current) return;
    lookupGeneration.current++; lookupController.current?.abort(); setLookupBusy(false); setContact(value); setCustomer(null); setLookupText('');
  }
  async function lookup() {
    if (locked || lookupBusy || lock.current) return;
    if (!contact.trim()) { setLookupText(productMessage('MSG01')); return; }
    const current = ++lookupGeneration.current, controller = new AbortController(); lookupController.current?.abort(); lookupController.current = controller;
    setLookupBusy(true); setLookupText(''); setCustomer(null);
    try { const result = await api.lookup(contact.trim(), { signal: controller.signal });
      if (mounted.current && current === lookupGeneration.current) { setCustomer(result.customer); if (!result.customer) setLookupText(productMessage('MSG110')); }
    } catch (error) {
      if (mounted.current && current === lookupGeneration.current) setLookupText(error.fields?.contact
        ? productMessage(error.fields.contact === 'PHONE' ? 'MSG03' : error.fields.contact === 'EMAIL' ? 'MSG02' : 'MSG01') : errorText(error));
    } finally { if (mounted.current && current === lookupGeneration.current) setLookupBusy(false); }
  }
  async function create() {
    if (lock.current || lookupBusy || (!command.current && (!lines.length || currentPreviewState !== 'success' || orderId))) return;
    lock.current = true; setBusy(true); setNotice(null);
    lookupGeneration.current++; lookupController.current?.abort();
    if (!command.current) command.current = { body: { lines: payloadLines(lines), ...(customer ? { customerId: customer.id } : {}) }, key: globalThis.crypto.randomUUID() };
    try {
      const value = await api.create(command.current.body, command.current.key);
      if (!mounted.current) return;
      command.current = null; setUncertain(false); setOrder(value); setRevision(v => v + 1); selectOrder(value.id);
    } catch (error) {
      if (!mounted.current) return;
      setUncertain(isUncertainOutcome(error));
      if (!isUncertainOutcome(error)) command.current = null;
      if (error.code === 'COUNTER_CUSTOMER_UNAVAILABLE') { setCustomer(null); setLookupText('Khách đã chọn không còn khả dụng. Vui lòng tìm lại hoặc bán không gắn khách.'); }
      setNotice({ kind: 'error', text: errorText(error) });
      if (!isUncertainOutcome(error)) setRevision(v => v + 1);
    } finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  async function act(action) {
    if (lock.current || !order || readState !== 'success') return;
    lock.current = true; setBusy(true); setNotice(null);
    try {
      const value = await api[action](order.id); if (!mounted.current) return;
      setOrder(value); setRevision(v => v + 1);
      if (['COMPLETED', 'CANCELLED'].includes(value.status)) setNotice({ kind: 'ok', text: productMessage(value.status === 'COMPLETED' ? 'MSG111' : 'MSG112', { code: value.code }) });
    } catch (error) { if (mounted.current) { setNotice({ kind: 'error', text: errorText(error) }); setRevision(v => v + 1); setReadRevision(v => v + 1); } }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  function newDraft() {
    if (lock.current || uncertain) return;
    lookupGeneration.current++; lookupController.current?.abort(); setLookupBusy(false);
    setLines([]); setPreview(null); setContact(''); setCustomer(null); setLookupText(''); setOrder(null); selectOrder(null);
  }
  return { lines, preview, previewState: currentPreviewState, order: orderId && order?.id === orderId ? order : null, readState, revision, contact, customer, lookupText, lookupBusy, busy, uncertain, notice, locked,
    add, change, remove, limit, changeContact, lookup, create, act, newDraft, retry: () => { setRevision(v => v + 1); setReadRevision(v => v + 1); } };
}
