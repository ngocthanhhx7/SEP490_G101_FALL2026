import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from './SessionContext.jsx';
import { createProductSalesApi } from '../services/product-sales-api.js';
import { hasRole } from '../utils/role-access.js';

const ProductCartContext = createContext(null);

// Holds the signed-in Customer's cart so the header badge, cart and checkout agree. Guests get the API only.
export function ProductCartProvider({ api: apiOverride, children }) {
  const session = useSession();
  const { getCsrfToken } = session;
  const api = useMemo(() => apiOverride ?? createProductSalesApi({ getCsrfToken, fetchImpl: (...args) => globalThis.fetch(...args) }), [apiOverride, getCsrfToken]);
  const userId = session.user?.id ?? null;
  const enabled = session.status === 'authenticated' && hasRole(session.user, 'CUSTOMER');
  const [state, setState] = useState({ status: 'idle', cart: null });
  const generation = useRef(0);
  const owner = enabled ? userId : null;
  const ownerRef = useRef(owner);
  const ownerEpoch = useRef(0);
  if (ownerRef.current !== owner) { ownerRef.current = owner; ownerEpoch.current++; }

  const refresh = useCallback(async () => {
    const current = ++generation.current;
    setState((value) => ({ ...value, status: 'loading' }));
    try {
      const { data } = await api.getCart();
      if (generation.current === current) setState({ status: 'ready', cart: data });
      return data;
    } catch (error) {
      if (generation.current === current) setState({ status: 'error', cart: null });
      throw error;
    }
  }, [api]);

  useEffect(() => {
    if (!enabled) { generation.current++; setState({ status: 'idle', cart: null }); return undefined; }
    refresh().catch(() => {});
    return () => { generation.current++; ownerEpoch.current++; };
  }, [enabled, userId, refresh]);

  const apply = useCallback(async (operation) => {
    const started = ownerEpoch.current;
    const startedOwner = ownerRef.current;
    const cart = await operation();
    if (!startedOwner || started !== ownerEpoch.current || startedOwner !== ownerRef.current) return cart;
    generation.current++;
    setState({ status: 'ready', cart });
    return cart;
  }, []);

  const value = useMemo(() => ({
    api, enabled, status: state.status, cart: state.cart, lineCount: state.cart?.lineCount ?? 0, refresh,
    addLine: (productId, quantity) => apply(() => api.addToCart(productId, quantity)),
    setLine: (productId, quantity) => apply(() => api.setCartLine(productId, quantity)),
    removeLine: (productId) => apply(() => api.removeCartLine(productId))
  }), [api, enabled, state, refresh, apply]);
  return <ProductCartContext.Provider value={value}>{children}</ProductCartContext.Provider>;
}

const NO_CART = Object.freeze({ enabled: false, lineCount: 0, status: 'idle', cart: null });

// For shared chrome such as the public header: renders without a cart when no provider is mounted.
export function useOptionalProductCart() {
  return useContext(ProductCartContext) ?? NO_CART;
}

export function useProductCart() {
  const value = useContext(ProductCartContext);
  if (!value) throw new Error('useProductCart requires ProductCartProvider');
  return value;
}
