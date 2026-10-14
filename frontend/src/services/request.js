/**
 * The one way the website talks to the backend.
 *
 * Every call goes through request(): it adds the base URL and the login token,
 * sends JSON, and turns any failure into an ApiError carrying the server's own
 * message ({ error, field, code }). A 401 (expired or invalid session) is handled in
 * one place, the handler AuthContext registers, except for the login call itself,
 * where 401 just means "wrong username or password".
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
let onUnauthorized = null
const writeListeners = new Set()

/**
 * Be told after every successful change (any non-GET call). The notification bell
 * uses this to refresh its count straight away. Returns a function that stops listening.
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

/** Remember (or forget, with null) the token sent as `Authorization: Bearer`. */
export function setToken(value) {
  token = value
}

/** Register the function called when the server answers 401 (not for /auth/login). */
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler
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
 * Call the API.
 * @param {string} method GET, POST or PATCH
 * @param {string} path e.g. "/projects/7"
 * @param {{ body?: object, query?: object }} [options]
 * @returns {Promise<any>} the parsed JSON body, or null when there is none
 */
export async function request(method, path, { body, query } = {}) {
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

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
    if (method !== 'GET') writeListeners.forEach((listener) => listener())
    return payload ?? null
  }

  if (response.status === 401 && path !== '/auth/login' && onUnauthorized) onUnauthorized()
  const message = payload?.error ?? `Request failed (${response.status}).`
  throw new ApiError(response.status, message, payload?.field, payload?.code)
}
