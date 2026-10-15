import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ConfirmDialog from './ConfirmDialog'
import { ApiError } from '../services/request'

/** An action the test finishes by hand, like a request held open. */
function heldAction() {
  let finish
  let fail
  const onConfirm = vi.fn(() => new Promise((resolve, reject) => { finish = resolve; fail = reject }))
  return { onConfirm, finish: () => finish(), fail: (error) => fail(error) }
}

function renderConfirm(props) {
  const onClose = vi.fn()
  render(<ConfirmDialog open title="Archive Apollo?" message="It is hidden, not deleted." confirmLabel="Archive" onClose={onClose} {...props} />)
  return onClose
}

const buttons = () => [screen.getByRole('button', { name: /cancel/i }), screen.getByRole('button', { name: /^(archive|please wait…)$/i })]

describe('ConfirmDialog', () => {
  it('runs the action and closes', async () => {
    const onConfirm = vi.fn().mockResolvedValue()
    const onClose = renderConfirm({ onConfirm })
    await userEvent.click(screen.getByRole('button', { name: 'Archive' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })

  it('disables both buttons and says it is working until the action succeeds', async () => {
    const action = heldAction()
    renderConfirm({ onConfirm: action.onConfirm })
    await userEvent.click(screen.getByRole('button', { name: 'Archive' }))
    expect(screen.getByRole('button', { name: 'Please wait…' })).toBeDisabled()
    buttons().forEach((button) => expect(button).toBeDisabled())
    action.finish()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Archive' })).toBeEnabled())
    expect(screen.getByRole('button', { name: /cancel/i })).toBeEnabled()
  })

  it('enables them again after an error, and shows it', async () => {
    const action = heldAction()
    renderConfirm({ onConfirm: action.onConfirm })
    await userEvent.click(screen.getByRole('button', { name: 'Archive' }))
    action.fail(new ApiError(409, 'Archive its deliverables first.'))
    expect(await screen.findByText('Archive its deliverables first.')).toBeInTheDocument()
    buttons().forEach((button) => expect(button).toBeEnabled())
  })

  it('acts once, however many times confirm is pressed', async () => {
    const action = heldAction()
    renderConfirm({ onConfirm: action.onConfirm })
    const confirm = screen.getByRole('button', { name: 'Archive' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    expect(action.onConfirm).toHaveBeenCalledTimes(1)
    action.finish()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Archive' })).toBeEnabled())
  })

  it('cannot be closed with Escape while working', async () => {
    const action = heldAction()
    const onClose = renderConfirm({ onConfirm: action.onConfirm })
    await userEvent.click(screen.getByRole('button', { name: 'Archive' }))
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    action.finish()
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
  })
})
