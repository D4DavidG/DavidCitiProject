# Documentation index

> **For:** anyone looking for a guide. **Answers:** which document explains what, and where it
> is. Back to the [project README](../README.md).

## The guides

Read them in this order if you are new: requirements, then architecture, then whichever you need.

| Guide | Read it to learn |
| --- | --- |
| [REQUIREMENTS.md](REQUIREMENTS.md) | What the workshop brief asked for and which screen meets each item; the seven client questions; who may do what; the rules the app enforces; how the money is worked out |
| [ARCHITECTURE.md](ARCHITECTURE.md) | How a request travels from the browser to Postgres and back; the layers of the API; where every piece of data lives; the security measures, in plain words |
| [API.md](API.md) | Every endpoint and who may call it; how to sign in and call the API from Swagger UI, Postman or curl, locally and on AWS; the error shapes and codes; how to watch the audit log and notifications |
| [TESTING.md](TESTING.md) | What every test suite proves, where it lives and why it is there; how to run each one, locally and against AWS; coverage, its gaps and their reasons; the load test results |
| [SETUP.md](SETUP.md) | How to set up a machine, run the app locally, sign in locally, load demo data, deploy to AWS, and fix what usually goes wrong |
| [DECISIONS.md](DECISIONS.md) | Every design decision David made, why, and what was rejected (archive instead of delete, logged time instead of payroll, refresh tokens in the body, and more) |
| [AI-WORKFLOW.md](AI-WORKFLOW.md) | How David built it with Claude Code: the instructions file, how work was split between agents, the orchestration, and how every claim was checked |

## The API files

| File | What it is |
| --- | --- |
| [openapi.json](openapi.json) | The API description (OpenAPI 3.0.3, 71 operations), built from the route table by `tools/openapi.py`; a test fails if it falls out of date. Import it into Postman or SwaggerHub |
| [swagger.html](swagger.html) | Swagger UI, which reads `openapi.json`. Serve it with `./tools/swagger.sh` and open http://localhost:8090/swagger.html; pick the Local or AWS server. Steps: [API.md](API.md) |

## Pictures

[screenshots/](screenshots/) holds the screenshots the project README shows (dashboard,
allocation grid, project, dependency view, phone). Playwright's `frontend/e2e/screenshots.spec.js`
retakes them on request; see [TESTING.md](TESTING.md).

## The folder READMEs

| README | Answers |
| --- | --- |
| [../README.md](../README.md) | What the tool is, the live site and every login, how to navigate the repo |
| [../backend/README.md](../backend/README.md) | The API's code: layers, route table, how a request is handled |
| [../frontend/README.md](../frontend/README.md) | The website's code: screens, shared components, unit and browser tests |
| [../tests/README.md](../tests/README.md) | Every test suite, where it lives and the command that runs it |
| [../infra/README.md](../infra/README.md) | What Terraform builds on AWS and in LocalStack |
| [../bin/README.md](../bin/README.md) | The shell scripts that set up, run, deploy and clean up |
| [../tools/README.md](../tools/README.md) | Our helper scripts: demo data, Swagger, browser tests, OpenAPI |
| [../CLAUDE.md](../CLAUDE.md) | The working notes Claude Code reads on every session: rules, decisions, traps, commands |

Not here on purpose: the organisation's coding instructions for AI assistants live in
`.github/instructions/`, beside the CI checks in `.github/workflows/`.
