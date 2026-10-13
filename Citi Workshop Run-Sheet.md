Prep complete 0 / 0

Collabera × Citi — 3-day in-person workshop

# Citi Workshop Run-Sheet

Three days of working interview, scored on what you can demo. Everything below is either a thing to install, a thing to pack, or a decision to make before 8:30am Tuesday.

- **When**Tue Oct 13 – Thu Oct 15, 9:00am–3:00pm EST. Arrive 8:30.
- **Where**Staybridge Suites Tampa East – Brandon, 3624 N Falkenburg Rd, Tampa FL 33619
- **Dress**Business smart. Dress pants and a collared shirt or blouse.
- **Bring**Unexpired photo ID, laptop + charger, mouse, mousepad, keyboard

**Lynn Durkin**908-256-0664

**Logan Kearns**727-433-0170

Do first — blocks everything else

## The four things that cost you a day if you skip them

These have a dependency on somebody else, so they need a head start. The rest of the list is just you and your laptop.

- [ ] Accept Chandan's GitHub organization invite. *Your Copilot seat comes through the org. If the invite is unaccepted Tuesday morning, you walk into an AI workshop with no AI tooling.*
- [ ] Open the ticket/project Chandan assigned to your GitHub account and read it end to end. *The email says returning participants got one assigned specifically to brush up on. That is the closest thing you have to a syllabus for Tuesday.*
- [ ] Confirm you are in the current Slack channel. *Someone on the logistics call found their old Slack had been deleted. Bianca adds people to the new one.*
- [ ] Reply-all to confirm receipt, and ask the questions in the last section of this page. *They offered either a Monday call with Logan or a recording. Take the call.*

#### Timing, and what you can skip

Only the four items above are worth doing today, because they depend on other people answering. Everything else on this page fits in a Sunday afternoon and a Monday evening.

Required is a short list: Git, Node, Python, AWS CLI, Terraform, VS Code, Copilot working. That is the official Cognixia checklist and nothing more. Databases, the cache warm-up and the GUI clients below are insurance against hotel wifi, not requirements. Java and Maven you can skip outright unless someone confirms a Spring Boot backend, because the last build you did for them was Python.

Context

## What is actually being scored

From the logistics call: it is an interview, but a deliberately comfortable one. Citi managers sit in all three days to facilitate, not to catch anyone out. You get three days instead of a one-hour technical screen, which means the burden shifts from answering questions well to shipping something and narrating it.

The scoring shape they described: hit the core requirements first, then add whatever your own strong suit is. There is no single right differentiator. Two they named by example were UI quality and ease of use, because those read instantly in a demo, and comprehensive testing, which they said evaluators would love. Pick the thing you are actually good at rather than the thing that sounds impressive.

#### Gap in what you sent me

The transcript file jumps from 1:10 to 35:22, so the whole middle of that call is missing, and the middle is where they would have walked through the project brief and the evaluation criteria. The SharePoint recording link is sign-in walled, so I cannot open it either. Someone on the call also asked them to send the document that was shown at the start of the meeting. Ask for both: the full recording and that document.

Sunday afternoon — needs admin rights and reboots

## Install the base toolchain

The Cognixia prep checklist asks for Git, Node 18+, Python 3.10+, AWS CLI v2, Terraform, and VS Code. I would add Docker, the GitHub CLI, and Postman, for reasons in the next two sections. Do this at home where you have admin rights and a fast connection.

```
# Run in PowerShell. Accept the UAC prompts.
winget install -e --id Git.Git
winget install -e --id OpenJS.NodeJS.LTS
winget install -e --id Python.Python.3.12
winget install -e --id Amazon.AWSCLI
winget install -e --id Hashicorp.Terraform
winget install -e --id Microsoft.VisualStudioCode
winget install -e --id GitHub.cli
winget install -e --id Postman.Postman
winget install -e --id Docker.DockerDesktop

# Skip these. Only if someone confirms a Java backend.
winget install -e --id EclipseAdoptium.Temurin.17.JDK
winget install -e --id Apache.Maven
```

