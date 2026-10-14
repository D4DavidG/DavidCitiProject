import { createContext, useContext } from 'react'

/**
 * The session: who is signed in, and the actions that change that.
 * @typedef {{
 *   user: object|null,
 *   status: 'loading'|'signedOut'|'signedIn'|'unavailable',
 *   sessionExpired: boolean,
 *   login: (username: string, password: string) => Promise<object>,
 *   logout: () => Promise<void>,
 *   refreshUser: () => Promise<object>,
 *   retrySession: () => void,
 *   startSession: (result: { token: string, refreshToken: string, user: object }) => object,
 * }} Session
 */
export const AuthContext = createContext(null)

/** @returns {Session} */
export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}

export const STAFF = ['ADMIN', 'MANAGER']

/** Where a user lands after signing in: managers and admins on the dashboard, employees on their tasks. */
export function homePath(user) {
  return user?.role === 'EMPLOYEE' ? '/my-tasks' : '/dashboard'
}
