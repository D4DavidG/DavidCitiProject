/*
 * The top bar's search: which of the signed-in role's pages match what was typed (projects come
 * from the server). Pages are the menu's (navigation.js), plus My account, which everyone has.
 */
import AccountIcon from '@mui/icons-material/AccountCircleOutlined'
import { NAV_ITEMS } from './navigation'

/** The page everyone has that is not in the menu (it hangs off your name in the top bar). */
const ACCOUNT = { to: '/account', label: 'My account', icon: AccountIcon, roles: ['ADMIN', 'MANAGER', 'EMPLOYEE'] }

/** Other words people use for a page; a page matches when one of their words starts with what was typed. */
const OTHER_WORDS = {
  '/dashboard': ['home', 'overview', 'at risk', 'budget'],
  '/my-tasks': ['home', 'my tasks', 'tasks', 'board'],
  '/allocation': ['capacity', 'over-allocated', 'workload', 'bookings', 'resources'],
  '/schedule': ['calendar', 'timeline', 'bookings'],
  '/projects': ['deliverables'],
  '/approvals': ['time', 'timesheets', 'hours', 'approve'],
  '/people': ['employees', 'staff', 'team', 'users'],
  '/requests': ['ask', 'overtime', 'task limit'],
  '/notifications': ['bell', 'alerts', 'messages'],
  '/audit': ['history', 'log', 'changes'],
  '/account': ['profile', 'password', 'my history', 'me'],
}

/**
 * The search field's own colours: white with dark words on the top bar's green, in both modes
 * (the bar is the same green in both). Each ratio is WCAG contrast; TopSearch.test.jsx checks them.
 */
export const FIELD = {
  background: '#FFFFFF', // 7.9:1 against the green bar
  ink: '#161A16', // typed words: 17.6:1 on white
  placeholder: '#4C5450', // 7.8:1 on white
  focus: '#165E26', // the focused border, the one green: 7.9:1 on white
}

/** True when `words` (a synonym, maybe several words) has a word starting with `typed`, or starts with it whole. */
function otherWordMatches(words, typed) {
  return words.startsWith(typed) || words.split(/[\s-]+/).some((word) => word.startsWith(typed))
}

/**
 * The pages `role` may open that match `text`, best first: a name that starts with it, then a name
 * that contains it, then another word for the page; ties keep the menu's order.
 * @param {string} text what was typed
 * @param {string} role ADMIN, MANAGER or EMPLOYEE
 * @returns {{ to: string, label: string, icon: object }[]}
 */
export function matchPages(text, role) {
  const typed = text.trim().toLowerCase()
  if (!typed) return []
  const rank = ({ to, label }) => {
    const name = label.toLowerCase()
    if (name.startsWith(typed)) return 0
    if (name.includes(typed)) return 1
    if ((OTHER_WORDS[to] ?? []).some((words) => otherWordMatches(words, typed))) return 2
    return null
  }
  return [...NAV_ITEMS, ACCOUNT]
    .filter((page) => page.roles.includes(role))
    .map((page, order) => ({ page, order, score: rank(page) }))
    .filter(({ score }) => score !== null)
    .sort((a, b) => a.score - b.score || a.order - b.order)
    .map(({ page: { to, label, icon } }) => ({ to, label, icon }))
}
