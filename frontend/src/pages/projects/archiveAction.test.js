import { describe, expect, it } from 'vitest'
import { archiveAction } from './archiveAction'

const live = { projectId: 1, managerId: 2, isArchived: false }

describe('archiveAction', () => {
  it('lets an admin archive any live project', () => {
    expect(archiveAction({ role: 'ADMIN', userId: 1 }, live)).toBe('archive')
  })

  it("lets a project's own manager ask, and nobody else's manager", () => {
    expect(archiveAction({ role: 'MANAGER', userId: 2 }, live)).toBe('request')
    expect(archiveAction({ role: 'MANAGER', userId: 5 }, live)).toBeNull()
  })

  it('offers an employee nothing, even on their own booking', () => {
    expect(archiveAction({ role: 'EMPLOYEE', userId: 2 }, live)).toBeNull()
  })

  it('offers nothing on an archived project', () => {
    const archived = { ...live, isArchived: true }
    expect(archiveAction({ role: 'ADMIN', userId: 1 }, archived)).toBeNull()
    expect(archiveAction({ role: 'MANAGER', userId: 2 }, archived)).toBeNull()
  })
})
