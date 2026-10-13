const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

async function request(path, body) {
  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw data;
  return data;
}

export const requestLoginOtp = (email) => request('/auth/otp/request', { email });
export const resendLoginOtp = (email) => request('/auth/otp/resend', { email });
export const verifyLoginOtp = (email, otp) => request('/auth/otp/verify', { email, otp });
