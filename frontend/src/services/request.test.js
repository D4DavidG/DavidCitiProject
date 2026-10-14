import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, onWrite, request, setToken, setUnauthorizedHandler } from './request'

function answer(status, payload) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(payload === undefined ? '' : JSON.stringify(payload)),
  })
}

describe('request()', () => {
  let fetchMock

  beforeEach(() => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test')
    fetchMock = vi.fn(() => answer(200, { ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    setToken(null)
    setUnauthorizedHandler(null)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('prefixes VITE_API_URL and /api/tracker', async () => {
    await request('GET', '/projects')
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.test/api/tracker/projects')
  })

  it('sends the bearer token once one is set', async () => {
    setToken('abc.def.ghi')
    await request('GET', '/auth/me')
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer abc.def.ghi')
  })

  it('sends no Authorization header without a token', async () => {
    await request('GET', '/health')
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined()
  })

  it('JSON-encodes the body and uses the method given', async () => {
    await request('PATCH', '/projects/7', { body: { name: 'Apollo' } })
    const [, init] = fetchMock.mock.calls[0]
    expect(init.method).toBe('PATCH')
    expect(init.body).toBe('{"name":"Apollo"}')
    expect(init.headers['Content-Type']).toBe('application/json')
  })

  it('builds the query string and drops empty values', async () => {
    await request('GET', '/projects', { query: { search: 'apo', status: undefined, page: 2, empty: '' } })
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.test/api/tracker/projects?search=apo&page=2')
  })

  it('returns the parsed JSON body', async () => {
    fetchMock.mockReturnValueOnce(answer(200, { items: [1, 2] }))
    await expect(request('GET', '/projects')).resolves.toEqual({ items: [1, 2] })
  })

  it('returns null for an empty body', async () => {
    fetchMock.mockReturnValueOnce(answer(200))
    await expect(request('POST', '/notifications/read-all')).resolves.toBeNull()
  })

  it('turns an error answer into an ApiError with the message and field', async () => {
    fetchMock.mockReturnValueOnce(answer(400, { error: 'Name is required.', field: 'name' }))
    const failure = request('POST', '/projects', { body: {} })
    await expect(failure).rejects.toBeInstanceOf(ApiError)
    await expect(failure).rejects.toMatchObject({ status: 400, message: 'Name is required.', field: 'name' })
  })

  it('calls the unauthorized handler on a 401', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    fetchMock.mockReturnValueOnce(answer(401, { error: 'Your session is invalid or has expired.' }))
    await expect(request('GET', '/projects')).rejects.toMatchObject({ status: 401 })
    expect(handler).toHaveBeenCalledOnce()
  })

  it('does not call the unauthorized handler for a failed login', async () => {
    const handler = vi.fn()
    setUnauthorizedHandler(handler)
    fetchMock.mockReturnValueOnce(answer(401, { error: 'Wrong username or password.' }))
    await expect(request('POST', '/auth/login', { body: {} })).rejects.toMatchObject({ status: 401 })
    expect(handler).not.toHaveBeenCalled()
  })

  it('maps a network failure to status 0 with a readable message', async () => {
    fetchMock.mockReturnValueOnce(Promise.reject(new TypeError('Failed to fetch')))
    await expect(request('GET', '/projects')).rejects.toMatchObject({
      status: 0,
      message: expect.stringContaining("Can't reach the server"),
    })
  })

  it('tells write listeners after a successful change, but not after a read or a failure', async () => {
    const listener = vi.fn()
    const stop = onWrite(listener)
    await request('GET', '/projects')
    expect(listener).not.toHaveBeenCalled()
    await request('POST', '/notifications/read-all')
    expect(listener).toHaveBeenCalledOnce()
    fetchMock.mockReturnValueOnce(answer(409, { error: 'no' }))
    await request('PATCH', '/projects/1', { body: {} }).catch(() => {})
    expect(listener).toHaveBeenCalledOnce()
    stop()
    await request('POST', '/notifications/read-all')
    expect(listener).toHaveBeenCalledOnce()
  })

  it('falls back to a generic message when the error body is not JSON', async () => {
    fetchMock.mockReturnValueOnce(Promise.resolve({ ok: false, status: 502, text: () => Promise.resolve('<html>') }))
    await expect(request('GET', '/projects')).rejects.toMatchObject({ status: 502, message: 'Request failed (502).' })
  })
})
