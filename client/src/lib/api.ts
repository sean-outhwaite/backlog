import { supabase } from './supabaseClient'

// In production the API is served from the same origin as the client (see vercel.json).
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? (import.meta.env.DEV ? 'http://localhost:4000' : '')

// Fired on window after any successful change to the user's list, so views outside the page
// that made the change (like the sidebar's in-progress panel) can refresh.
export const LISTS_CHANGED_EVENT = 'lists-changed'

// The server answered with an error, as opposed to the request not getting through at all.
export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

// The server's `error` is either a sentence or zod's flattened validation errors
// ({ formErrors: [...], fieldErrors: { field: [...] } }); either way, something a person can read.
function errorMessage(error: unknown, status: number): string {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    const { formErrors = [], fieldErrors = {} } = error as {
      formErrors?: string[]
      fieldErrors?: Record<string, string[] | undefined>
    }
    const messages = [
      ...formErrors,
      ...Object.entries(fieldErrors).flatMap(([field, errors]) => (errors ?? []).map((text) => `${field}: ${text}`)),
    ]
    if (messages.length > 0) return messages.join('. ')
  }
  return `Request failed: ${status}`
}

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
    throw new ApiError(errorMessage(body.error, response.status), response.status)
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
  // Sends a file as the raw request body, typed by the blob itself.
  putBlob: <T>(path: string, blob: Blob) =>
    request<T>(path, { method: 'PUT', body: blob, headers: { 'Content-Type': blob.type } }),
}
