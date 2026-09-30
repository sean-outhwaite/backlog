import { supabase } from './supabaseClient'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000'

// Fired on window after any successful change to the user's list, so views outside the page
// that made the change (like the sidebar's in-progress panel) can refresh.
export const LISTS_CHANGED_EVENT = 'lists-changed'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...init?.headers,
    },
  })

  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error ? JSON.stringify(body.error) : `Request failed: ${response.status}`)
  }
  if (init?.method && path.startsWith('/api/lists')) window.dispatchEvent(new Event(LISTS_CHANGED_EVENT))
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}
