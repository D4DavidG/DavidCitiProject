import { describe, expect, it } from 'vitest'
import { projectColours } from './chartColours'

describe('projectColours', () => {
  it('colours projects by id, lowest first, whatever order they arrive in', () => {
    const expected = new Map([[3, '#1c5cab'], [7, '#199e70'], [9, '#9085e9']])
    expect(projectColours([7, 3, 9])).toEqual(expected)
    expect(projectColours([9, 3, 7, 3])).toEqual(expected)
  })

  it('folds the 6th project and later into Other', () => {
    const colours = projectColours([1, 2, 3, 4, 5, 6, 7])
    expect([colours.get(5), colours.get(6), colours.get(7)]).toEqual(['#eda100', '#D1D5DB', '#D1D5DB'])
  })
})
