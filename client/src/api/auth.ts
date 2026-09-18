import { API_BASE_URL } from '../config';
export interface User {
  id: string;
  email: string;
  name: string;
  createdAt?: string;
  hasPassword: boolean;
  providers: string[];
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
  return request<AuthResponse>(`${API_BASE_URL}/api/auth/me`);
}

export function loginUser(email: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function signupUser(email: string, password: string): Promise<AuthResponse> {
  return request<AuthResponse>(`${API_BASE_URL}/api/auth/signup`, {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function logoutUser(): Promise<void> {
  return request<void>(`${API_BASE_URL}/api/auth/logout`, { method: 'POST' });
}

export function updateProfile(name: string): Promise<AuthResponse> {
  return request<AuthResponse>(`${API_BASE_URL}/api/auth/profile`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  });
}

export function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return request<void>(`${API_BASE_URL}/api/auth/password`, {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export function deleteAccount(currentPassword: string, confirmation: string): Promise<void> {
  return request<void>(`${API_BASE_URL}/api/auth/account`, {
    method: 'DELETE',
    body: JSON.stringify({ currentPassword, confirmation }),
  });
}
