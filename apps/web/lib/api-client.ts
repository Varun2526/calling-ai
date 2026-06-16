/**
 * Thin, typed fetch wrapper (stub).
 *
 * Points at the backend BFF/API base URL. In real usage the URL comes from a
 * validated public env var (NEXT_PUBLIC_API_URL); request/response types should
 * be imported from @propulse/contracts so the client stays in sync with the API.
 * No auth/error-normalization wired yet — placeholder only.
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface ApiRequestOptions extends RequestInit {
  /** Path relative to the API base, e.g. "/leads". */
  path: string;
}

export async function apiFetch<TResponse>({ path, ...init }: ApiRequestOptions): Promise<TResponse> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

  if (!res.ok) {
    // TODO: normalize to RFC7807 problem-details once contracts land.
    throw new Error(`API request failed: ${res.status} ${res.statusText}`);
  }

  return (await res.json()) as TResponse;
}

export const apiClient = { fetch: apiFetch, baseUrl: API_BASE_URL };
