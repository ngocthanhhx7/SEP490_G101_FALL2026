// No fake Guest/authenticated response: P06/P08/P34 supply the real adapter.
// resolve({ signal }) -> { status: 'guest' } or
// { status: 'authenticated', user: { displayName, role } }.
// Cookie, /me mapping, CSRF acquisition and logout are backend integration gates.
export const pendingSessionAdapter = {
  async resolve() { return { status: 'pending' }; },
};
