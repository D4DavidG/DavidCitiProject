import { useCallback } from 'react'
import { request } from './request'
import { useApi } from './useApi'

/** "Maria Lopez" from a user record. */
export function fullName(user) {
  return user ? `${user.firstName} ${user.lastName}` : ''
}

/**
 * Active users with one role, as [userId, name] options for a dropdown.
 * Managers and admins only (the server refuses employees).
 */
export function usePeopleOptions(role) {
  const load = useCallback(() => request('GET', '/users', { query: { role, pageSize: 100 } }), [role])
  const { data, error } = useApi(load)
  return { options: (data?.items ?? []).map((u) => [u.userId, fullName(u)]), error }
}
