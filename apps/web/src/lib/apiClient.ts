import { supabase } from './supabaseClient'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api'

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
    const body = await response.text()
    throw new Error(`API ${response.status} ${path}: ${body}`)
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
      const body = await response.text()
      throw new Error(`API ${response.status} ${path}: ${body}`)
    }
    return response.json() as Promise<T>
  },
}
