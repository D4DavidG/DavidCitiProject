import { useCallback, useState } from 'react'
import PropTypes from 'prop-types'
import { Link } from 'react-router'
import {
  Box, Button, Card, CardActions, CardContent, Chip, LinearProgress, MenuItem, TextField, Typography,
} from '@mui/material'
import WarningIcon from '@mui/icons-material/WarningAmberRounded'
import CheckIcon from '@mui/icons-material/CheckCircleOutlined'
import BudgetBar from '../../components/BudgetBar'
import BudgetChart from '../../components/charts/BudgetChart'
import WorkloadChart from '../../components/charts/WorkloadChart'
import PageHeader from '../../components/PageHeader'
import PageState, { Pager } from '../../components/PageState'
import ProjectTimelines from '../../components/ProjectTimelines'
import SearchField from '../../components/SearchField'
import StatusChip from '../../components/StatusChip'
import { useAuth } from '../../auth/useAuth'
import { formatDate } from '../../services/format'
import { request } from '../../services/request'
import { useApi } from '../../services/useApi'

const PAGE_SIZE = 12
/** The workload chart shows this many people, the most over first (the server sorts them). */
const WORKLOAD_PEOPLE = 8
const STATUS_OPTIONS = [['', 'All statuses'], ['PLANNING', 'Planning'], ['ACTIVE', 'Active'], ['ON_HOLD', 'On hold'], ['COMPLETE', 'Complete']]

function Stat({ label, value, color }) {
  return (
    <Card sx={{ flex: '1 1 160px' }}>
      <CardContent>
        <Typography variant="body2" color="text.secondary">{label}</Typography>
        <Typography variant="h2" component="p" color={color} aria-label={label}>{value}</Typography>
      </CardContent>
    </Card>
  )
}

Stat.propTypes = { label: PropTypes.string.isRequired, value: PropTypes.number.isRequired, color: PropTypes.string }

/** One project: questions 1 (status), 2 (risk and why) and 7 (budget) on one card. */
function ProjectCard({ project }) {
  const titleId = `project-${project.projectId}`
  return (
    <Card component="article" aria-labelledby={titleId} sx={{ display: 'flex', flexDirection: 'column', borderColor: project.atRisk ? 'error.main' : 'divider' }}>
      <CardContent sx={{ flexGrow: 1, display: 'grid', gap: 1.5 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'flex-start' }}>
          <Box>
            <Typography id={titleId} variant="h3" component="h2">{project.name}</Typography>
            <Typography variant="body2" color="text.secondary">{project.managerName}</Typography>
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
        <Button component={Link} to={`/projects/${project.projectId}`} variant="outlined">Open project</Button>
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
  }).isRequired,
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
      {/* Not inside a sentence, so a secondary button rather than a text link (spec 5c). */}
      <Button component={Link} to="/allocation" variant="outlined" sx={{ mt: 1 }}>
        All people and weeks in Allocation
      </Button>
    </Box>
  )
}

/**
 * The manager's landing screen: their projects this week as a timeline first, then every live
 * project they run (admins: all), each with status, risk and budget. At-risk projects come first
 * (the server orders them). Both counters come from the server and cover every page: `total` and
 * `atRiskTotal`. The timeline and the workload chart have their own requests, so searching or
 * filtering the cards never reloads them.
 */
export default function DashboardPage() {
  const { user } = useAuth()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [pageNumber, setPageNumber] = useState(1)

  const load = useCallback(
    () => request('GET', '/dashboard/projects', { query: { q: search, status, page: pageNumber, pageSize: PAGE_SIZE } }),
    [search, status, pageNumber],
  )
  const { data, error, loading, reload } = useApi(load)
  const items = data?.items ?? []

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle={`${user.role === 'ADMIN' ? "Every live project's" : 'The projects you manage:'} status, risk and budget. At-risk projects come first.`}
      />

      <ProjectTimelines title="My projects this week" />

      <WorkloadPanel />

      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center', mb: 3 }}>
        <SearchField id="dashboard-search" label="Search projects" value={search} onSearch={(q) => { setSearch(q); setPageNumber(1) }} />
        <TextField id="dashboard-status" select label="Status" size="small" value={status} onChange={(e) => { setStatus(e.target.value); setPageNumber(1) }} sx={{ minWidth: 180 }}>
          {STATUS_OPTIONS.map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
        </TextField>
      </Box>

      {/* Only the first load shows the spinner: a new search keeps the old counts and cards until it arrives. */}
      <PageState loading={loading && !data} error={error} onRetry={reload} empty={data && items.length === 0 ? 'No projects to show.' : null}>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mb: 3 }}>
          <Stat label="Total projects" value={data?.total ?? 0} />
          <Stat label="Total at risk" value={data?.atRiskTotal ?? 0} color="error.main" />
        </Box>
        {(search || status) && (
          <Typography variant="body2" color="text.secondary" sx={{ mt: -2, mb: 3 }}>Counts are for the current search and status.</Typography>
        )}
        <Box sx={{ mb: 3 }}><BudgetChart projects={items} /></Box>
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' } }}>
          {items.map((project) => <ProjectCard key={project.projectId} project={project} />)}
        </Box>
        <Pager page={pageNumber} totalPages={data?.totalPages} onChange={setPageNumber} />
      </PageState>
    </>
  )
}