Close and reopen PowerShell afterwards so `PATH` picks up. Docker Desktop on Windows needs WSL 2 and at least one reboot, so do it tonight and not Monday at 11pm. If WSL is not set up, run `wsl --install` from an admin prompt first.

```
# Homebrew first, if you do not have it:
# /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

brew install git node python@3.12 awscli terraform gh
brew install --cask visual-studio-code postman docker

# Skip these. Only if someone confirms a Java backend.
brew install --cask temurin@17
brew install maven
```

Launch Docker Desktop once from Applications so it installs its helper and starts the daemon. On Apple silicon, note that some older MySQL images are amd64 only; the `mysql:8` image below has an arm64 build, so it is fine.

### Then verify, and do not skip this part

Every line should print a version, not an error. This is the exact check the Cognixia checklist asks for, plus the ones I added.

```
git --version
node --version
npm --version
python --version
pip --version
aws --version
terraform -version
docker --version
gh --version
code --version
```

On macOS and Linux, `python` may not exist even when `python3` does. If `python --version` fails there, use `python3` and `pip3` throughout.

### Which of these are actually applications

Most of the list is not. Only four things on this page are programs you open and look at; the rest are command-line tools with no window at all, which is why they seem to vanish after installing.

- **VS Code** — the editor. This is where you will spend the three days, and where Copilot lives.
- **Docker Desktop** — must be open and running for any `docker` command to work. Installing it is not enough.
- **Postman** — worth having as an app rather than the web version, because the desktop app can reach `localhost`. Sign in once at home so your collections sync.
- **A browser** — you already have one.
- *Optional:* MongoDB Compass and MySQL Workbench, only if you want to put a database on screen during a demo.

Git, Node, Python, the AWS CLI and Terraform have no interface. You use them by typing their names in a terminal, and the version checks above are the only confirmation you get that they exist. GitHub Copilot is not an app either; it is an extension inside VS Code. Git does install one extra window, **Git Bash**, which is useful to know about: it accepts the bash-style `\` line continuations that PowerShell rejected.

- [ ] Base toolchain installed
- [ ] Every verify command prints a version
- [ ] Docker Desktop launches and `docker run hello-world` succeeds
- [ ] Reboot done, if Windows asked for one

### Git identity and auth

```
git config --global user.name "David Gusmao"
git config --global user.email "the email on your GitHub account"
git config --global init.defaultBranch main
git config --global pull.rebase false

# Browser-based login; also sets up HTTPS credentials for pushing.
gh auth login
gh auth status
```

- [ ] Git identity set and `gh auth status` is clean
- [ ] Cloned one private org repo successfully, to prove push access works before Tuesday

### VS Code extensions

```
code --install-extension GitHub.copilot
code --install-extension GitHub.copilot-chat
code --install-extension ms-python.python
code --install-extension ms-python.vscode-pylance
code --install-extension dbaeumer.vscode-eslint
code --install-extension esbenp.prettier-vscode
code --install-extension rangav.vscode-thunder-client
code --install-extension ms-azuretools.vscode-docker
code --install-extension hashicorp.terraform
code --install-extension mtxr.sqltools
code --install-extension mtxr.sqltools-driver-mysql
code --install-extension mongodb.mongodb-vscode
code --install-extension eamodio.gitlens
```

- [ ] Signed into GitHub inside VS Code and Copilot gives a live completion in a scratch file
- [ ] Copilot Chat opens and answers. *Test it on real code, not "hello". If your seat is not provisioned yet it fails here, and you want to find that out Sunday.*

Optional insurance — Sunday or Monday, not tonight

## Databases: start the Docker engine first

This is not on the Cognixia checklist. It is insurance against on-site bandwidth, and it is cheap only because Docker is already installed. If you cut one thing from this page, cut the MySQL half.

#### Why your commands failed — two separate problems

**The engine is not running.** `cannot find the file specified` on `npipe:////./pipe/dockerDesktopLinuxEngine` means the `docker` CLI installed correctly but the engine it talks to is not up. Docker Desktop is an application, not a background service: it has to be launched, and on Windows its first launch builds a WSL 2 backend and often wants a reboot.

