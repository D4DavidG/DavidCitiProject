import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PasswordField from './PasswordField'

function Box(props) {
  const [value, setValue] = useState('')
  return <PasswordField id="password" label="Password" value={value} onChange={(e) => setValue(e.target.value)} {...props} />
}

describe('PasswordField', () => {
  it('hides what you type until you press the eye, then shows it, then hides it again', async () => {
    render(<Box />)
    const box = screen.getByLabelText('Password')
    await userEvent.type(box, 'Demo-pass-2026')
    expect(box).toHaveAttribute('type', 'password')
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(box).toHaveAttribute('type', 'text')
    expect(box).toHaveValue('Demo-pass-2026')
    await userEvent.click(screen.getByRole('button', { name: 'Hide password' }))
    expect(box).toHaveAttribute('type', 'password')
  })

  it('names the eye by what it will do, with a tooltip, like every icon-only button', async () => {
    render(<Box />)
    await userEvent.hover(screen.getByRole('button', { name: 'Show password' }))
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Show password')
  })

  it('keeps the cursor in the box when the eye is pressed with a mouse', async () => {
    render(<Box />)
    const box = screen.getByLabelText('Password')
    await userEvent.click(box)
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }))
    expect(box).toHaveFocus()
  })

  it('locks the eye with the box while a form is saving', () => {
    render(<Box disabled />)
    expect(screen.getByRole('button', { name: 'Show password' })).toBeDisabled()
  })
})
