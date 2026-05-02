# Share-It MVP Design

Date: 2026-05-02

## Summary

`oh-share-it` MVP is a local-first context sharing system for coding agents.
The primary workflow is not chat and does not depend on routing.
Users define what to share in a dedicated share rules file, ask their coding
agent to run `/share-it`, upload the selected files to a chosen server-side
context library, and later run `/share-me` to sync that library back into their
working directory for the agent to browse.

The server organizes uploaded context as an OpenViking-inspired filesystem:
resources, memories, skills, and L0/L1/L2 indexes. Routing remains useful, but
it is an optional component that agents can call when they want query-based
help finding directories, documents, or text chunks.

A server is not itself a library. A server can host multiple context libraries.
Each library has members, roles, invites, indexes, and shares. A share is one
user-named upload package inside a library.

## Goals

- Let users share context from inside their existing coding agent workflow.
- Avoid reusing `.gitignore` or changing the repository's git behavior.
- Upload user-selected files to a user-named share inside a selected context
  library.
- Let one server host multiple independent libraries.
- Let owners and admins invite or remove library members.
- Let each working directory bind to one default server and library.
- Organize shared context into resources, memories, skills, raw files, and
  layered indexes.
- Sync the bound library back into the local working directory so agents can
  browse and read it directly.
- Provide optional routing as an additive capability, not as a required path.
- Keep the MVP dependency-light and easy to run locally.

## Non-Goals

- Do not build a full chat product.
- Do not replace the user's coding agent runtime.
- Do not automatically modify the user's source files, git settings, or agent
  configuration.
- Do not require routing for the main share/sync workflow.
- Do not implement enterprise permissions, billing, SSO, or multi-tenant
  production hosting in the MVP.
- Do not provide open self-join for libraries. Joining requires an invite.
- Do not guarantee recall of content that a removed member already synced
  locally before removal.
- Do not auto-merge personal context into a single truth layer without retaining
  source identity.

## User Workflow

### Create, Join, and Bind a Library

1. A user creates a library on a server, becoming its owner.
2. The owner or an admin creates an invite token for a role such as
   `contributor` or `reader`.
3. Another user receives the invite and runs `/share-me join <invite-token>`.
4. The CLI stores the user's server credential in user-level config.
5. The user binds a working directory to the target library. The binding lives in
   `.oh-share-it/binding.json`.
6. `/share-it`, `/share-me`, and optional query routing use the current working
   directory binding by default.

### Share Context

1. The user creates or edits `share-it.rules` in the working directory.
2. The user asks the coding agent to run `/share-it`.
3. The agent follows the `oh-share-it` skill instructions and runs the CLI.
4. The CLI reads `share-it.rules`, scans the working directory, and creates a
   share package from allowed files.
5. The CLI uploads the package to the bound library with a user-provided share
   name.
6. The server stores it under `libraries/<library>/shares/<share-name>/`,
   regenerates indexes, and records the upload in a manifest.

### Sync Shared Context

1. The user asks the coding agent to run `/share-me`.
2. The agent runs the CLI sync command.
3. The CLI downloads the bound server library into
   `.oh-share-it/public/<library>/`.
4. The agent reads `.oh-share-it/public/<library>/indexes/L0.md` first, then
   follows L1 and L2 references as needed.

### Optional Query Assist

1. The user asks `/share-me query "..."`, or the agent decides query help would
   save time.
2. The CLI calls the optional routing endpoint for the bound library unless the
   user specifies another accessible library.
3. The routing engine returns relevant directories, documents, or text chunks.
4. The agent decides whether to browse those paths or use the returned text.

## Share Rules

The share rules file is named `share-it.rules`.

It is independent from `.gitignore`. It should be visible and easy to edit, and
it should never affect git behavior.

Rules use a gitignore-like syntax with explicit allow and deny prefixes:

```gitignore
+ README.md
+ docs/**
+ .codex/skills/**
- **/.env
- **/.git/**
- **/node_modules/**
- **/dist/**
- **/*.log
```

The MVP uses an explicit allow model:

- `+ pattern` includes matching files.
- `- pattern` excludes matching files.
- Blank lines and `#` comments are ignored.
- If a file matches both allow and deny rules, deny wins.
- If no allow rule matches a file, it is not shared.

This model protects users from accidentally sharing an entire repository.

## Library and Permission Model

The top-level sharing unit is a context library.

```text
server
  libraries/
    acme-product/
    acme-infra/
    personal-lab/
```

A library is a bounded context space. It has its own members, invites, shares,
indexes, audit log, and optional routing scope. Multiple libraries can live on
one server. A separate server is only needed later for physical isolation,
private deployment, or compliance boundaries.

