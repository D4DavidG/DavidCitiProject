import { useMediaQuery } from 'react-responsive'

/** Below this width the sidebar becomes a drawer and tables become cards. */
const MOBILE_MAX_WIDTH = 899

/** True on phones and narrow windows (react-responsive, as the brief asks). */
export function useIsMobile() {
  return useMediaQuery({ maxWidth: MOBILE_MAX_WIDTH })
}
