import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemeProvider } from '@mui/material/styles'
import StatusChip from './StatusChip'
import theme from '../theme/theme'

const draw = (status) => render(<ThemeProvider theme={theme}><StatusChip status={status} /></ThemeProvider>)
const chip = (label) => screen.getByText(label).closest('.MuiChip-root')

describe('StatusChip', () => {
  it.each([
    ['ACTIVE', 'Active', 'PlayCircle', 'Primary'],
    ['ON_HOLD', 'On hold', 'PauseCircle', 'Warning'],
    ['DONE', 'Done', 'CheckCircle', 'Success'],
    ['BLOCKED', 'Blocked', 'Block', 'Error'],
    ['PENDING', 'Pending', 'HourglassEmpty', 'Warning'],
    ['REJECTED', 'Rejected', 'Cancel', 'Error'],
    ['TODO', 'To do', 'RadioButtonUnchecked', 'Default'],
  ])('shows %s as an icon, the word "%s" and a colour', (status, label, icon, colour) => {
    draw(status)
    const shown = chip(label)
    expect(shown.querySelector('svg')).not.toBeNull()
    expect(shown.querySelector('svg')).toHaveAttribute('data-testid', expect.stringContaining(icon))
    expect(shown).toHaveClass(`MuiChip-color${colour}`)
  })

  it('is outlined, never a filled block of colour (one fill green on the site: buttons)', () => {
    draw('ACTIVE')
    expect(chip('Active')).toHaveClass('MuiChip-outlined')
  })

  it('shows an unknown status as its own word', () => {
    draw('ARCHIVED')
    expect(screen.getByText('ARCHIVED')).toBeInTheDocument()
  })
})
