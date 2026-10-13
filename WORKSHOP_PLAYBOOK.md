# Playbook: building a transactional web app in four days

Context to hand an AI assistant at the start of a similar project. Written from
a finished one: a banking app built in four days by four people — 6,571 lines of
Python, 4,283 of React, 168 tests, 19 REST routes, MongoDB with an in-memory
fallback.

Start with "What made this one work", then "Decide these before writing code",
"Order of operations" and "Working with an AI assistant". Those four are what
actually determined whether the project worked; the rest is detail you can read
when you reach it.

---

## What was built, and how fast

| Day | Commits | What landed |
| --- | --- | --- |
| 1 | 13 | Domain models, service layer, in-memory repository, 17 REST routes, auth, 95 tests, Postman export |
| 2 | 18 | MongoDB behind the same repository interface. Immutable transactions. |
| 3 | 43 | Entire React frontend — scaffold, 16 pages, admin console, JWT auth |
| 4 | 16 | Confirmations, audit log, docs consolidation |

Day 3 was a crunch and it only worked because days 1–2 produced a backend that
was finished and tested. **The single biggest scheduling lesson: the UI cannot
start until the API is stable, so the API has to be done early, not well.**

---

## What made this one work — the short version

If you take five things into the next project, take these. Everything below is
detail on them.

1. **One irreversible decision, made first: money is integer cents.** Every other
   correctness property in the project rests on it — the invariant check is exact
   because both sides are integers, the wire format is unambiguous, and no
   rounding policy had to be agreed. Changing it later would have been a rewrite.

2. **A repository interface before a database.** The real database arrived on day
   two and touched one file. The in-memory version is still there, and it is what
   makes the test suite fast and the demo zero-setup.

3. **An invariant that is checked by every single test.** `balance == sum(ledger)`
   runs in `tearDown` of all 168 tests. A code path that moves money without a
   ledger entry fails in whichever test touched it, immediately. Pick the one
   property that must never be false and wire it into the test harness on day one.

4. **Rules in a service layer with no framework imports, proven by a test file
   that never imports the API.** That import boundary is what makes "clean
   separation" checkable rather than claimed, and it is why the same rules served
   HTTP, a console demo and the tests.

5. **A single team document with the non-obvious rules in it.** Not architecture
   — that is derivable from the code — but the things that bite: money is cents,
   ownership is 404 not 403, never authorize off the token's role claim. Read by
   people and by the AI assistant, and kept current in the same commit as the code
   that outdated it.

**What stands out most, honestly:** the backend was finished and tested before
the UI started. That is the whole reason 43 frontend commits in one day was
survivable instead of a disaster. Everything in "Order of operations" is in
service of getting there.

---

## Decide these before writing code

Each of these is cheap on day 1 and expensive by day 3. Two of them were decided
late on this project and both cost real time.

1. **How money is represented.** Pick integer minor units (cents). Not float,
   not `Decimal`, not strings. See "Money" below — this is the highest-leverage
   decision in the whole project.
2. **Which database.** This project never settled it. The brief said MySQL "to
   be confirmed", the syllabus taught MongoDB, and the SQL script is *still*
   owed as a graded deliverable a month later. **Ask the instructor on hour one.
   Do not guess, but do not defer either** — an unmade decision is worse than
   either answer.
3. **The wire field naming convention.** snake_case or camelCase, picked once,
   applied to requests *and* responses. Mixing them produced a silent bug here —
   see "What cost time", item 2.
4. **Whether auth is in scope.** It changes every service signature, because
   every method needs to know who is calling.

---

## Order of operations

This sequence is what to repeat. Each step is testable before the next begins.

1. **Errors first.** A module of domain exceptions — `InsufficientFunds`,
   `AccountNotFound`, `NotAuthorized`. Ten minutes, and it is what lets the
   service layer stay framework-free.
2. **The money module.** One file: parse, validate, format. Nothing else may
   convert money.
3. **Models.** Plain classes. Make the invariant-critical field read-only (see
   "Encapsulation that holds").
