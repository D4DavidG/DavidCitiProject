# infra/: the AWS infrastructure, as Terraform code

For anyone deploying the tracker or asked "what runs on AWS, and why is it set up this
way?". It answers: what each file builds, what we changed from the workshop's template and
why, what is switched off, and which outputs matter. How to run a deploy is in
[docs/SETUP.md](../docs/SETUP.md); the scripts that call Terraform are in
[bin/README.md](../bin/README.md). Back to the [README](../README.md).

Nothing on AWS was clicked together in the console: `./bin/deploy-backend.sh` runs
`terraform apply` on this folder, and `./bin/start-dev.sh` applies the same files to
LocalStack (fake AWS on your machine). The files tell the two apart by the account ID:
LocalStack's is `000000000000`, so `count = ... != "000000000000" ? 1 : 0` means "AWS only".

## What it builds

```
browser ──HTTPS──> CloudFront ──/api/tracker*──> Lambda (Python 3.13, 512 MB) ──> Aurora PostgreSQL 17
                        └──── everything else ──> S3 bucket (the website's files)
```

| File | What it builds or holds |
| --- | --- |
| `lambda.tf` | One Lambda per folder under `backend/` (ours: `tracker`), each with a public Function URL, a dead-letter queue (SQS) and CloudWatch logs kept 7 days. Locally, `hot_reload` mounts the folder into LocalStack so Python edits are live |
| `locals.tf` | Finds the services (any `backend/*/requirements.txt`; folders starting with `_` are skipped), sets runtime `python3.13` and handler `function.handler`, and lists the environment variables every Lambda gets (`IS_LOCAL`, `POSTGRES_*`, `JWT_SECRET`, `BOOTSTRAP_ADMIN_PASSWORD`, ...) |
| `cloudfront.tf` | The one public address. `/api/tracker*` goes to the Lambda (one such rule per service) with no caching and every header passed on; everything else comes from the S3 bucket. Also the bucket policy that lets only CloudFront read the bucket. AWS only |
| `rds.tf` | Aurora Serverless v2, PostgreSQL 17.7, encrypted, 0 to 4 capacity units, in the workshop's network with no public address. AWS only; locally the Lambda uses the host's Postgres |
| `s3.tf` | The website bucket (`coding-workshop-website-` plus the participant ID), and locally the `hot-reload` bucket |
| `secrets.tf` | **Ours.** Two generated secrets: the key that signs sign-in tokens, and the first admin's password |
| `output.tf` | The values the scripts read after a deploy (below) |
| `data.tf` | Looks up what already exists: the region, the account, the workshop's network (VPC, subnets, route tables, security groups) |
| `main.tf` | Two random names that make every resource name unique when no participant ID is set |
| `variable.tf` | Inputs, set through `TF_VAR_...` in `ENVIRONMENT.config`: the participant ID (`aws_app_code`), the project name, and the on/off switches below |
| `provider.tf` | The AWS provider, its tags, and Terraform's own state stored in S3 (`coding-workshop-tfstate-` plus the participant ID, passed in by the scripts) |
| `policy.tftpl` | An IAM policy template from the workshop. No `.tf` file here reads it |
| `documentdb.tf`, `eks.tf`, `helm/` | Off by default and unused: see [below](#off-by-default-safe-to-ignore) |

For David's environment the names are: CloudFront `d1gov8jpsxhwer.cloudfront.net`, Lambda
`coding-workshop-tracker-c7dabfc1`, Aurora `coding-workshop-rds-c7dabfc1`, website bucket
`coding-workshop-website-c7dabfc1`.

## What we changed, and why

Five changes to the template, each with its reason in a comment beside it. `git log -- infra/`
shows them (commits `dc3935f`, `d19634e`, `4d8b949`).

| Change | File | Why |
| --- | --- | --- |
| Lambda memory 128 MB → **512 MB** | `lambda.tf` line 11 | Passwords are hashed with PBKDF2 at 600,000 rounds, which is slow on purpose. A 128 MB Lambda gets a small slice of a CPU: about 2 s per sign-in, estimated from 0.14 s on one VDI core. At 512 MB a warm sign-in measured 1.15 s through CloudFront (13 Oct) |
| **New `secrets.tf`**: `jwt_secret` (48 characters) and `bootstrap_admin` (16) | `secrets.tf`, passed in through `locals.tf` | A Lambda is not one server: copies start and stop on their own and share no memory. A signing key "generated on first run" would differ per copy and cause random sign-outs, so Terraform generates it once and gives every copy the same one |
| **Output `bootstrap_admin_password`** (marked sensitive) | `output.tf` | The first admin, `AD000001`, is created on the first cold start with this password and must change it at first sign-in. This is how you read it |
| **Removed CloudFront's `custom_error_response`** (404 → `/index.html` with 200) | `cloudfront.tf` | It applied to the whole distribution, API included, so the API's JSON 404 ("not found or not yours") came back as something else (seen on the first AWS deploy, 13 Oct). The website uses addresses like `/#/projects/7`, so it never needs that rewrite |
| **CORS `allow_headers`: `*` → `authorization`, `content-type`** | `lambda.tf` | Browsers never let `*` cover the `Authorization` header (Firefox already warns it will stop accepting it). The website itself is same-origin behind CloudFront and doesn't need CORS; this is for other pages calling the Lambda URL, such as Swagger UI ([docs/API.md](../docs/API.md)). Committed 15 Oct; on AWS after the next `./bin/deploy-backend.sh` |

Kept as the template had it, but worth knowing:

- **Aurora pauses itself when idle** (`min_capacity = 0.0`, `rds.tf` line 27). The first
  request afterwards takes about 15 seconds. Wake it before a demo
  ([SETUP.md, section 7](../docs/SETUP.md#7-wake-the-site-before-a-demo)).
- **Aurora isn't reachable from outside**, and has no Data API. So the schema can't be
  applied from a laptop: the Lambda applies its own migrations on each cold start
  (`backend/tracker/store/migrate.py`).
- **The Lambda's zip is built on the machine that runs Terraform** (`build_in_docker =
  false`). Deploy from Ubuntu only: from Windows it ships the wrong build of the Postgres
  driver and crashes on import.
- **`skip_final_snapshot = true`** (`rds.tf`) and **`force_destroy = true`** (`s3.tf`):
  `terraform destroy` deletes the database and the website with nothing kept. Hence the
  warning on `./bin/cleanup-environment.sh` ([bin/README.md](../bin/README.md#cleanup-environmentsh)).
- **The Lambda can't send email or texts:** its role has no `ses:` permission and its
  network has no route to those services. That is why a forgotten password is reset by an
  admin.

## Off by default, safe to ignore

These serve the workshop's other tracks. Each is behind a switch in `variable.tf` that we
never turned on, so they create nothing:

| File | Builds | Switch (default) |
| --- | --- | --- |
| `documentdb.tf` | A DocumentDB (MongoDB-compatible) cluster | `aws_mongo_enabled` (`false`) |
| `eks.tf`, `helm/` | A Kubernetes cluster and Helm charts for Jupyter and data jobs | `aws_eks_enabled` (`false`) |

`aws_postgres_enabled` is the one switch that is on (`true`): it builds Aurora.

## Outputs

`terraform output` lists them after a deploy. The scripts read them; you rarely need to.

| Output | Value | Used by |
| --- | --- | --- |
| `website_url` | `https://d1gov8jpsxhwer.cloudfront.net` on AWS | printed by `deploy-frontend.sh` |
| `api_base_url`, `api_endpoints`, `lambda_urls` | Where the API is (CloudFront on AWS, the LocalStack URL locally) | `generate-env.sh`, `deploy-frontend.sh` |
| `s3_bucket_name`, `cloudfront_distribution_id` | Where the website goes, and what to invalidate | `deploy-frontend.sh` |
| `bootstrap_admin_password` | The first admin's first password (sensitive, so hidden unless asked for by name) | you, once per new environment |

Terraform's state follows the last script that ran: `start-dev.sh` points it at LocalStack,
`deploy-backend.sh` at AWS. So the same command answers for different places:

```sh
cd ~/DavidCitiProject
(set -a; source ENVIRONMENT.config; terraform -chdir=infra output -raw bootstrap_admin_password; echo)
```

That prints the AWS value after `deploy-backend.sh`. The local value is printed by the
command in [SETUP.md, section 4](../docs/SETUP.md#4-sign-in-locally-and-add-demo-data). Either
works only until the admin changes it at first sign-in.

## Before you commit a change here

```sh
cd ~/DavidCitiProject/infra
terraform validate
```

`validate` checks the files are well formed without changing anything (it needs the
`terraform init` that `start-dev.sh` or `deploy-backend.sh` already ran). Then deploy both halves
([SETUP.md, section 6](../docs/SETUP.md#6-deploy-to-aws)). Write a comment beside every
resource you add, and keep names in snake_case.
