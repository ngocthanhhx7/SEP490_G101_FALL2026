import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const EMPTY = Object.freeze([]);
const PublicPolicyContext = createContext({ status: 'ready', catalog: EMPTY });

// UI readiness only. The server remains the authority and independently validates
// and persists accepted versions before provisioning.
export function registrationPolicyReadiness(policies, now = Date.now()) {
  if (!Array.isArray(policies) || !Number.isFinite(now)) return { ready: false, key: '' };
  const versions = {};
  for (const slug of ['terms', 'privacy']) {
    const candidates = policies.filter(policy => {
      const effective = Date.parse(policy?.effectiveAt);
      const approved = Date.parse(policy?.approvedAt);
      const expiry = (policy?.expiresAt === undefined || policy?.expiresAt === null) ? Infinity : Date.parse(policy.expiresAt);
      return policy?.slug === slug && policy.status === 'APPROVED'
        && typeof policy.versionId === 'string' && policy.versionId.trim()
        && Number.isFinite(effective) && Number.isFinite(approved)
        && approved <= now && effective <= now && now < expiry;
    }).sort((a, b) => Date.parse(b.effectiveAt) - Date.parse(a.effectiveAt));
    if (!candidates.length || (candidates[1] && Date.parse(candidates[0].effectiveAt) === Date.parse(candidates[1].effectiveAt))) {
      return { ready: false, key: '' };
    }
    versions[slug] = candidates[0].versionId;
  }
  return { ready: true, versions, key: JSON.stringify(versions) };
}

export function PublicPolicyProvider({ policies, loadPolicies, children }) {
  const [state, setState] = useState({ status: 'loading', catalog: EMPTY });
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    if (Array.isArray(policies) || typeof loadPolicies !== 'function') return;
    const abort = new AbortController();
    setState({ status: 'loading', catalog: EMPTY });
    Promise.resolve().then(() => loadPolicies({ signal: abort.signal })).then(catalog => {
      if (!Array.isArray(catalog)) throw new Error('Invalid policy catalog');
      if (!abort.signal.aborted) setState({ status: 'ready', catalog });
    }).catch(() => { if (!abort.signal.aborted) setState({ status: 'error', catalog: EMPTY }); });
    return () => abort.abort();
  }, [loadPolicies, policies, revision]);
  const value = Array.isArray(policies) ? { status: 'ready', catalog: policies }
    : typeof loadPolicies === 'function' ? state : { status: 'ready', catalog: EMPTY };
  return <PublicPolicyContext.Provider value={{ ...value, retry }}>{children}</PublicPolicyContext.Provider>;
}

export function useRegistrationPolicies() {
  const { catalog, status, retry } = useContext(PublicPolicyContext);
  return { ...registrationPolicyReadiness(catalog), status, retry, current: () => registrationPolicyReadiness(catalog) };
}

export function usePublicPolicyState() { return useContext(PublicPolicyContext); }
export function usePublicPolicyCatalog() { return usePublicPolicyState().catalog; }