4. **The repository, in memory.** Dictionaries behind method names a database
   will later implement. Do not skip the in-memory version to "save time by
   going straight to the real database" — it is what makes the tests fast and
   the swap cheap.
5. **The service layer.** Every business rule, no framework imports.
6. **Tests of the rules**, calling the service directly. No HTTP.
7. **The controller.** A route table, one auth function, one error-mapping table.
8. **Tests of the HTTP layer.**
9. **Seed data**, replayed through the real service methods.
10. **A console demo script** that exercises everything with no server running.
11. *Only now:* the real database, behind the repository interface.
12. *Only now:* the frontend.

Steps 1–10 were day 1. That is achievable and it is the right shape.

---

## Working with an AI assistant

This project was built with one. The difference between it going fast and going
sideways came down to a handful of habits.

### Make it verify, not assert

The failure mode is not an assistant that writes bad code. It is one that writes
plausible code and then tells you it works. Insist on evidence, and the kind of
evidence that matches the claim:

| Claim | What actually proves it |
| --- | --- |
| "the tests pass" | the run output, with the count |
| "the page works" | a request against the running server, not `npm run build` |
| "this colour is accessible" | the computed ratio, printed |
| "the endpoint returns X" | `curl` against it |
| "the hint matches the server" | a request that violates the limit, showing the 400 |

**A clean build is not a working feature.** Several times here a page compiled,
linted and built while being wrong — a component rendered with a missing required
prop crashed at runtime with a green build behind it.

### Ask what it could not check

End-of-task summaries should separate "verified" from "not verified". An
assistant cannot see your screen: hover states, animations, colour in context and
layout are all things it can only reason about. Getting that said explicitly
stops a visual bug being reported as done.

### Make it write the test that locks the fix in

Every behavioural fix should arrive with a test that fails without it. This is
also how the "tests that assert absences" above got written — they came from
fixing something and then asking what stops it coming back.

### Give it the real constraint in writing

`AGENTS.md` said "brevity outranks everything else" and "a feature nobody can
explain is worse than no feature". That changed the output measurably: without
it, an assistant optimises for completeness, because that is what looks like good
work. Project values belong in a file it reads, not in your head.

### When it disagrees with your plan, make it show you

Twice here the assistant pushed back — that bright pastel account colours cannot
carry white text (1.3:1 against a 4.5:1 floor), and that a demo running order
would show an account page before any account existed. Both were right and both
were demonstrated with output rather than argued. "Prove it" is the right
response to pushback; so is listening when the proof arrives.

### Distrust clean merges

Git merges text. It does not merge meaning. See "Collaboration" below.

---

## Money

The one rule everything else depends on.

**Money is an integer number of cents, everywhere except on screen.** `123456`
is `1,234.56`.

- **Why not float:** `1000.10 + 234.20 + 0.30 - 0.04` gives
  `1234.5599999999999`. Drift compounds across a ledger.
- **Why not `Decimal`:** it is also correct, and this project started there and
  migrated away. `Decimal` is exact *only if* every value is quantized to two
  places on the way in — forget one `.quantize()` and a third decimal place
  survives to be rounded inconsistently later. It is also not JSON-serializable,
  which forces money out as a quoted string and back through a parser on every
  client. An `int` cannot hold a fractional cent at all: the rule is enforced by
  the type rather than by remembering to call something.
- **Why integers win on the wire:** JSON has one numeric type. A fractional
  literal becomes an IEEE 754 double the instant `JSON.parse` runs. An integer
  is exact to 2^53 — about ninety trillion dollars in cents.

**Enforce it at both boundaries and reject rather than guess:**

```
server:  parse_amount()  -> 400 on a float, a string, or 3 decimal places
client:  parseDollars()  -> null on "1.1", because "$1.10" and
                            "I have not finished typing" are indistinguishable
         formatCents()   -> display only
```

Refusing `25.00` looks pedantic and is not: in an API that speaks cents, is that
twenty-five dollars or twenty-five cents? Guessing wrong is a hundredfold error.

