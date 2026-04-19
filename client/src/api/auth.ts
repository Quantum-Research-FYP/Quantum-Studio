export interface User {
  id: string;
  email: string;
}

export interface AuthResponse {
  user: User;
}

export interface AuthError {
  error: string;
  action?: string;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      (body as AuthError)?.error ||
      (res.status >= 500 ? 'Something went wrong. Please try again later.' : 'An error occurred.');
    const err = new Error(message) as Error & { status: number; action?: string };
    err.status = res.status;
    err.action = (body as AuthError)?.action;
    throw err;
  }

  return body as T;
}

export function fetchCurrentUser(): Promise<AuthResponse> {
  return request<AuthResponse>('/api/auth/me');
}

export function loginUser(email: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function signupUser(email: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>('/api/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function logoutUser(): Promise<void> {
  return request<void>('/api/auth/logout', { method: 'POST' });
}
