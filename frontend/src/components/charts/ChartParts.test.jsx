import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@mui/material/styles'
import theme from '../../theme/theme'
import { ChartFigure, ChartLegend, ChartRow } from './ChartParts'

const inTheme = (ui) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>)

describe('chart parts', () => {
  it('is a figure named by its heading, with its summary', () => {
    inTheme(<ChartFigure title="Budget by project" summary="0 of 2 projects are over budget."><li>row</li></ChartFigure>)
    expect(screen.getByRole('figure', { name: 'Budget by project' })).toHaveTextContent('0 of 2 projects are over budget.')
  })

  it('lets a reference line span every row: the rows list is the positioning box', () => {
    inTheme(<ChartFigure title="Lines" summary="S"><li>row</li></ChartFigure>)
    expect(within(screen.getByRole('figure', { name: 'Lines' })).getByRole('list')).toHaveStyle({ position: 'relative' })
  })

  it('gives each row one focusable target that carries the tooltip sentence', async () => {
    inTheme(<ul><ChartRow tooltip="45 h booked · Ben Okafor"><span>Ben</span></ChartRow></ul>)
    const target = screen.getByRole('img', { name: '45 h booked · Ben Okafor' })
    expect(target).toHaveAttribute('tabindex', '0')
    await userEvent.tab()
    expect(await screen.findByRole('tooltip')).toHaveTextContent('45 h booked · Ben Okafor')
  })

  it('names every legend entry and marks the problem one with the warning icon', () => {
    inTheme(<ChartLegend items={[{ label: 'Spent', colour: '#0B3D91', kind: 'swatch' }, { label: 'Over budget', colour: '#C62828', kind: 'problem' }]} />)
    const legend = screen.getByRole('list', { name: 'Legend' })
    expect(within(legend).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Spent', 'Over budget'])
    expect(within(legend).getAllByTestId('WarningAmberRoundedIcon')).toHaveLength(1)
  })

  it('adds stripes to problem marks only for print and high-contrast mode', () => {
    inTheme(<ChartFigure title="T" summary="S"><li data-mark data-state="over">x</li></ChartFigure>)
    const css = [...document.querySelectorAll('style')].map((s) => s.textContent).join('')
    expect(css).toMatch(/forced-colors:\s*active/)
    expect(css).toMatch(/repeating-linear-gradient\(45deg/)
    expect(css).toMatch(/forced-color-adjust:\s*none/)
  })

  it('keeps stripes above a mark\'s inline background shorthand', () => {
    inTheme(<ChartFigure title="T2" summary="S"><li data-mark data-state="late" style={{ background: '#C62828' }}>x</li></ChartFigure>)
    const css = [...document.querySelectorAll('style')].map((s) => s.textContent).join('')
    expect(css).toMatch(/background-image:\s*repeating-linear-gradient[^;]*!important/)
  })

  it('gives two figures with the same title different heading ids', () => {
    inTheme(<><ChartFigure title="Same" summary="a" /><ChartFigure title="Same" summary="b" /></>)
    const [a, b] = screen.getAllByRole('figure', { name: 'Same' })
    expect(a.getAttribute('aria-labelledby')).not.toBe(b.getAttribute('aria-labelledby'))
  })
})
