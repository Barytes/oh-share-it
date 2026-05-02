---
name: oh-share-it
description: Use when the user asks to share local context, join or list context libraries, sync shared context, or query oh-share-it from a coding agent.
---

# Oh Share It

Use this skill for `/share-it`, `/share-me`, `/share-me join`, `/share-me libraries`, and `/share-me query`.

## Defaults

The default `/share-me` workflow is sync and browse. Query routing is optional.

Read `.oh-share-it/binding.json` for the active server and library. Credentials live outside the repository at `~/.oh-share-it/credentials.json`.

Treat `share-it.rules` as the user's upload intent. Do not upload secrets or private files outside the user's share-it.rules intent, and call out suspicious allow rules before sharing.

## `/share-it`

1. Read `.oh-share-it/binding.json` and `share-it.rules`.
2. Tell the user which server and library are bound, and summarize what the rules allow if the upload scope is not obvious.
3. Run `node cli/share-it.js share --name <share-name>` after choosing or asking for a descriptive share name.
4. Report the target library, share name, and uploaded file count.

## `/share-me`

1. Run `node cli/share-it.js sync`.
2. Read `.oh-share-it/public/<library>/indexes/L0.md`, replacing `<library>` with the bound library from `.oh-share-it/binding.json`.
3. Follow L1, L2, resource, memory, skill, or raw-file references as needed for the user's task.
4. Use synced files as external context. Routing is helpful when needed, but not required.

## `/share-me join <invite-token>`

Run `node cli/share-it.js join --invite <invite-token> --server <server-url> --member <member-name>` after replacing placeholders with the user's values. If the user wants this workspace bound afterward, run `node cli/share-it.js bind --server <server-url> --library <library-name>` and report the active binding.

## `/share-me libraries`

Run `node cli/share-it.js libraries`. Explain which libraries the current credential can access and identify the current `.oh-share-it/binding.json` library when present.

## `/share-me query "..."`

Run `node cli/share-it.js query "<query>"`. Treat returned directories, documents, or chunks as suggestions; decide what to read from the synced library before answering.
