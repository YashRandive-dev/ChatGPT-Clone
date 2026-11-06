/**
 * HTTP client for the Kairo Express API.
 * - Sends credentials (HTTP-only auth cookies) with every request.
 * - Transparently refreshes the access token once on 401 and retries.
 * - Supports Server-Sent Events streaming over POST and upload progress.
 */

export const API_BASE = (process.env.NEXT_PUBLIC_API_URL ?? '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string = 'ERROR',
    readonly details?: unknown,
    readonly body?: unknown,
  ) {
    super(message);
  }
}

type Json = Record<string, unknown> | unknown[] | null;

interface RequestOptions {
  method?: string;
  body?: Json | FormData;
  signal?: AbortSignal;
  /** Skip the automatic refresh-and-retry (used by auth endpoints themselves). */
  noRefresh?: boolean;
}

const REFRESHABLE = new Set(['TOKEN_EXPIRED', 'UNAUTHORIZED', 'INVALID_TOKEN']);
let refreshPromise: Promise<boolean> | null = null;

/** Single-flight token refresh shared by concurrent requests. */
export function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE}/api/auth/refresh`, { method: 'POST', credentials: 'include' })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        setTimeout(() => (refreshPromise = null), 0);
      });
  }
  return refreshPromise;
}

function onSessionExpired() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('kairo:session-expired'));
}

async function toApiError(res: Response): Promise<ApiError> {
  let body: { error?: { message?: string; code?: string; details?: unknown } } | null = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON error */
  }
  const fallback = res.status === 0 ? 'Network error' : res.status >= 500 ? 'Server error. Please try again.' : `Request failed (${res.status})`;
  return new ApiError(body?.error?.message ?? fallback, res.status, body?.error?.code ?? 'ERROR', body?.error?.details, body);
}

async function rawFetch(path: string, opts: RequestOptions): Promise<Response> {
  const isForm = typeof FormData !== 'undefined' && opts.body instanceof FormData;
  try {
    return await fetch(`${API_BASE}${path}`, {
      method: opts.method ?? (opts.body ? 'POST' : 'GET'),
      credentials: 'include',
      headers: isForm ? undefined : opts.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: isForm ? (opts.body as FormData) : opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError('Cannot reach the server. Check your connection.', 0, 'NETWORK_ERROR');
  }
}

/** Fetch with one automatic refresh+retry on an expired access token. */
async function fetchWithAuth(path: string, opts: RequestOptions): Promise<Response> {
  let res = await rawFetch(path, opts);
  if (res.status === 401 && !opts.noRefresh) {
    const err = await toApiError(res.clone());
    if (REFRESHABLE.has(err.code)) {
      if (await refreshSession()) res = await rawFetch(path, opts);
      else onSessionExpired();
    }
  }
  return res;
}

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await fetchWithAuth(path, opts);
  if (!res.ok) throw await toApiError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const get = <T>(path: string, signal?: AbortSignal) => api<T>(path, { signal });
export const post = <T>(path: string, body: Json = {}) => api<T>(path, { method: 'POST', body });
export const patch = <T>(path: string, body: Json) => api<T>(path, { method: 'PATCH', body });
export const del = <T>(path: string, body?: Json) => api<T>(path, { method: 'DELETE', body });

/** SWR fetcher. */
export const fetcher = <T>(path: string) => get<T>(path);

export interface SSEHandlers {
  [event: string]: ((data: any) => void) | undefined; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** Parses a text/event-stream body and dispatches each event to its handler. */
export async function readSSE(body: ReadableStream<Uint8Array>, handlers: SSEHandlers) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      if (!raw.trim() || raw.startsWith(':')) continue;
      let event = 'message';
      const dataLines: string[] = [];
      for (const line of raw.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
      }
      if (!dataLines.length) continue;
      try {
        handlers[event]?.(JSON.parse(dataLines.join('\n')));
      } catch (err) {
        console.error('Bad SSE payload', err);
      }
    }
  }
}

/** POSTs JSON and consumes a Server-Sent Events response. Rejects with ApiError on HTTP errors. */
export async function streamPost(path: string, body: Json, handlers: SSEHandlers, signal?: AbortSignal) {
  const res = await fetchWithAuth(path, { method: 'POST', body, signal });
  if (!res.ok) throw await toApiError(res);
  if (!res.body || !res.headers.get('content-type')?.includes('text/event-stream')) {
    throw new ApiError('Unexpected response from server', res.status, 'BAD_STREAM');
  }
  await readSSE(res.body, handlers);
}

/** Multipart upload with progress (fetch has no upload progress, so XHR is used). */
export function uploadWithProgress<T>(path: string, form: FormData, onProgress: (pct: number) => void, signal?: AbortSignal): Promise<T> {
  const send = () =>
    new Promise<{ status: number; body: unknown }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}${path}`);
      xhr.withCredentials = true;
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
      xhr.onload = () => {
        let parsed: unknown = null;
        try {
          parsed = JSON.parse(xhr.responseText);
        } catch {
          /* ignore */
        }
        resolve({ status: xhr.status, body: parsed });
      };
      xhr.onerror = () => reject(new ApiError('Upload failed. Check your connection.', 0, 'NETWORK_ERROR'));
      xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'));
      signal?.addEventListener('abort', () => xhr.abort());
      xhr.send(form);
    });

  return (async () => {
    let r = await send();
    if (r.status === 401 && (await refreshSession())) r = await send();
    if (r.status < 200 || r.status >= 300) {
      const e = (r.body as { error?: { message?: string; code?: string } } | null)?.error;
      throw new ApiError(e?.message ?? `Upload failed (${r.status})`, r.status, e?.code ?? 'UPLOAD_FAILED');
    }
    return r.body as T;
  })();
}

export function fileUrl(id: string, download = false) {
  return `${API_BASE}/api/files/${id}${download ? '?download=1' : ''}`;
}

export function errorMessage(err: unknown, fallback = 'Something went wrong') {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.name !== 'AbortError') return err.message || fallback;
  return fallback;
}