**Never compute a balance in the browser.** Every write endpoint returns the new
authoritative account beside the transaction. Render that. A client that adds the
deposit to the number it was holding is wrong the moment two tabs are open.

---

## Backend

### The repository as a seam — the decision that paid off most

Two store classes with identical method names: one backed by dictionaries, one
by MongoDB. The service layer never learns which one it was handed.

The database arrived on day 2 and **touched one file**. No business rule changed.
If the services had talked to dictionaries directly, day 2 would have been a
rewrite of everything with the frontend already being planned on top of it.

What the in-memory version stands in for, explicitly:

| In memory | In the database |
| --- | --- |
| `itertools.count()` ids | a counters collection / `AUTO_INCREMENT` |
| an email dict | a unique index on `users.email` |
| a set of client txn ids | a unique index on `transactions.client_txn_id` |
| a lock around each change | a multi-document transaction |

### Wrap concurrency in one named thing, from the start

Every state-changing service method runs inside `with self.store.atomic():`.

In memory that is a reentrant lock. Against MongoDB it is a multi-document
transaction, which also holds across separate server processes. **Same call
site.** Had the lock been written inline in each method, swapping it for
transactions would have meant editing every one of them.

Why it is needed at all: the natural "read the balance, check it, write the new
balance" sequence lets two simultaneous withdrawals both pass the check and both
write. The account goes negative and the business rule was technically
implemented correctly.

Use a *reentrant* lock — methods call each other (`transfer` reuses `withdraw`'s
internals) and a plain lock deadlocks the instant one held method calls another.

### Encapsulation that holds

`balance` is a read-only property backed by `_balance`. No setter.
`account.balance = 999999` raises. The only way a balance moves is an `_apply()`
call that the service makes immediately beside writing a ledger entry.

If `balance` were a plain public attribute, the core invariant would be
unenforceable, because any line of code anywhere could break it.

### Pick an invariant and check it constantly

**Stored balance must always equal the sum of that account's transactions.**

- `reconcile_all()` returns every account where they disagree. Always empty.
- It runs in `tearDown` of **every test**, so every test is also a test of the
  invariant. A code path that moves a balance without writing a ledger entry
  fails inside whichever test exercised it, immediately — not three days later
  when the numbers stop adding up.
- An admin endpoint exposes it, so it is demoable live.

Because both sides are integers, the comparison is exact. No rounding tolerance.
This is the payoff from the money decision.

### The ledger is append-only

A correction is a new entry in the opposite direction. There is deliberately **no
`set_balance` method anywhere** — it is the easiest admin feature to write and
the wrong one, because a balance that moves without a ledger entry breaks the
invariant permanently and afterwards there is no way to tell which number is
right.

Admins post an *adjustment*: a normal ledger entry with a direction and a written
reason (minimum 10 characters), plus an audit row. All three, every time.

---

## Security

### Passwords

PBKDF2-HMAC-SHA256, 600,000 rounds, random per-user salt, stored as one
self-describing string carrying algorithm, cost, salt and key.

- The salt stops one precomputed table cracking every account at once.
- The round count makes each guess expensive. **The instinct to "just use
  SHA-256" is wrong** — a plain hash is built to be *fast*, and fast is exactly
  what an attacker wants when making billions of guesses. Slow is the feature.
- Storing the cost *inside* the hash means it can be raised later without
  invalidating existing users.
- Use bcrypt/argon2 if a dependency is allowed. PBKDF2 is the stdlib answer.

### Tokens

Signed JWTs (`HS256`), carrying `sub`, `username`, `name`, `role`, `iat`, `exp`.

Three details that are easy to get wrong and all three matter:

1. **Verify the signature *before* parsing the payload.** Parsing untrusted bytes
   first means acting on attacker-supplied structure.
2. **Compare with a constant-time function**, not `==`. Normal equality returns
   as soon as it finds a difference, so how long it takes leaks how much of a
   forged signature was correct — enough attempts reconstruct a valid one byte
   at a time. This applies to *any* secret comparison; it was also used for the
   admin registration code.
