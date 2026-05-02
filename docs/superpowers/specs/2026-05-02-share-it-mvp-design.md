# Share-It MVP Design

Date: 2026-05-02

## Summary

`oh-share-it` MVP is a local-first context sharing system for coding agents.
The primary workflow is not chat and does not depend on routing.
Users define what to share in a dedicated share rules file, ask their coding
agent to run `/share-it`, upload the selected files to a server-side public
library folder, and later run `/share-me` to sync the shared library back into
their working directory for the agent to browse.

The server organizes uploaded context as an OpenViking-inspired filesystem:
resources, memories, skills, and L0/L1/L2 indexes. Routing remains useful, but
it is an optional component that agents can call when they want query-based
help finding directories, documents, or text chunks.

## Goals

- Let users share context from inside their existing coding agent workflow.
- Avoid reusing `.gitignore` or changing the repository's git behavior.
- Upload user-selected files to a server-managed public library subfolder named
  by the user.
- Organize shared context into resources, memories, skills, raw files, and
  layered indexes.
- Sync the public library back into the local working directory so agents can
  browse and read it directly.
- Provide optional routing as an additive capability, not as a required path.
- Keep the MVP dependency-light and easy to run locally.

## Non-Goals

- Do not build a full chat product.
- Do not replace the user's coding agent runtime.
- Do not automatically modify the user's source files, git settings, or agent
  configuration.
- Do not require routing for the main share/sync workflow.
- Do not implement enterprise permissions, billing, or multi-tenant production
  hosting in the MVP.
- Do not auto-merge personal context into a single truth layer without retaining
  source identity.

## User Workflow

### Share Context

1. The user creates or edits `share-it.rules` in the working directory.
2. The user asks the coding agent to run `/share-it`.
3. The agent follows the `oh-share-it` skill instructions and runs the CLI.
4. The CLI reads `share-it.rules`, scans the working directory, and creates a
   share package from allowed files.
5. The CLI uploads the package to the server with a user-provided share name.
6. The server stores it under `library/<share-name>/`, regenerates indexes, and
   records the upload in a manifest.

### Sync Shared Context

1. The user asks the coding agent to run `/share-me`.
2. The agent runs the CLI sync command.
3. The CLI downloads the server public library into `.oh-share-it/public/`.
4. The agent reads `.oh-share-it/public/indexes/L0.md` first, then follows L1
   and L2 references as needed.

### Optional Query Assist

1. The user asks `/share-me query "..."`, or the agent decides query help would
   save time.
2. The CLI calls the optional routing endpoint.
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
    library/
    uploads/
  docs/
    superpowers/
      specs/
```

The MVP can be implemented with Node.js built-in modules and vanilla browser
code. This avoids dependency installation as a prerequisite for the first demo.

## Server

The server exposes HTTP endpoints for upload, listing, sync, index regeneration,
and optional routing.

### Endpoints

- `GET /api/health`
  Returns server status.
- `GET /api/library`
  Lists public library folders and their latest manifest summary.
- `GET /api/library/:shareName`
  Returns one folder's manifest and index metadata.
- `GET /api/library/:shareName/file?path=<path>`
  Reads an indexed file or raw file.
- `POST /api/share`
  Accepts a share package and writes it to `data/library/<shareName>/`.
- `POST /api/library/:shareName/reindex`
  Regenerates Resource/Memory/Skill classification and L0/L1/L2 indexes.
- `GET /api/sync`
  Returns a complete library snapshot for local sync.
- `POST /api/route`
  Optional routing endpoint. Returns relevant directories, documents, or chunks.

### Storage

Uploaded context is stored as a filesystem library:

```text
data/library/
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

The `raw/` directory preserves the uploaded file layout. The classified folders
contain generated entry files or copies that make the folder easy for an agent
to browse. The manifest is the source of truth for source paths, hashes, sizes,
classification, upload time, and generated index paths.

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
public library.

### L0

