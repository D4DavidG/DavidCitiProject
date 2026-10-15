import { useCallback, useState } from 'react'
import PropTypes from 'prop-types'
import { Link, useParams } from 'react-router'
import { Box, Button, Card, CardContent, FormHelperText, Typography } from '@mui/material'
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

function Node({ node, needs, canManage, unlinking, refusal = null, onUnlink }) {
  const titleId = `node-${node.milestoneId}`
  const waiting = needs.filter((n) => n.status !== 'DONE')
  return (
    <Card component="article" aria-labelledby={titleId} sx={{ borderColor: node.status === 'BLOCKED' ? 'error.main' : 'divider' }}>
      <CardContent sx={{ display: 'grid', gap: 0.75 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'flex-start' }}>
          <Typography id={titleId} variant="subtitle1" component="h3" sx={{ fontWeight: 600 }}>{node.name}</Typography>
          <StatusChip status={node.status} />
        </Box>
        {/* Two lines: the cards are narrow, and one long line wrapped mid-phrase. */}
        <Typography variant="body2" color="text.secondary">Due {formatDate(node.dueDate)}</Typography>
        <Typography variant="body2" color="text.secondary">{node.progressPercent}% of estimated hours done</Typography>
        {needs.length > 0 && <Typography variant="body2">Needs {needs.map((n) => n.name).join(', ')}</Typography>}
        {node.status === 'BLOCKED' && waiting.length > 0 && (
          <Typography variant="body2" color="error.main">Waiting for {waiting.map((n) => n.name).join(', ')} to be done.</Typography>
        )}
        {canManage && needs.map((dep) => (
          // Words, not just an icon: a phone has no hover to reveal a tooltip.
          <Button key={dep.milestoneId} size="small" variant="contained" color="error" startIcon={<LinkOffIcon fontSize="small" />}
            onClick={() => onUnlink(node, dep)} disabled={unlinking === dep.milestoneId} sx={{ justifySelf: 'start' }}>
            Remove link to {dep.name}
          </Button>
        ))}
        {refusal && <FormHelperText error role="alert" sx={{ m: 0 }}>{refusal}</FormHelperText>}
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
  /** The deliverable whose link from this one is being removed right now: its button waits for the answer. */
  unlinking: PropTypes.number,
  /** The server's sentence when removing one of this deliverable's links was refused. */
  refusal: PropTypes.string,
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
  const [refusal, setRefusal] = useState(null) // { milestoneId, text }: shown on that deliverable's card
  const [unlinking, setUnlinking] = useState(null) // { from, to } while a link is being removed

  const p = project.data
  const canManage = Boolean(p) && !p.isArchived && (user.role === 'ADMIN' || (user.role === 'MANAGER' && p.managerId === user.userId))
  const nodes = graph.data?.nodes ?? []
  const edges = graph.data?.edges ?? []
  const byId = new Map(nodes.map((n) => [n.milestoneId, n]))
  const needsOf = (id) => edges.filter((e) => e.from === id).map((e) => byId.get(e.to)).filter(Boolean)
  const options = nodes.map((n) => [n.milestoneId, n.name])

  async function unlink(node, dep) {
    setRefusal(null)
    setUnlinking({ from: node.milestoneId, to: dep.milestoneId })
    try {
      await request('POST', `/milestones/${node.milestoneId}/dependencies/${dep.milestoneId}/archive`)
      graph.reload()
    } catch (failure) {
      setRefusal({ milestoneId: node.milestoneId, text: failure.message })
    } finally {
      setUnlinking(null)
    }
  }

  return (
    <>
      <PageHeader
        title={p ? `${p.name}: dependencies` : 'Dependencies'}
        subtitle="Read left to right: each deliverable can only finish after the ones it needs."
        actions={(
          <>
            <Button component={Link} to={`/projects/${projectId}`} variant="contained">Back to project</Button>
            {canManage && <Button variant="contained" startIcon={<AddIcon />} onClick={() => setAdding(true)}>Add a link</Button>}
          </>
        )}
      />

      <PageState loading={graph.loading} error={graph.error} onRetry={graph.reload} empty={graph.data && nodes.length === 0 ? 'No deliverables yet, so there is no chain to show.' : null}>
        <Box sx={{ display: 'flex', gap: 2, flexDirection: { xs: 'column', md: 'row' }, alignItems: { md: 'flex-start' }, overflowX: 'auto' }}>
          {steps(nodes, edges).map((column, index) => (
            <Box key={column[0].milestoneId} sx={{ display: 'flex', gap: 2, alignItems: { xs: 'center', md: 'flex-start' }, flexDirection: { xs: 'column', md: 'row' } }}>
              {index > 0 && <ArrowIcon color="action" sx={{ transform: { xs: 'rotate(90deg)', md: 'none' }, mt: { md: 7 } }} aria-hidden />}
              <Box component="section" aria-label={`Step ${index + 1}`} sx={{ display: 'grid', gap: 1.5, minWidth: 240, width: { xs: '100%', md: 260 } }}>
                <Typography variant="overline" color="text.secondary">Step {index + 1}</Typography>
                {column.map((node) => (
                  <Node key={node.milestoneId} node={node} needs={needsOf(node.milestoneId)} canManage={canManage} unlinking={unlinking?.from === node.milestoneId ? unlinking.to : undefined} refusal={refusal?.milestoneId === node.milestoneId ? refusal.text : undefined} onUnlink={unlink} />
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