**My command block was bash, not PowerShell.** The trailing `\` characters are bash line continuations. PowerShell ignored them and read each following line as a brand new command, which is every `The term '-e' is not recognized` error. Nothing was wrong on your end. The commands below are one line each.

### Start the engine

The engine is not a separate download. Docker Desktop installs the `docker` command and the engine together, and the engine runs inside the Docker Desktop application, so the command only works while that app is open. Nothing to install here, only to launch.

- Open the Start menu, type **Docker Desktop**, launch it, and leave it running. Wait until the tray whale stops animating and the dashboard reads *Engine running*. First launch can take several minutes while it builds its WSL 2 backend.
- Or launch it from PowerShell: `& "C:\Program Files\Docker\Docker\Docker Desktop.exe"`
- Set it to start with Windows, in Settings → General, so Tuesday morning does not depend on you remembering.

```
docker version   # Client AND Server should both print
docker info
```

A Client block followed by `failed to connect to the docker API at npipe:...dockerDesktopLinuxEngine` on Server is exactly this: client fine, engine down. Wait longer, or restart Docker Desktop. Only move on once a Server section prints.

### If launching it does not fix the Server block

- `wsl --status` and `wsl --list --verbose`. You want to see `docker-desktop` listed and WSL 2 as the default version.
- If WSL is missing or stale: `wsl --install` then `wsl --update` in an **administrator** PowerShell, reboot, launch Docker Desktop again.
- If WSL reports virtualization unavailable, turn on *Virtual Machine Platform* in Windows Features, and check virtualization is enabled in your BIOS.
- `docker context ls` should show `desktop-linux` as current. If it does not: `docker context use desktop-linux`.

If none of that works in twenty minutes, stop. This is optional insurance, and MongoDB Atlas has a free tier you can point at instead. Do not spend Sunday on it.

### Then pull and run, one line each

Mongo first. Last time's build used MongoDB with an in-memory fallback, so it is the likely answer. MySQL is the hedge, because the Simple Bank brief still says "to be confirmed" and hands you a SQL schema.

```
# PowerShell-safe. No line continuations anywhere.
docker pull mongo:7
docker pull mysql:8

docker run -d --name mongo-bank -p 27017:27017 mongo:7
docker run -d --name mysql-bank -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=bankdb -p 3306:3306 mysql:8

docker ps
docker exec -it mongo-bank mongosh --eval "db.runCommand({ping:1})"
docker exec -it mysql-bank mysql -uroot -proot -e "SHOW DATABASES;"
```

Once those exist they start offline with `docker start mongo-bank`, which is the whole point. `docker stop` gives the memory back without losing the data or the images.

GUI clients are a nice-to-have, not a requirement: MongoDB Compass from mongodb.com, MySQL Workbench from the MySQL site. The MongoDB and SQLTools extensions already cover it inside VS Code, so only install these if you would rather show a database on screen during a demo.

- [ ] Docker Desktop launched, `docker version` prints both Client and Server
- [ ] Images pulled and containers reachable
- [ ] Optional: ran the Simple Bank `CREATE TABLE` script from the project PDF against `bankdb`

Monday night — the highest-value hour on this page

## Warm every cache so you can work offline

You will be on hotel wifi at a Staybridge in Brandon, sharing it with the rest of the cohort and whoever else is in the building, and Citi moved the workshop here because Tampa is already hosting a large conference. Assume the network is slow or saturated. Every dependency you download on site is time you are not building.

So download everything now by building a throwaway version of the thing you are likely to build on site. The code is disposable; the point is that npm, pip, Terraform, and Docker all keep what they fetch in a local cache that survives.

### Frontend cache

```
npm create vite@latest warmup-ui -- --template react-ts
cd warmup-ui
npm install
npm install axios react-router-dom recharts
npm run build
npm run dev   # confirm it serves, then Ctrl+C
```

### Backend cache, both database drivers

```
cd .. && mkdir warmup-api && cd warmup-api
python -m venv .venv

# Windows:    .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate

pip install fastapi "uvicorn[standard]" pydantic python-dotenv \
  pymongo motor \
  sqlalchemy pymysql \
  "passlib[bcrypt]" "python-jose[cryptography]" \
  pytest httpx
