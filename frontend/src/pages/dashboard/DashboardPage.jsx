import { useCallback, useEffect, useRef, useState } from 'react'
import PropTypes from 'prop-types'
import { Link, useSearchParams } from 'react-router'
import {
  Box, Button, Card, CardActions, CardContent, Chip, LinearProgress, MenuItem, TextField, Typography,
} from '@mui/material'
import WarningIcon from '@mui/icons-material/WarningAmberRounded'
import CheckIcon from '@mui/icons-material/CheckCircleOutlined'
import BackIcon from '@mui/icons-material/ArrowBackOutlined'
import BudgetBar from '../../components/BudgetBar'
import BudgetChart from '../../components/charts/BudgetChart'
import WorkloadChart from '../../components/charts/WorkloadChart'
import PageHeader from '../../components/PageHeader'
import PageState, { Pager } from '../../components/PageState'
import ProjectTimelines from '../../components/ProjectTimelines'
import SearchField from '../../components/SearchField'
import StatusChip from '../../components/StatusChip'
import { useAuth } from '../../auth/useAuth'
import { formatDate, formatUpdated } from '../../services/format'
import { request } from '../../services/request'
import { useApi } from '../../services/useApi'

/** A "See all" view shows its group 12 cards to a page. */
const PAGE_SIZE = 12
/** Each column shows this many projects, the most recently updated first. */
const COLUMN_SIZE = 3
/** The two groups, split by the server's at-risk flag; each key is also its ?group= value in the address. */
const GROUPS = {
  'at-risk': {
    atRisk: 'true', title: 'At risk', all: 'All at-risk projects', empty: 'No at-risk projects.', seeAll: (n) => `See all ${n} at-risk projects`,
  },
  'on-track': {
    atRisk: 'false', title: 'On track', all: 'All on-track projects', empty: 'No on-track projects.', seeAll: (n) => `See all ${n} on-track projects`,
  },
}
/** The workload chart shows this many people, the most over first (the server sorts them). */
const WORKLOAD_PEOPLE = 8
const STATUS_OPTIONS = [['', 'All statuses'], ['PLANNING', 'Planning'], ['ACTIVE', 'Active'], ['ON_HOLD', 'On hold'], ['COMPLETE', 'Complete']]

/** A small count beside the search (spec 6.4): its words, then the number in bold, on one line. */
function Count({ label, value, color = 'text.primary' }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, whiteSpace: 'nowrap' }}>
      <Typography variant="body2" component="span" sx={{ color: 'text.secondary' }}>{label}</Typography>
      {/* Colour in sx: MUI 9's Typography color prop ignores dotted paths such as 'error.main'. */}
      <Typography component="span" aria-label={label} sx={{ fontWeight: 700, fontSize: '1.125rem', color }}>{value}</Typography>
    </Box>
  )
}

Count.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.number.isRequired,
  /** A theme colour path for the number. */
  color: PropTypes.string,
}

/** One project: questions 1 (status), 2 (risk and why) and 7 (budget) on one card. */
function ProjectCard({ project }) {
  const titleId = `project-${project.projectId}`
  return (
    <Card component="article" aria-labelledby={titleId} sx={{ display: 'flex', flexDirection: 'column', borderColor: project.atRisk ? 'error.main' : 'divider' }}>
      <CardContent sx={{ flexGrow: 1, display: 'grid', gap: 1.5 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'flex-start' }}>
          <Box>
            {/* h3: each card sits under its column's or group's h2. */}
            <Typography id={titleId} variant="h3" component="h3">{project.name}</Typography>
            <Typography variant="body2" color="text.secondary">{project.managerName}</Typography>
            {project.lastActivityAt && <Typography variant="body2" color="text.secondary">{formatUpdated(project.lastActivityAt)}</Typography>}
          </Box>
          <StatusChip status={project.status} />
        </Box>

        {project.atRisk
          ? <Chip icon={<WarningIcon />} color="error" label="At risk" sx={{ justifySelf: 'start' }} />
          : <Chip icon={<CheckIcon />} color="success" variant="outlined" label="On track" sx={{ justifySelf: 'start' }} />}
        {project.riskReasons.length > 0 && (
          <Box component="ul" sx={{ m: 0, pl: 2.5, color: 'error.main' }}>
            {project.riskReasons.map((reason) => (
              <Typography component="li" variant="body2" key={reason.message}>{reason.message}</Typography>
            ))}
          </Box>
        )}

        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', columnGap: 2 }}>
            <Typography variant="body2">{project.progressPercent}% of estimated hours done</Typography>
            <Typography variant="body2" color="text.secondary">Ends {formatDate(project.predictedEndDate)}</Typography>
          </Box>
          <LinearProgress variant="determinate" value={project.progressPercent} aria-label="Progress" sx={{ mt: 0.5, height: 6, borderRadius: 3 }} color="success" />
        </Box>

        <BudgetBar {...project} />
      </CardContent>
      <CardActions sx={{ px: 2, pb: 2 }}>
        <Button component={Link} to={`/projects/${project.projectId}`} variant="contained">Open project</Button>
      </CardActions>
    </Card>
  )
}

