import { supabase } from './supabaseClient'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'

/** An API error carrying the HTTP status and the server's error `code` (e.g. FX_UNAVAILABLE). */
export class ApiError extends Error {
  readonly status: number
  readonly code: string | undefined

  constructor(status: number, code: string | undefined, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

function toApiError(status: number, path: string, body: string): ApiError {
  let code: string | undefined
  try {
    code = (JSON.parse(body) as { code?: string }).code
  } catch {
    code = undefined
  }
  // A 401 means the session is gone (expired, or the user row no longer
  // exists — e.g. after `seed:demo:reset`). Drop the stale session so the app
  // returns to the login screen and gets a fresh token.
  if (status === 401) void supabase.auth.signOut()
  return new ApiError(status, code, `API ${status} ${path}: ${body}`)
}

/** True when a failed load was caused by an unresolvable exchange rate (so the UI can offer a retry). */
export function isFxUnavailable(error: string | null | undefined): boolean {
  return typeof error === 'string' && error.includes('FX_UNAVAILABLE')
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = {
    // Only label requests that carry a JSON body: Fastify rejects a body-less
    // request (e.g. a DELETE, which browsers send with Content-Length: 0)
    // that claims to be application/json.
    ...(init?.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(await authHeader()),
    ...(init?.headers ?? {}),
  }
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers })
  if (!response.ok) {
    throw toApiError(response.status, path, await response.text())
  }
  // Endpoints returning void (e.g. DELETE) answer 200 with an empty body.
  const text = await response.text()
  return (text ? JSON.parse(text) : undefined) as T
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload: async <T>(path: string, file: File): Promise<T> => {
    const formData = new FormData()
    formData.append('file', file)
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: await authHeader(),
      body: formData,
    })
    if (!response.ok) {
      if (response.status === 401) void supabase.auth.signOut()
      const body = await response.text()
      throw new Error(`API ${response.status} ${path}: ${body}`)
    }
    return response.json() as Promise<T>
  },
}
