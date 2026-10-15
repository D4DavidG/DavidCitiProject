import { useEffect, useState } from 'react'
import PropTypes from 'prop-types'
import { NavLink } from 'react-router'
import {
  AppBar, Box, Button, Chip, Divider, Drawer, IconButton, List, ListItem, ListItemButton, ListItemIcon, ListItemText,
  Snackbar, SnackbarContent, Toolbar, Tooltip, Typography,
} from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import CollapseIcon from '@mui/icons-material/KeyboardDoubleArrowLeft'
import ExpandIcon from '@mui/icons-material/KeyboardDoubleArrowRight'
import { useAuth } from '../auth/useAuth'
import ColorModeToggle from '../theme/ColorModeToggle'
import { useIsMobile } from '../theme/responsive'
import AcmeLogo from './AcmeLogo'
import { NAV_ITEMS, ROLE_LABELS } from './navigation'
import NotificationBell from './NotificationBell'
import { onWrite } from '../services/request'

const DRAWER_WIDTH = 240
/** The collapsed menu: icons only. */
const RAIL_WIDTH = 64
const COLLAPSED_KEY = 'acme.menuCollapsed'

// Storage can throw (private windows, blocked site data): both accesses are wrapped.
function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === 'true'
  } catch {
    return false
  }
}

function saveCollapsed(collapsed) {
  try {
    localStorage.setItem(COLLAPSED_KEY, String(collapsed))
  } catch {
    // the choice lasts until the page reloads
  }
}

/** Successful writes that are not a change to the work: signing in or out, marking notifications read. */
function isSavedChange(path) {
  return !['/auth/login', '/auth/logout', '/auth/refresh'].includes(path) && !path.startsWith('/notifications/')
}

/**
 * The menu links. Collapsed, each is an icon whose label is its accessible name and its
 * tooltip. Each link sits in its own <li>: a <ul> may hold only list items (axe rule 'list').
 */
function NavList({ role, collapsed = false, onNavigate }) {
  return (
    <Box component="nav" aria-label="Main menu" sx={{ flexGrow: 1, overflowX: 'hidden', overflowY: 'auto' }}>
      <List>
        {NAV_ITEMS.filter((item) => item.roles.includes(role)).map(({ to, label, icon: Icon }) => {
          const link = (
            <ListItemButton
              component={NavLink}
              to={to}
              onClick={onNavigate}
              aria-label={collapsed ? label : undefined}
              sx={{
                mx: 1,
                justifyContent: collapsed ? 'center' : 'flex-start',
                px: collapsed ? 0 : 2,
                '&.active': { bgcolor: 'fill.main', color: 'fill.contrastText' }, // the one fill, as primary buttons
                '&.active .MuiListItemIcon-root': { color: 'inherit' },
              }}
            >
              <ListItemIcon sx={{ minWidth: collapsed ? 0 : 36 }}><Icon fontSize="small" /></ListItemIcon>
              {!collapsed && <ListItemText primary={label} />}
            </ListItemButton>
          )
          return (
            <ListItem key={to} disablePadding>
              {collapsed ? <Tooltip title={label} placement="right">{link}</Tooltip> : link}
            </ListItem>
          )
        })}
      </List>
    </Box>
  )
}

NavList.propTypes = {
  role: PropTypes.string.isRequired,
  collapsed: PropTypes.bool,
  onNavigate: PropTypes.func,
}

/**
 * The frame around every signed-in page: a top bar (logo, light/dark switch, bell, who you
 * are, sign out) and the menu: a sidebar on desktop that collapses to icons (remembered in
 * this browser), a drawer on phones. After every successful change it says "Saved" for
 * 3 seconds at the top centre, so it never covers the bell's pop-up at the bottom.
 */
