# Live notifications (WebSockets): findings

Status: **read-only spike**, 14 Oct 2026, for David's review. Nothing was built,
changed or deployed.

- Source: David's notes, "notifications ... maybe websocket" (`notes.txt:5`) and "Look
  into AWS API Gateway's WebSocket service" (`notes.txt:38`).
- AWS docs were read on 14 Oct 2026. Code citations are `file:line` in the working
  tree on 14 Oct.
- **The workshop AWS credentials had expired** (`ExpiredToken` on `sts
  get-caller-identity`), so the live permission checks were not run. Section 4 relies
  on the role policy saved earlier today and on the email spike's AWS calls. Section
  10 has the commands that rerun them.

## 1. Verdict

| Question | Answer |
| --- | --- |
| Can the deployed app push notifications over WebSockets? | **No.** The organisers' account blocks both halves |
| What blocks it? | (1) Our role has **no `apigateway:` permission**, so we can't create a WebSocket API. (2) The API Lambda has **no network route** to the "send a message" address. This is the same blocker as email |
| Is the problem in the notes real? | Yes, but it is **delay and no pop-up**. The notifications themselves are created. Locally, Sam (Chloe's manager) has 7 unread, including "Chloe Kim logged 10 h on task Cut over databases" (checked with `curl`, 14 Oct). The bell asks every 30 s (`NotificationBell.jsx:7`) and only changes a number. It never shows a pop-up |
| What to do instead | Check sooner and show it. Poll every 10 s while the tab is visible, and check at once when you come back to the tab. Show a pop-up (MUI **Snackbar**) when the count goes up. Works on AWS today; about 40 lines plus tests (estimate) |

## 2. How it would work (if it were allowed)

API Gateway (Amazon's managed front door for APIs) has a "WebSocket API" type. The
browser keeps one open connection to it, and our code runs only when something
happens:

1. The browser opens `wss://{api-id}.execute-api.us-east-2.amazonaws.com/{stage}`. The
   **`$connect`** route runs a Lambda. Auth can be checked **only here**, once per
   connection ([$connect/$disconnect docs][connect]).
   - Browsers can't add an `Authorization` header to a WebSocket, so the JWT would go
     in the URL (`?token=`), where access logs can record it.
2. The `$connect` Lambda stores the connection id with the user's id. In this app that
   is a new Postgres table, `ws_connections` (connection_id, user_id, opened_at,
   closed_at).
   - Because of the no-DELETE trigger (CLAUDE.md §9), closed connections are marked
     with `closed_at`, never removed.
3. **`$disconnect`** marks the row closed. It is **best effort**: "API Gateway will try
   its best to deliver the `$disconnect` event ... but it cannot guarantee delivery"
   ([docs][connect]). So a failed send must also mark the row closed.
4. **`$default`** catches any other message from the browser (for example a heartbeat).
5. **The push.** After `record_change` commits (`services/audit.py`), the server looks
   up each recipient's open connections. It then sends
   `POST https://{api-id}.execute-api.us-east-2.amazonaws.com/{stage}/@connections/{connection_id}`,
   signed with AWS SigV4. The caller needs `execute-api:ManageConnections`. A closed
   connection answers `GoneException` ([@connections docs][conn]).
6. The browser receives "something changed" and re-reads `/notifications/unread-count`.

Limits ([WebSocket quotas][quota]):

- A connection lasts **2 hours at most** and is dropped after **10 minutes idle**.
  Neither can be raised.
- Frames are 32 KB; messages are 128 KB.
- There are 500 new connections per second per account.

So the browser needs reconnect logic and a heartbeat at least every 10 minutes. The
browser's WebSocket API has no `ping()` method, so the heartbeat is an app message,
which is billed and runs the `$default` route.

Steps 1 to 4 would work. API Gateway can invoke our VPC Lambda, because invocation
doesn't use the function's VPC networking ([Lambda VPC docs][vpc]). **Step 5 is the one
that fails** (section 4).

## 3. Cost (if it were allowed)

Pricing page, read 14 Oct ([API Gateway pricing][apigw-price]). Its worked example
uses **$1.00 per million messages** and **$0.25 per million connection minutes**,
metered in 32 KB steps. Ping and pong frames are free.

Example: 10 people with the app open 8 h a day for 22 working days.

- Connection time: 105,600 connection-minutes is about **$0.03 a month**.
- Messages: a few thousand a month, a fraction of a cent.

Cost is not the reason not to do it.

## 4. Blockers, with evidence

| # | Blocker | Evidence |
| --- | --- | --- |
| 1 | **We can't create the WebSocket API.** Our role's policy grants no `apigateway:` or `execute-api:` action | The role policy saved at 09:36 on 14 Oct (`assume-policy.json`, 12 statements; a scratch file from that session, not in the repo) covers only these services: acm, cloudfront, cloudwatch, ec2, eks, elasticloadbalancing, iam, kms, lambda, logs, rds, s3, secretsmanager, sns, sqs and waf (parsed with Python, 14 Oct). There is also no `apigateway` resource anywhere in `infra/*.tf` (grep, 14 Oct). **Caveat:** an "allow" in another policy we can't see would change this. The simulation in section 10 settles it |
| 2 | **The Lambda can't reach the `@connections` address.** It is a public AWS address (`*.execute-api...amazonaws.com`). Our Lambda sits in a VPC (a private network) on subnets that have no NAT gateway | `vpc_subnet_ids = local.public_subnet_ids` (`infra/lambda.tf:28`). These are subnets whose route table has an internet gateway (`infra/locals.tf:4-13`). AWS docs: "Connecting a function to a public subnet doesn't give it internet access or a public IP address" ([Lambda VPC docs][vpc]). From the email spike's AWS calls on 14 Oct (**not rerun**: credentials expired), recorded in `2026-10-14-email-and-sms-findings.md:38`: no NAT gateway; endpoints only for dynamodb, s3, ec2messages, workspaces, secretsmanager, workspaces-instances, sts and ds; **no `execute-api` endpoint**; no IPv6 |
| 3 | **An `execute-api` VPC endpoint wouldn't fix it,** and we can't create one anyway | Endpoints are a private link from the VPC to one AWS service. Private APIs: "Only REST APIs are supported", and "If you turn on private DNS, you can't access the default endpoint for public APIs" ([private API docs][private]). A WebSocket API is public, so sends through that endpoint fail. A community thread reports a 403 doing exactly this ([re:Post][repost]; community report, page not readable). `ec2:CreateVpcEndpoint` is implicitDeny for us: the email spike's simulation, and the saved policy only allows `ec2:*` on instances and our security groups. A NAT gateway is also implicitDeny (email spike) |
| 4 | **Leaving the VPC loses the database** | Aurora isn't publicly reachable (CLAUDE.md trap 11). A Lambda outside the VPC can reach the internet but not Postgres |

### The workaround design, and what it would cost

**Two Lambdas, linked through S3:**

1. The API Lambda (in the VPC) writes a small "push this" file to our S3 bucket. S3 is
   reachable: there is an S3 gateway endpoint in the VPC.
2. The file contains the connection ids, read from Postgres.
3. An S3 event starts a second **"pusher" Lambda outside the VPC**, which calls
   `@connections`.

- The API Lambda can't call the pusher directly: there is no Lambda endpoint in the
  VPC.
- `$connect` and `$disconnect` can stay on the API Lambda, which stores connection ids
  in Postgres (step 2 in section 2).
- **Still blocked by #1:** there is no API Gateway permission to create the API.
- If the organisers granted it, the build would include:
  - Terraform for the API, its routes, stage and integrations;
  - a migration and a store for `ws_connections`;
  - the S3 event, the pusher Lambda and its `execute-api:ManageConnections`
    permission (we have `iam:*` on the organisers' Lambda role, but editing it needs
    their OK, as in the email findings §4);
  - a browser client with reconnect and heartbeat;
  - tests for each part.
- Estimate: **one to two days**, against a demo tomorrow. Each push adds an S3 write
  and a second cold start, so delivery is likely a second or more (not measured).
  AWS charges stay at pennies.

## 5. Alternatives that work today, ranked

Per-tab load: 30 s polling is 2 requests a minute (120 an hour); 10 s polling is 6 a
minute (360 an hour). Each request is one CloudFront request plus one Lambda call.

| Rank | Option | Delay a manager sees | Works on AWS today? | Requests per open tab | Size |
| --- | --- | --- | --- | --- | --- |
| **1** | **Poll every 10 s while the tab is visible. Check at once on `visibilitychange` (tab shown again) and on window `focus`. Stop the timer while hidden** | Up to 10 s, and instantly on returning to the tab | **Yes** | 6/min visible, 0 hidden | Small: `NotificationBell.jsx` and its test |
| **2** | **Pop-up (MUI `Snackbar`) when the unread count goes up,** showing the newest summary from `GET /notifications?unread=true` (`services/notifications.py:22-24`) with a "View" link | Same as the poll, but **visible**. This is what "didn't pop up" in the notes asks for | **Yes** | +1 request only when the count rises | Small. No Snackbar exists today (grep of `frontend/src`, 14 Oct) |
| 3 | Keep 30 s, add only the visibility check | Up to 30 s | Yes | 2/min | Smallest |
| 4 | Server-Sent Events (one long HTTP response the server keeps writing to) via a Lambda function URL with `InvokeMode: RESPONSE_STREAM` | Near instant | **No** | One Lambda held open per tab | Large |
| 5 | API Gateway WebSockets | Near instant | **No** (section 4) | Connection-minutes | Large |

Why option 4 is out ([response streaming docs][stream]):

- "Lambda supports response streaming on Node.js managed runtimes. For other languages,
  including Python, you can use a custom runtime ... or use the Lambda Web Adapter." We
  run `python3.13` (CLAUDE.md §5).
- "Lambda function URLs do not support response streaming within a VPC environment."
  Ours is in a VPC (`infra/lambda.tf:27-28`).
- "Customers are billed for the full function duration." One open tab holds one running
  512 MB Lambda: 1,800 GB-seconds an hour, about $0.03 at $0.0000166667 per GB-second
  ([Lambda pricing][lambda-price], N. Virginia example rate). For the example team in
  section 3 that is about $53 a month, against about $1 for polling (below).

Why the visibility check matters more than a shorter interval
([Chrome timer throttling][chrome]):

- Chrome runs a hidden tab's timers at most once a second.
- After **5 minutes hidden**, a repeating timer (a chain of 5 or more; `setInterval`
  counts) runs only **once per minute**.
- So a 10 s poll in a background tab is really a 60 s poll.
- `visibilitychange` fires when the user switches tabs, minimises, or (on a phone)
  switches apps. It has been "available across browsers since April 2021"
  ([MDN][mdn]).

### Cost of option 1 on AWS

Same example team (10 people, 8 h a day, 22 days), polling every 10 s while visible:
**633,600 requests a month at most**.

| Item | Price (read 14 Oct) | Monthly |
| --- | --- | --- |
| CloudFront requests | $0.0100 per 10,000 HTTPS requests; 10 M a month free ([CloudFront pricing][cf-price]) | $0 (inside free tier); $0.63 without it |
| Lambda requests | $0.20 per million; 1 M a month free ([Lambda pricing][lambda-price]) | $0 (inside free tier); $0.13 without it |
| Lambda duration | $0.0000166667 per GB-second; 400,000 GB-s free. **Assumes 50 ms billed at 512 MB** (local round trip measured 20 to 30 ms; AWS not measured) | $0 (inside free tier); $0.26 without it |
| Aurora | No change. A warm Lambda keeps its Postgres connection open (`function.py:38-42`), and "If any user-initiated connections are open ... the instance won't pause" ([auto-pause docs][pause]). Polling at 30 s already keeps it awake while anyone has the app open | Unchanged (inferred, not measured) |

Total: **about $1 a month without free tiers, $0 with them.**

## 6. Recommendation

1. **Don't build WebSockets for this workshop.** The role can't create the API, and
   the Lambda can't reach the send address. Ask the organisers only if David wants it
   as a "with more time" item.
2. **Build options 1 and 2 together** in `NotificationBell.jsx`:
   - 10 s while visible;
   - an immediate check on `visibilitychange` and `focus`;
   - no timer while hidden;
   - a Snackbar when the count rises.

   Each needs a Vitest test that fails without it (fake timers; fire
   `visibilitychange`; assert the Snackbar text). It's a frontend-only change, so no
   backend redeploy.
3. Update the bell's comment (`NotificationBell.jsx:10-12`) and the README line
   "a bell polled every 30 s" (`README.md:143`) in the same commit (CLAUDE.md rule).

Demo moment: Chloe logs time in one window. Sam's window, in front, shows the pop-up
within 10 s. If Sam's tab was in the background, it shows the moment he clicks back.

## 7. Spoken answer: "why polling, not WebSockets?"

> "Our Lambda sits in a private network with no route out, and the workshop role has
> no API Gateway permission, so the server can't push. I checked both.
>
> So the bell checks every 10 seconds while you're looking, checks straight away when
> you come back to the tab, and pops up when something new arrives. That's a few
> hundred tiny requests an hour per user, which is pennies.
>
> In production I'd use an API Gateway WebSocket API. Connection ids would go in
> Postgres, and the server would push after each audit row commits."

## 8. Verified

- Code, opened 14 Oct:
  - `NotificationBell.jsx:7, 10-12, 19-24`;
  - `request.js:36` (`onWrite` refreshes only the tab that made the change);
  - `infra/lambda.tf:27-28, 40`: no `invoke_mode`, so responses are buffered;
  - `infra/locals.tf:4-13`;
  - `infra/rds.tf:25-28` (`min_capacity = 0.0`, no auto-pause interval, so 300 s);
  - `function.py:38-42`;
  - `services/notifications.py:22-24`.
- No `apigateway` in `infra/*.tf`, no Snackbar in `frontend/src`: grep, 14 Oct.
- The saved role policy has no `apigateway`, `execute-api` or `dynamodb` actions:
  parsed with Python, 14 Oct.
- Sam receives Chloe's notifications locally: `curl` as SP345715, `unread-count` =
  `{"count": 7}`, with "Chloe Kim logged 10 h on task Cut over databases" among them.
  Local `unread-count` round trips took 0.02 to 0.03 s.
- AWS and browser facts: each linked page below, read 14 Oct.

## 9. Not verified

- **Live AWS checks.** The credentials had expired, so none ran:
  - the permission simulations for our role and for the Lambda role;
  - a fresh VPC endpoint and NAT listing.

  The VPC facts come from the email spike's calls earlier on 14 Oct.
- Other policies on our role, or organisation-wide policies, that might allow or deny
  API Gateway.
- Whether the "function URLs do not support response streaming within a VPC" sentence
  covers our setup exactly. It doesn't change the ranking: Python has no native
  streaming either.
- The re:Post 403 thread: the page refused to load (HTTP 403), so only its title and
  a search summary were seen.
- AWS-side Lambda duration per poll, and the build-size estimates.
- Ohio (us-east-2) prices. The pages quoted N. Virginia and US example rates.
- Options 1 and 2 are a recommendation; neither is built. Snackbar layout and
  placement at phone width are untested.

## 10. Rerun the AWS checks (David, in your own terminal)

The first command refreshes the expired credentials. The block after it is read only.
It looks up the Lambda's role and network itself, so no account number is written in this
public repo.

```sh
cd ~/DavidCitiProject && ./bin/setup-participant.sh
```

```sh
cd ~/DavidCitiProject && (set -a; source ENVIRONMENT.config; set +a; export AWS_REGION=us-east-2
ROLE=$(aws sts get-caller-identity --query Arn --output text | sed -E 's#:sts::([0-9]+):assumed-role/([^/]+)/.*#:iam::\1:role/\2#')
echo "Our role: $ROLE"
aws iam simulate-principal-policy --policy-source-arn "$ROLE" \
  --action-names apigateway:POST apigateway:GET execute-api:ManageConnections execute-api:Invoke ec2:CreateVpcEndpoint ec2:CreateNatGateway \
  --query 'EvaluationResults[].[EvalActionName,EvalDecision]' --output table
LAMBDA_ROLE=$(aws lambda get-function-configuration --function-name coding-workshop-tracker-c7dabfc1 --query Role --output text)
VPC=$(aws lambda get-function-configuration --function-name coding-workshop-tracker-c7dabfc1 --query VpcConfig.VpcId --output text)
echo "Lambda role: $LAMBDA_ROLE  VPC: $VPC"
aws iam simulate-principal-policy --policy-source-arn "$LAMBDA_ROLE" \
  --action-names execute-api:ManageConnections execute-api:Invoke \
  --query 'EvaluationResults[].[EvalActionName,EvalDecision]' --output table
aws ec2 describe-vpc-endpoints --filters Name=vpc-id,Values="$VPC" --query 'VpcEndpoints[].ServiceName' --output text
aws ec2 describe-nat-gateways --filter Name=vpc-id,Values="$VPC" --query 'NatGateways[].NatGatewayId' --output text)
```

Expected if this document is right:

- our role shows `implicitDeny` for every action;
- the endpoint list has no `com.amazonaws.us-east-2.execute-api`;
- the NAT list is empty.

[connect]: https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api-route-keys-connect-disconnect.html
[conn]: https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-how-to-call-websocket-api-connections.html
[quota]: https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-execution-service-websocket-limits-table.html
[apigw-price]: https://aws.amazon.com/api-gateway/pricing/
[private]: https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-private-apis.html
[repost]: https://www.repost.aws/questions/QUGg471EaCRqOrOpNGKBgneQ/403-to-post-to-connection-from-lambda-private-subnet
[vpc]: https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc.html
[stream]: https://docs.aws.amazon.com/lambda/latest/dg/configuration-response-streaming.html
[lambda-price]: https://aws.amazon.com/lambda/pricing/
[cf-price]: https://aws.amazon.com/cloudfront/pricing/pay-as-you-go/
[pause]: https://docs.aws.amazon.com/AmazonRDS/latest/AuroraUserGuide/aurora-serverless-v2-auto-pause.html
[chrome]: https://developer.chrome.com/blog/timer-throttling-in-chrome-88
[mdn]: https://developer.mozilla.org/en-US/docs/Web/API/Document/visibilitychange_event