### Roles

- `owner`
  Can delete the library, manage members, create invites, upload, sync, reindex,
  and route.
- `admin`
  Can manage members, create invites, upload, sync, reindex, and route.
- `contributor`
  Can upload shares, sync the library, and use optional routing.
- `reader`
  Can sync the library and use optional routing.
- removed member
  Cannot upload, sync, route, or read server files.

MVP permissions are library-scoped. They do not yet support per-file ACLs inside
a library.

### Joining

Libraries do not allow open self-join. A user joins through an invite token.

```bash
node cli/share-it.js library create acme-product
node cli/share-it.js invite create --library acme-product --role contributor
node cli/share-it.js join --invite osi_invite_example
```

Invite tokens include the server, library name, target role, creator, creation
time, optional expiration, and revoked state. An owner or admin can revoke an
invite before it is used.

### Blocking and Removal

Owners and admins can remove a member from a library. After removal, the server
rejects that member's upload, sync, route, and file-read requests for the
library.

The MVP cannot recall context that was already synced to that member's local
machine before removal. The server should record the removal in `audit.log`, and
the CLI should refuse future syncs once the credential is no longer accepted.

### Workdir Binding

Each working directory can bind to one default server and library.

```text
.oh-share-it/
  binding.json
  public/
    acme-product/
```

`binding.json` stores non-sensitive binding information:

```json
{
  "server": "http://localhost:4317",
  "library": "acme-product",
  "member": "alice",
  "syncPath": ".oh-share-it/public/acme-product"
}
```

Credentials are stored outside the repository in user-level config:

```text
~/.oh-share-it/credentials.json
```

This prevents a repository from accidentally committing access tokens while
still making the active library discoverable to an agent working in the
directory.

### Library Discovery

Users should not guess which library to use. The MVP supports three discovery
paths:

- invite tokens tell the user the server, library name, description, and role
- `node cli/share-it.js libraries` lists libraries the credential can access
- `.oh-share-it/binding.json` tells the agent which library the current working
  directory already uses

## Project Structure

```text
oh-share-it/
  server/
    index.js
    lib/
      classifier.js
      library-store.js
      indexer.js
      router.js
      uploads.js
      auth.js
  client/
    index.html
    app.js
    styles.css
  cli/
    share-it.js
  skills/
    oh-share-it/
      SKILL.md
  data/
    libraries/
  docs/
    superpowers/
      specs/
```

The MVP can be implemented with Node.js built-in modules and vanilla browser
code. This avoids dependency installation as a prerequisite for the first demo.

## Server

The server exposes HTTP endpoints for library management, invite-based joining,
upload, listing, sync, index regeneration, and optional routing.

### Endpoints

- `GET /api/health`
  Returns server status.
- `GET /api/libraries`
  Lists libraries the caller can access.
- `POST /api/libraries`
  Creates a library and makes the caller its owner.
- `GET /api/libraries/:libraryName`
  Returns library metadata, member role, and index metadata.
- `GET /api/libraries/:libraryName/members`
  Lists members for owners and admins.
- `POST /api/libraries/:libraryName/invites`
  Creates an invite token for owners and admins.
- `POST /api/invites/:token/join`
  Joins the invite's library and returns a credential.
- `DELETE /api/libraries/:libraryName/members/:member`
  Removes a member for owners and admins.
- `GET /api/libraries/:libraryName/shares`
  Lists share folders and their latest manifest summaries.
- `GET /api/libraries/:libraryName/shares/:shareName`
  Returns one share's manifest and index metadata.
- `GET /api/libraries/:libraryName/file?path=<path>`
  Reads an indexed file or raw file from a library.
- `POST /api/libraries/:libraryName/shares`
  Accepts a share package and writes it to
  `data/libraries/<libraryName>/shares/<shareName>/`.
- `POST /api/libraries/:libraryName/reindex`
  Regenerates Resource/Memory/Skill classification and L0/L1/L2 indexes for the
  library.
- `GET /api/libraries/:libraryName/sync`
  Returns a complete authorized library snapshot for local sync.
- `POST /api/route`
  Optional routing endpoint. Returns relevant directories, documents, or chunks
  inside an authorized library.

### Storage

Uploaded context is stored in filesystem-backed libraries:

```text
data/libraries/
  <library-name>/
    library.json
    members.json
    invites.json
    audit.log
    indexes/
      L0.md
      L1.md
      L2.json
    shares/
      <share-name>/
        raw/
          <uploaded files>
        resources/
        memories/
        skills/
        indexes/
          L0.md
          L1.md
          L2.json
        manifest.json
```

