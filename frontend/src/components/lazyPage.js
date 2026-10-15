import { lazy } from 'react'
import { PageLoadFailed } from './PageState'

/**
 * Load a page's code on its first visit. If the download fails (offline, or a deploy
 * replaced the file), show Reload instead of a blank screen.
 */
export default function lazyPage(load) {
  return lazy(() => load().catch(() => ({ default: PageLoadFailed })))
}
