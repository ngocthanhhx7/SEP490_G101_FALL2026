const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

async function request(path, body, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 204) return null;
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error?.message ?? 'Không thể xử lý yêu cầu lúc này.');
    error.code = result.error?.code;
    error.retryAfterSeconds = result.error?.retryAfterSeconds;
    throw error;
  }
  return result;
}

async function requestMultipart(path, formData) {
  const response = await fetch(`${API_BASE_URL}${path}`, { method: 'POST', body: formData });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error?.message ?? 'Không thể xử lý yêu cầu lúc này.');
    error.code = result.error?.code;
    error.retryAfterSeconds = result.error?.retryAfterSeconds;
    throw error;
  }
  return result;
}

export const registerAccount = (body) => request('/api/v1/auth/register', body);
export const verifyRegistration = (otp, token) => request('/api/v1/auth/register/verify', { otp }, { token });
export const resendRegistrationOtp = (token) => request('/api/v1/auth/register/resend', {}, { token });

export const requestLoginOtp = (body) => request('/api/v1/auth/login/request-otp', body);
export const verifyLoginOtp = (body) => request('/api/v1/auth/login/verify-otp', body);
export const logoutAccount = (token) => request('/api/v1/auth/login/logout', {}, { token });
export async function getCurrentUser(token) {
  const response = await fetch(`${API_BASE_URL}/api/v1/auth/login/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error?.message ?? 'Could not restore the login session.');
    error.code = result.error?.code;
    throw error;
  }
  return result;
}
export async function getPetSitterApplicationStatus(token) {
  const response = await fetch(`${API_BASE_URL}/api/v1/pet-sitter/applications/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error?.message ?? 'Could not load application status.');
    error.code = result.error?.code;
    throw error;
  }
  return result;
}

export const submitSitterApplication = (formData) => requestMultipart('/api/v1/pet-sitter/applications', formData);
export const verifySitterApplicationOtp = (otp, token) => request(
  '/api/v1/pet-sitter/applications/verify-otp', { otp }, { token },
);
export const resendSitterApplicationOtp = (token) => request(
  '/api/v1/pet-sitter/applications/resend-otp', {}, { token },
);
export async function cancelSitterApplication(token) {
  const response = await fetch(`${API_BASE_URL}/api/v1/pet-sitter/applications/pending`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    const error = new Error(result.error?.message ?? 'Không thể cập nhật hồ sơ lúc này.');
    error.code = result.error?.code;
    throw error;
  }
}
