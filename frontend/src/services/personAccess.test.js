import { describe, expect, it } from 'vitest'
import { mayActOn, personActions } from './personAccess'
import { USERS } from '../test/utils'

const BEN = { userId: 4, managerId: 2, isArchived: false } // Maria's (USERS.manager) report
const DEV = { userId: 6, managerId: 9, isArchived: false } // someone else's report

describe('personActions', () => {
  it('gives an admin everything on someone else, Archive last', () => {
    expect(personActions(USERS.admin, BEN)).toEqual(['capacity', 'history', 'edit', 'reset', 'archive'])
  })

  it('gives a manager capacity and history of their own reports only', () => {
    expect(personActions(USERS.manager, BEN)).toEqual(['capacity', 'history'])
    expect(personActions(USERS.manager, DEV)).toEqual([])
  })

  it('counts a row with no isArchived (an Allocation row) as live', () => {
    expect(personActions(USERS.manager, { userId: 4, managerId: 2 })).toEqual(['capacity', 'history'])
  })
})

describe('mayActOn', () => {
  it('is true for an admin on anyone and a manager on their own reports', () => {
    expect(mayActOn(USERS.admin, DEV)).toBe(true)
    expect(mayActOn(USERS.manager, BEN)).toBe(true)
  })

  it('is false for a manager on someone else\'s report, and for a person with no line manager', () => {
    expect(mayActOn(USERS.manager, DEV)).toBe(false)
    expect(mayActOn(USERS.manager, { userId: 7, managerId: null })).toBe(false)
  })
})