export default function AppLayout({ children }) {
  const { user, logout } = useAuth()
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const [saved, setSaved] = useState(false)

  useEffect(() => onWrite((path) => { if (isSavedChange(path)) setSaved(true) }), [])

  function toggleCollapsed() {
    saveCollapsed(!collapsed)
    setCollapsed(!collapsed)
  }

  const width = collapsed ? RAIL_WIDTH : DRAWER_WIDTH
  const widthChange = (t) => t.transitions.create('width', { duration: t.transitions.duration.shorter })

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar
        position="fixed"
        color="header"
        enableColorOnDark // without it, MUI paints the bar in the card colour in dark mode
        // The green-ink focus ring disappears on the green bar, so in the bar it takes the bar's text colour.
        sx={{ zIndex: (t) => t.zIndex.drawer + 1, '& .MuiButtonBase-root.Mui-focusVisible': { outlineColor: 'currentColor' } }}
      >
        <Toolbar sx={{ gap: 1 }}>
          {isMobile && (
            <Tooltip title="Open menu">
              <IconButton edge="start" color="inherit" aria-label="Open menu" onClick={() => setOpen(true)}>
                <MenuIcon />
              </IconButton>
            </Tooltip>
          )}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexGrow: 1, minWidth: 0 }}>
            <AcmeLogo size={isMobile ? 22 : 26} tone="inherit" />
            {!isMobile && <Typography component="span" sx={{ fontWeight: 600 }} noWrap>Project Tracker</Typography>}
          </Box>
          <ColorModeToggle color="inherit" />
          <NotificationBell />
          {!isMobile && (
            <Button component={NavLink} to="/account" aria-label="My account" color="inherit" sx={{ gap: 1 }}>
              <Typography variant="body2">{user.firstName} {user.lastName}</Typography>
              <Chip size="small" variant="outlined" label={ROLE_LABELS[user.role]} sx={{ color: 'inherit', borderColor: 'currentColor' }} />
            </Button>
          )}
          <Button color="inherit" onClick={logout} aria-label="Sign out" sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}>Sign out</Button>
        </Toolbar>
      </AppBar>

      {isMobile ? (
        <Drawer open={open} onClose={() => setOpen(false)} sx={{ '& .MuiDrawer-paper': { width: DRAWER_WIDTH } }}>
          <Box sx={{ p: 2 }}>
            <Typography variant="subtitle2">{user.firstName} {user.lastName}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{ROLE_LABELS[user.role]}</Typography>
            <Button component={NavLink} to="/account" size="small" sx={{ mt: 1 }} onClick={() => setOpen(false)}>My account</Button>
          </Box>
          <NavList role={user.role} onNavigate={() => setOpen(false)} />
        </Drawer>
      ) : (
        <Drawer
          variant="permanent"
          sx={{
            width,
            flexShrink: 0,
            transition: widthChange,
            '& .MuiDrawer-paper': { width, boxSizing: 'border-box', overflowX: 'hidden', transition: widthChange },
          }}
        >
          <Toolbar />
          <NavList role={user.role} collapsed={collapsed} />
          <Divider />
          <Box sx={{ p: 1, display: 'flex', justifyContent: collapsed ? 'center' : 'flex-end' }}>
            <Tooltip title={collapsed ? 'Expand menu' : 'Collapse menu'} placement="right">
              <IconButton aria-label={collapsed ? 'Expand menu' : 'Collapse menu'} onClick={toggleCollapsed}>
                {collapsed ? <ExpandIcon fontSize="small" /> : <CollapseIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
          </Box>
        </Drawer>
      )}

      <Box component="main" sx={{ flexGrow: 1, minWidth: 0, p: { xs: 2, md: 4 } }}>
        <Toolbar />
        {children}
      </Box>

      <Snackbar
        open={saved}
        autoHideDuration={3000}
        onClose={() => setSaved(false)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        sx={{ top: { xs: 64, sm: 72 } }} // just under the top bar
      >
        {/* role="status" is polite; the default "alert" would interrupt a screen reader */}
        <SnackbarContent role="status" message="Saved" />
      </Snackbar>
    </Box>
  )
}

AppLayout.propTypes = {
  children: PropTypes.node.isRequired,
}
