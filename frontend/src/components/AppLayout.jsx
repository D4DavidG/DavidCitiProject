import { useState } from 'react'
import PropTypes from 'prop-types'
import { NavLink } from 'react-router'
import {
  AppBar, Box, Button, Chip, Drawer, IconButton, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Toolbar, Typography,
} from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'
import { useAuth } from '../auth/useAuth'
import { useIsMobile } from '../theme/responsive'
import { NAV_ITEMS, ROLE_LABELS } from './navigation'
import NotificationBell from './NotificationBell'

const DRAWER_WIDTH = 240

function NavList({ role, onNavigate }) {
  return (
    <Box component="nav" aria-label="Main menu">
      <List>
        {NAV_ITEMS.filter((item) => item.roles.includes(role)).map(({ to, label, icon: Icon }) => (
          // Each link sits in its own <li>: a <ul> may hold only list items (axe rule 'list').
          <ListItem key={to} disablePadding>
            <ListItemButton
              component={NavLink}
              to={to}
              onClick={onNavigate}
              sx={{ mx: 1, borderRadius: 1, '&.active': { bgcolor: 'primary.main', color: 'primary.contrastText' }, '&.active .MuiListItemIcon-root': { color: 'inherit' } }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}><Icon fontSize="small" /></ListItemIcon>
              <ListItemText primary={label} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  )
}

NavList.propTypes = {
  role: PropTypes.string.isRequired,
  onNavigate: PropTypes.func,
}

/**
 * The frame around every signed-in page: a top bar (app name, bell, who you are,
 * sign out) and the menu, which is a fixed sidebar on desktop and a drawer on phones.
 */
export default function AppLayout({ children }) {
  const { user, logout } = useAuth()
  const isMobile = useIsMobile()
  const [open, setOpen] = useState(false)

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="fixed" color="inherit" sx={{ borderBottom: 1, borderColor: 'divider', zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar sx={{ gap: 1 }}>
          {isMobile && (
            <IconButton edge="start" aria-label="Open menu" onClick={() => setOpen(true)}>
              <MenuIcon />
            </IconButton>
          )}
          <Typography variant="h6" component="span" sx={{ fontWeight: 700, color: 'primary.main', flexGrow: 1 }} noWrap>
            {isMobile ? 'ACME' : 'ACME Project Tracker'}
          </Typography>
          <NotificationBell />
          {!isMobile && (
            <Button component={NavLink} to="/account" aria-label="My account" color="inherit" sx={{ gap: 1 }}>
              <Typography variant="body2">{user.firstName} {user.lastName}</Typography>
              <Chip size="small" label={ROLE_LABELS[user.role]} />
            </Button>
          )}
          <Button onClick={logout} aria-label="Sign out" sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}>Sign out</Button>
        </Toolbar>
      </AppBar>

      {isMobile ? (
        <Drawer open={open} onClose={() => setOpen(false)} sx={{ '& .MuiDrawer-paper': { width: DRAWER_WIDTH } }}>
          <Box sx={{ p: 2 }}>
            <Typography variant="subtitle2">{user.firstName} {user.lastName}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{ROLE_LABELS[user.role]}</Typography>
            <Button component={NavLink} to="/account" size="small" sx={{ px: 0 }} onClick={() => setOpen(false)}>My account</Button>
          </Box>
          <NavList role={user.role} onNavigate={() => setOpen(false)} />
        </Drawer>
      ) : (
        <Drawer
          variant="permanent"
          sx={{ width: DRAWER_WIDTH, flexShrink: 0, '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' } }}
        >
          <Toolbar />
          <NavList role={user.role} />
        </Drawer>
      )}

      <Box component="main" sx={{ flexGrow: 1, minWidth: 0, p: { xs: 2, md: 3 } }}>
        <Toolbar />
        {children}
      </Box>
    </Box>
  )
}

AppLayout.propTypes = {
  children: PropTypes.node.isRequired,
}
