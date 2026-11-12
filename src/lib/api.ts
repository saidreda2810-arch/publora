// Central API client — all backend calls should go through here.
// Keeps request headers consistent (JSON content-type) and gives a single
// place to add auth, retries, or telemetry later.

export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers || {});
  if (init.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  return fetch(input, { ...init, headers, credentials: 'include' });
}

// Convenience wrapper for the common "call endpoint, parse JSON body" pattern.
// Never throws on HTTP error status — callers inspect `data.success` as before.
export async function apiJson<T = any>(input: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(input, init);
  try {
    return (await res.json()) as T;
  } catch {
    return {} as T;
  }
}
