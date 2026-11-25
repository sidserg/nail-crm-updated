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
  skipCache?: boolean; // Force bypass cache
}

/* ============ Request Queue (throttle concurrent requests) ============ */
class RequestQueue {
  private queue: Array<() => Promise<any>> = [];
  private running = 0;
  private readonly concurrency = 3; // Max 3 concurrent requests

  async enqueue<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await fn();
          resolve(result);
        } catch (e) {
          reject(e);
        }
      });
      this.process();
    });
  }

  private async process() {
    if (this.running >= this.concurrency || this.queue.length === 0) return;
    this.running++;
    const fn = this.queue.shift()!;
    try {
      await fn();
    } finally {
      this.running--;
      this.process();
    }
  }
}

const requestQueue = new RequestQueue();

/* ============ Request Deduplication (prevent duplicate in-flight requests) ============ */
const pendingRequests = new Map<string, Promise<any>>();

const makeRequestKey = (path: string, options: ApiOptions): string => {
  const { method = 'GET', body, params } = options;
  return `${method}:${path}:${JSON.stringify(body ?? '')}:${JSON.stringify(params ?? '')}`;
}

/* ============ In-Memory Cache for GET requests ============ */
interface CacheEntry<T> {
  data: T;
  expires: number;
}

const cache = new Map<string, CacheEntry<any>>();
const CACHE_TTL_MS = 30000; // 30 seconds default TTL for GET requests

const getCached = <T>(key: string): T | null => {
  const entry = cache.get(key);
  if (entry && entry.expires > Date.now()) return entry.data as T;
  return null;
};

const setCache = <T>(key: string, data: T, ttlMs = CACHE_TTL_MS): void => {
  cache.set(key, { data, expires: Date.now() + ttlMs });
};

const makeCacheKey = (path: string, options: ApiOptions): string => {
  const { params } = options;
  return `GET:${path}:${JSON.stringify(params ?? '')}`;
};

/* ============ Core API Function ============ */
export async function api<T = unknown>(path: string, { method = 'GET', body, params, skipCache = false }: ApiOptions = {}): Promise<T> {
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

  const isGet = method === 'GET';
  const requestKey = makeRequestKey(path, { method, body, params });
  const cacheKey = isGet ? makeCacheKey(path, { params }) : null;

  // 1. Check cache for GET requests
  if (isGet && !skipCache && cacheKey) {
    const cached = getCached<T>(cacheKey);
    if (cached !== null) return cached;
  }

  // 2. Deduplication: if identical request is already in flight, wait for it
  if (pendingRequests.has(requestKey)) {
    return pendingRequests.get(requestKey)! as Promise<T>;
  }

  // 3. Queue the request to limit concurrency
  const promise = requestQueue.enqueue<T>(async () => {
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

    const result = data as T;
    
    // Cache successful GET responses
    if (isGet && !skipCache && cacheKey) {
      setCache(cacheKey, result);
    }
    
    return result;
  });

  // Register pending request for deduplication
  pendingRequests.set(requestKey, promise);
  
  try {
    const result = await promise;
    return result;
  } finally {
    pendingRequests.delete(requestKey);
  }
}

/* ============ Utility Functions ============ */

/** Clear entire cache */
export function clearApiCache(): void {
  cache.clear();
}

/** Invalidate cache for a specific path */
export function invalidateCache(path: string, params?: Record<string, any>): void {
  const key = `GET:${path}:${JSON.stringify(params ?? '')}`;
  cache.delete(key);
}

/** Set custom cache TTL for next request (use with skipCache: true then manual set) */
export function setCacheTTL(ms: number): void {
  // Not implemented globally - use per-request if needed
}

/* ============ Copy Text Utility ============ */
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