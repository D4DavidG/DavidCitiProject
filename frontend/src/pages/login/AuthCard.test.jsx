import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import AuthCard from './AuthCard'
import { renderAt } from '../../test/utils'

vi.mock('../../theme/responsive', () => ({ useIsMobile: vi.fn(() => false) }))
const responsive = await import('../../theme/responsive')

function renderCard() {
  renderAt(<AuthCard title="Sign in"><p>the form</p></AuthCard>, { path: '/login' })
  return {
    logo: screen.getByRole('img', { name: 'ACME' }),
    card: screen.getByRole('heading', { name: 'Sign in' }).closest('.MuiCard-root'),
  }
}

const before = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

describe('AuthCard', () => {
  it('puts the logo large on the left with one line under it, and the card on the right, on desktop', () => {
    responsive.useIsMobile.mockReturnValue(false)
    const { logo, card } = renderCard()
    expect(logo).toHaveAttribute('height', '104')
    expect(screen.getByText('Project tracker: status, people, deliverables and budget in one place')).toBeInTheDocument()
    expect(before(logo, card)).toBe(true)
    expect(card.parentElement).toHaveStyle({ gridTemplateColumns: 'minmax(0, 440px) minmax(0, 420px)' })
  })

  it('puts a smaller logo on top of the card on phones', () => {
    responsive.useIsMobile.mockReturnValue(true)
    const { logo, card } = renderCard()
    expect(logo).toHaveAttribute('height', '48')
    expect(before(logo, card)).toBe(true)
    expect(card.parentElement).toHaveStyle({ gridTemplateColumns: 'minmax(0, 420px)' })
    responsive.useIsMobile.mockReturnValue(false)
  })

  it('has the dark mode switch', () => {
    renderCard()
    expect(screen.getByRole('button', { name: 'Switch to dark mode' })).toBeInTheDocument()
  })

  it('shows the form inside the card', () => {
    const { card } = renderCard()
    expect(card).toHaveTextContent('the form')
  })
})
