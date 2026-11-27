import { useCallback, useEffect, useRef, useState } from 'react';
import { COUNTER_LIMITS } from '../constants/counter-sale.js';
import { isUncertainOutcome, productErrorText, productMessage } from '../utils/product-format.js';

const payloadLines = lines => lines.map(({ productId, quantity }) => ({ productId, quantity }));
const DEFAULT_POLL_MS = 3000;
const readyLinkOf = order => (order?.paymentLink?.state === 'READY' && order.paymentLink.checkoutUrl
  ? { checkoutUrl: order.paymentLink.checkoutUrl, expiresAt: order.paymentLink.expiresAt ?? null, orderCode: order.paymentLink.orderCode ?? null }
  : null);

export function useCounterSale({ api, orderId, selectOrder, paymentCancelled = false, pollIntervalMs = DEFAULT_POLL_MS }) {
  const [lines, setLines] = useState([]), [preview, setPreview] = useState(null), [previewState, setPreviewState] = useState('loading');
  const [order, setOrder] = useState(null), [readState, setReadState] = useState('success'), [revision, setRevision] = useState(0);
  const [readRevision, setReadRevision] = useState(0);
  const [contact, setContact] = useState(''), [customer, setCustomer] = useState(null), [lookupText, setLookupText] = useState('');
  const [lookupBusy, setLookupBusy] = useState(false), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false);
  const [notice, setNotice] = useState(null);
  const [lineNotices, setLineNotices] = useState({});
  const [paymentWay, setPaymentWay] = useState('CASH');
  const [vietqrLink, setVietqrLink] = useState(null);
  const [vietqrError, setVietqrError] = useState('');
  const lock = useRef(false), command = useRef(null), mounted = useRef(false), lookupGeneration = useRef(0), lookupController = useRef(null);
  const lastOrderId = useRef(orderId), polling = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; lookupGeneration.current++; lookupController.current?.abort(); }; }, []);
  useEffect(() => {
    const switched = lastOrderId.current !== orderId;
    lastOrderId.current = orderId;
    if (switched) { setVietqrLink(null); setVietqrError(''); }
    const controller = new AbortController();
    if (!orderId) { setReadState('success'); return () => controller.abort(); }
    setReadState('loading');
    api.read(orderId, { signal: controller.signal }).then(value => {
      if (controller.signal.aborted) return;
      setOrder(value); setReadState('success');
      if (value.paid) {
        setPaymentWay(value.paymentMethod === 'COUNTER_VIETQR' ? 'VIETQR' : 'CASH');
        setVietqrLink(null); setVietqrError('');
      } else if (value.status === 'AWAITING_PAYMENT') {
        if (paymentCancelled || value.paymentLink?.state === 'FAILED') {
          setPaymentWay('VIETQR'); setVietqrLink(null);
        } else {
          const existing = readyLinkOf(value);
          if (existing) { setPaymentWay('VIETQR'); setVietqrLink(existing); }
        }
      }
    }).catch(error => { if (!controller.signal.aborted) { setReadState(error.status === 403 ? 'forbidden' : 'error'); setNotice({ kind: 'error', text: productErrorText(error) }); } });
    return () => controller.abort();
  }, [api, orderId, readRevision, paymentCancelled]);
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
  const clearLineNotice = id => setLineNotices(old => {
    if (!old[id]) return old;
    const next = { ...old };
    delete next[id];
    return next;
  });
  function limit(line) {
    const text = line.quantity >= COUNTER_LIMITS.quantity
      ? 'Mỗi dòng tối đa 99 sản phẩm.'
      : productMessage('MSG58', { n: line.available });
    setNotice(null);
    setLineNotices(old => ({ ...old, [line.productId]: text }));
  }
  function add(product) {
    if (locked || lock.current) return;
    const found = lines.find(line => line.productId === product.id);
    if (found && (found.quantity >= product.available || found.quantity >= COUNTER_LIMITS.quantity)) return limit({ ...found, available: product.available });
    if (!found && lines.length >= COUNTER_LIMITS.lines) { setNotice({ kind: 'error', text: 'Mỗi đơn tối đa 30 sản phẩm khác nhau.' }); return; }
    if (product.available < 1) return;
    setNotice(null);
    clearLineNotice(product.id);
    setLines(old => found ? old.map(line => line.productId === product.id ? { ...line, quantity: line.quantity + 1, available: product.available } : line)
      : [...old, { productId: product.id, productCode: product.code, productName: product.name, available: product.available, quantity: 1 }]);
  }
  function change(line, quantity) {
    if (!locked && !lock.current) {
      setNotice(null);
      clearLineNotice(line.productId);
      setLines(old => old.map(item => item.productId === line.productId ? { ...item, quantity } : item));
    }
  }
  function remove(id) {
    if (!locked && !lock.current) {
      clearLineNotice(id);
      setLines(old => old.filter(line => line.productId !== id));
    }
  }
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
    lock.current = true; setBusy(true); setNotice(null); setLineNotices({});
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
      if (error.code === 'PRODUCT_QUANTITY_EXCEEDS_AVAILABLE' && error.productId && lines.some(line => line.productId === error.productId)) {
        setLineNotices(old => ({ ...old, [error.productId]: errorText(error) }));
      } else {
        setNotice({ kind: 'error', text: errorText(error) });
      }
      if (!isUncertainOutcome(error)) setRevision(v => v + 1);
    } finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  const activeOrder = orderId && order?.id === orderId ? order : null;
  const effectiveWay = activeOrder?.paid
    ? (activeOrder.paymentMethod === 'COUNTER_VIETQR' ? 'VIETQR' : 'CASH')
    : paymentWay;
  const vietqrFailed = Boolean(activeOrder?.status === 'AWAITING_PAYMENT' && !activeOrder.paid
    && (paymentCancelled || activeOrder.paymentLink?.state === 'FAILED'));
  const activeVietqrLink = activeOrder?.status === 'AWAITING_PAYMENT' && !activeOrder.paid && !vietqrFailed
    ? (vietqrLink ?? readyLinkOf(activeOrder))
    : null;
  const vietqrNotice = vietqrError || (vietqrFailed ? productMessage('MSG32') : '');

  useEffect(() => {
    if (!activeOrder || activeOrder.status !== 'AWAITING_PAYMENT' || activeOrder.paid || !activeVietqrLink || pollIntervalMs <= 0) return;
    const controller = new AbortController();
    const poll = () => {
      if (polling.current || controller.signal.aborted) return;
      polling.current = true;
      api.read(activeOrder.id, { signal: controller.signal }).then(value => {
        if (controller.signal.aborted || !mounted.current) return;
        if (value.paid || value.status !== 'AWAITING_PAYMENT' || value.paymentLink?.state === 'FAILED') {
          setOrder(value);
          setRevision(v => v + 1);
          if (value.paid) {
            setPaymentWay(value.paymentMethod === 'COUNTER_VIETQR' ? 'VIETQR' : 'CASH');
            setVietqrLink(null); setVietqrError('');
          } else if (value.paymentLink?.state === 'FAILED') {
            setVietqrLink(null);
          }
        }
      }).catch(() => {}).finally(() => { polling.current = false; });
    };
    const timer = window.setInterval(poll, pollIntervalMs);
    const onVisible = () => { if (document.visibilityState === 'visible') poll(); };
    window.addEventListener('focus', poll);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener('focus', poll);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [api, activeOrder, activeVietqrLink, pollIntervalMs]);

  function changePaymentWay(nextWay) {
    if (busy || (activeOrder && activeOrder.status !== 'AWAITING_PAYMENT')) return;
    setPaymentWay(nextWay); setVietqrError('');
  }
  async function createPaymentLink() {
    if (lock.current || !activeOrder || activeOrder.status !== 'AWAITING_PAYMENT' || readState !== 'success') return;
    lock.current = true; setBusy(true); setNotice(null); setVietqrError('');
    try {
      const link = await api.createPaymentLink(activeOrder.id);
      if (!mounted.current) return;
      setPaymentWay('VIETQR');
      setVietqrLink(link);
      setOrder(old => old && old.id === activeOrder.id
        ? { ...old, paymentLink: { state: 'READY', checkoutUrl: link.checkoutUrl, expiresAt: link.expiresAt ?? null, orderCode: link.orderCode ?? null } }
        : old);
      selectOrder(activeOrder.id);
      setRevision(v => v + 1);
    } catch (error) {
      if (!mounted.current) return;
      setVietqrError(errorText(error));
      if (['ORDER_STATE_CONFLICT', 'ORDER_PAYMENT_IN_PROGRESS'].includes(error?.code)) {
        setReadRevision(v => v + 1); setRevision(v => v + 1);
      }
    } finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  function checkPayment() {
    if (busy || !activeOrder) return;
    setReadRevision(v => v + 1);
    setRevision(v => v + 1);
  }
  async function act(action) {
    if (lock.current || !activeOrder || readState !== 'success') return;
    lock.current = true; setBusy(true); setNotice(null); setVietqrError('');
    try {
      const value = await api[action](activeOrder.id); if (!mounted.current) return;
      setOrder(value); setRevision(v => v + 1);
      if (value.paid) {
        setPaymentWay(value.paymentMethod === 'COUNTER_VIETQR' ? 'VIETQR' : 'CASH');
        setVietqrLink(null);
        selectOrder(value.id);
      }
      if (['COMPLETED', 'CANCELLED'].includes(value.status)) {
        setVietqrLink(null);
        setNotice({ kind: 'ok', text: productMessage(value.status === 'COMPLETED' ? 'MSG111' : 'MSG112', { code: value.code }) });
      }
    } catch (error) { if (mounted.current) { setNotice({ kind: 'error', text: errorText(error) }); setRevision(v => v + 1); setReadRevision(v => v + 1); } }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  }
  function newDraft() {
    if (lock.current || uncertain) return;
    lookupGeneration.current++; lookupController.current?.abort(); setLookupBusy(false);
    setLines([]); setLineNotices({}); setPreview(null); setContact(''); setCustomer(null); setLookupText(''); setOrder(null);
    setPaymentWay('CASH'); setVietqrLink(null); setVietqrError(''); selectOrder(null);
  }
  return { lines, lineNotices, preview, previewState: currentPreviewState, order: activeOrder, readState, revision, contact, customer, lookupText, lookupBusy, busy, uncertain, notice, locked,
    paymentWay: effectiveWay, vietqrLink: activeVietqrLink, vietqrFailed, vietqrNotice,
    add, change, remove, limit, changeContact, lookup, create, changePaymentWay, createPaymentLink, checkPayment, act, newDraft,
    retry: () => { setRevision(v => v + 1); setReadRevision(v => v + 1); } };
}