ProjectCard.propTypes = {
  project: PropTypes.shape({
    projectId: PropTypes.number.isRequired,
    name: PropTypes.string.isRequired,
    status: PropTypes.string.isRequired,
    managerName: PropTypes.string,
    predictedEndDate: PropTypes.string,
    progressPercent: PropTypes.number.isRequired,
    atRisk: PropTypes.bool.isRequired,
    riskReasons: PropTypes.arrayOf(PropTypes.shape({ code: PropTypes.string, message: PropTypes.string })).isRequired,
    /** The latest change to the project or anything in it (ISO timestamp). */
    lastActivityAt: PropTypes.string,
  }).isRequired,
}

/**
 * One request for dashboard cards, the most recently updated first. With `skip`, it asks
 * nothing and answers null (a hook can't be called conditionally).
 */
function useProjects({ search, status, atRisk, page, pageSize, skip = false }) {
  const load = useCallback(
    () => (skip ? Promise.resolve(null) : request('GET', '/dashboard/projects', { query: { q: search, status, atRisk, sort: 'updated', page, pageSize } })),
    [search, status, atRisk, page, pageSize, skip],
  )
  return useApi(load)
}

/** A useApi result, as the column and the group view take it. */
const RESULT = PropTypes.shape({
  data: PropTypes.object,
  error: PropTypes.object,
  loading: PropTypes.bool.isRequired,
  reload: PropTypes.func.isRequired,
})

/**
 * One column: its heading with the group's count, at most three cards (the most recently
 * updated), and "See all N" under them when the group has more.
 */