3. **One answer for every failure.** Malformed, forged, expired → the same 401
   with the same message. Telling an attacker which part of the forgery was wrong
   tells them what to fix.

**Signed, not encrypted.** Anyone holding the token can read the payload —
base64 is not encryption. Nothing sensitive goes in there. What they cannot do is
change it.

### Never authorize off the token's role claim

The most important auth lesson here. The `role` claim is signed, so it has not
been tampered with — but a JWT cannot be recalled and these last a week. A user
demoted after logging in still carries a token saying ADMIN.

So `_authenticate` re-reads the user from storage and authorizes on the **stored**
role. The token says who you are; the database says what you may do.

### Ownership, and the two-method split

All account access goes through one method, so no route can forget. It raises
**404, not 403**, when the account belongs to someone else — a 403 confirms the
account exists, which lets an attacker enumerate the customer base by walking
ids. There is a test asserting the "not yours" and "does not exist" messages are
byte-identical.

Then the refinement that is worth copying:

| Method | Rule |
| --- | --- |
| `get_account_for` | read access; **an admin may read any account** |
| `get_account_to_move_money` | ownership only; **an admin is not an exception** |

Reading any account is a normal supervisory power. Moving a customer's money
through the ordinary customer route is not, because it leaves no record of who
did it. An admin who needs to change a balance uses `adjust()`, which demands a
written reason and writes an audit row.

### Separate the privileged role from the data it supervises

**An admin holds no accounts.** `open_account` refuses an admin as the owner and
the nav hides the account tabs for them. The reasoning: every admin power —
freeze, adjust, read the audit log — is over somebody else's money. An admin who
also banked here could freeze their own account, adjust their own balance, and
sign off on both.

### Secrets

- The signing key is generated on first run and written to a gitignored `.env`.
  **This removed a setup step that people skip.** Without it, every server
  restart signs everyone out.
- Each developer gets their own; it is never shared. A token is only presented to
  the server that signed it, and everyone runs their own backend on localhost.
  Only a deployed shared backend needs an agreed key, and it sets the variable in
  its own environment.
- The admin registration code lives **only** on the server. A comparison written
  in JavaScript ships to the browser and stops nobody.

### Idempotency

Write endpoints accept a `clientTxnId` — one `crypto.randomUUID()` per submission
attempt. A replayed id is refused, so a double-clicked button cannot move money
twice. In memory a set lookup; in the database a unique index, which is the
version that holds under load.

---

## API

### The route table is data

19 routes in one list, each row declaring whether it needs a token and whether it
needs the admin role. That is the entire authorization configuration, auditable
at a glance, and one `_authenticate` function reads it.

The alternative — an `if` repeated inside nineteen handlers — is the fastest
possible route to having eighteen that check and one that forgot.

**And a test walks the real route table asserting every route except the public
ones requires a token.** Add a route, forget the flag, the suite fails.

### Exception → status in one table

The service layer raises `InsufficientFunds`, never `409`. That is what lets the
same rules serve the HTTP API, a console demo, and the test suite.

One ordered list maps every domain exception to a status. Order matters —
subclasses before parents, or a 400 answers 500.

| Status | Meaning here |
| --- | --- |
| 400 | the request is malformed or the amount is invalid |
| 401 | authenticate — *including a failed login* |
| 403 | authenticating again will not help |
| 404 | not found, **or exists but is not yours** |
| 409 | well-formed but the state refuses it (overdraft, frozen, duplicate) |
| 503 | the database is unavailable; nothing was changed |

The 401/403 split is worth stating explicitly because getting it backwards is
common: a wrong password is 401.

### Shape conventions worth copying

- **Every failure answers the same `{ "error": "..." }` shape.** One thing for
  the client to unwrap.
- **Paginate from day one.** Lists come back in an envelope
  (`{ items, page, pageSize, total, totalPages }`). Adding pagination later
  changes the response shape and breaks every client that consumed a bare array.
  The cost now is one word of nesting.
