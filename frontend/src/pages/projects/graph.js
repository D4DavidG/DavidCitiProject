/**
 * Arrange deliverables into steps for the dependency view: a deliverable with no
 * dependencies is step 1; any other is one step after the latest thing it depends
 * on. The server guarantees there are no loops, so this always finishes.
 *
 * @param {Array<{milestoneId: number}>} nodes
 * @param {Array<{from: number, to: number}>} edges `from` depends on `to`
 * @returns {Array<Array<object>>} nodes grouped by step, in step order
 */
export function steps(nodes, edges) {
  const needs = new Map(nodes.map((n) => [n.milestoneId, []]))
  edges.forEach(({ from, to }) => { if (needs.has(from) && needs.has(to)) needs.get(from).push(to) })

  const depth = new Map()
  const visit = (id) => {
    if (!depth.has(id)) depth.set(id, Math.max(-1, ...needs.get(id).map(visit)) + 1)
    return depth.get(id)
  }
  nodes.forEach((n) => visit(n.milestoneId))

  const grouped = []
  nodes.forEach((n) => {
    const d = depth.get(n.milestoneId)
    ;(grouped[d] ??= []).push(n)
  })
  return grouped.filter(Boolean)
}
