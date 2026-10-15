# bin/: the setup, run and deploy scripts

For anyone running or deploying the tracker. It answers: what each script in this folder
does, when to run it, what it writes, and what we changed. The step-by-step walkthrough
(first-time setup, seeding, deploying, troubleshooting) is [docs/SETUP.md](../docs/SETUP.md).
Back to the [README](../README.md).

These scripts came with the Citi workshop's template. All but one are unchanged: we changed
only `proxy-server.js` ([below](#proxy-serverjs)). Run them from the repo root on Ubuntu
22.04 (the workshop VDI), in your own terminal: they read `PARTICIPANT_ID` and
`PARTICIPANT_CODE` from `~/.bashrc`, which Ubuntu skips in non-interactive shells.

| Script | Run it | In one line |
| --- | --- | --- |
| [`setup-environment.sh`](#setup-environmentsh) | once per machine | installs the toolchain |
| [`setup-participant.sh`](#setup-participantsh) | once, then whenever AWS says `ExpiredToken` | gets temporary AWS credentials |
| [`start-dev.sh`](#start-devsh) | every time you work locally | starts Postgres, LocalStack, the backend, the proxy and the website |
| [`deploy-backend.sh`](#deploy-backendsh) | to deploy (with the next one) | Terraform: builds or updates everything in `infra/` |
| [`deploy-frontend.sh`](#deploy-frontendsh) | to deploy (right after the one above) | builds the website and uploads it |
| [`generate-env.sh`](#generate-envsh) | rarely by hand (`start-dev.sh` runs it) | writes `frontend/.env.local` |
| [`proxy-server.js`](#proxy-serverjs) | never by hand (`start-dev.sh` runs it) | the local proxy on port 3001 |
| [`cleanup-environment.sh`](#cleanup-environmentsh) | **only to delete the AWS deployment for good** | backs up the code, then destroys everything |

Every shell script prints its options with `-h`.

---

## setup-environment.sh

Installs everything the project needs on Ubuntu 22.04: system packages (`curl`, `jq`,
`unzip` and others), Python 3.13 (made the default with `PYENV_VERSION`, line 13), Node.js, Docker, LocalStack, the AWS command line (version 2), Terraform,
PostgreSQL, MongoDB, VS Code, PyCharm and IntelliJ. It also installs the workshop's other
tracks' tools (Spark, Trino, Jupyter, kubectl, Helm), which this app doesn't use; their
failures don't matter here.

```sh
cd ~/DavidCitiProject
./bin/setup-environment.sh -d
source ~/.bashrc
```

| Option | Effect |
| --- | --- |
| `-d` | Also installs dnsmasq, so `*.localhost.localstack.cloud` resolves to your own machine. Use it |
| `-n` | Dry run: prints what it would do and changes nothing |

- **When:** once per machine. It skips what is already installed, so rerun it if it fails
  part way.
- **Writes:** system packages (it asks for your sudo password); a log in
  `~/.local/share/workspace-setup/`.
- **Doesn't install:** `dig`. If `setup-participant.sh` needs it: `sudo apt install -y dnsutils`.

## setup-participant.sh

Trades your workshop Participant ID and Code for **temporary** AWS credentials.

1. Reads the DNS TXT record of `codingworkshop.net` to find the workshop's credentials
   address for your `EVENT_ID`.
2. Calls it with `PARTICIPANT_ID` and `PARTICIPANT_CODE` (sent as the `x-id` and `x-code`
   headers) and stops with `Workshop API returned HTTP 4xx` if they are wrong.
3. Saves the credentials as the AWS command line's default profile (`aws configure set`) and
   looks up the account ID.
4. Writes `ENVIRONMENT.config` at the repo root: the credentials, the account ID, the
   Terraform state bucket (`coding-workshop-tfstate-c7dabfc1` for David), and the `TF_VAR_...`
   values Terraform reads (`aws_app_code`, `aws_project`, `aws_ds_ip`).

```sh
cd ~/DavidCitiProject
./bin/setup-participant.sh && aws sts get-caller-identity
```

- **When:** once before the first AWS deploy, then whenever an AWS command says
  `ExpiredToken`. `deploy-backend.sh`, `deploy-frontend.sh` and `cleanup-environment.sh`
  run it themselves first, so a deploy always starts with fresh credentials.
- **Needs:** `aws`, `curl`, `jq` and `dig`, plus `EVENT_ID`, `PARTICIPANT_ID`,
  `PARTICIPANT_CODE` and `AWS_REGION=us-east-2` exported in `~/.bashrc`
  ([SETUP.md, section 2](../docs/SETUP.md#2-first-time-setup-once-per-machine)).
- **Writes:** `~/.aws/credentials` and `ENVIRONMENT.config`. **`ENVIRONMENT.config` holds live
  credentials.** Git ignores it (the `*.config` rule in `.gitignore`); never commit it.

## start-dev.sh

Starts or repairs the whole local stack, one step at a time (it runs with `set -e`, so it
stops at the first command that fails):

| Step | What it does |
| --- | --- |
| 1. PostgreSQL | Starts it and rebinds it to `0.0.0.0` with `trust` sign-in in `pg_hba.conf`, so the Lambda inside Docker can reach it (development only) |
| 2. MongoDB | Starts it on 27017. Part of the template; this app doesn't use it |
| 3. LocalStack | Starts the container (`localstack start -d`) and waits until it answers on 4566 |
| 4. Backend | Installs each service's `requirements.txt` into its own folder (for us, `psycopg` into `backend/tracker/`), then deploys to LocalStack with `deploy-backend.sh local`, but only if a service is missing or none answers |
| 5. Website | `npm install` if needed, runs `generate-env.sh`, restarts `proxy-server.js` on 3001, then runs Vite (`npm run dev`) on 3000 in the foreground |

```sh
cd ~/DavidCitiProject
source ~/.bashrc && ./bin/start-dev.sh
```

- **When:** each time you sit down to work. Done when it prints `All Components Verified!`.
  `Ctrl+C` stops the website and the proxy; Postgres and LocalStack keep running.
- **Writes:** `frontend/.env.local`; the packages it installs into `backend/tracker/` (git
  ignores them through `backend/tracker/.gitignore`); logs in `/tmp/tf-init.log`,
  `/tmp/backend-deploy.log`, `/tmp/npm-install.log` and `/tmp/proxy-server.log`.
- **Side effect:** it points Terraform's state at LocalStack, so a plain `terraform output`
  afterwards answers for the local copy, not AWS.
- **Trap:** pip's errors in step 4 are hidden (`2>/dev/null || true`, line 342). If the local
  API answers 502 with `No module named 'psycopg'`, see
  [SETUP.md, Troubleshooting](../docs/SETUP.md#9-troubleshooting).

## deploy-backend.sh

Runs Terraform on `infra/`: creates or updates the Lambda, the database, the website bucket
and CloudFront. Terraform changes only what differs, so a code-only deploy is quick.

```sh
cd ~/DavidCitiProject
./bin/deploy-backend.sh
./bin/deploy-frontend.sh
```

| Form | Target |
| --- | --- |
| `./bin/deploy-backend.sh` or `./bin/deploy-backend.sh aws` | AWS. Runs `setup-participant.sh` first, loads `ENVIRONMENT.config`, then `terraform init` against the state bucket in S3 |
| `(source ENVIRONMENT.config && ./bin/deploy-backend.sh local)` | LocalStack, with its fake credentials. Load `ENVIRONMENT.config` first, as shown, or the app id falls back to `abcd1234` and Terraform renames every resource |

- **When:** to put backend or infrastructure changes on AWS, always followed by
  `deploy-frontend.sh` ([why both](../docs/SETUP.md#6-deploy-to-aws)). Locally, only after
  changing Terraform or adding or removing a folder under `backend/`: Python edits are live
  without it.
- **Runs `terraform apply -auto-approve`:** it does not stop to ask.
- **Prints:** Terraform's changes, `Apply complete! Resources: ...`, the outputs
  (`bootstrap_admin_password` shows as `<sensitive>`), then
  `INFO: Infrastructure deployment complete!`. New database migrations then run on the
  Lambda's first cold start, not during the deploy.

## deploy-frontend.sh

Builds the website and publishes it behind CloudFront.

1. Runs `setup-participant.sh`, then reads the bucket name, the API address and the CloudFront
   distribution from Terraform's outputs (so the backend must be deployed first).
2. `npm run build` in `frontend/`, giving `frontend/dist/`.
3. `aws s3 sync dist/ s3://coding-workshop-website-c7dabfc1/ --delete` (David's bucket):
   uploads the new files and removes old ones.
4. Invalidates `/*` on CloudFront, so it stops serving cached old files.
5. Prints `INFO: Frontend deployment complete!` and
   `CloudFront URL: https://d1gov8jpsxhwer.cloudfront.net`.

- **When:** right after `deploy-backend.sh`, every time.
- **`local`:** `./bin/deploy-frontend.sh local` builds nothing; it only tells you to use
  `start-dev.sh`, because Vite on port 3000 reloads in about a second.

## generate-env.sh

Writes `frontend/.env.local` from Terraform's outputs: `VITE_API_URL`, `VITE_API_ENDPOINTS`
and `VITE_LAMBDA_URLS` (and the same three as `REACT_APP_...` for the template's older
React setup). It checks whether LocalStack answers on 4566 to decide between local and AWS.
Locally the API address is the proxy, `http://localhost:3001`.

- **When:** `start-dev.sh` runs it on every start. By hand only after deploying to LocalStack
  without `start-dev.sh`.
- **Writes:** `frontend/.env.local` (git ignores `.env.*`). `proxy-server.js` reads its
  `VITE_API_ENDPOINTS` line to learn where the Lambda is.

## proxy-server.js

A small Node.js server on port **3001**, for local work only. The website calls
`http://localhost:3001/api/tracker/...`; the proxy drops `/api/tracker` and forwards the
rest to the tracker Lambda's address inside LocalStack. It exists because LocalStack's Lambda
addresses mishandle browsers' cross-origin (CORS) headers, so the proxy removes the browser
headers (`origin`, `referer`, `sec-fetch-*`) and adds its own CORS answer. On AWS, CloudFront
does this job and the proxy isn't used.

```sh
curl -s http://localhost:3001/
curl -s http://localhost:3001/api/tracker/health
```

The first lists the services it knows; the second should print `{"status": "ok"}`.

**What we changed (13 Oct, commit `dc3935f`), and why.** Without these two changes every
signed-in request failed locally:

| Change | Why |
| --- | --- |
| It forwards the `Authorization` header (and `Content-Length`) | The template forwarded only `accept`, `content-type`, `user-agent` and `host`, so the sign-in token never reached the Lambda and every signed-in call answered 401 |
| `Access-Control-Allow-Headers: Authorization, Content-Type` instead of `*` | Under the browsers' Fetch standard, `*` never covers `Authorization`, so the browser blocked the request before it was even sent |

The same `*` problem was fixed on AWS on 15 Oct, in the Lambda's own CORS settings
([infra/README.md](../infra/README.md)).

## cleanup-environment.sh

**Deletes the whole AWS deployment. It cannot be undone and does not ask first.**

1. Runs `setup-participant.sh` and loads `ENVIRONMENT.config`.
2. Zips the repo folder (without `.git`, `node_modules`, `.venv`, caches and Terraform's
   working files) and moves the zip to
   `s3://coding-workshop-tfstate-c7dabfc1/backup/backup-c7dabfc1.zip` (for David).
3. `terraform destroy -auto-approve`: removes CloudFront, the Lambda, the website bucket and
   the Aurora database **with all its data** (`skip_final_snapshot = true` in
   `infra/rds.tf`, so no final copy is kept).

The backup holds the code, not the data. After it, the live site and every login stop
working. Run it only when the AWS deployment should be gone for good. More in
[SETUP.md, section 10](../docs/SETUP.md#10-danger-cleanup-environmentsh).
