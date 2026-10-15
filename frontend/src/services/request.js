/**
 * The one way the website talks to the backend.
 *
 * Every call goes through request(): it adds the base URL and the login token,
 * sends JSON, and turns any failure into an ApiError carrying the server's own
 * message ({ error, field, code }).
 *
 * The access token lasts 15 minutes. On a 401, request() swaps the refresh token
 * for a new pair once (POST /auth/refresh), then retries the call once. Only if
 * the server refuses the refresh token does it call the handler AuthContext
 * registers (sign out); if the refresh can't get through, the call fails with
 * "try again" and the session is kept. The
 * /auth/login, /auth/refresh and /auth/logout calls never refresh: there a 401
 * means "wrong username or password" or "this session is over".
 */

const NETWORK_MESSAGE = "Can't reach the server. Check your connection and try again."

/** An error answer from the API: HTTP status, the server's message, the field it concerns, and its code. */
export class ApiError extends Error {
  /**
   * @param {number} status HTTP status, or 0 when the server couldn't be reached
   * @param {string} message text safe to show to the user
   * @param {string} [field] the camelCase input the error is about, when there is one
   * @param {string} [code] a machine-readable tag, e.g. OVER_CAPACITY (the page asks to confirm)
   */
  constructor(status, message, field, code) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.field = field
    this.code = code
  }
}

let token = null
let refreshToken = null
let onUnauthorized = null
let onRefreshed = null
let refreshing = null // the refresh in flight, shared by every call that got a 401
const NO_REFRESH = ['/auth/login', '/auth/refresh', '/auth/logout']
const writeListeners = new Set()

/**
 * Be told after every successful change (any non-GET call), with the path called.
 * The notification bell uses this to refresh its count straight away, and the layout
 * to say "Saved". Returns a function that stops listening.
 * @param {(path: string) => void} listener
 * @returns {() => void}
 */
export function onWrite(listener) {
  writeListeners.add(listener)
  return () => writeListeners.delete(listener)
}

const unreadListeners = new Set()

/**
 * Be told when the unread-notification count changed (the bell saw a different number).
 * The Notifications page uses this to reload its list. Returns a function that stops listening.
 * @param {() => void} listener
 * @returns {() => void}
 */
export function onUnreadChange(listener) {
  unreadListeners.add(listener)
  return () => unreadListeners.delete(listener)
}

/** Tell every onUnreadChange listener that the count changed. Called by the notification bell. */
export function announceUnreadChange() {
  unreadListeners.forEach((listener) => listener())
}

/**
 * Remember (or forget, with nulls) both tokens.
 * @param {string|null} access sent as `Authorization: Bearer` (15 minutes)
 * @param {string|null} refresh swapped at /auth/refresh for a new pair (8 hours from login)
 */
export function setTokens(access, refresh) {
  token = access
  refreshToken = refresh
}

/** The refresh token held now (after any rotation), for Sign out to end it on the server. */
export function getRefreshToken() {
  return refreshToken
}

/** Register the function called when the session is over: a 401 that a refresh couldn't fix. */
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler
}

/**
 * Register the function told about each new pair, so AuthContext stores it at once.
 * (A reload with the old refresh token in storage would count as reuse and sign out everywhere.)
 * @param {((tokens: { token: string, refreshToken: string }) => void)|null} handler
 */
export function setRefreshedHandler(handler) {
  onRefreshed = handler
}

/** `${VITE_API_URL}/api/tracker`: the deploy script sets VITE_API_URL to the CloudFront URL. */
export function apiBase() {
  return `${import.meta.env.VITE_API_URL ?? ''}/api/tracker`
}

function queryString(query) {
  const params = new URLSearchParams()
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.append(key, String(value))
  })
  const text = params.toString()
  return text ? `?${text}` : ''
}

function parse(text) {
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

/**
 * Swap the refresh token for a new pair. However many calls ask at once, one request
 * is sent. Uses fetch directly, not request(), so it can never loop.
 * Only a 401 or 400 answer means the refresh token is dead (sign out). A network
 * failure or a 5xx (Aurora waking up) says nothing about it: this throws a
 * "try again" ApiError, the tokens stay, and the next request refreshes again.
 * @returns {Promise<boolean>} true when there is a new access token, false when the session is over
 */
function refreshSession() {
  if (!refreshing) {
    refreshing = (async () => {
      if (!refreshToken) return false
      let response
      try {
        response = await fetch(`${apiBase()}/auth/refresh`, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        })
      } catch {
        throw new ApiError(0, NETWORK_MESSAGE)
      }
      if (response.status === 401 || response.status === 400) return false
      const result = parse(await response.text())
      if (!response.ok || !result?.token) throw new ApiError(response.status, NETWORK_MESSAGE)
      setTokens(result.token, result.refreshToken)
      onRefreshed?.({ token: result.token, refreshToken: result.refreshToken })
      return true
    })().finally(() => {
      refreshing = null
    })
  }
  return refreshing
}

/**
 * Call the API.
 * @param {string} method GET, POST or PATCH
 * @param {string} path e.g. "/projects/7"
 * @param {{ body?: object, query?: object }} [options]
 * @returns {Promise<any>} the parsed JSON body, or null when there is none
 */
export function request(method, path, options = {}) {
  return send(method, path, options, false)
}

async function send(method, path, { body, query }, retried) {
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const sentToken = token
  if (sentToken) headers.Authorization = `Bearer ${sentToken}`

  let response
  try {
    response = await fetch(`${apiBase()}${path}${queryString(query)}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, NETWORK_MESSAGE)
  }

  const payload = parse(await response.text())
  if (response.ok) {
    if (method !== 'GET') writeListeners.forEach((listener) => listener(path))
    return payload ?? null
  }

  if (response.status === 401 && !NO_REFRESH.includes(path)) {
    // Another call may already have refreshed (the token changed): then just retry.
    // If the refresh can't get through, its "try again" error leaves from here.
    if (!retried && (token !== sentToken || await refreshSession())) {
      return send(method, path, { body, query }, true)
    }
    onUnauthorized?.()
  }
  const message = payload?.error ?? `Request failed (${response.status}).`
  throw new ApiError(response.status, message, payload?.field, payload?.code)
}
