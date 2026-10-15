import { describe, expect, it } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AuthProvider from './AuthContext'
import { useAuth } from './useAuth'
import { request } from '../services/request'
import { USERS, stubApi } from '../test/utils'

function Probe() {
  const { status, user, login, logout, sessionExpired } = useAuth()
  return (
    <div>
      <p>status: {status}</p>
      <p>user: {user?.username ?? 'none'}</p>
      <p>expired: {String(sessionExpired)}</p>
      <button type="button" onClick={() => login('ML662930', 'secret-pass')}>log in</button>
      <button type="button" onClick={logout}>log out</button>
    </div>
  )
}

function renderProvider() {
  return render(<AuthProvider><Probe /></AuthProvider>)
}

describe('AuthProvider', () => {
  it('probes a stored token with /auth/me on load', async () => {
    sessionStorage.setItem('acme.token', 'stored-token')
    const calls = stubApi({ 'GET /auth/me': [200, USERS.manager] })
    renderProvider()
    expect(screen.getByText('status: loading')).toBeInTheDocument()
    await screen.findByText('status: signedIn')
    expect(screen.getByText('user: ML662930')).toBeInTheDocument()
    expect(calls[0].headers.Authorization).toBe('Bearer stored-token')
  })

  it('is signed out without asking the server when there is no token', async () => {
    const calls = stubApi({})
    renderProvider()
    await screen.findByText('status: signedOut')
    expect(calls).toHaveLength(0)
  })

  it('signs out and forgets the token when the probe fails', async () => {
    sessionStorage.setItem('acme.token', 'old-token')
    stubApi({ 'GET /auth/me': [401, { error: 'Your session is invalid or has expired.' }] })
    renderProvider()
    await screen.findByText('status: signedOut')
    expect(sessionStorage.getItem('acme.token')).toBeNull()
  })

  it('keeps the token and offers a retry when the server is unavailable, rather than signing out', async () => {
    sessionStorage.setItem('acme.token', 'stored-token')
    let attempts = 0
    stubApi({
      'GET /auth/me': () => (++attempts === 1 ? [503, { error: 'The database is not ready. Please try again shortly.' }] : [200, USERS.manager]),
    })
    renderProvider()
    await screen.findByText('status: unavailable')
    expect(sessionStorage.getItem('acme.token')).toBe('stored-token')
  })

  it('logs in, stores both tokens and the user', async () => {
    const calls = stubApi({ 'POST /auth/login': [200, { token: 'new-token', refreshToken: 'new-refresh', user: USERS.manager }] })
    renderProvider()
    await screen.findByText('status: signedOut')
    await userEvent.click(screen.getByText('log in'))
    await screen.findByText('status: signedIn')
    expect(calls[0].body).toEqual({ username: 'ML662930', password: 'secret-pass' })
    expect(sessionStorage.getItem('acme.token')).toBe('new-token')
    expect(sessionStorage.getItem('acme.refresh')).toBe('new-refresh')
  })

  it('logs out: ends the refresh token on the server and forgets both tokens', async () => {
    sessionStorage.setItem('acme.token', 'stored-token')
    sessionStorage.setItem('acme.refresh', 'stored-refresh')
    const calls = stubApi({ 'GET /auth/me': [200, USERS.manager], 'POST /auth/logout': [204] })
    renderProvider()
    await screen.findByText('status: signedIn')
    await userEvent.click(screen.getByText('log out'))
    expect(screen.getByText('status: signedOut')).toBeInTheDocument()
    expect(calls.find((c) => c.path === '/auth/logout').body).toEqual({ refreshToken: 'stored-refresh' })
    expect(sessionStorage.getItem('acme.token')).toBeNull()
    expect(sessionStorage.getItem('acme.refresh')).toBeNull()
  })

  it('logs out here even when the server call fails', async () => {
    sessionStorage.setItem('acme.token', 'stored-token')
    sessionStorage.setItem('acme.refresh', 'stored-refresh')
    stubApi({ 'GET /auth/me': [200, USERS.manager], 'POST /auth/logout': [503, { error: 'down' }] })
    renderProvider()
    await screen.findByText('status: signedIn')
    await userEvent.click(screen.getByText('log out'))
    expect(screen.getByText('status: signedOut')).toBeInTheDocument()
    expect(screen.getByText('expired: false')).toBeInTheDocument()
    expect(sessionStorage.getItem('acme.refresh')).toBeNull()
  })

  it('refreshes a stored session whose access token expired, stays signed in, and stores the new pair', async () => {
    sessionStorage.setItem('acme.token', 'old-token')
    sessionStorage.setItem('acme.refresh', 'old-refresh')
    let probes = 0
    const calls = stubApi({
      'GET /auth/me': () => (++probes === 1 ? [401, { error: 'expired' }] : [200, USERS.manager]),
      'POST /auth/refresh': [200, { token: 'new-token', refreshToken: 'new-refresh' }],
    })
    renderProvider()
    await screen.findByText('status: signedIn')
    expect(calls.find((c) => c.path === '/auth/refresh').body).toEqual({ refreshToken: 'old-refresh' })
    expect(sessionStorage.getItem('acme.token')).toBe('new-token')
    expect(sessionStorage.getItem('acme.refresh')).toBe('new-refresh')
  })

  it('signs out and flags the expiry when any later call answers 401', async () => {
    sessionStorage.setItem('acme.token', 'stored-token')
    stubApi({ 'GET /auth/me': [200, USERS.manager], 'GET /projects': [401, { error: 'expired' }] })
    renderProvider()
    await screen.findByText('status: signedIn')
    await act(async () => {
      await request('GET', '/projects').catch(() => {})
    })
    await waitFor(() => expect(screen.getByText('status: signedOut')).toBeInTheDocument())
    expect(screen.getByText('expired: true')).toBeInTheDocument()
  })

  it('still works when sessionStorage throws', async () => {
    const getItem = Storage.prototype.getItem
    Storage.prototype.getItem = () => { throw new Error('blocked') }
    try {
      stubApi({})
      renderProvider()
      await screen.findByText('status: signedOut')
    } finally {
      Storage.prototype.getItem = getItem
    }
  })
})
