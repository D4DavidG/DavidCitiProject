import { useCallback, useEffect, useMemo, useState } from 'react'
import PropTypes from 'prop-types'
import { AuthContext } from './useAuth'
import {
  getRefreshToken, request, setRefreshedHandler, setTokens, setUnauthorizedHandler,
} from '../services/request'

const TOKEN_KEY = 'acme.token'
const REFRESH_KEY = 'acme.refresh'

// Storage can throw (private windows, blocked site data): every access is wrapped.
function read(key) {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key, value) {
  try {
    if (value) sessionStorage.setItem(key, value)
    else sessionStorage.removeItem(key)
  } catch {
    // the session still works for this page; it just won't survive a reload
  }
}

/** Hand both tokens to request() and keep them for a reload (or forget both, with nulls). */
function storeTokens(token, refreshToken) {
  setTokens(token, refreshToken)
  write(TOKEN_KEY, token)
  write(REFRESH_KEY, refreshToken)
}

/**
 * Holds the session for the whole app. On load it probes a stored token with
 * GET /auth/me. The access token lasts 15 minutes: request() swaps the refresh token
 * for a new pair on a 401 and tells us, so we store the pair at once. Only a 401 that
 * a refresh can't fix signs out, in this one place. If the probe fails for another
 * reason (503 while the database wakes up), the session is 'unavailable': the tokens
 * are kept and the screen offers Retry.
 * Both tokens live in sessionStorage, so closing the tab signs you out.
 */
export default function AuthProvider({ children }) {
  // With no stored token there is nothing to check: start signed out instead of loading.
  const [state, setState] = useState(() => ({
    user: null, status: read(TOKEN_KEY) ? 'loading' : 'signedOut', sessionExpired: false,
  }))

  const signOut = useCallback((expired = false) => {
    storeTokens(null, null)
    setState({ user: null, status: 'signedOut', sessionExpired: expired })
  }, [])

  const [probe, setProbe] = useState(0)

  useEffect(() => {
    setUnauthorizedHandler(() => signOut(true))
    setRefreshedHandler(({ token, refreshToken }) => storeTokens(token, refreshToken))
    const stopListening = () => {
      setUnauthorizedHandler(null)
      setRefreshedHandler(null)
    }
    const stored = read(TOKEN_KEY)
    if (!stored) return stopListening
    setTokens(stored, read(REFRESH_KEY))
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
      stopListening()
    }
  }, [signOut, probe])

  const retrySession = useCallback(() => {
    setState((previous) => ({ ...previous, status: 'loading' }))
    setProbe((n) => n + 1)
  }, [])

  /** Keep a session the server just handed out (login or change-password). Returns its user. */
  const startSession = useCallback((result) => {
    storeTokens(result.token, result.refreshToken)
    setState({ user: result.user, status: 'signedIn', sessionExpired: false })
    return result.user
  }, [])

  const login = useCallback(async (username, password) => {
    const result = await request('POST', '/auth/login', { body: { username, password } })
    return startSession(result)
  }, [startSession])

  const logout = useCallback(async () => {
    const refreshToken = getRefreshToken()
    signOut(false)
    try {
      await request('POST', '/auth/logout', { body: { refreshToken } }) // ends it on the server too
    } catch {
      // signed out here either way; the refresh token dies by itself 8 hours after login
    }
  }, [signOut])

  const refreshUser = useCallback(async () => {
    const user = await request('GET', '/auth/me')
    setState((previous) => ({ ...previous, user }))
    return user
  }, [])

  const value = useMemo(
    () => ({ ...state, login, logout, refreshUser, retrySession, startSession }),
    [state, login, logout, refreshUser, retrySession, startSession],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
}
