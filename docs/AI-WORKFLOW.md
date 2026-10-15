# How this was built with Claude Code

For employers and engineers who want to know how David used AI to build this tracker: who
decided what, how the agents were organised, what kept them from doing harm, and what went
wrong. Back to the [main README](../README.md) or the [docs index](README.md).

**In short.** David ran the build like a small team, as product owner and tech lead. Claude
Code (Anthropic's coding agent, run in VS Code on the workshop's cloud desktop, the "VDI") was
the lead engineer: it asked the questions, wrote the plans, wrote code test first, ran the
tests and committed. For bigger features it split the work into tasks and gave each task to
its own agent, with a different agent reviewing every task and a fresh one reviewing the whole
branch before merge. David made every product decision, read the results, and was the only one
who could push to GitHub or deploy to AWS. Test output counted as proof; an agent saying "done"
did not.

Contents: [1. Who did what](#1-who-did-what) ·
[2. One feature, idea to deploy](#2-one-feature-idea-to-deploy) ·
[3. Running agents in parallel](#3-running-agents-in-parallel) ·
[4. Guardrails](#4-guardrails) · [5. Skills, plugins and extensions](#5-skills-plugins-and-extensions) ·
[6. What went wrong](#6-what-went-wrong-and-what-was-learned) ·
[7. How to repeat it](#7-how-to-repeat-it) · [8. Numbers and evidence](#8-numbers-and-where-the-evidence-is)

## 1. Who did what

"Opus", "Sonnet" and "Haiku" are Claude 5.5 models, from most to least capable (and costly).
The rule: the strongest model for design, final reviews and risky code; Sonnet for
well-specified tasks and their reviews; Haiku for bookkeeping.

| Role | Who, which model | What it did, with a real example |
| --- | --- | --- |
| **David**: product owner, tech lead, reviewer | a person | Made the product calls, mostly in multiple-choice interviews (65 questions in 40 rounds by 15 Oct). Turned task assignment from push to pull: "We don't want a push system, we want a pull system". Reviewed the site live and asked for changes. Pushed and deployed |
| **Lead session** (the "controller") | one Claude Code chat, Opus 5.5 | Asked the questions, wrote specs, plans and workflow scripts, dispatched agents, read their reports, merged branches, ran the final checks. Built some parts itself, such as the theme (`39ede18`) and the top bar (`1b99cac`) |
| **Implementers** | a fresh agent per task: Sonnet, or Opus for risky tasks | Pull board: Sonnet built 8 of 10 tasks; Opus built the two with row locks and race conditions |
| **Task reviewers** | never the agent that built it | Two verdicts per task: does it match the spec, and is it well built. An Important finding opens a fix loop |
| **Fixers and re-reviewers** | the builder's model; a fresh Opus from round 4 | At most 5 rounds per task; 90 findings fixed this way in the two biggest builds |
| **Final reviewer** | a fresh Opus with no memory of the build | Read the whole pull-board branch and found that a double click on **Take this** sent two claims; fixed test first in `5de45ab` |
| **Researchers and skeptics** | read-only Opus agents, in parallel | Could the app send email or texts? Four probes, a recommender and a skeptic: no, the workshop's AWS role and network forbid it (see [DECISIONS.md](DECISIONS.md)) |
| **Visual reviewers** | Opus reading screenshots; two skeptics per finding try to disprove it | 36 screenshots of the live site, 59 findings, 24 survived, 14 fixes (`64b3671`, `b880af9`) |
| **Bookkeepers** | Haiku, low effort | Append one line to the build's progress ledger: the cheapest model for a job with no judgement |
| **Verifiers** | a separate agent at the end of a build | Run the full test suites and report the counts |

Git can't show which agent wrote a commit. Every commit is under David's git name, and the
co-author line always says "Claude Opus 5.5", even on work a Sonnet agent did, because the
workflow scripts set that line. It shows that Claude helped, not which model.

## 2. One feature, idea to deploy

From 14 Oct, each bigger feature went through these steps. The names in brackets are the
skills that drive each step (section 5).

1. **Decide** (the `grill-me` interview, or brainstorming's questions). Claude asks David one multiple-choice question at a time (Claude
   Code's `AskUserQuestion` tool), until every choice that changes the code is made. The
   answers became the decisions table in [CLAUDE.md](../CLAUDE.md), now explained in
   [DECISIONS.md](DECISIONS.md). Where Claude had to decide alone, it wrote down the ruling and
   what it costs if wrong, so David could overrule it.
2. **Spec** (brainstorming). One agent writes a short design note: what, why, what was
   rejected. A second agent checks every claim in it against the code.
3. **Plan** (writing-plans). Numbered, test-first tasks with exact file paths. One agent
   drafts it; another attacks it against the code. A preflight agent checks that every name
   the plan relies on exists, and which tasks share files.
4. **Build** (subagent-driven-development, test-driven-development). A workflow script runs the
   tasks. Per task: the implementer writes a failing test, then the code; a different agent
   reviews it; a fix loop runs until the review is clean (at most 5 rounds); a bookkeeper
   writes "review clean" in the ledger.
5. **Final review** (requesting-code-review). A fresh agent reads the whole branch. Important
   findings are fixed test first; minor ones become the first task of the next build instead
   of being dropped.
6. **Verify** (verification-before-completion). Run the suites and paste the counts. A claim
   with no output behind it is not accepted.
7. **Ship** (finishing-a-development-branch). Claude commits. David reviews, runs `git push`,
   then the deploy scripts.

**A real example: the pull board, 14 Oct** (employees take Ready tasks themselves, up to a
limit).

| Step | What happened |
| --- | --- |
| Decide (10:15) | David asked for pull, not push. Follow-up questions settled a per-person limit, set by the line manager, built now |
| Spec and plan | A design note, then a plan of 10 test-first tasks |
| Build (13:05 to 14:22) | Workflow `pull-board-sdd`: 56 agents (36 Sonnet, 11 Haiku, 9 Opus) |
| Final review | 1 Important finding: a double click sent two claims. Fixed in `5de45ab` |
| Verify | 423 backend and 233 website tests passed; lint, build and bandit clean |
| Ship | David pushed and deployed that night |

**The ledger.** Each build kept a progress ledger (`.superpowers/sdd/2026-10-14-pull-board/progress.md`,
on the VDI only). A ruling is one line: what, why, and the cost if wrong. A real one: keep
`SELECT task_limit … FOR UPDATE` and the count of held tasks as two statements, because "under
READ COMMITTED a combined statement's subquery keeps the pre-wait snapshot, so the second of
two concurrent claims would count stale and pass the limit".

**Read the real specs and plans.** The 17 design and research notes and 12 plans
(`docs/superpowers/`) left the tree on 15 Oct, to keep the docs short, but they stay in git
history:

```sh
git ls-tree -r --name-only 4d8b949 -- docs/superpowers
git show 4d8b949:docs/superpowers/specs/2026-10-14-pull-board-design.md | less
git show 4d8b949:docs/superpowers/plans/2026-10-14-pull-board.md | less
```

## 3. Running agents in parallel

The VDI has 2 CPU cores and 7 GB of memory (`nproc`, `free -g`), one local stack and fixed
test-database names. So running agents side by side needed rules, not just more agents.

| Pattern | In plain words, then the term | Where it was used |
| --- | --- | --- |
| Workflow scripts | A small JavaScript program that starts agents in phases (build, review, fix, verify) and waits for each: Claude Code's `Workflow` tool. A stopped run can be resumed; agents that already finished replay from a cache | Most builds from 14 Oct: 22 runs and 397 agents by 15 Oct 00:05 |
| Lanes with file ownership | Each parallel agent owns named files and may not edit anyone else's; it lists "Needs from others" in its report instead | The redesign night (5 lanes), 15 Oct morning (4 lanes), 15 Oct afternoon (below) |
| Worktrees | A second folder checked out on another branch of the same repo (`git worktree add`), so two builds never touch each other's files | `pm-notify`, `David2`, `merge-prep`, `David3`, `David-tweaks`, `docs-overhaul` |
| Locks | Only one agent commits (or runs tests) at a time: `flock` on a shared lock file | `git.lock` and `test.lock` from the redesign night on |
| Batched tests | Each step runs only its own tests; a checkpoint agent runs everything at milestones | From 14 Oct 19:50, at David's request, to save the 2 CPUs |
| The spec as the channel | A change asked for mid-run goes into the spec, which every lane reads first and every reviewer checks against | Gold highlights (`5bfeac9`), red field errors (`4ca8c27`), one design language (`771f12e`), each within minutes on 14 Oct night |
| Multi-lens review | Several reviewers, each looking for one kind of problem: the spec, correctness, tests, security, accessibility | Every task review (the spec, then build quality); two reviewers on the comments pass; four probes on the email question |
| Adversarial review | A skeptic tries to disprove each finding; a reviewer breaks a scratch copy on purpose to see if the tests notice (mutation testing) | Screenshot review (35 of 59 findings rejected); Schedule (3 breaks passed all 18 tests, so 9 fixes followed) |
| Verify before claiming | Every report ends with "verified (and how)" and "not verified (and why)"; layout and colour always go in "not verified" | Every task, from CLAUDE.md section 1 |
| Ultracode | A standing permission from David to start multi-agent workflows without asking each time | From 14 Oct 06:18 |

A commit under a lock, as the agents ran it (`flock` waits until the lock file is free):

```sh
mkdir -p "$HOME/locks"
flock "$HOME/locks/git.lock" sh -c 'git add -- docs/AI-WORKFLOW.md && git commit -m "Docs: how this was built" -- docs/AI-WORKFLOW.md'
```

Every lane's prompt also said: stage files by name (never `git add -A`); never push, never
`git -C`, never stash, reset, rebase or amend; never print `ENVIRONMENT.config` (it holds AWS
credentials); never stage David's `notes.txt`; no agents inside agents.

### The runs, in order

| When | What | Shape |
| --- | --- | --- |
| 13 Oct, day | Backend: database, services, API, tests | The lead session built it test first; a separate agent reviewed it |
| 13 to 14 Oct, night | Every website screen (14 tasks) | A self-paced overnight loop, then a fresh-eyes reviewer: 199 website and 374 backend tests by morning |
| 14 Oct, morning | Screenshot review of the live site | Visual reviewers and skeptics: 14 fixes |
| 14 Oct, day | Pull board, then dashboard charts | One subagent-driven workflow each |
| 14 Oct, evening | Requests, overtime, tokens, history, counts, OpenAPI, accessibility scan, speed | One long workflow, while a second worktree (`David2`) built the Schedule screen and the k6 load test; merged in `2d869eb`, `David` fast-forwarded at 22:38 |
| 14 Oct, night | The redesign | 5 lanes in one worktree (`David3`), locks for git and tests: 39 commits from 23:14 |
| 15 Oct, morning | David's tweaks after seeing the redesign | David clicked through a copy on port 3002 in a worktree; the requests became spec section 6 (`54a933e`); the lead session and 4 lanes built them: 30 commits from 08:30 to 09:15 |
| 15 Oct, afternoon | Post-demo changes and this documentation | About a dozen single-agent workflows at once (below) |

### This run: 15 Oct afternoon

After the demo, David asked for some product changes and a documentation overhaul, with a
16:30 Eastern deadline.

- **In the main checkout** (branch `David`): a backend lane, two website lanes and a Playwright
  lane built the post-demo changes (top-bar search, the archive warning, minimum pay, the
  two-column dashboard, the late-deliverable tooltip, video and UI mode in `tools/e2e.sh`).
- **In a worktree** (branch `docs-overhaul`): seven docs lanes, each owning its own files.
  This page is one of them. Docs agents read the main checkout to describe the newest code,
  but never edit it.
- **Shared rules:** commits through a shared `flock` lock, files named on every commit, and
  the docs committed by 16:00.
- **Then (16:00 to 16:35):** the old notes were deleted only after every lane had used them as
  sources; a link checker passed (every link and anchor resolves, every page reachable from the
  README); the docs branch was merged into `David` (`16b67d6`) and `David` into `main`
  (`7f5f81b`); the numbers were taken from the final runs (683 backend, 889 website, 37 browser
  passed and 1 skipped); David pushed and deployed, and 20 of 20 read-only browser tests then
  passed on the live site.
- **Mid-run, one change from David:** Ana Ruiz, archived during the demo, was reactivated, and
  the lead session re-created Ana's Apollo booking from the audit log's record of it.

## 4. Guardrails

### Permissions

Claude Code asks before running a shell command unless a rule allows it. The rules live in
`.claude/settings.local.json`, which git ignores (`.gitignore` lists `.claude/`), so here is the
whole file as of 15 Oct. A deny rule beats an allow rule.

```json
{
  "permissions": {
    "allow": [
      "Bash",
      "Bash(npm install:*)", "Bash(npm run:*)", "Bash(npm test:*)", "Bash(npm audit:*)",
      "Bash(npx vitest:*)", "Bash(npx playwright:*)",
      "Bash(git add:*)", "Bash(git commit:*)", "Bash(git status:*)", "Bash(git diff:*)", "Bash(git log:*)",
      "Bash(.venv/bin/pytest:*)", "Bash(python3 tools/demo.py:*)", "Bash(./bin/start-dev.sh:*)"
    ],
    "deny": [
      "Bash(git push:*)", "Bash(./bin/deploy-backend.sh:*)", "Bash(./bin/deploy-frontend.sh:*)",
      "Bash(./bin/cleanup-environment.sh:*)", "Bash(terraform apply:*)", "Bash(terraform destroy:*)",
      "Bash(../bin/deploy-backend.sh:*)", "Bash(../bin/deploy-frontend.sh:*)", "Bash(../bin/cleanup-environment.sh:*)",
      "Bash(git push)", "Bash(git -C:*)"
    ]
  }
}
```

| Rule | Why |
| --- | --- |
| allow `Bash` (any other command) | So overnight and parallel agents don't stall waiting for a click. Added 13 Oct 23:16 for the overnight run, removed 14 Oct 06:50 at David's request, added back 09:38 |
| allow the narrow test and commit commands | From the first overnight build; they still cover the work if the blanket line goes |
| deny `git push` | Nothing reaches GitHub until David has read it |
| deny the deploy scripts | The live site was the demo |
| deny `cleanup-environment.sh`, `terraform apply` and `destroy` | Irreversible changes to AWS |
| deny `git -C` | Closes a loophole: git aimed at another folder. Agents write `cd` first, then `git` |

Why the deny list exists: on 13 Oct, before it, Claude tried one AWS deploy (stopped by Claude
Code's own safety check) and one push (it failed for lack of GitHub credentials). An honest
gap: a denied command wrapped in `bash -c` was never tested against the list.

### CLAUDE.md

[CLAUDE.md](../CLAUDE.md) is the working notes Claude Code reads at the start of every session;
every agent's prompt points to it. It holds the stack and the decisions, where files go, the
build order, the traps found by reading the template, the commands, and how to work with David:
explain as you go, verify instead of asserting, end each task with "verified" and "not
verified" lists, and ship every fix with the test that fails without it. Its own rule: fix
anything stale in the same commit as the code that made it stale.

### Memory

Claude Code keeps short notes between sessions, outside the repo (under `~/.claude/projects/`,
on the VDI only). Each note says a rule, why, and how to apply it. The kinds saved here:

- **How to explain:** plain words first, and copy-paste commands with no placeholders to fill
  in (a placeholder once broke David's shell).
- **Who does what:** Claude commits; David pushes and deploys, and pastes the end of any output
  Claude needs, since Claude can't see that terminal.
- **The approved work queue:** the order of features agreed on 14 Oct, built one at a time.
- **David's design language:** welcoming, not military; one green; filled rounded buttons;
  square boxes; no glows.
- **Project changes:** after the demo, the audience became employers.

## 5. Skills, plugins and extensions

A skill is a packaged set of instructions Claude loads for one kind of task. A plugin bundles
skills or tools.

| Name | What it is | How it was used |
| --- | --- | --- |
| Claude Code | Anthropic's coding agent, in VS Code (`anthropic.claude-code` 2.1.300) | The lead session: Opus 5.5; effort medium, high from 13 Oct 16:33, xhigh from 14 Oct 23:09 |
| `superpowers` plugin (6.4.2) | The process skills: brainstorming, writing-plans, subagent-driven-development, test-driven-development, requesting-code-review, verification-before-completion, finishing-a-development-branch, dispatching-parallel-agents | The bigger builds from 14 Oct (section 2). Worktrees were made with plain `git worktree add`, not its worktree skill |
| `grill-me` skill | A relentless interview to sharpen a plan, from `mattpocock/skills` (kept in `.agents/skills/` and `.claude/skills/`, recorded in `skills-lock.json`; all ignored by git) | The 13 Oct decisions. It calls a `grilling` skill that wasn't installed, so Claude ran the interview by hand |
| `dataviz` skill | A method for charts: form, colour, accessibility | Its colour-blind check cut the chart palette to 5 colours |
| `workflow-authoring` skill | How to write a workflow script | Every workflow script |
| `loop` skill | Repeat a task on a timer or at its own pace | The self-paced overnight build, 13 to 14 Oct |
| `update-config` skill | Changes Claude Code's settings files | Putting the `Bash` allow rule back on 14 Oct |
| context7 plugin | Current library documentation | Checking library APIs (1 call) |
| Playwright MCP plugin | Lets an agent drive a real browser | Looking at pages (3 calls); separate from the repo's own browser tests ([TESTING.md](TESTING.md)) |
| skill-creator plugin | Writes new skills | Installed, not used |

VS Code extensions on the VDI: **PostgreSQL** (`ms-ossdata.vscode-pgsql`, to browse the local
tables), **Playwright Test**, **Postman**, **Python** and **Pylance**, **Containers**. REST
Client is not installed; [tools/tracker.http](../tools/tracker.http) is written for it.

## 6. What went wrong, and what was learned

| What happened | Lesson |
| --- | --- |
| A Sonnet comments pass wrote confident, wrong comments (one said `money.py` does all the money maths; the dashboard also does it in SQL). Two Opus reviewers found 4 important and about 18 minor problems, fixed in `b3e9ed7` with a check that no code changed | Review comments like code |
| On Schedule, a reviewer broke a scratch copy 3 ways and all 18 tests still passed: nothing checked where a bar is drawn. 9 fixes followed | A reviewer who tries to break the code finds what tests miss |
| Skeptics rejected 35 of 59 screenshot findings (one was a tab underline caught mid-animation) | Reviewers cry wolf too: check a finding before fixing it |
| The AWS backend vanished on 14 Oct (about 20:50); no agent had run a writing Terraform command, and the workshop role can't read the AWS audit trail | Look before changing: a read-only `terraform plan` showed 10 to add and 0 to destroy, then David redeployed |
| An overnight workflow stalled while the VDI was paused: agents run on that machine, so nothing moves while it sleeps | Keep the desktop running for a long unattended run, and check early; a workflow can be resumed from its cache |
| A second dev server (port 3002, in a worktree) shared the main folder's packages, so it rewrote the pre-bundled library files (Vite's cache) the port-3000 server was using | Two dev servers need two caches (Vite's `cacheDir`) and two ports |
| Sending a message to an agent inside a running workflow started a duplicate copy of it, doing the same work again | Change the spec, which every lane reads first, or wait for the lane to finish |
| `284c204` left a test red; `42e0b40`, three minutes later, fixed it | Run the tests a change touches before each commit, not just at the end |
| The theme lane read the spec before a mid-run change and committed orange (`43fe274`) after the spec said gold | Changes through the spec reach agents that start later; a polish round catches the rest |
| `David` was fast-forwarded to the morning tweaks before a full run; the first full run then failed `budget.spec.js`, and `history.spec.js` still pressed a removed button (both fixed in `e97b645`) | No push or deploy until a full run passes on that exact commit |
| `pgrep -f` matched its own shell, so a queued test never started; `tools/test-all.sh` checked port 3000, which served a different folder's code | Give each worktree its own port and check what a port serves |
| A hand commit (`1c93961`, "updates") swept up an agent's half-done files | No hand commits on a branch an agent is building on |

## 7. How to repeat it

1. **Write the notes first.** A `CLAUDE.md` with the stack, the decisions, the traps you found
   and how you want to work. Keep it current in the same commit as the code.
2. **Set the guardrails.** Allow what is safe; deny push, deploy, destroy and `git -C`. Keep
   the irreversible steps for a person.
3. **Get grilled before building.** One question at a time until every choice that changes the
   code is made, and write the answers down with the reason.
4. **For each feature:** spec, then plan of test-first tasks, then one agent per task with a
   different reviewer, then a fresh final review, then verify with real output.
5. **Run in parallel only with ownership:** named files per lane, a worktree per branch, a lock
   for git and tests, and one port and cache per dev server.
6. **Trust output, not reports.** Test counts, `curl` answers, screenshots. End every task with
   "verified" and "not verified".
7. **Keep rulings in a ledger:** what, why, and the cost if wrong, so a person can overrule
   them later.

## 8. Numbers and where the evidence is

| Number | What | How to re-check |
| --- | --- | --- |
| 362 / 297 / 288 | Commits in the repo / under David's git name / with the Claude co-author line, at `4d8b949` (15 Oct; the other 65, all from before 13 Oct, are the workshop template's) | `git rev-list --count 4d8b949`; `git log 4d8b949 --author="David Gusmao" --oneline \| wc -l`; `git log 4d8b949 --grep="Co-Authored-By: Claude" --oneline \| wc -l` |
| 17 / 12 | Design notes / plans written before building | `git ls-tree -r --name-only 4d8b949 -- docs/superpowers` |
| 22 / 397 | Workflow runs / agents in them, by 15 Oct 00:05 (290 Opus, 85 Sonnet, 22 Haiku) | Session records, VDI only |
| 40 / 65 | Decision rounds / questions Claude asked David, by 15 Oct 00:05 | Session records, VDI only |
| 90 / 112 | Findings fixed in task fix rounds / minor ones logged for later, in the two biggest builds | The ledgers, VDI only |

**What survives:** git history (every commit message says what changed and why), this page,
[DECISIONS.md](DECISIONS.md) and [CLAUDE.md](../CLAUDE.md). **What doesn't:** the session
transcripts, workflow scripts, ledgers, settings and memory live on the VDI, which is wiped
after the workshop. They are quoted here so the record outlives them.

Related: [DECISIONS.md](DECISIONS.md) (every product and design decision, and why) ·
[TESTING.md](TESTING.md) (what the tests check and how to run them) ·
[ARCHITECTURE.md](ARCHITECTURE.md) (how the parts fit) · [SETUP.md](SETUP.md) (run it yourself).
