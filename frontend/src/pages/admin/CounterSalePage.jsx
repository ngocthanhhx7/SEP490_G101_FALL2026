import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CounterProductTable } from '../../components/product/CounterProductTable.jsx';
import { CounterOrderPanel } from '../../components/product/CounterOrderPanel.jsx';
import { CounterOpenOrders } from '../../components/product/CounterOpenOrders.jsx';
import { useCounterSale } from '../../hooks/useCounterSale.js';
import '../../components/product/product-shop.css';
import './counter-sale.css';

export function CounterSalePage({ api }) {
  const [params, setParams] = useSearchParams(), orderId = params.get('order');
  const selectOrder = useCallback(id => setParams(id ? { order: id } : {}, { replace: true }), [setParams]);
  const sale = useCounterSale({ api, orderId, selectOrder });
  return <section className="pwc-shop counter-sale" aria-labelledby="counter-sale-title">
    <h1 id="counter-sale-title">Bán tại quầy</h1>
    <p className="pwc-shop-lead">Tra sản phẩm, tạo đơn cho khách tại quầy và thu tiền.</p>
    {sale.notice && <p className={`pwc-shop-alert pwc-shop-alert--${sale.notice.kind}`} role={sale.notice.kind === 'error' ? 'alert' : 'status'}>{sale.notice.text}</p>}
    <div className="counter-grid">
      <CounterProductTable api={api} revision={sale.revision} locked={sale.locked} onAdd={sale.add} />
      <CounterOrderPanel sale={sale} />
    </div>
    <CounterOpenOrders api={api} revision={sale.revision} locked={sale.busy || sale.uncertain} onSelect={selectOrder} />
  </section>;
}