- **Write endpoints return the new authoritative resource**, not just the
  transaction.
- **Serialize by naming every field explicitly**, never by dumping an object's
  `__dict__`. That is what guarantees `password_hash` cannot leak when someone
  adds a field later.
- **Keep database keys out of the interface where you can.** A transfer names a
  *person* (`toUserId`) and the server resolves it to their account, so the
  browser is never told anyone else's account ids.
- **Generate the Postman collection from the route table** by importing the app
  and walking it. A hand-maintained collection drifts, and the drift surfaces
  during integration instead of the afternoon it was introduced. Include the
  *failure* cases — a collection of happy paths proves the endpoints exist; one
  with overdraft, bad amounts and an ownership violation proves the rules do.

---

## Database

- **Build the in-memory store first and keep it.** It is the fast test path, it
  is the zero-setup demo path, and it is the thing that proves the interface is
  actually an interface.
- **Translate driver errors into domain errors at the boundary.** A lost
  connection becomes `StorageUnavailable`; a write conflict becomes
  `ConcurrentUpdate`. No driver exception escapes the store file, so the
  controller answers 503 and 409 without importing the database library. A small
  decorator does this for every method.
- **Distinguish *which* unique index collided.** A duplicate on `email` and a
  duplicate on `_id` mean completely different things; the driver reports the
  index in `keyPattern`.
- **Store money as a 64-bit integer type.** `BIGINT` / BSON `Long`. Never
  `FLOAT`, `DOUBLE`, or a driver-dependent `DECIMAL`.
- **Multi-document transactions need a replica set on MongoDB.** A standalone
  `mongod` accepts the code and silently gives no atomicity. Know this before
  demoing.
- **Write a diagnostic script.** This project has `tools/check_mongo.py` — run it
  when the cluster will not connect and it explains what failed. Four hundred
  lines that saved the team repeatedly.
- **Skip, do not fail, tests that need the real cluster.** 16 of 168 skip
  without it, so the suite still passes on a machine with no database.

---

## Frontend

### One module talks to the backend

Every call goes through a single `request()` function, so the token header, the
JSON encoding and the error shape are handled once. Pages call named functions
and never call `fetch` directly. When the auth scheme or base URL changes, it
changes in one file.

### Handle session expiry in exactly one place

Any 401 from any call clears the stored token and drops the user, so the route
guard redirects to sign-in. **Login and register are exempt**, because a 401
there means "wrong password", not "your session ended".

Before this existed, the app kept rendering as though signed in — name in the
nav, stale account list on screen — while every request failed, and the reason
arrived as a small red line next to whichever button was pressed.

Do not add per-page 401 handling.

### Probe the session on load, do not assume it

On mount, ask the backend whether the stored token is still good rather than
assuming it and letting the first real call fail. While that is in flight,
`loading` is true and the router renders nothing — so a signed-in user refreshing
a page is never briefly bounced to the login screen.

Corollary: only a session that *existed* can be said to have ended. A visitor
arriving with a stale token was never signed in, and telling them their session
expired is a lie about something they did not do. (This needed a ref, not state —
a handler registered once closes over the initial value forever.)

### Shared state lives where two things need it

The account list sits in auth context because the nav bar and the home page both
read it. Fetching it in both would mean two calls per load and two versions of
the truth.

The matching rule: **anything that moves money must refresh it afterwards**, or
both the nav and the home page keep showing the old balance.

### Wrap every storage access

`localStorage` and `sessionStorage` *throw* rather than return null in some
private-browsing modes. A session that cannot be persisted should still work
until the tab closes, not crash on load. Also: "remember me" chooses between the
two stores — it buys a longer-lived *store*, not a longer-lived token.

### Design tokens with contrast ratios in the comments

Every colour in the stylesheet is annotated with its measured ratio:

```css
--navy: #003b70;   /* 11.29:1 with white  - nav, primary buttons */
--muted: #5c6672;  /*  5.84:1 on surface,  4.87:1 on bg */
```

This makes accessibility checkable instead of aspirational, and it makes a dark
theme tractable — redefine only the tokens, guarded so an explicit light choice
still wins:

```css
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }
:root[data-theme="dark"] { … }
```

Never signal an error by border colour alone; tie the message to its field with
`aria-describedby`. A money action should be reversible, checked, or confirmed
(WCAG 3.3.4) — one confirm component with two states, not a second page.

### Share the form, not the page

Deposit and withdraw render one `TransactionMenu` with a `fixedKind` prop, so all
three money actions share one set of validation rules. Three near-identical pages
is where the rules drift apart.

### One page shell, filled by a different inner component

Deposit, Withdraw and History are the same four lines:

```jsx
<div className="card profile">
  <h1>Deposit</h1>
  <AccountPicker … />        {/* which account */}
  <TransactionMenu … />      {/* what you came to do */}
</div>
```

The page owns the card, the title and the account picker. The inner component
owns only its own job. That is what makes the pages look like one another
without any of them knowing about the others.

**The trap when you compose this way:** the inner component usually started life
as a whole page and still draws its own title and header. Deposit showed the
account twice for a while — once in the picker, once in the menu's own header —
and it took a screenshot to notice. When you nest a page inside a page, suppress
the inner chrome explicitly.

Same lesson one level up: History and Transactions were two pages showing one
thing in two shapes. Merging them meant one page and one route pair
(`/history` and `/accounts/:id/transactions` render the same component; the
second just arrives with the account chosen).

### Pass the id in the URL, and actually read it

`/accounts/25/withdraw` carried the account in the path and the page ignored it,
defaulting to the first account. Arriving from an account page put you on a
different account's withdraw form. **On a money app that is the most expensive
possible bug class**, and it survived because nothing failed — the page worked
perfectly, on the wrong account.

### Three React patterns worth reusing

- **Reset state with a `key`, not an effect.** Switching account in a picker had
  to reset the table's page number. `<Transactions key={id} … />` remounts the
  component, which resets it for free. An effect calling `setPage(1)` triggers a
  second render and the linter is right to complain.
- **Use the native `<dialog>` with `showModal()`.** Focus trapping, an inert
  background and Escape-to-close all come free. Hand-rolled modals get all three
  wrong.
- **Live search needs a debounce *and* a sequence number.** The debounce stops
  eight requests for "benjamin". The sequence number stops a slow reply for "ben"
  landing after the newer, narrower reply and overwriting it. Responses do not
  arrive in the order they were sent, and the last to *arrive* is the wrong one
  to trust.

### The one deliberate exception to "never compute money in the browser"

The confirmation dialog shows "balance after". That is browser arithmetic, and
it is allowed in exactly one place because it is a *forecast of a request not yet
sent*, not a balance: nothing reads it back, nothing stores it, it is labelled an
estimate on screen, and the instant the response arrives the figure shown
everywhere is the server's.

Worth copying as a pattern — not the arithmetic, but **writing down why an
exception to your own rule is allowed, at the exception.** Otherwise the next
person reads it as permission.

### Disabled controls

A disabled button tinted from the brand colour reads as a second, wrong brand
colour, not as "off". This wasted three rounds of back-and-forth here. Either
keep the fill and dim only the label, or go to a neutral that is clearly not in
the palette. And check the dimmed label still clears contrast — at 70% white on
a mid-tone fill it does not; 88% did.

---

## Tests

168 tests, ~12 seconds, standard library `unittest`. The split matters:

- **Rule tests call the service directly and never import the API module.** That
  import boundary is what *proves* the layer separation rather than asserting it:
  if a rule migrates into a request handler, these tests physically cannot reach
  it. Verifiable in one command — `grep -c "api" test_bank.py` → `0`.
- **HTTP tests** cover routing, auth, error mapping, serialization, plus one pass
  over a real socket.

### Write tests that assert absences

These are the ones that keep working after everyone has forgotten why:

- No `set_balance` on the service or the model.
- No route with "balance" in its path.
- Assigning to `balance` raises.
- The "not yours" and "does not exist" messages are identical.
- Every route except the public ones requires a token.
- The *real* password-hashing cost is still high — because the fixtures
  deliberately hash at 1,000 rounds instead of 600,000 to keep the suite fast,
  and that shortcut must not leak into production.

That last pattern generalises: **when you take a shortcut for test speed, write
the test that stops it escaping.**

### Make the seed data a test

Every seeded balance is replayed through the real `deposit`/`withdraw` methods,
then asserted against independently computed figures. So loading the seed is
itself a test that fails if a rule broke, and the balances are a genuine
prediction rather than numbers typed in.

Seed deliberate edge cases: zero balance, a balance one cent below a common
withdrawal, a frozen account, one cent, a value that exposes float drift.

### Rehearse the demo against the running app, not from memory

Walking the planned running order through the real API found a hole nobody had
noticed: the script had one person registering a fresh user, then a second
explaining the account details page — and a fresh user has zero accounts, so
there was nothing on screen to explain. Accounts were opened two steps later.

Two things that came out of rehearsing, both worth copying:

- **Demo the refusal, not just the action.** Freezing an account changes a badge.
  Freezing it and then *trying to spend* shows the rule being enforced, which is
  the thing you actually built. Same for an overdraft and a replayed submission.
- **End on the invariant.** `GET /api/admin/reconciliation` returning
  `balanced: true` across every account is the strongest thirty seconds
  available, and it was nearly left out because it is an endpoint rather than a
  screen.

Also check, before the room is watching: the environment variable the demo needs
is set on the *presenting* machine, there is exactly one server running, and
somebody knows a name to type into any search box.

### Ship a console demo

A script that exercises every rule with no server and no input, printing what
happened — then does the same things over HTTP so the rules reappear as status
codes. Safe to run live: no port to bind, nothing to type under pressure,
nothing to clean up. It was the strongest five minutes of the presentation.

---

## What cost time — avoid these

1. **The money representation changed mid-project.** Started `Decimal`, moved to
   integer cents. It was one commit on day 1 and would have been brutal on day 3
   with a frontend attached. **Decide before the second file is written.**

2. **Docs and code drifted on field naming, silently.** The API contract document
   described request fields in snake_case (`client_txn_id`) while the code read
   camelCase (`clientTxnId`). This is the dangerous kind of mismatch: a frontend
   following the docs sends `client_txn_id`, the optional-field lookup returns
   `None`, and **the idempotency guard quietly does nothing**. Double-clicking
   deposits twice, with no error anywhere. Either generate the contract from the
   code or write a test that asserts them equal.

3. **A policy constant changed and the docs did not.** A savings minimum went
   from $25 to $0, which made the account-type polymorphism vestigial — both
   types became functionally identical. Presentation material still claimed the
   $25 rule weeks later. **When a constant that documents a business rule
   changes, grep for it.**

4. **The blocking decision was never forced.** "MySQL or MongoDB" stayed open
   from day one. The consequence is that a graded deliverable — the SQL schema
   and seed script — is still outstanding, and the planning doc that holds the
   verified schema uses `DECIMAL` while the code uses integer cents, so even
   extracting it needs a judgment call. **Identify what is blocked on someone
   else's answer in hour one and chase it immediately.**

5. **Submission artifacts were left to the end.** UI screenshots are a graded
   requirement and were still not captured after the build finished. **Capture
   them per feature as it lands, including error and empty states, not just the
   happy path.**

6. **Planning docs multiplied, then had to be consolidated.** Day 4 included a
   commit titled "One README for the whole project, and the planning docs go."
   Start with one document.

7. **43 commits in one day on the frontend.** Survivable only because the
   backend was finished. Do not let the entire UI land in a single day if the
   schedule can be shaped otherwise.

8. **Two servers bound to the same port, silently.** `http.server` sets
   `allow_reuse_address`, and on Windows that lets a second `python server.py`
   bind a port that is already taken — no error, no warning. Requests then go to
   whichever process wins, so roughly half the responses come from stale code.
   This produced an hour of chasing a "transient" login failure and a
   `404` from a route that definitely existed. **When behaviour is inconsistent
   between identical requests, count the listeners before debugging anything
   else.** `Get-NetTCPConnection -LocalPort 8000 -State Listen`

