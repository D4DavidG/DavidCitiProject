# Email and text messages: findings

Status: **findings of a read-only spike**, 14 Oct 2026, for David's review. Nothing was
built, sent or deployed.

- The spike had two passes: a recommendation, then a skeptic's review. Where they
  disagreed, the skeptic's corrections are used here.
- Code citations are `file:line` in the working tree on 14 Oct, unless marked `HEAD`
  (commit `a52da44`). Two files, `users.py` and `PeoplePage.jsx`, had uncommitted
  changes while this was written, so both states are given where they differ, with the
  function or component name in case the line numbers move.
- AWS facts come from the spike's own read-only AWS calls on 14 Oct. They were **not
  rerun** for this document.
- **Third-party email services (Resend, SendGrid, Postmark) are unverified.** The
  web-research step failed, so nothing here states their rules.

## 1. The question

Can the tracker send a **welcome message** (a new account's sign-in details) or a
**password-reset message** by email or by text (SMS)?

## 2. Verdict

| Channel | From the deployed app (AWS) |
| --- | --- |
| Email | **No** |
| Text (SMS) | **No** |
| LocalStack's fake email service | **Local capture only**: messages land in `http://localhost:4566/_aws/ses`, never in an inbox. It doesn't exist on AWS |

## 3. Why

Two blockers for email, and a third for texts. Our workshop role can't remove any of
them.

| Blocker | Evidence |
| --- | --- |
| **No email permission.** The Lambda runs on the organisers' role, not one we create, and that role has no `ses:` permission | `create_role = false` (`infra/lambda.tf:32`); the role is `lambda_role_arn` (`infra/lambda.tf:15`, built at `infra/locals.tf:118-122`). AWS: `ses:SendEmail` is implicitDeny and `sesv2 get-account` is AccessDenied |
| **No way out of the network.** The Lambda sits in a VPC (a private network) with no NAT gateway (the usual exit to the internet) and no private endpoint for email or SNS | `vpc_subnet_ids = local.public_subnet_ids` (`infra/lambda.tf:28`). AWS: `describe-nat-gateways` is empty; the only endpoints are dynamodb, s3, ec2messages, workspaces, secretsmanager, workspaces-instances, sts and ds; no IPv6. `ec2:CreateNatGateway` and `ec2:CreateVpcEndpoint` are implicitDeny for us |
| **Texts: sandbox and US registration.** `sns:Publish` is allowed, but the network blocker above still applies. Verifying a phone number for the SMS sandbox is denied, and US numbers need a registered sender first | AWS: the sandbox call was denied. The US sender rule is from AWS docs read 14 Oct |

Even with all three fixed, the seeded `@acme.test` addresses (`tools/demo.py:33-37`) can
never receive mail: `.test` is a reserved name that never resolves.

## 4. What we could do but shouldn't

- The workshop role has `iam:*` (including PassRole) on the organisers' Lambda role
  (confirmed by a policy simulation). We could grant ourselves `ses:`.
- **Don't, without asking the organisers.** It is their role, and it still wouldn't
  fix the network. An organisation-wide policy might block it anyway; we can't see
  those.

## 5. Options

| Option | What the evaluator sees | Works on AWS tomorrow? | Size |
| --- | --- | --- | --- |
| **A. Today's flow: shown-once credentials.** Recommended for the demo | Admin creates a person; a dialog shows the username and temporary password once; the person must change it at first sign-in | **Yes**, deployed and tested | 0 lines |
| **B. In-app "Outbox".** Messages saved in Postgres, shown to admins, behind a swappable mailer | A welcome note or reset code in an admin-only Outbox screen | Yes once built, but it is a **simulation, not delivery**: someone who forgot their password is signed out and can't see it, so an admin still passes the code on | About 1,000 to 1,400 lines with tests, about a day (estimate) |
| **C. `mailto:` button** in the "Account created" dialog | The admin's own email app opens with the username and sign-in steps filled in | Yes, if the machine has an email app set up (untested on the VDI) | Small. Safer to leave the password out of the email |
| **D. SES (Amazon's email service) or a third-party API** from the API Lambda | A real email | **No.** Blocked by permission and network (section 3) | n/a |
| **D2. Second "mailer" Lambda outside the VPC,** triggered through S3, calling a third-party API | A real email | **Untested.** Our policy allows `lambda:*` on our functions, `s3:*` on our bucket and sets no VPC condition, but an org-wide policy could block it, and provider rules are unverified | B plus a Terraform module, a small Lambda and an API-key secret |
| **E. LocalStack SES** | A message captured at `localhost:4566/_aws/ses` (answered 200 with `{"messages": []}` on 14 Oct) | **No**, local only | B plus a small SES mailer |
| **F. Text messages (SNS)** | A text on a phone | **No.** Network, sandbox and US registration | n/a |

A shortcut from S3 events to an SNS email topic is not available: our `sns:*` grant
points at an SQS-style address, so we can't create topics.

## 6. Security design for any future reset flow

| Rule | Why | Today |
| --- | --- | --- |
| Send a **single-use, expiring set-password link or code**, never the password (for example 1 h for a reset, 72 h for a welcome) | A message can be read by anyone with the mailbox | n/a |
| **Store only a hash of the code** (SHA-256); cap wrong guesses at 5; mark codes used or superseded, never delete | A database leak shouldn't hand out live codes | The `no_delete` trigger is created per table (`001_init.sql:246-254`), so a new codes table needs its own |
| **Same answer and same timing whether the account exists** | Otherwise the reset form tells an attacker which usernames are real | Login had a leak: `HEAD` `users.py:29` built the dummy hash with 1,000 rounds, against 600,000 for real ones (`passwords.py:18`). On the VDI: 0.3 ms against 125.7 ms. **Fixed in the working tree, not yet committed or deployed:** `login` now does one hash at the live round count for an unknown username (`users.py:157-162`), and `test_unknown_username_costs_the_same_hashing_as_a_wrong_password` (`tests/backend/test_users.py:110`) passes |
| **Rate-limit reset requests, counted in Postgres** | Lambda instances share no memory (CLAUDE.md §5) | Login itself isn't rate-limited (plan §16, "Deliberately not doing") |
| **Audit rows** for "reset requested" and "reset completed"; never the code or its hash in a snapshot | Same audit rule as every other change | A NULL actor is allowed (`001_init.sql:211, 221`), but the column comment reserves it for the bootstrap admin |
| **Revoke old sessions** with a `password_changed_at` column; reject tokens issued before it | A stolen session should die when the password changes | **Gap today.** Tokens last 8 h (`tokens.py:20`); `verify` checks only signature and expiry, never `iat` (`tokens.py:47-59`); `actors.load` rereads the user's name, role, manager and `must_change_password`, but no password-change time (`actors.py:48-52`). Inferred, not tested: after an admin reset and the user's own change, an old token works again until it expires |
| **Ask for the current password before an email change** (or notify the old address) | Otherwise a stolen session changes the email, then resets the password and locks the owner out | **Gap today.** `update_self` in `users.py` changes email with no password check (lines 208-219 on 14 Oct) |

## 7. Live demo steps (option A)

Labels are from the code.

1. Sign in as AD000001 and open **People** (route at `App.jsx:69`).
2. Click **New person** (`PeoplePage.jsx:152`). Fill **First name**, **Last name**,
   **Email**, **Role** (`PeoplePage.jsx:28-31`) and click **Create**
   (`PeoplePage.jsx:183`).
3. The **Account created** dialog (`PeoplePage.jsx:188`, drawn by `PasswordShown`)
   shows the username and **Temporary password**, with "This password is shown only
   once…" (`PeoplePage.jsx:61-63`).
   - The copy button in `PasswordShown` depends on which version is deployed. At
     `HEAD` it is **Copy password** and copies only the password (`HEAD`
     `PeoplePage.jsx:43, 61`): read the username aloud. In the uncommitted working tree
     it is **Copy username and password** (`PeoplePage.jsx:48, 67`).
   - Click **Done** (`PeoplePage.jsx:68`).
4. In a private window, on **Sign in** ("Use the username and password your
   administrator gave you.", `LoginPage.jsx:38`), enter both and click **Sign in**.
5. The app opens **Change password**. Fill **Current password**, **New password** (at
   least 8 characters) and **Confirm new password** (`ChangePasswordPage.jsx:9-11`),
   then click **Change password**.
6. Optional refusal: before step 5, the website sends every other screen back to
   **Change password** (`RequireRole.jsx:26-27`). Underneath, the API answers 403
   "Change your generated password before continuing." (`api/app.py:29-30`) on every
   route except `GET /auth/me` and `POST /auth/change-password` (`routes.py:49-50`).
   Show the 403 with `curl`, not on screen.
7. Forgotten password: as admin, click the person's **Reset password**
   (`PeoplePage.jsx:134`), then confirm with **Reset password** in the "Reset (their
   name)'s password?" dialog (`PeoplePage.jsx:217-219`). The **Password reset** dialog shows a new one-time
   password (`PeoplePage.jsx:222`), and the person is forced to change it again.

There is no "Forgot password?" link and no `mailto:` in `frontend/src` (grep, 14 Oct).
That is by design: "A forgotten password is reset by an admin." (`MVP.md:40`).
Emailed reset and email notifications are out of the MVP ("Out of the MVP",
`MVP.md:122-123`), and the Accounts row of CLAUDE.md's decisions table calls emailed
reset a stretch goal (`CLAUDE.md:54`).

## 8. How to answer "why no email?"

> "The Lambda runs inside a private network with no route to the internet, and the
> role the organisers gave it has no email permission. Our account can't change either,
> and I didn't want to edit the organisers' role without asking.
>
> So an admin creates the account and sees the password once, and the person must
> change it at first sign-in. In production I'd send a single-use, expiring link, store
> only its hash, and answer the same way whether or not the account exists."

## 9. Verified and not verified

**Verified**

- `infra/lambda.tf:15, 28, 32` and `infra/locals.tf:118-122`: opened 14 Oct.
- `MVP.md:40, 122-123`, `CLAUDE.md:54`: opened 14 Oct.
- `tokens.py:20, 47-59`, `actors.py:48-52`, `users.py` (`login`, `update_self`),
  `passwords.py:18`, `001_init.sql:211, 221, 246-254`, `api/app.py:29-30`,
  `routes.py:49-50`, `RequireRole.jsx:26-27`, `tools/demo.py:33-37`: opened 14 Oct.
- UI labels: opened in `PeoplePage.jsx`, `LoginPage.jsx`, `ChangePasswordPage.jsx`,
  `App.jsx`; `HEAD` versions with `git show`.
- No "Forgot" link and no `mailto:` in `frontend/src`: grep, 14 Oct.
- Dummy-hash fix: its test passes in the working tree (pytest, 14 Oct).
- LocalStack SES endpoint: answered 200 with `{"messages": []}` (rechecked with `curl`,
  14 Oct).
- From the spike's AWS calls on 14 Oct (not rerun here): no `ses:` permission, VPC
  with no NAT gateway and no email/SNS endpoint, no IPv6, `sns:Publish` allowed, SMS
  sandbox verification denied, `iam:*` on the organisers' Lambda role, the `lambda:*`,
  `s3:*` and `sns:*` grants behind option D2 and the S3-to-SNS note.
- Dummy-hash timing: measured by the skeptic on the VDI (0.3 ms against 125.7 ms).

**Not verified**

- Third-party email rules (Resend, SendGrid, Postmark): the web research failed.
- SES and SMS sandbox status: the read calls are denied.
- Organisation-wide policies: not visible to our role.
- A live outbound connection from the Lambda.
- Option D2 end to end, and the `mailto:` button on the VDI.
- The build-size estimates.
- The old-token inference in section 6: read from the code, not tested.
- The dummy-hash fix and the copy-button change on AWS: both were uncommitted and
  undeployed while this was written.
- Layout of the dialogs in context.