function ProjectColumn({ groupKey, result, onSeeAll }) {
  const group = GROUPS[groupKey]
  const headingId = `dashboard-${groupKey}`
  const { data, error, loading, reload } = result
  const items = data?.items ?? []
  const Icon = groupKey === 'at-risk' ? WarningIcon : CheckIcon
  return (
    <Box component="section" aria-labelledby={headingId} sx={{ display: 'grid', gap: 2, alignContent: 'start', minWidth: 0 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <Icon aria-hidden="true" sx={{ color: groupKey === 'at-risk' ? 'error.main' : 'success.main' }} />
        <Typography id={headingId} variant="h2">{data ? `${group.title} (${data.total})` : group.title}</Typography>
      </Box>
      {/* Only the first load shows the spinner: a new search keeps the old cards until it arrives. */}
      <PageState loading={loading && !data} error={error} onRetry={reload} empty={data && items.length === 0 ? group.empty : null}>
        <Box sx={{ display: 'grid', gap: 2 }}>
          {items.map((project) => <ProjectCard key={project.projectId} project={project} />)}
        </Box>
        {data?.total > COLUMN_SIZE && (
          <Box><Button variant="contained" onClick={onSeeAll}>{group.seeAll(data.total)}</Button></Box>
        )}
      </PageState>
    </Box>
  )
}

ProjectColumn.propTypes = {
  /** 'at-risk' or 'on-track'. */
  groupKey: PropTypes.oneOf(Object.keys(GROUPS)).isRequired,
  result: RESULT.isRequired,
  /** Opens the whole group. */
  onSeeAll: PropTypes.func.isRequired,
}

/**
 * The top of a "See all" view: the way back, then the group's heading with its count. The
 * heading takes focus when the view opens, so the browser scrolls to it and a screen reader
 * says where you are.
 */
function GroupHeading({ groupKey, total, onBack }) {
  const heading = useRef(null)
  useEffect(() => { heading.current?.focus() }, [])
  const group = GROUPS[groupKey]
  return (
    <Box sx={{ display: 'grid', gap: 2, justifyItems: 'start', mb: 3 }}>
      <Button variant="contained" startIcon={<BackIcon />} onClick={onBack}>Back to dashboard</Button>
      <Box>
        <Typography ref={heading} tabIndex={-1} variant="h2" sx={{ '&:focus': { outline: 'none' } }}>
          {total === undefined ? group.all : `${group.all} (${total})`}
        </Typography>
        <Typography variant="body2" color="text.secondary">The most recently updated first.</Typography>
      </Box>
    </Box>
  )
}

GroupHeading.propTypes = {
  groupKey: PropTypes.oneOf(Object.keys(GROUPS)).isRequired,
  /** The group's total, once known. */
  total: PropTypes.number,
  onBack: PropTypes.func.isRequired,
}

/**
 * Questions 3 and 5: this week's workload for every project, on its own request, so the project
 * search and filters below never refetch or empty it, and its failure never hides the cards.
 */
function WorkloadPanel() {
  // useApi re-runs whenever its function changes, so it is memoised once: no inputs, no refetch.
  const load = useCallback(() => request('GET', '/dashboard/allocation', { query: { weeks: 1, pageSize: WORKLOAD_PEOPLE } }), [])
  const { data, error, loading, reload } = useApi(load)
  return (
    <Box sx={{ mb: 3 }}>
      <PageState loading={loading} error={error} onRetry={reload} empty={data && data.items.length === 0 ? 'No employees to show.' : null}>
        {data && <WorkloadChart people={data.items} total={data.total} />}
      </PageState>
      {/* Not inside a sentence, so a button rather than a text link; every button is filled (spec 6.2). */}
      <Button component={Link} to="/allocation" variant="contained" sx={{ mt: 1 }}>
        All people and weeks in Allocation
      </Button>
    </Box>
  )
}

/**
 * The manager's landing screen (spec 6.4), built for hundreds of projects: their projects this
 * week as a timeline, this week's workload, the project search with two small counts beside it,
 * then two columns, At risk and On track (stacked on a phone, At risk first), each with the three
 * most recently updated projects they run (admins: all) as cards with status, risk and budget,
 * and Budget by project last, for the cards on screen. "See all N" under a column opens that
 * whole group 12 to a page; the choice is kept in the address (?group=at-risk), so the browser's
 * Back button works. The search and status filter apply to both columns and to a group. Every
 * count comes from the server: each column's `total`, and `atRiskTotal`. The timeline and the
 * workload chart have their own requests, so searching never reloads them.
 */
export default function DashboardPage() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const asked = params.get('group')
  const groupKey = asked && Object.hasOwn(GROUPS, asked) ? asked : null
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [groupPage, setGroupPage] = useState(1)

  const atRisk = useProjects({ search, status, atRisk: 'true', page: 1, pageSize: COLUMN_SIZE })
  const onTrack = useProjects({ search, status, atRisk: 'false', page: 1, pageSize: COLUMN_SIZE })
  const group = useProjects({ search, status, atRisk: GROUPS[groupKey]?.atRisk, page: groupPage, pageSize: PAGE_SIZE, skip: !groupKey })

  /** Opens a group (or, with null, goes back to the columns) as a new place in the browser's history. */
  function show(key) {
    setGroupPage(1)
    setParams(key ? { group: key } : {})
  }

  const onScreen = groupKey
    ? (group.data?.items ?? [])
    : [...(atRisk.data?.items ?? []), ...(onTrack.data?.items ?? [])]
  const whose = user.role === 'ADMIN' ? 'Every live project' : 'The projects you manage'

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={groupKey
          ? `${whose}: status, risk and budget.`
          : `${whose}: status, risk and budget, in two columns, at risk and on track, each showing the three most recently updated.`}
      />

      {groupKey ? (
        <GroupHeading groupKey={groupKey} total={group.data?.total} onBack={() => show(null)} />
      ) : (
        <>
          <ProjectTimelines title="My projects this week" />
          <WorkloadPanel />
        </>
      )}

      {/* The search, its filter and two small counts on one line (they wrap on a phone). A new search
          keeps the old counts until its answer arrives, as it keeps the cards. Total projects is the
          two groups' totals together: every project matching the search is in exactly one. */}
      <Box role="group" aria-label="Project search and counts" sx={{ display: 'flex', rowGap: 1.5, columnGap: 3, flexWrap: 'wrap', alignItems: 'center', mb: (search || status) ? 1 : 3 }}>
        <SearchField id="dashboard-search" label="Search projects" value={search} onSearch={(q) => { setSearch(q); setGroupPage(1) }} />
        <TextField id="dashboard-status" select label="Status" size="small" value={status} onChange={(e) => { setStatus(e.target.value); setGroupPage(1) }} sx={{ minWidth: 180 }}>
          {STATUS_OPTIONS.map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
        </TextField>
        {atRisk.data && onTrack.data && (
          <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            <Count label="Total projects" value={atRisk.data.total + onTrack.data.total} />
            <Count label="Total at risk" value={atRisk.data.atRiskTotal ?? atRisk.data.total} color="error.main" />
          </Box>
        )}
      </Box>
      {(search || status) && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>Counts are for the current search and status.</Typography>
      )}

      {groupKey ? (
        <PageState
          loading={group.loading && !group.data}
          error={group.error}
          onRetry={group.reload}
          empty={group.data && group.data.items.length === 0 ? GROUPS[groupKey].empty : null}
        >
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' } }}>
            {onScreen.map((project) => <ProjectCard key={project.projectId} project={project} />)}
          </Box>
          <Pager page={groupPage} totalPages={group.data?.totalPages} onChange={setGroupPage} />
        </PageState>
      ) : (
        <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' } }}>
          <ProjectColumn groupKey="at-risk" result={atRisk} onSeeAll={() => show('at-risk')} />
          <ProjectColumn groupKey="on-track" result={onTrack} onSeeAll={() => show('on-track')} />
        </Box>
      )}

      {/* Last on the page (spec 6.4): the projects whose cards are on screen. */}
      {onScreen.length > 0 && <Box sx={{ mt: 3 }}><BudgetChart projects={onScreen} /></Box>}
    </>
  )
}
