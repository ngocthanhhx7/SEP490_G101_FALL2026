import { createContext, useContext, useEffect, useState } from 'react';

const EMPTY = Object.freeze([]);
const PublicPolicyContext = createContext(EMPTY);

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
  const [catalog, setCatalog] = useState(Array.isArray(policies) ? policies : EMPTY);
  useEffect(() => {
    if (Array.isArray(policies)) {
      setCatalog(policies);
      return undefined;
    }
    if (typeof loadPolicies !== 'function') return undefined;
    let active = true;
    loadPolicies().then(next => { if (active && Array.isArray(next)) setCatalog(next); }).catch(() => {});
    return () => { active = false; };
  }, [loadPolicies, policies]);
  return <PublicPolicyContext.Provider value={catalog}>{children}</PublicPolicyContext.Provider>;
}

export function useRegistrationPolicies() {
  const policies = useContext(PublicPolicyContext);
  return { ...registrationPolicyReadiness(policies), current: () => registrationPolicyReadiness(policies) };
}

export function usePublicPolicyCatalog() {
  return useContext(PublicPolicyContext);
}