Each share's `raw/` directory preserves the uploaded file layout. The classified
folders contain generated entry files or copies that make the share easy for an
agent to browse. The share manifest is the source of truth for source paths,
hashes, sizes, classification, upload time, and generated index paths.

Library-level indexes combine the visible shares inside the library. They are
the first synced files the agent reads.

## Classification

MVP classification is deterministic and file-based. It does not require an LLM.

### Resource

Resources are durable reference materials. Examples:

- `README.md`
- `docs/**`
- ADRs and specs
- references
- product notes
- architecture documents

### Memory

Memories are contextual traces, history, decisions, notes, and project state that
may be more time-bound or personal. Examples:

- meeting notes
- handoff notes
- retrospectives
- dated project logs
- decision background

### Skill

Skills are agent-facing instructions, playbooks, or executable workflows.
Examples:

- `SKILL.md`
- `.codex/skills/**`
- workflow docs
- runbooks
- agent instructions

Classification can assign tags as well as a primary type. For example, an ADR
is a resource with `decision` and `architecture` tags.

## Layered Indexes

The server generates L0/L1/L2 indexes for each share folder and for the combined
library.

### L0

`L0.md` is the first file an agent should read. It is short and includes:

- available share folders
- library name and description
- caller's member role
- one-line folder summaries
- top resources
- top memories
- top skills
- recommended next reads

### L1

`L1.md` is the navigation overview. It includes:

- Resource/Memory/Skill sections
- folder maps
- notable source files
- generated summaries
- links to L2 entries and raw paths

### L2

`L2.json` is the detailed machine-readable manifest. It includes:

- stable `oh://` URI
- share name
- source path
- local raw path
- classified path
- type
- tags
- hash
- size
- updated time
- short extracted preview

## URI Convention

The MVP uses stable `oh://` URIs for agent references:

```text
oh://library/<library-name>/indexes/L0.md
oh://library/<library-name>/shares/<share-name>/resources/<path>
oh://library/<library-name>/shares/<share-name>/memories/<path>
oh://library/<library-name>/shares/<share-name>/skills/<path>
oh://library/<library-name>/shares/<share-name>/raw/<path>
```

The URI does not replace filesystem paths. It gives agents and future APIs a
stable identity for citing context across syncs.

## CLI

The CLI lives at `cli/share-it.js`.

### Commands

- `library create <name>`
  Creates a library and makes the current user its owner.
- `invite create --library <name> --role <role>`
  Creates an invite token for a library.
- `join --invite <token>`
  Joins a library and stores the returned credential in user-level config.
- `bind --server <url> --library <name>`
  Binds the current working directory to a server and library.
- `libraries`
  Lists libraries available to the current credential.
- `share`
  Reads `share-it.rules`, packages allowed files, and uploads them to the bound
  library.
- `sync`
  Downloads the bound library snapshot to `.oh-share-it/public/<library>/`.
- `list`
  Lists share folders inside the bound library.
- `read <path-or-uri>`
  Reads a synced context file.
- `query <query>`
  Calls the optional routing endpoint for the bound library.

### Examples

```bash
node cli/share-it.js library create acme-product
node cli/share-it.js invite create --library acme-product --role contributor
node cli/share-it.js join --invite osi_invite_example
node cli/share-it.js bind --server http://localhost:4317 --library acme-product
node cli/share-it.js share --name alice-api-notes
node cli/share-it.js sync
node cli/share-it.js list
node cli/share-it.js query "how should this repo organize agent skills?"
```

## Agent Skill

The skill lives at `skills/oh-share-it/SKILL.md`.

It gives coding agents two primary slash-command behaviors:

- `/share-it`
  Read `.oh-share-it/binding.json`, read `share-it.rules`, explain what will be
  shared if needed, run the CLI share command, and report the target library and
  share name.
- `/share-me`
  Run the CLI sync command for the bound library, read
  `.oh-share-it/public/<library>/indexes/L0.md`, then browse L1/L2/raw files as
  needed for the user's task.

It also describes optional behavior:

- `/share-me join <invite-token>`
  Join the invited library, bind the current working directory if requested, and
  show the user which library is now active.
- `/share-me libraries`
  List libraries available to the current user and identify the current working
  directory binding if one exists.
- `/share-me query "..."`
  Call the routing command for the bound library and decide whether returned
  directories, documents, or chunks are useful.

The skill should tell agents that `/share-me` sync and browse is the default
mode. Query routing is a helper, not a required step.

## Client

The client is a local web UI for inspecting authorized libraries.

