const TOKEN_KEY = 'nailcrm_token';
let memToken: string | null = null;

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY) || memToken;
  } catch {
    return memToken;
  }
}

export function setToken(t: string | null): void {
  memToken = t;
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Ignore storage errors in restricted iframes
  }
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

interface ApiOptions {
  method?: string;
  body?: unknown;
  params?: Record<string, string | number | boolean | null | undefined>;
}

export async function api<T = unknown>(path: string, { method = 'GET', body, params }: ApiOptions = {}): Promise<T> {
  let url = '/api' + path;
  if (params) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') {
        qs.append(k, String(v));
      }
    }
    const s = qs.toString();
    if (s) url += '?' + s;
  }

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data: { detail?: string | Array<{ msg: string }> } | null = null;
  try {
    data = await res.json();
  } catch {
    // Empty body (e.g. 204)
  }

  if (res.status === 401 && !path.startsWith('/public') && !path.startsWith('/auth/login')) {
    setToken(null);
    if (!window.location.pathname.startsWith('/book') && !window.location.pathname.startsWith('/login')) {
      window.location.assign('/login');
    }
    throw new ApiError('Сессия истекла — войдите заново', 401);
  }

  if (!res.ok) {
    let msg = data?.detail;
    if (Array.isArray(msg)) msg = msg.map((e) => e.msg).join('; ');
    throw new ApiError(typeof msg === 'string' && msg ? msg : `Ошибка ${res.status}`, res.status);
  }

  return data as T;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    return true;
  } catch {
    return false;
  }
}