pip freeze > requirements.txt
```

That covers Mongo and MySQL, plus password hashing and JWTs for the login requirement, plus pytest and httpx so testing is available as a differentiator without a download.

### Terraform provider cache

The AWS provider plugin is a large download and `terraform init` fetches it per project. Run it once now so it is in your plugin cache.

```
cd .. && mkdir warmup-tf && cd warmup-tf

# Write a minimal main.tf, then init. No resources, no AWS calls.
printf 'terraform {\n  required_providers {\n    aws = {\n      source  = "hashicorp/aws"\n      version = "~> 5.0"\n    }\n  }\n}\nprovider "aws" {\n  region = "us-east-1"\n}\n' > main.tf

terraform init
terraform validate
```

On Windows, create `main.tf` in VS Code instead of using `printf`.

### Spring Boot: skip unless someone confirms Java

Your last build for them was Python and React, so this is almost certainly wasted effort. Noting it only because Maven's first build downloads an enormous dependency tree: if Java does come up, generate a project at start.spring.io with Web, JPA, MySQL Driver and Validation and run `.\mvnw package` once at home to fill `~/.m2`.

- [ ] npm cache warm, Vite app builds and serves
- [ ] pip cache warm, both DB drivers installed
- [ ] Terraform AWS provider downloaded, `validate` passes
- [ ] Docker images pulled, containers start from cache with the network off
- [ ] Keep the warmup folders. Do not delete `node_modules` or `.venv`.

#### Prove it

Turn your wifi off and run `npm install` in a copy of the warmup UI folder and `docker start mysql-bank`. If both work with no network, you are genuinely prepared. If they do not, better to know now.

When credentials arrive

## AWS and Copilot credentials

Cognixia provisions your AWS account and sends credentials. You are not meant to create your own, so do not go sign up.

```
aws configure                    # key, secret, region (likely us-east-1), json
aws sts get-caller-identity      # should print your account and ARN
```

- [ ] Credentials configured and `get-caller-identity` returns your account
- [ ] Created a `.gitignore` habit for `.env`, `.venv`, `node_modules`, `*.tfstate`, `.terraform/` *Committing an AWS key to an org repo at a bank, in front of Citi managers, is the one unrecoverable mistake available to you this week. Secrets go in environment variables.*

Tuesday 8:30am

## What goes in the bag

- [ ] Unexpired driver's license or passport. *Explicitly required. No ID, no entry.*
- [ ] Laptop and charger
- [ ] External mouse, mousepad, keyboard. *Named in the workshop document, so they expect you to be set up to work for six hours.*
- [ ] Power strip or a short extension cord. *Hotel conference rooms never have enough outlets and twenty people are about to find that out together.*
- [ ] USB-C hub with HDMI. *You may be asked to plug into a screen to demo.*
- [ ] Phone hotspot tested, and know your data cap
- [ ] Headphones
- [ ] Notebook and pen. *Not optional. Visible note-taking while a manager explains requirements reads well, and the criticism you write down verbatim is the raw material for the class presentation described above.*
- [ ] Business smart outfit ready for all three days, not just Tuesday
- [ ] Logan and Lynn's numbers saved in your phone, and the hotel address in your maps app
- [ ] Drive to Falkenburg Rd timed for a 7:30–8:30 arrival window. *Brandon is on the I-75 / I-4 side of Tampa and that is real rush hour.*

From someone who has taken this workshop

## What it is actually like in the room

First-hand account from a past participant. This is better information than anything in the official material, so where it conflicts with my guesses, it wins.

### How the three days run

- **Day one goes slowly, and that is normal.** Environment setup eats a chunk of it. The productive use of the rest is reading the problem statement properly and designing: architecture, what you are going to use, what your objects are. Do not measure day one in lines of code.
- **Expect to work outside the 9–3 window.** The direct quote is that you will not finish otherwise. Plan your evenings around building, not around recovering.
- **Get the MVP standing, then do one thing to stand out.** Same order the logistics call described. The differentiator only counts once the core works.

### People, not just code

- **Introduce yourself to the Citi staff and the recruiters.** Small talk is the whole ask. The point is that they can put a name to a face when the decision gets made, and that is a cheap advantage most people in the room will not take.
- **Talk to the people at your table.** Sharing ideas, helping someone who is stuck, asking questions — all of it is visible and all of it reads well. This is also the easiest place to show the coordinating instinct you are trying to be hired for.

### Be ready to be examined on your own code

This is the most concrete thing in the account, and it changes how you build. They will ask you questions about the codebase, ask you to start your localhost and walk them through it, ask to see your Postman tests or SwaggerHub, and ask you to run your test suite. You do not need it line by line, but you need to explain the program end to end.

- [ ] Can start the app from cold in under a minute, in front of people
- [ ] Postman collection or Swagger docs exist and are current. *Your playbook's answer: generate the collection from the route table so it cannot drift, and include the failure cases. A collection of happy paths proves the endpoints exist; one with an overdraft and an ownership violation proves the rules do.*
- [ ] Test suite runs on command and passes, with the count visible
- [ ] Can trace one request end to end out loud: route, auth check, service rule, repository, database, response
- [ ] Can name the parts you did not write or do not fully understand, honestly. *Candor there is a credibility signal with engineers, and getting caught bluffing is the one thing that is hard to recover from.*

### Feedback is part of the evaluation

Take criticism visibly well: accept it, then say how you will implement it or that you will go back and iterate. Then the move worth copying outright — present to the whole class, not only in your one-on-one. The participant who passed this on did their class presentation *after* their one-on-one and showed three things: the original version, the notes they took on the criticism they received, and what they changed to meet it.

That is a demonstration of coachability using the evaluators' own words as evidence, and it is why the notebook is on the packing list. Write down every piece of criticism verbatim as you receive it.

Carried over from the last build

## Decisions to force in hour one

Your own playbook from the four-day bank build is more useful than anything I could invent, and three of its lessons are things you can only act on at the very start. Have them ready to say out loud.

- **Money is an integer number of cents, everywhere except on screen.** The playbook calls this the highest-leverage decision in the project, and it had to be migrated mid-build last time. Saying it in hour one is a ten-second contribution that prevents a day-three rewrite.
- **A repository interface with an in-memory store behind it, before any real database.** That is what made the database swap touch one file last time, and it means a demo with zero setup. It is also the move that makes the unresolved SQL-or-Mongo question stop blocking anyone.
- **The database decision itself.** Last time it stayed open from day one and a graded SQL deliverable went unfinished. Identify in hour one what is blocked on an instructor's answer and chase it immediately.
- **One field-naming convention on the wire.** snake_case or camelCase, picked once, for requests and responses. Mixing them silently disabled the idempotency guard last time, so double-clicks moved money twice with no error.
- **One team document, not several.** Values, the non-obvious rules, and a TODO split into must-ship, should-ship, stretch, and deliberately-not-doing. Last time the planning docs multiplied and had to be consolidated on day four.

#### The scheduling lesson, and what it means for you specifically

The playbook's own conclusion: the UI cannot start until the API is stable, so the backend has to be finished early rather than finished well. Last time that produced 43 frontend commits in a single day. You are aiming at the frontend and the coordinating role, which means the crunch lands on you. The lever you have is at the start, not at the end: push the team to get a thin end-to-end slice and a stable route table done on day one so day three is survivable.

Strategy

## Your angle

They said to go in knowing what you are strong at and show that. On your record, that is not a hard call. You led frontend UX on a deployed MERN app, you were PM and technical lead on a five-person sponsored capstone building a permission-aware AI document-retrieval agent for a university legal office, and you wanted the frontend plus project-manager slot on the training team's Simple Bank build. So the two things you can offer that most of the room cannot are a UI that looks finished and the ability to keep a team's requirements straight.

Both of those happen to be what they said demos well. Some concrete moves:

- In the first hour, write the requirements down as a visible checklist the team works from. That is a real contribution and it is also the clearest possible demonstration of initiative, which is one of the two soft skills they sent videos about.
- Get the boring end-to-end path working before anything clever: one endpoint, one screen, one row in the database. A thin working slice on day one buys you two days of room.
- Make the UI legible on a projector. Real empty states, real validation messages, real error text. The Simple Bank spec already lists validation messages on the UI as a bonus, so it is a sanctioned differentiator.
- **Ship light and dark mode.** Named explicitly by the participant who has done this. It is also nearly free for you: your playbook already has the exact pattern, tokens on `:root` redefined under a guarded `prefers-color-scheme` block, with the contrast ratio written in the comment beside each colour. That annotation is the part that makes it look deliberate rather than toggled on.
- **Have a scalability answer, and pagination as the proof.** Also named explicitly. Paginate from day one rather than retrofitting: your playbook's note is that adding it later changes the response shape and breaks every client, while doing it up front costs one layer of nesting in the envelope. Then you can answer the scalability question by pointing at working code instead of describing an intention.
- Add tests once the core works. They said explicitly that evaluators would love comprehensive testing, and almost nobody will do it under time pressure. `pytest` and `httpx` are already in your cache.
- Volunteer to narrate the demo. You have done stakeholder communication with a non-technical legal office; a room of bank managers is an easier audience than that.

#### A likely repeat ask

On the training project, the hiring manager asked for separate admin and normal user logins, with an AI assistant chatbot as a stretch goal. Given this workshop is branded as an AI workshop and Copilot credentials are being issued, expect something in that shape again. Have the pattern in your head: a role column on the user, a dependency that checks it, two different post-login views. You do not need to write it now, just do not be surprised by it.

Soft skills

## Two stories to have ready

They sent videos on adaptability and self-initiative, which tells you those are on the rubric. Have one real, specific story for each, under ninety seconds, with a result at the end.

- **Adaptability.** Something where the requirements or the tooling moved under you and you adjusted. Your research on build systems and the cross-tool comparison work both fit, as does anything from capstone where the legal office changed what it wanted.
- **Self-initiative.** Something you started that nobody assigned. The independent containerized agent project is the cleanest example, and the honest framing is better than an inflated one: say plainly which parts work and which are unfinished. Candor about scope is a credibility signal with engineering managers, not a weakness.

Also prepare a sixty-second version of who you are: UCF CS senior graduating in December, Master's starting spring, research on LLMs applied to software dependencies, interested in the lead and applied-AI side of engineering. That gets asked on day one and you want it smooth.

Open items

## What to ask before Tuesday

Worth putting in your reply-all or raising on the Monday call with Logan. Each one changes what you do on site.

#### Ask about lodging today, not Monday

You are in Orlando and the workshop is in Brandon. That is around three hours of driving a day, and the participant who has done this says plainly that you will not finish without working outside the 9–3 sessions. Those two facts do not fit together.

The venue is a Staybridge Suites, which is an extended-stay hotel, and Collabera chose it, so rooms may well be part of the arrangement. Ask Lynn or Logan whether lodging is provided or reimbursable. If it is not, you need to decide tonight whether to book something near Falkenburg Rd yourself, because a room two minutes away converts six hours of I-4 into six hours of build time, and Sunday is the last comfortable moment to book it.

- [ ] Asked whether lodging is provided, and booked something if it is not
- [ ] What is the stack? Specifically, SQL or Mongo, and Python or Node or Java. *The Simple Bank doc leaves the database "to be confirmed" and lists three possible backends. Asking is not a weak question, it is a scoping question.*
- [ ] Are teams assigned, and is the deliverable a group build or individual? *Changes whether you push for the lead role on day one.*
- [ ] Can they resend the full logistics recording and the document shown at the start of that meeting? *Your transcript is missing roughly 34 minutes in the middle, and the recording link needs a sign-in I do not have.*
- [ ] Is AWS deployment part of the evaluation, or local only? *Decides whether Terraform matters at all this week.*

Checkbox state is saved in this browser only. Sources: the Collabera Citi 3 Day Workshop document, the JUMP Associate Software Engineer pre-training checklist, the Cognixia orientation deck, the Simple Bank Application project document, the recruiter emails, the partial logistics-call transcript, your own four-day build playbook, and a first-hand account from a past participant.