import axios, { AxiosError } from 'axios';
import type { Meta } from './types';

export const TOKEN_KEY = 'sc_token';
export const api = axios.create({ baseURL: import.meta.env.VITE_API_URL ?? '/api', timeout: 20000 });

api.interceptors.request.use((cfg) => {
  try { const t = localStorage.getItem(TOKEN_KEY); if (t) cfg.headers.Authorization = `Bearer ${t}`; } catch { /* storage blocked */ }
  return cfg;
});
api.interceptors.response.use(
  (r) => r,
  (err: AxiosError<ApiErrorBody>) => {
    const url = err.config?.url ?? '';
    if (err.response?.status === 401 && !url.startsWith('/auth/login') && !url.startsWith('/auth/register')) {
      window.dispatchEvent(new CustomEvent('sc:unauthorized'));
    }
    return Promise.reject(err);
  },
);

interface ApiErrorBody { success: false; error: { code: string; message: string; details?: Array<{ field: string; message: string }> } }

export function errMsg(e: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const ax = e as AxiosError<ApiErrorBody>;
  if (ax?.response?.data?.error) {
    const { message, details } = ax.response.data.error;
    return details?.length ? `${message}: ${details.map((d) => d.message).join(', ')}` : message;
  }
  if (ax?.code === 'ERR_NETWORK' || ax?.message === 'Network Error') return 'Cannot reach the server. Check that the backend is running.';
  return fallback;
}
export const errCode = (e: unknown) => (e as AxiosError<ApiErrorBody>)?.response?.data?.error?.code;
export const errStatus = (e: unknown) => (e as AxiosError)?.response?.status;

/** GET returning { data, meta } as sent by the API envelope. */
export async function get<T>(url: string, params?: Record<string, unknown>) {
  const clean = Object.fromEntries(Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== '' && v !== null));
  const r = await api.get<{ success: true; data: T; meta?: Meta }>(url, { params: clean });
  return { data: r.data.data, meta: r.data.meta as Meta | undefined };
}
export const post = async <T,>(url: string, body?: unknown) => (await api.post<{ data: T }>(url, body)).data.data;
export const put = async <T,>(url: string, body?: unknown) => (await api.put<{ data: T }>(url, body)).data.data;
export const patch = async <T,>(url: string, body?: unknown) => (await api.patch<{ data: T }>(url, body)).data.data;
export const del = async <T,>(url: string) => (await api.delete<{ data: T }>(url)).data.data;