9. **Styling a disabled state by tinting the brand colour.** Three rounds of
   "that button is still the wrong blue" before the actual diagnosis: it was not
   a wrong blue, it was the disabled state, and fading navy to 60% over white
   lands on a colour that reads as a deliberate second brand. See "Disabled
   controls".

10. **Writing demo data into the shared database without saying so.** The audit
    log is append-only by design, so six rows added to make a feature
    demonstrable are there permanently. Fine, but it needs announcing — and it
    is a good argument for a per-developer database, which this project had and
    then drifted away from.

11. **Pointing the app at the test database.** `MONGODB_DB` was briefly set to
    the database the test suite wipes before every test. Nothing broke
    immediately, which is what makes it dangerous. **Name databases so the wrong
    one is obviously wrong**, and have the test suite hard-code its own name
    rather than reading the shared variable — this one did, which is why it was
    survivable.

---

## Collaboration

Four people, 90 commits, **21 of them merges**. Nearly a quarter of the history
was merging, and that was with everybody on one shared branch.

### Merge constantly, and never trust a clean one

A clean merge means git found no overlapping *lines*. It says nothing about
whether the result makes sense. Three real examples from this project, all from
merges with zero conflicts:

- Two sections of `AGENTS.md` ended up saying the same thing about brevity in
  different words, because two people added one each.
- A teammate built a transaction menu that did deposit, withdraw and transfer
  while the plan still listed three separate unclaimed pages for exactly those —
  two people were one step from building the same thing twice.
- A backend rewrite changed tokens from stored rows to signed JWTs; the merge
  was clean and the running server was still serving the old shape, so the first
  test after it failed for a reason that had nothing to do with the merge.

**After every merge, run the tests and read what changed in the files you own.**
Budget for it: at a quarter of all commits, merging is a scheduled activity, not
an interruption.

### Own files, not features

The split that worked was one person per *page file*, with shared things
(`api.js`, `index.css`, the auth context) touched deliberately and announced.
The split that caused conflicts was two people in the same stylesheet.

Write the ownership down in the team document, in a table, with the route next
to the filename. It also tells you instantly who to ask.

### Restart the server after pulling backend changes

Obvious, routinely forgotten, and the symptom is baffling: the code is right,
the tests pass, and the running app serves the old behaviour. Lost an hour here
to exactly this twice.

---

## The team document that made collaboration work

A single `AGENTS.md` at the repo root, read by humans and AI alike, with exactly
three sections:

1. **Project values** — explicitly "brevity outranks everything", scope stays at
   3–5 features, a feature nobody can explain is worse than no feature.
2. **Conventions that will bite you** — not architecture description (that is
   derivable from the code) but the *non-obvious* rules: money is cents, never
   compute a balance in the browser, ownership is 404 not 403, never authorize
   off the token's role claim, call `refreshAccounts()` after moving money.
3. **A live TODO split into must-ship / should-ship / stretch / deliberately not
   doing.**

That last category is underrated. Writing down "refresh tokens, httpOnly cookie
sessions, login rate limiting — all the right end state, none of them graded"
stopped the team relitigating them and gave an honest answer when asked.

Rule attached to it: **if something in that file is out of date, fix it in the
same commit as the code that outdated it.**

---

## Things to say out loud about the limitations

Knowing a weakness reads better than defending it.

- `http.server` is not a production server and its own documentation says so. It
  is the right choice when zero-setup install matters, and the layer boundary
  means swapping it touches one file.
- An in-process lock does not coordinate across processes. The replacement is a
  conditional `UPDATE … WHERE balance >= :amount` — zero rows updated means
  insufficient funds. The check and the write were never separable.
- A JWT cannot be revoked. Signing replaced storing, so there is no token table
  and nothing to revoke; the mitigation is a short expiry plus re-reading the
  role from storage.
