import { useCallback, useState } from 'react'
import PropTypes from 'prop-types'
import { Link, useParams } from 'react-router'
import { Alert, Box, Button, Card, CardContent, IconButton, Tooltip, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import ArrowIcon from '@mui/icons-material/ArrowForward'
import LinkOffIcon from '@mui/icons-material/LinkOff'
import FormDialog from '../../components/FormDialog'
import PageHeader from '../../components/PageHeader'
import PageState from '../../components/PageState'
import StatusChip from '../../components/StatusChip'
import { useAuth } from '../../auth/useAuth'
import { formatDate } from '../../services/format'
import { request } from '../../services/request'
import { useApi } from '../../services/useApi'
import { steps } from './graph'

function Node({ node, needs, canManage, onUnlink }) {
  const titleId = `node-${node.milestoneId}`
  const waiting = needs.filter((n) => n.status !== 'DONE')
  return (
    <Card component="article" aria-labelledby={titleId} sx={{ borderColor: node.status === 'BLOCKED' ? 'error.main' : 'divider' }}>
      <CardContent sx={{ display: 'grid', gap: 0.75 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'flex-start' }}>
          <Typography id={titleId} variant="subtitle1" component="h3" sx={{ fontWeight: 600 }}>{node.name}</Typography>
          <StatusChip status={node.status} />
        </Box>
        <Typography variant="body2" color="text.secondary">Due {formatDate(node.dueDate)} · {node.progressPercent}% done</Typography>
        {needs.length > 0 && <Typography variant="body2">Needs {needs.map((n) => n.name).join(', ')}</Typography>}
        {node.status === 'BLOCKED' && waiting.length > 0 && (
          <Typography variant="body2" color="error.main">Waiting for {waiting.map((n) => n.name).join(', ')} to be done.</Typography>
        )}
        {canManage && needs.map((dep) => (
          <Box key={dep.milestoneId}>
            <Tooltip title={`Remove the link to ${dep.name}`}>
              <IconButton size="small" aria-label={`Remove the link to ${dep.name}`} onClick={() => onUnlink(node, dep)}>
                <LinkOffIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Typography component="span" variant="caption" color="text.secondary">{dep.name}</Typography>
          </Box>
        ))}
      </CardContent>
    </Card>
  )
}

Node.propTypes = {
  node: PropTypes.shape({
    milestoneId: PropTypes.number.isRequired,
    name: PropTypes.string.isRequired,
    status: PropTypes.string.isRequired,
    dueDate: PropTypes.string.isRequired,
    progressPercent: PropTypes.number.isRequired,
  }).isRequired,
  needs: PropTypes.arrayOf(PropTypes.object).isRequired,
  canManage: PropTypes.bool.isRequired,
  onUnlink: PropTypes.func.isRequired,
}

/**
 * Question 6: the dependency chain between a project's deliverables, read left to
 * right. A deliverable is blocked until everything it needs is done; links can't
 * form a loop or cross projects (the server refuses both and says why).
 */
export default function DependencyPage() {
  const projectId = Number(useParams().id)
  const { user } = useAuth()
  const loadProject = useCallback(() => request('GET', `/projects/${projectId}`), [projectId])
  const project = useApi(loadProject)
  const loadGraph = useCallback(() => request('GET', `/projects/${projectId}/dependency-graph`), [projectId])
  const graph = useApi(loadGraph)
  const [adding, setAdding] = useState(false)
  const [actionError, setActionError] = useState(null)

  const p = project.data
  const canManage = Boolean(p) && !p.isArchived && (user.role === 'ADMIN' || (user.role === 'MANAGER' && p.managerId === user.userId))
  const nodes = graph.data?.nodes ?? []
  const edges = graph.data?.edges ?? []
  const byId = new Map(nodes.map((n) => [n.milestoneId, n]))
  const needsOf = (id) => edges.filter((e) => e.from === id).map((e) => byId.get(e.to)).filter(Boolean)
  const options = nodes.map((n) => [n.milestoneId, n.name])

  async function unlink(node, dep) {
    setActionError(null)
    try {
      await request('POST', `/milestones/${node.milestoneId}/dependencies/${dep.milestoneId}/archive`)
      graph.reload()
    } catch (failure) {
      setActionError(failure.message)
    }
  }

  return (
    <>
      <PageHeader
        title={p ? `${p.name}: dependencies` : 'Dependencies'}
        subtitle="Read left to right: each deliverable can only finish after the ones it needs."
        actions={(
          <>
            <Button component={Link} to={`/projects/${projectId}`} variant="outlined">Back to project</Button>
            {canManage && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAdding(true)}>Add a link</Button>}
          </>
        )}
      />
      {actionError && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setActionError(null)}>{actionError}</Alert>}

      <PageState loading={graph.loading} error={graph.error} onRetry={graph.reload} empty={graph.data && nodes.length === 0 ? 'No deliverables yet, so there is no chain to show.' : null}>
        <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', md: 'row' }, alignItems: { md: 'stretch' }, overflowX: 'auto' }}>
          {steps(nodes, edges).map((column, index) => (
            <Box key={column[0].milestoneId} sx={{ display: 'flex', gap: 2, alignItems: 'center', flexDirection: { xs: 'column', md: 'row' } }}>
              {index > 0 && <ArrowIcon color="action" sx={{ transform: { xs: 'rotate(90deg)', md: 'none' } }} aria-hidden />}
              <Box component="section" aria-label={`Step ${index + 1}`} sx={{ display: 'grid', gap: 1.5, minWidth: 240, width: { xs: '100%', md: 260 } }}>
                <Typography variant="overline" color="text.secondary">Step {index + 1}</Typography>
                {column.map((node) => (
                  <Node key={node.milestoneId} node={node} needs={needsOf(node.milestoneId)} canManage={canManage} onUnlink={unlink} />
                ))}
              </Box>
            </Box>
          ))}
        </Box>
      </PageState>

      {adding && (
        <FormDialog
          open
          title="Add a dependency"
          submitLabel="Add"
          fields={[
            { name: 'milestoneId', label: 'Deliverable', type: 'select', numeric: true, options, required: true },
            { name: 'dependsOnMilestoneId', label: 'Depends on', type: 'select', numeric: true, options, required: true, helper: 'It can only finish after this one is done.' },
          ]}
          onSubmit={async ({ milestoneId, dependsOnMilestoneId }) => {
            await request('POST', `/milestones/${milestoneId}/dependencies`, { body: { dependsOnMilestoneId } })
            graph.reload()
          }}
          onClose={() => setAdding(false)}
        />
      )}
    </>
  )
}
