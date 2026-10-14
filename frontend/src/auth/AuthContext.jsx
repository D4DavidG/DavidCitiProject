import { useCallback, useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import { AuthContext } from './useAuth'
import { request, setTokens, setUnauthorizedHandler } from '../services/request'

const TOKEN_KEY = 'acme.token'

// Storage can throw (private windows, blocked site data): every access is wrapped.
function readToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

function writeToken(value) {
  try {
    if (value) sessionStorage.setItem(TOKEN_KEY, value)
    else sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // the session still works for this page; it just won't survive a reload
  }
}

/**
 * Holds the session for the whole app. On load it probes a stored token with
 * GET /auth/me; any 401 later (an expired token) signs out in this one place. If the
 * probe fails for another reason (503 while the database wakes up), the session is
 * 'unavailable': the token is kept and the screen offers Retry.
 * The token lives in sessionStorage, so closing the tab signs you out.
 */
export default function AuthProvider({ children }) {
  // With no stored token there is nothing to check: start signed out instead of loading.
  const [state, setState] = useState(() => ({
    user: null, status: readToken() ? 'loading' : 'signedOut', sessionExpired: false,
  }))

  const signOut = useCallback((expired = false) => {
    setTokens(null, null)
    writeToken(null)
    setState({ user: null, status: 'signedOut', sessionExpired: expired })
  }, [])

  const [probe, setProbe] = useState(0)

  useEffect(() => {
    setUnauthorizedHandler(() => signOut(true))
    const stored = readToken()
    if (!stored) return () => setUnauthorizedHandler(null)
    setTokens(stored, null)
    let current = true
    request('GET', '/auth/me')
      .then((user) => { if (current) setState({ user, status: 'signedIn', sessionExpired: false }) })
      .catch((failure) => {
        // A 401 has already signed out through the handler above. Anything else (the
        // database waking up, a network blip) says nothing about the token: keep it.
        if (current && failure.status !== 401) setState({ user: null, status: 'unavailable', sessionExpired: false })
      })
    return () => {
      current = false
      setUnauthorizedHandler(null)
    }
  }, [signOut, probe])

  const retrySession = useCallback(() => {
    setState((previous) => ({ ...previous, status: 'loading' }))
    setProbe((n) => n + 1)
  }, [])

  const login = useCallback(async (username, password) => {
    const result = await request('POST', '/auth/login', { body: { username, password } })
    setTokens(result.token, null)
    writeToken(result.token)
    setState({ user: result.user, status: 'signedIn', sessionExpired: false })
    return result.user
  }, [])

  const logout = useCallback(() => signOut(false), [signOut])

  const refreshUser = useCallback(async () => {
    const user = await request('GET', '/auth/me')
    setState((previous) => ({ ...previous, user }))
    return user
  }, [])

  const value = useMemo(
    () => ({ ...state, login, logout, refreshUser, retrySession }),
    [state, login, logout, refreshUser, retrySession],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
}
