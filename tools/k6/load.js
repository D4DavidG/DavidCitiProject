/*
 * k6 load test for the tracker API: many managers reading the dashboard at once, plus a burst of logins.
 *
 *   Local (through the proxy on 3001; LocalStack itself fails past about 15 users, so 10 at most):
 *     K6_USERNAME=ML460428 K6_PASSWORD=Demo-pass-2026 k6 run tools/k6/load.js
 *   AWS (David runs it; 25 users, as the removed Python load test did on 13 Oct):
 *     K6_PROFILE=aws K6_BASE_URL=https://d1gov8jpsxhwer.cloudfront.net/api/tracker \
 *     K6_USERNAME=ML460428 K6_PASSWORD=Demo-pass-2026 k6 run tools/k6/load.js
 *
 * Two scenarios:
 *   reads  - each virtual user logs in once, then loops over the reads a manager's screens make
 *            (dashboard cards, at-risk panel, projects list, allocation grid, unread count, and one
 *            project's detail, budget and deliverables), 1 s apart, like someone clicking around.
 *   logins - after the reads, a burst of 20 logins from 10 users at once.
 * Every request is tagged kind:read or kind:login so each kind has its own threshold. Login is slow on
 * purpose: the password hash (PBKDF2, 600,000 rounds) is built to cost about a second of CPU, to make
 * guessing passwords expensive, and a person logs in once per session. So reads must answer within
 * 1 s at p95 and logins within 3 s. Under 1% of all requests may fail. Read-only: nothing is written.
 */
import http from 'k6/http'
import { check, fail, sleep } from 'k6'

const BASE = __ENV.K6_BASE_URL || 'http://localhost:3001/api/tracker'
const USERNAME = __ENV.K6_USERNAME
const PASSWORD = __ENV.K6_PASSWORD
const AWS = __ENV.K6_PROFILE === 'aws'
const PEAK = Number(__ENV.K6_VUS || (AWS ? 25 : 10))

export const options = {
  scenarios: {
    reads: {
      executor: 'ramping-vus',
      exec: 'reads',
      startVUs: 0,
      // Ramp up over a minute, hold, then ramp down: about 1 min 40 s locally, 3 min 40 s on AWS.
      stages: [
        { duration: '1m', target: PEAK },
        { duration: AWS ? '2m' : '30s', target: PEAK },
        { duration: '10s', target: 0 },
      ],
    },
    logins: {
      executor: 'shared-iterations',
      exec: 'loginBurst',
      vus: 10,
      iterations: 20,
      startTime: AWS ? '3m45s' : '1m45s', // after the reads, so the two don't share the CPU
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    'http_req_duration{kind:read}': ['p(95)<1000'],
    'http_req_duration{kind:login}': ['p(95)<3000'],
    checks: ['rate>0.99'],
  },
}

/** Log in and return the token, or stop this user with the reason. */
function login() {
  const res = http.post(`${BASE}/auth/login`, JSON.stringify({ username: USERNAME, password: PASSWORD }), {
    headers: { 'Content-Type': 'application/json' },
    tags: { kind: 'login', name: 'POST /auth/login' },
  })
  const ok = check(res, { 'login answers 200 with a token': (r) => r.status === 200 && Boolean(r.json('token')) })
  if (!ok) fail(`login failed: ${res.status} ${res.body}`)
  return res.json('token')
}

// Init-context variables belong to one virtual user, so each user logs in once and keeps its token.
let token
let projectId

/** GET one path as this user; `name` groups URLs with an id in them into one row of the summary. */
function read(path, name = `GET ${path}`) {
  const res = http.get(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` }, tags: { kind: 'read', name } })
  check(res, { [`${name} answers 200`]: (r) => r.status === 200 })
  return res
}

/** The reads scenario: one round of a manager's screens per iteration. */
export function reads() {
  if (!USERNAME || !PASSWORD) fail('Set K6_USERNAME and K6_PASSWORD (a manager, e.g. the seeded Maria Lopez).')
  if (!token) token = login()

  read('/dashboard/projects')
  read('/dashboard/at-risk')
  const projects = read('/projects')
  read('/dashboard/allocation?weeks=8')
  read('/notifications/unread-count')
  if (projectId === undefined) projectId = projects.json('items.0.projectId')
  if (projectId) {
    read(`/projects/${projectId}`, 'GET /projects/{id}')
    read(`/projects/${projectId}/budget`, 'GET /projects/{id}/budget')
    read(`/projects/${projectId}/milestones`, 'GET /projects/{id}/milestones')
  }
  sleep(1)
}

/** The logins scenario: one login per iteration, ten at a time. */
export function loginBurst() {
  login()
}