`L0.md` is the first file an agent should read. It is short and includes:

- available share folders
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
oh://public/<share-name>/resources/<path>
oh://public/<share-name>/memories/<path>
oh://public/<share-name>/skills/<path>
oh://public/<share-name>/raw/<path>
oh://public/indexes/L0.md
```

The URI does not replace filesystem paths. It gives agents and future APIs a
stable identity for citing context across syncs.

## CLI

The CLI lives at `cli/share-it.js`.

### Commands

- `share`
  Reads `share-it.rules`, packages allowed files, and uploads them.
- `sync`
  Downloads the public library snapshot to `.oh-share-it/public/`.
- `list`
  Lists server library folders.
- `read <path-or-uri>`
  Reads a synced context file.
- `query <query>`
  Calls the optional routing endpoint.

### Examples

```bash
node cli/share-it.js share --name beiyan-project
node cli/share-it.js sync
node cli/share-it.js list
node cli/share-it.js query "how should this repo organize agent skills?"
```

## Agent Skill

The skill lives at `skills/oh-share-it/SKILL.md`.

It gives coding agents two primary slash-command behaviors:

- `/share-it`
  Read `share-it.rules`, explain what will be shared if needed, run the CLI
  share command, and report the server folder name.
- `/share-me`
  Run the CLI sync command, read `.oh-share-it/public/indexes/L0.md`, then browse
  L1/L2/raw files as needed for the user's task.

It also describes optional behavior:

- `/share-me query "..."`
  Call the routing command and decide whether returned directories, documents,
  or chunks are useful.

The skill should tell agents that `/share-me` sync and browse is the default
mode. Query routing is a helper, not a required step.

## Client

The client is a local web UI for inspecting the public library.

It supports:

- listing share folders
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
  "scope": "public",
  "shareName": "optional-folder",
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
      "uri": "oh://public/beiyan-project/resources/docs/architectue.md",
      "path": "beiyan-project/resources/docs/architectue.md",
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

- Missing `share-it.rules`: CLI creates a starter file and stops before upload.
- Empty share package: CLI reports that no files matched allow rules.
- Denied sensitive file: CLI excludes it and records the exclusion count.
- Server unavailable: CLI exits with a clear connection error.
- Duplicate share name: server replaces the previous snapshot and records a new
  manifest version for MVP simplicity.
- Malformed upload: server rejects the package and leaves the previous library
  untouched.
- Sync failure: CLI writes to a temporary directory first, then replaces the
  local `.oh-share-it/public/` only after a complete snapshot is available.

## Testing

MVP tests should cover:

- share rule parsing with allow, deny, comments, and deny-wins behavior
- packaging only allowed files
- server upload writes the expected library structure
- classification of representative resource, memory, and skill files
- L0/L1/L2 index generation
- sync snapshot writes `.oh-share-it/public/`
- optional routing returns directories, documents, and chunks by mode
- client can load library data from the server

The first implementation can use Node's built-in test runner.

## Acceptance Criteria

- A user can create `share-it.rules` and run `/share-it` through the skill/CLI.
- The selected files upload to `data/library/<share-name>/raw/`.
- The server generates `resources/`, `memories/`, `skills/`, `indexes/L0.md`,
  `indexes/L1.md`, `indexes/L2.json`, and `manifest.json`.
- A user can run `/share-me` and sync the public library to
  `.oh-share-it/public/`.
- An agent can start from synced `L0.md`, navigate through `L1.md`, and read L2
  or raw files without calling routing.
- Optional query routing can return relevant directories, documents, or chunks.
- The local client can browse the same public library.

## Open Decisions Resolved For MVP

- The share rules file is `share-it.rules`.
- Sharing is explicit allow by default.
- Deny rules win over allow rules.
- The server public library is filesystem-backed.
- The default agent workflow is sync and browse.
- Routing is optional and isolated.
- Initial classification and routing are deterministic, not LLM-dependent.