It supports:

- listing libraries the user can access
- viewing a library's members and invites when the user has admin rights
- listing share folders inside a library
- viewing a folder's manifest summary
- browsing Resource/Memory/Skill groups
- reading L0/L1/L2 indexes
- triggering reindex
- trying optional query routing

The client is not the primary product surface. The primary surface is the coding
agent skill plus CLI.

## Optional Routing Component

Routing is implemented as a separate module, `server/lib/router.js`, and an
optional endpoint, `POST /api/route`.

It never blocks share or sync.

### Input

```json
{
  "query": "How should this repo organize agent skills?",
  "library": "acme-product",
  "shareName": "optional-share",
  "mode": "directories|documents|chunks"
}
```

### Output

```json
{
  "query": "How should this repo organize agent skills?",
  "mode": "documents",
  "results": [
    {
      "uri": "oh://library/acme-product/shares/alice-api-notes/resources/docs/architectue.md",
      "path": "acme-product/shares/alice-api-notes/resources/docs/architectue.md",
      "type": "resource",
      "score": 12,
      "why": "Matched skill, agent, context, and architecture terms."
    }
  ]
}
```

### MVP Ranking

The first routing engine uses deterministic scoring:

- exact query token matches
- path and filename matches
- type/tag matches
- L0/L1 summary matches
- simple recency boost

Future versions can add embeddings without changing the main workflow.

## Error Handling

- Missing `.oh-share-it/binding.json`: CLI stops before share, sync, or query and
  explains how to run `bind` or `join`.
- Missing credential for a bound server/library: CLI stops and explains how to
  join or authenticate.
- Unauthorized library access: server returns a permission error without
  revealing file contents.
- Revoked invite: join fails and tells the user to request a new invite.
- Removed member: server rejects future upload, sync, route, and file-read
  requests for that library.
- Missing `share-it.rules`: CLI creates a starter file and stops before upload.
- Empty share package: CLI reports that no files matched allow rules.
- Denied sensitive file: CLI excludes it and records the exclusion count.
- Server unavailable: CLI exits with a clear connection error.
- Duplicate share name inside the same library: server replaces that share's
  previous snapshot and records a new manifest version for MVP simplicity.
- Malformed upload: server rejects the package and leaves the previous library
  untouched.
- Sync failure: CLI writes to a temporary directory first, then replaces the
  local `.oh-share-it/public/<library>/` only after a complete snapshot is
  available.

## Testing

MVP tests should cover:

- share rule parsing with allow, deny, comments, and deny-wins behavior
- library creation, invite creation, join, member removal, and role checks
- workdir binding file creation and credential separation
- packaging only allowed files
- server upload writes the expected library structure
- classification of representative resource, memory, and skill files
- share-level and library-level L0/L1/L2 index generation
- sync snapshot writes `.oh-share-it/public/<library>/`
- optional routing returns directories, documents, and chunks by mode
- client can load library data from the server

The first implementation can use Node's built-in test runner.

## Acceptance Criteria

- A user can create `share-it.rules` and run `/share-it` through the skill/CLI.
- A user can create a library, invite another user, join by invite, and bind a
  working directory to that library.
- The selected files upload to
  `data/libraries/<library>/shares/<share-name>/raw/`.
- The server generates share-level `resources/`, `memories/`, `skills/`,
  `indexes/L0.md`, `indexes/L1.md`, `indexes/L2.json`, and `manifest.json`.
- The server generates library-level `indexes/L0.md`, `indexes/L1.md`, and
  `indexes/L2.json`.
- A removed member can no longer sync or upload to the removed library.
- A user can run `/share-me` and sync the bound library to
  `.oh-share-it/public/<library>/`.
- An agent can start from synced library `L0.md`, navigate through `L1.md`, and
  read L2 or raw files without calling routing.
- Optional query routing can return relevant directories, documents, or chunks.
- The local client can browse the same authorized libraries.

## Open Decisions Resolved For MVP

- The share rules file is `share-it.rules`.
- Sharing is explicit allow by default.
- Deny rules win over allow rules.
- A server can host multiple libraries.
- Library join requires an invite token.
- Workdir-to-library binding lives in `.oh-share-it/binding.json`.
- Credentials live outside the repository in `~/.oh-share-it/credentials.json`.
- Each library is filesystem-backed under `data/libraries/<library>/`.
- Each uploaded context package is a share under
  `data/libraries/<library>/shares/<share-name>/`.
- The default agent workflow is sync and browse.
- Routing is optional and isolated.
- Initial classification and routing are deterministic, not LLM-dependent.
