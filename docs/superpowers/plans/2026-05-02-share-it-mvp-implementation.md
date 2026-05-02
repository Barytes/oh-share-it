# Share-It MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first runnable `oh-share-it` MVP with a Node server, vanilla client, CLI, and agent skill for library-scoped context sharing and syncing.

**Architecture:** The MVP is dependency-light and file-backed. Core domain behavior lives in small Node modules under `server/lib/`, the HTTP server exposes those modules through JSON endpoints, the CLI calls the same HTTP API and manages local binding/credentials, and the client is a static browser for authorized libraries. The default workflow is sync-and-browse; routing is an optional module that scores L0/L1/L2 text.

**Tech Stack:** Node.js built-in modules, Node's built-in `node:test` runner, vanilla HTML/CSS/JS, JSON files, Markdown indexes.

---

## File Structure

Create or modify these files:

- Create: `package.json`
  Defines `npm test`, `npm start`, and `npm run dev` scripts without external dependencies.
- Modify: `.gitignore`
  Ignores runtime data: `data/libraries/`, `.oh-share-it/`, and local credential fixtures.
- Create: `server/index.js`
  Starts the HTTP server, serves JSON API endpoints, and serves the static client.
- Create: `server/lib/fs-utils.js`
  Owns safe path handling, JSON reads/writes, hashing, recursive walking, and atomic directory replacement.
- Create: `server/lib/share-rules.js`
  Parses `share-it.rules` and evaluates explicit allow/deny patterns.
- Create: `server/lib/packager.js`
  Builds a share package from a working directory using parsed share rules.
- Create: `server/lib/auth.js`
  Defines roles, permissions, token generation, credential parsing, and request authorization helpers.
- Create: `server/lib/library-store.js`
  Owns filesystem-backed libraries, members, invites, shares, manifests, snapshots, and audit records.
- Create: `server/lib/classifier.js`
  Classifies uploaded files as `resource`, `memory`, or `skill` and assigns deterministic tags.
- Create: `server/lib/indexer.js`
  Generates share-level and library-level L0/L1 Markdown indexes and L2 JSON manifests.
- Create: `server/lib/router.js`
  Provides optional deterministic query routing over library indexes and file previews.
- Create: `server/lib/http-utils.js`
  Provides request parsing, JSON responses, error responses, and static file serving helpers.
- Create: `cli/share-it.js`
  Provides `library create`, `invite create`, `join`, `bind`, `libraries`, `share`, `sync`, `list`, `read`, and `query` commands.
- Create: `client/index.html`
  Provides the local library browser shell.
- Create: `client/app.js`
  Loads libraries, shares, indexes, members, and routing results from the server.
- Create: `client/styles.css`
  Styles the browser UI with dense, operational layout.
- Create: `skills/oh-share-it/SKILL.md`
  Documents `/share-it`, `/share-me`, `/share-me join`, `/share-me libraries`, and `/share-me query`.
- Create: `tests/helpers/tmp.js`
  Creates isolated temporary directories and test fixtures.
- Create: `tests/share-rules.test.js`
  Tests share rule parsing and deny-wins behavior.
- Create: `tests/packager.test.js`
  Tests local file packaging.
- Create: `tests/auth-store.test.js`
  Tests library creation, invites, joining, removal, and permission checks.
- Create: `tests/indexer-router.test.js`
  Tests classification, L0/L1/L2 generation, and optional routing modes.
- Create: `tests/server-api.test.js`
  Tests the HTTP API end to end.
- Create: `tests/cli.test.js`
  Tests CLI flows against a local server process.
- Create: `tests/client-smoke.test.js`
  Tests that the client assets contain the expected application shell and API wiring.

## Implementation Tasks

### Task 1: Project Harness

**Files:**
- Create: `package.json`
- Modify: `.gitignore`
- Create: `tests/helpers/tmp.js`

- [ ] **Step 1: Add package scripts**

Create `package.json`:

```json
{
  "name": "oh-share-it",
  "version": "0.1.0",
  "private": true,
  "type": "commonjs",
  "scripts": {
    "start": "node server/index.js",
    "dev": "node server/index.js",
    "test": "node --test"
  },
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 2: Ignore runtime data**

Modify `.gitignore` so it contains:

```gitignore
.DS_Store
data/libraries/
.oh-share-it/
tmp/
```

- [ ] **Step 3: Add test temp helpers**

Create `tests/helpers/tmp.js`:

```js
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function makeTempDir(prefix = "oh-share-it-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFile(root, relativePath, contents) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
  return target;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

module.exports = { makeTempDir, writeFile, readJson };
```

- [ ] **Step 4: Run test harness**

Run: `npm test`

Expected: PASS with zero tests or a successful empty test run.

- [ ] **Step 5: Commit**

```bash
git add package.json .gitignore tests/helpers/tmp.js
git commit -m "chore: add node test harness"
```

### Task 2: Filesystem Utilities

**Files:**
- Create: `server/lib/fs-utils.js`
- Create: `tests/fs-utils.test.js`

- [ ] **Step 1: Write filesystem utility tests**

Create `tests/fs-utils.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { makeTempDir, writeFile, readJson } = require("./helpers/tmp");
const {
  ensureDir,
  readJsonFile,
  writeJsonFile,
  safeJoin,
  sha256,
  walkFiles,
  replaceDirAtomic
} = require("../server/lib/fs-utils");

test("safeJoin rejects path traversal", () => {
  const root = makeTempDir();
  assert.throws(() => safeJoin(root, "../secret.txt"), /outside root/);
});

test("safeJoin accepts nested relative paths", () => {
  const root = makeTempDir();
  assert.equal(safeJoin(root, "a/b.txt"), path.join(root, "a/b.txt"));
});

test("writeJsonFile and readJsonFile round trip data", () => {
  const root = makeTempDir();
  const file = path.join(root, "state", "x.json");
  writeJsonFile(file, { ok: true });
  assert.deepEqual(readJsonFile(file), { ok: true });
  assert.deepEqual(readJson(file), { ok: true });
});

test("walkFiles returns normalized relative paths", () => {
  const root = makeTempDir();
  writeFile(root, "docs/a.md", "A");
  writeFile(root, "src/b.js", "B");
  assert.deepEqual(walkFiles(root).sort(), ["docs/a.md", "src/b.js"]);
});

test("replaceDirAtomic replaces a directory after complete write", () => {
  const root = makeTempDir();
  const target = path.join(root, "public");
  ensureDir(target);
  writeFile(target, "old.txt", "old");
  replaceDirAtomic(target, path.join(root, "next"), next => {
    writeFile(next, "new.txt", "new");
  });
  assert.equal(fs.existsSync(path.join(target, "old.txt")), false);
  assert.equal(fs.readFileSync(path.join(target, "new.txt"), "utf8"), "new");
});

test("sha256 returns stable hashes", () => {
  assert.equal(sha256("hello"), "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
});
```

- [ ] **Step 2: Run the failing tests**

Run: `node --test tests/fs-utils.test.js`

Expected: FAIL with `Cannot find module '../server/lib/fs-utils'`.

- [ ] **Step 3: Implement filesystem utilities**

Create `server/lib/fs-utils.js`:

```js
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function normalizeRelativePath(relativePath) {
  return String(relativePath).replaceAll("\\", "/").replace(/^\/+/, "");
}

function safeJoin(root, relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  const target = path.resolve(root, normalized);
  const resolvedRoot = path.resolve(root);
  if (target !== resolvedRoot && !target.startsWith(resolvedRoot + path.sep)) {
    throw new Error(`Path escapes outside root: ${relativePath}`);
  }
  return target;
}

function readJsonFile(filePath, fallback = undefined) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonFile(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function walkFiles(root) {
  const output = [];
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      if (entry.isFile()) output.push(path.relative(root, fullPath).replaceAll("\\", "/"));
    }
  }
  if (fs.existsSync(root)) visit(root);
  return output;
}

function removeDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

function replaceDirAtomic(targetDir, tempDir, writer) {
  removeDir(tempDir);
  ensureDir(tempDir);
  writer(tempDir);
  removeDir(targetDir);
  fs.renameSync(tempDir, targetDir);
}

module.exports = {
  ensureDir,
  normalizeRelativePath,
  readJsonFile,
  removeDir,
  replaceDirAtomic,
  safeJoin,
  sha256,
  walkFiles,
  writeJsonFile
};
```

- [ ] **Step 4: Run filesystem tests**

Run: `node --test tests/fs-utils.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/fs-utils.js tests/fs-utils.test.js
git commit -m "feat: add filesystem utilities"
```

### Task 3: Share Rules Parser

**Files:**
- Create: `server/lib/share-rules.js`
- Create: `tests/share-rules.test.js`

- [ ] **Step 1: Write share rules tests**

Create `tests/share-rules.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseShareRules, isAllowedByShareRules } = require("../server/lib/share-rules");

test("parseShareRules supports comments, allow, and deny", () => {
  const rules = parseShareRules(`
# comment
+ README.md
+ docs/**
- **/.env
- **/*.log
`);
  assert.deepEqual(rules.allow, ["README.md", "docs/**"]);
  assert.deepEqual(rules.deny, ["**/.env", "**/*.log"]);
});

test("explicit allow is required", () => {
  const rules = parseShareRules("+ docs/**");
  assert.equal(isAllowedByShareRules("src/index.js", rules), false);
});

test("allow pattern matches nested files", () => {
  const rules = parseShareRules("+ docs/**");
  assert.equal(isAllowedByShareRules("docs/decisions/a.md", rules), true);
});

test("deny wins over allow", () => {
  const rules = parseShareRules(`
+ docs/**
- **/*.log
`);
  assert.equal(isAllowedByShareRules("docs/debug.log", rules), false);
});

test("bare filename pattern matches only that normalized relative path", () => {
  const rules = parseShareRules("+ README.md");
  assert.equal(isAllowedByShareRules("README.md", rules), true);
  assert.equal(isAllowedByShareRules("docs/README.md", rules), false);
});
```

- [ ] **Step 2: Run failing tests**

Run: `node --test tests/share-rules.test.js`

Expected: FAIL with `Cannot find module '../server/lib/share-rules'`.

- [ ] **Step 3: Implement share rules parser**

Create `server/lib/share-rules.js`:

```js
const { normalizeRelativePath } = require("./fs-utils");

function parseShareRules(contents) {
  const allow = [];
  const deny = [];
  for (const rawLine of String(contents).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const prefix = line[0];
    const pattern = line.slice(1).trim();
    if (!pattern) continue;
    if (prefix === "+") allow.push(pattern);
    if (prefix === "-") deny.push(pattern);
  }
  return { allow, deny };
}

function escapeRegex(value) {
  return value.replace(/[.+^${}()|[\]\\]/g, "\\$&");
}

function patternToRegex(pattern) {
  const normalized = normalizeRelativePath(pattern);
  let source = "";
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];
    if (char === "*" && next === "*") {
      const after = normalized[index + 2];
      if (after === "/") {
        source += "(?:.*/)?";
        index += 2;
      } else {
        source += ".*";
        index += 1;
      }
    } else if (char === "*") {
      source += "[^/]*";
    } else {
      source += escapeRegex(char);
    }
  }
  return new RegExp(`^${source}$`);
}

function matchesAny(relativePath, patterns) {
  const normalized = normalizeRelativePath(relativePath);
  return patterns.some(pattern => patternToRegex(pattern).test(normalized));
}

function isAllowedByShareRules(relativePath, rules) {
  if (!matchesAny(relativePath, rules.allow)) return false;
  if (matchesAny(relativePath, rules.deny)) return false;
  return true;
}

module.exports = { isAllowedByShareRules, parseShareRules, patternToRegex };
```

- [ ] **Step 4: Run share rules tests**

Run: `node --test tests/share-rules.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/share-rules.js tests/share-rules.test.js
git commit -m "feat: parse share rules"
```

### Task 4: Packager

**Files:**
- Create: `server/lib/packager.js`
- Create: `tests/packager.test.js`

- [ ] **Step 1: Write packager tests**

Create `tests/packager.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeTempDir, writeFile } = require("./helpers/tmp");
const { buildSharePackage } = require("../server/lib/packager");

test("buildSharePackage includes allowed files and excludes denied files", () => {
  const root = makeTempDir();
  writeFile(root, "share-it.rules", `
+ README.md
+ docs/**
- **/*.log
`);
  writeFile(root, "README.md", "# Project");
  writeFile(root, "docs/a.md", "Doc");
  writeFile(root, "docs/debug.log", "Log");
  writeFile(root, "src/index.js", "Code");

  const pkg = buildSharePackage({ root, shareName: "alice-notes", member: "alice" });

  assert.equal(pkg.shareName, "alice-notes");
  assert.deepEqual(pkg.files.map(file => file.path).sort(), ["README.md", "docs/a.md"]);
  assert.equal(pkg.files[0].contentBase64.length > 0, true);
});

test("buildSharePackage stops when rules file is missing", () => {
  const root = makeTempDir();
  assert.throws(
    () => buildSharePackage({ root, shareName: "missing", member: "alice" }),
    /Missing share-it.rules/
  );
});

test("buildSharePackage stops when no files match", () => {
  const root = makeTempDir();
  writeFile(root, "share-it.rules", "+ docs/**");
  writeFile(root, "README.md", "# Project");
  assert.throws(
    () => buildSharePackage({ root, shareName: "empty", member: "alice" }),
    /No files matched/
  );
});
```

- [ ] **Step 2: Run failing tests**

Run: `node --test tests/packager.test.js`

Expected: FAIL with `Cannot find module '../server/lib/packager'`.

- [ ] **Step 3: Implement packager**

Create `server/lib/packager.js`:

```js
const fs = require("node:fs");
const path = require("node:path");
const { parseShareRules, isAllowedByShareRules } = require("./share-rules");
const { sha256, walkFiles } = require("./fs-utils");

function buildSharePackage({ root, shareName, member }) {
  const rulesPath = path.join(root, "share-it.rules");
  if (!fs.existsSync(rulesPath)) {
    throw new Error("Missing share-it.rules");
  }

  const rules = parseShareRules(fs.readFileSync(rulesPath, "utf8"));
  const files = walkFiles(root)
    .filter(relativePath => relativePath !== "share-it.rules")
    .filter(relativePath => !relativePath.startsWith(".git/"))
    .filter(relativePath => !relativePath.startsWith(".oh-share-it/"))
    .filter(relativePath => isAllowedByShareRules(relativePath, rules))
    .map(relativePath => {
      const absolutePath = path.join(root, relativePath);
      const buffer = fs.readFileSync(absolutePath);
      return {
        path: relativePath,
        hash: sha256(buffer),
        size: buffer.length,
        contentBase64: buffer.toString("base64")
      };
    });

  if (files.length === 0) {
    throw new Error("No files matched share-it.rules");
  }

  return {
    shareName,
    member,
    createdAt: new Date().toISOString(),
    files
  };
}

module.exports = { buildSharePackage };
```

- [ ] **Step 4: Run packager tests**

Run: `node --test tests/packager.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/packager.js tests/packager.test.js
git commit -m "feat: build share packages"
```

### Task 5: Auth and Library Store

**Files:**
- Create: `server/lib/auth.js`
- Create: `server/lib/library-store.js`
- Create: `tests/auth-store.test.js`

- [ ] **Step 1: Write auth/store tests**

Create `tests/auth-store.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { makeTempDir } = require("./helpers/tmp");
const { createStore } = require("../server/lib/library-store");

test("library owner can create an invite and invited user can join", () => {
  const root = makeTempDir();
  const store = createStore({ dataDir: path.join(root, "data") });
  const ownerCredential = store.createLibrary({ name: "acme-product", owner: "alice" });
  const invite = store.createInvite({
    libraryName: "acme-product",
    actorToken: ownerCredential.token,
    role: "contributor"
  });
  const joined = store.joinInvite({ token: invite.token, member: "bob" });

  assert.equal(joined.library, "acme-product");
  assert.equal(joined.member, "bob");
  assert.equal(store.getMemberRole("acme-product", joined.token), "contributor");
});

test("reader cannot upload shares", () => {
  const root = makeTempDir();
  const store = createStore({ dataDir: path.join(root, "data") });
  const ownerCredential = store.createLibrary({ name: "acme-product", owner: "alice" });
  const invite = store.createInvite({
    libraryName: "acme-product",
    actorToken: ownerCredential.token,
    role: "reader"
  });
  const reader = store.joinInvite({ token: invite.token, member: "bob" });
  assert.throws(
    () => store.assertPermission("acme-product", reader.token, "upload"),
    /Permission denied/
  );
});

test("removed member loses access", () => {
  const root = makeTempDir();
  const store = createStore({ dataDir: path.join(root, "data") });
  const ownerCredential = store.createLibrary({ name: "acme-product", owner: "alice" });
  const invite = store.createInvite({
    libraryName: "acme-product",
    actorToken: ownerCredential.token,
    role: "reader"
  });
  const reader = store.joinInvite({ token: invite.token, member: "bob" });
  store.removeMember({
    libraryName: "acme-product",
    actorToken: ownerCredential.token,
    member: "bob"
  });

  assert.equal(store.getMemberRole("acme-product", reader.token), null);
  assert.equal(fs.existsSync(path.join(root, "data", "libraries", "acme-product", "audit.log")), true);
});
```

- [ ] **Step 2: Run failing tests**

Run: `node --test tests/auth-store.test.js`

Expected: FAIL with `Cannot find module '../server/lib/library-store'`.

- [ ] **Step 3: Implement auth helpers**

Create `server/lib/auth.js`:

```js
const crypto = require("node:crypto");

const ROLE_PERMISSIONS = {
  owner: ["delete", "members", "invite", "upload", "sync", "reindex", "route", "read"],
  admin: ["members", "invite", "upload", "sync", "reindex", "route", "read"],
  contributor: ["upload", "sync", "route", "read"],
  reader: ["sync", "route", "read"]
};

function createToken(prefix) {
  return `${prefix}_${crypto.randomBytes(18).toString("hex")}`;
}

function can(role, permission) {
  return Boolean(ROLE_PERMISSIONS[role] && ROLE_PERMISSIONS[role].includes(permission));
}

function parseBearerToken(headers) {
  const value = headers.authorization || headers.Authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(value);
  return match ? match[1] : null;
}

module.exports = { ROLE_PERMISSIONS, can, createToken, parseBearerToken };
```

- [ ] **Step 4: Implement library store**

Create `server/lib/library-store.js` with these exported functions:

```js
const fs = require("node:fs");
const path = require("node:path");
const { can, createToken } = require("./auth");
const { ensureDir, readJsonFile, safeJoin, writeJsonFile } = require("./fs-utils");

function createStore({ dataDir }) {
  const librariesDir = path.join(dataDir, "libraries");
  ensureDir(librariesDir);

  function libraryDir(name) {
    return safeJoin(librariesDir, name);
  }

  function membersPath(name) {
    return path.join(libraryDir(name), "members.json");
  }

  function invitesPath(name) {
    return path.join(libraryDir(name), "invites.json");
  }

  function audit(name, event) {
    const line = JSON.stringify({ at: new Date().toISOString(), ...event }) + "\n";
    fs.appendFileSync(path.join(libraryDir(name), "audit.log"), line);
  }

  function readMembers(name) {
    return readJsonFile(membersPath(name), { members: [] });
  }

  function writeMembers(name, value) {
    writeJsonFile(membersPath(name), value);
  }

  function readInvites(name) {
    return readJsonFile(invitesPath(name), { invites: [] });
  }

  function writeInvites(name, value) {
    writeJsonFile(invitesPath(name), value);
  }

  function findMemberByToken(name, token) {
    return readMembers(name).members.find(member => member.token === token) || null;
  }

  function getMemberRole(name, token) {
    const member = findMemberByToken(name, token);
    return member ? member.role : null;
  }

  function assertPermission(name, token, permission) {
    const member = findMemberByToken(name, token);
    if (!member || !can(member.role, permission)) {
      throw new Error(`Permission denied for ${permission}`);
    }
    return member;
  }

  function createLibrary({ name, owner }) {
    const dir = libraryDir(name);
    ensureDir(path.join(dir, "shares"));
    ensureDir(path.join(dir, "indexes"));
    writeJsonFile(path.join(dir, "library.json"), {
      name,
      description: "",
      createdAt: new Date().toISOString()
    });
    const credential = { library: name, member: owner, role: "owner", token: createToken("osi_member") };
    writeMembers(name, { members: [credential] });
    writeInvites(name, { invites: [] });
    audit(name, { type: "library.created", actor: owner });
    return credential;
  }

  function createInvite({ libraryName, actorToken, role }) {
    const actor = assertPermission(libraryName, actorToken, "invite");
    const state = readInvites(libraryName);
    const invite = {
      token: createToken("osi_invite"),
      library: libraryName,
      role,
      createdBy: actor.member,
      createdAt: new Date().toISOString(),
      revoked: false
    };
    state.invites.push(invite);
    writeInvites(libraryName, state);
    audit(libraryName, { type: "invite.created", actor: actor.member, role });
    return invite;
  }

  function joinInvite({ token, member }) {
    const libraries = fs.readdirSync(librariesDir, { withFileTypes: true }).filter(entry => entry.isDirectory());
    for (const entry of libraries) {
      const state = readInvites(entry.name);
      const invite = state.invites.find(candidate => candidate.token === token);
      if (invite && !invite.revoked) {
        const credential = {
          library: invite.library,
          member,
          role: invite.role,
          token: createToken("osi_member")
        };
        const members = readMembers(invite.library);
        members.members = members.members.filter(existing => existing.member !== member);
        members.members.push(credential);
        writeMembers(invite.library, members);
        audit(invite.library, { type: "member.joined", actor: member, role: invite.role });
        return credential;
      }
    }
    throw new Error("Invite is invalid or revoked");
  }

  function removeMember({ libraryName, actorToken, member }) {
    const actor = assertPermission(libraryName, actorToken, "members");
    const state = readMembers(libraryName);
    state.members = state.members.filter(existing => existing.member !== member);
    writeMembers(libraryName, state);
    audit(libraryName, { type: "member.removed", actor: actor.member, member });
  }

  return {
    assertPermission,
    createInvite,
    createLibrary,
    getMemberRole,
    joinInvite,
    libraryDir,
    removeMember
  };
}

module.exports = { createStore };
```

- [ ] **Step 5: Run auth/store tests**

Run: `node --test tests/auth-store.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/lib/auth.js server/lib/library-store.js tests/auth-store.test.js
git commit -m "feat: add library permissions"
```

### Task 6: Classification and Indexing

**Files:**
- Create: `server/lib/classifier.js`
- Create: `server/lib/indexer.js`
- Create: `tests/indexer-router.test.js`

- [ ] **Step 1: Write classification and index tests**

Create the first half of `tests/indexer-router.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { makeTempDir } = require("./helpers/tmp");
const { createStore } = require("../server/lib/library-store");
const { writeShare, reindexLibrary } = require("../server/lib/indexer");

function samplePackage() {
  return {
    shareName: "alice-api-notes",
    member: "alice",
    createdAt: "2026-05-02T00:00:00.000Z",
    files: [
      {
        path: "README.md",
        hash: "h1",
        size: 9,
        contentBase64: Buffer.from("# Project").toString("base64")
      },
      {
        path: ".codex/skills/context/SKILL.md",
        hash: "h2",
        size: 19,
        contentBase64: Buffer.from("# Skill\nUse context").toString("base64")
      },
      {
        path: "notes/2026-05-02-handoff.md",
        hash: "h3",
        size: 18,
        contentBase64: Buffer.from("handoff background").toString("base64")
      }
    ]
  };
}

test("writeShare stores raw files and generated classified entries", () => {
  const root = makeTempDir();
  const store = createStore({ dataDir: path.join(root, "data") });
  const owner = store.createLibrary({ name: "acme-product", owner: "alice" });
  writeShare({ store, libraryName: "acme-product", actorToken: owner.token, sharePackage: samplePackage() });

  const base = path.join(root, "data", "libraries", "acme-product", "shares", "alice-api-notes");
  assert.equal(fs.existsSync(path.join(base, "raw", "README.md")), true);
  assert.equal(fs.existsSync(path.join(base, "resources", "README.md")), true);
  assert.equal(fs.existsSync(path.join(base, "skills", ".codex", "skills", "context", "SKILL.md")), true);
  assert.equal(fs.existsSync(path.join(base, "memories", "notes", "2026-05-02-handoff.md")), true);
});

test("reindexLibrary writes share-level and library-level indexes", () => {
  const root = makeTempDir();
  const store = createStore({ dataDir: path.join(root, "data") });
  const owner = store.createLibrary({ name: "acme-product", owner: "alice" });
  writeShare({ store, libraryName: "acme-product", actorToken: owner.token, sharePackage: samplePackage() });
  reindexLibrary({ store, libraryName: "acme-product", actorToken: owner.token });

  const libraryDir = path.join(root, "data", "libraries", "acme-product");
  const l0 = fs.readFileSync(path.join(libraryDir, "indexes", "L0.md"), "utf8");
  const l2 = JSON.parse(fs.readFileSync(path.join(libraryDir, "indexes", "L2.json"), "utf8"));
  assert.match(l0, /acme-product/);
  assert.match(l0, /alice-api-notes/);
  assert.equal(l2.entries.length, 3);
  assert.equal(l2.entries.some(entry => entry.type === "skill"), true);
});
```

- [ ] **Step 2: Run failing tests**

Run: `node --test tests/indexer-router.test.js`

Expected: FAIL with `Cannot find module '../server/lib/indexer'`.

- [ ] **Step 3: Implement classifier**

Create `server/lib/classifier.js`:

```js
function classifyPath(relativePath) {
  const lower = relativePath.toLowerCase();
  const tags = [];

  if (lower.endsWith("skill.md") || lower.includes("/skills/") || lower.includes("runbook")) {
    tags.push("agent", "workflow");
    return { type: "skill", tags };
  }

  if (
    lower.includes("handoff") ||
    lower.includes("retro") ||
    lower.includes("retrospective") ||
    lower.includes("meeting") ||
    lower.includes("notes/") ||
    /\d{4}-\d{2}-\d{2}/.test(lower)
  ) {
    tags.push("history");
    return { type: "memory", tags };
  }

  if (lower.includes("decision") || lower.includes("adr")) tags.push("decision");
  if (lower.includes("architecture") || lower.includes("architectue")) tags.push("architecture");
  if (lower.includes("reference")) tags.push("reference");
  return { type: "resource", tags };
}

module.exports = { classifyPath };
```

- [ ] **Step 4: Implement indexer**

Create `server/lib/indexer.js` with exports `writeShare` and `reindexLibrary`. The implementation must:

```js
const fs = require("node:fs");
const path = require("node:path");
const { classifyPath } = require("./classifier");
const { ensureDir, safeJoin, walkFiles, writeJsonFile } = require("./fs-utils");

function previewText(contents) {
  return contents.replace(/\s+/g, " ").trim().slice(0, 180);
}

function classifiedDirFor(type) {
  if (type === "skill") return "skills";
  if (type === "memory") return "memories";
  return "resources";
}

function writeShare({ store, libraryName, actorToken, sharePackage }) {
  store.assertPermission(libraryName, actorToken, "upload");
  const libraryDir = store.libraryDir(libraryName);
  const shareDir = path.join(libraryDir, "shares", sharePackage.shareName);
  fs.rmSync(shareDir, { recursive: true, force: true });
  ensureDir(shareDir);

  const entries = [];
  for (const file of sharePackage.files) {
    const decoded = Buffer.from(file.contentBase64, "base64");
    const rawPath = safeJoin(path.join(shareDir, "raw"), file.path);
    ensureDir(path.dirname(rawPath));
    fs.writeFileSync(rawPath, decoded);

    const classification = classifyPath(file.path);
    const classifiedRoot = path.join(shareDir, classifiedDirFor(classification.type));
    const classifiedPath = safeJoin(classifiedRoot, file.path);
    ensureDir(path.dirname(classifiedPath));
    fs.writeFileSync(classifiedPath, decoded);

    entries.push({
      uri: `oh://library/${libraryName}/shares/${sharePackage.shareName}/${classifiedDirFor(classification.type)}/${file.path}`,
      shareName: sharePackage.shareName,
      sourcePath: file.path,
      rawPath: `shares/${sharePackage.shareName}/raw/${file.path}`,
      classifiedPath: `shares/${sharePackage.shareName}/${classifiedDirFor(classification.type)}/${file.path}`,
      type: classification.type,
      tags: classification.tags,
      hash: file.hash,
      size: file.size,
      updatedAt: sharePackage.createdAt,
      preview: previewText(decoded.toString("utf8"))
    });
  }

  writeJsonFile(path.join(shareDir, "manifest.json"), {
    shareName: sharePackage.shareName,
    member: sharePackage.member,
    createdAt: sharePackage.createdAt,
    entries
  });
  writeIndexes({
    baseDir: shareDir,
    title: sharePackage.shareName,
    entries
  });
  writeLibraryIndexes({ libraryName, libraryDir });
  return { shareName: sharePackage.shareName, entries };
}

function writeIndexes({ baseDir, title, entries }) {
  ensureDir(path.join(baseDir, "indexes"));
  fs.writeFileSync(path.join(baseDir, "indexes", "L0.md"), [
    `# ${title}`,
    "",
    `Shares indexed: ${new Set(entries.map(entry => entry.shareName)).size}`,
    `Resources: ${entries.filter(entry => entry.type === "resource").length}`,
    `Memories: ${entries.filter(entry => entry.type === "memory").length}`,
    `Skills: ${entries.filter(entry => entry.type === "skill").length}`,
    "",
    "## Recommended Next Reads",
    ...entries.slice(0, 10).map(entry => `- ${entry.uri}`)
  ].join("\n") + "\n");

  fs.writeFileSync(path.join(baseDir, "indexes", "L1.md"), [
    `# ${title} Overview`,
    "",
    ...["resource", "memory", "skill"].map(type => {
      const rows = entries.filter(entry => entry.type === type);
      return [`## ${type}`, ...rows.map(entry => `- ${entry.uri} - ${entry.preview}`)].join("\n");
    })
  ].join("\n\n") + "\n");

  writeJsonFile(path.join(baseDir, "indexes", "L2.json"), { entries });
}

function readShareEntries(libraryDir) {
  const sharesDir = path.join(libraryDir, "shares");
  return walkFiles(sharesDir)
    .filter(relativePath => relativePath.endsWith("manifest.json"))
    .flatMap(relativePath => {
      const manifest = JSON.parse(fs.readFileSync(path.join(sharesDir, relativePath), "utf8"));
      return manifest.entries;
    });
}

function writeLibraryIndexes({ libraryName, libraryDir }) {
  const entries = readShareEntries(libraryDir);
  writeIndexes({ baseDir: libraryDir, title: libraryName, entries });
}

function reindexLibrary({ store, libraryName, actorToken }) {
  store.assertPermission(libraryName, actorToken, "reindex");
  writeLibraryIndexes({ libraryName, libraryDir: store.libraryDir(libraryName) });
}

module.exports = { reindexLibrary, writeShare, writeLibraryIndexes };
```

- [ ] **Step 5: Run index tests**

Run: `node --test tests/indexer-router.test.js`

Expected: PASS for the two index tests.

- [ ] **Step 6: Commit**

```bash
git add server/lib/classifier.js server/lib/indexer.js tests/indexer-router.test.js
git commit -m "feat: index shared context"
```

### Task 7: Optional Router

**Files:**
- Modify: `server/lib/router.js`
- Modify: `tests/indexer-router.test.js`

- [ ] **Step 1: Add router tests**

Append to `tests/indexer-router.test.js`:

```js
const { routeQuery } = require("../server/lib/router");

test("routeQuery returns document results from L2 entries", () => {
  const root = makeTempDir();
  const store = createStore({ dataDir: path.join(root, "data") });
  const owner = store.createLibrary({ name: "acme-product", owner: "alice" });
  writeShare({ store, libraryName: "acme-product", actorToken: owner.token, sharePackage: samplePackage() });
  reindexLibrary({ store, libraryName: "acme-product", actorToken: owner.token });

  const result = routeQuery({
    store,
    libraryName: "acme-product",
    actorToken: owner.token,
    query: "agent skill context",
    mode: "documents"
  });

  assert.equal(result.mode, "documents");
  assert.equal(result.results[0].type, "skill");
  assert.match(result.results[0].why, /Matched/);
});

test("routeQuery supports chunk mode", () => {
  const root = makeTempDir();
  const store = createStore({ dataDir: path.join(root, "data") });
  const owner = store.createLibrary({ name: "acme-product", owner: "alice" });
  writeShare({ store, libraryName: "acme-product", actorToken: owner.token, sharePackage: samplePackage() });
  reindexLibrary({ store, libraryName: "acme-product", actorToken: owner.token });

  const result = routeQuery({
    store,
    libraryName: "acme-product",
    actorToken: owner.token,
    query: "handoff background",
    mode: "chunks"
  });

  assert.equal(result.results[0].chunk.includes("handoff"), true);
});
```

- [ ] **Step 2: Run failing router tests**

Run: `node --test tests/indexer-router.test.js`

Expected: FAIL with `Cannot find module '../server/lib/router'`.

- [ ] **Step 3: Implement router**

Create `server/lib/router.js`:

```js
const fs = require("node:fs");
const path = require("node:path");

function tokenize(value) {
  return String(value).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function scoreEntry(entry, queryTokens) {
  const haystack = tokenize([
    entry.uri,
    entry.sourcePath,
    entry.type,
    ...(entry.tags || []),
    entry.preview
  ].join(" "));
  return queryTokens.reduce((score, token) => score + haystack.filter(item => item.includes(token)).length, 0);
}

function routeQuery({ store, libraryName, actorToken, query, mode = "documents", shareName = null }) {
  store.assertPermission(libraryName, actorToken, "route");
  const libraryDir = store.libraryDir(libraryName);
  const l2Path = path.join(libraryDir, "indexes", "L2.json");
  const l2 = JSON.parse(fs.readFileSync(l2Path, "utf8"));
  const queryTokens = tokenize(query);
  const scored = l2.entries
    .filter(entry => !shareName || entry.shareName === shareName)
    .map(entry => ({ entry, score: scoreEntry(entry, queryTokens) }))
    .filter(row => row.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 10);

  const results = scored.map(({ entry, score }) => {
    const base = {
      uri: entry.uri,
      path: `${libraryName}/${entry.classifiedPath}`,
      type: entry.type,
      score,
      why: `Matched ${queryTokens.join(", ")} against path, type, tags, or preview.`
    };
    if (mode === "directories") {
      return { ...base, directory: path.dirname(entry.classifiedPath) };
    }
    if (mode === "chunks") {
      return { ...base, chunk: entry.preview };
    }
    return base;
  });

  return { query, mode, results };
}

module.exports = { routeQuery, tokenize };
```

- [ ] **Step 4: Run router tests**

Run: `node --test tests/indexer-router.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/router.js tests/indexer-router.test.js
git commit -m "feat: add optional routing"
```

### Task 8: HTTP Server API

**Files:**
- Create: `server/lib/http-utils.js`
- Create: `server/index.js`
- Create: `tests/server-api.test.js`

- [ ] **Step 1: Write server API tests**

Create `tests/server-api.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeTempDir } = require("./helpers/tmp");
const { createServer } = require("../server/index");

async function withServer(fn) {
  const root = makeTempDir();
  const server = createServer({ dataDir: `${root}/data`, port: 0 });
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test("server exposes health and library lifecycle", async () => {
  await withServer(async baseUrl => {
    const health = await fetch(`${baseUrl}/api/health`).then(response => response.json());
    assert.equal(health.ok, true);

    const created = await fetch(`${baseUrl}/api/libraries`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "acme-product", owner: "alice" })
    }).then(response => response.json());
    assert.equal(created.library, "acme-product");

    const listed = await fetch(`${baseUrl}/api/libraries`, {
      headers: { authorization: `Bearer ${created.token}` }
    }).then(response => response.json());
    assert.deepEqual(listed.libraries.map(library => library.name), ["acme-product"]);
  });
});

test("server upload, sync, and route flow works", async () => {
  await withServer(async baseUrl => {
    const created = await fetch(`${baseUrl}/api/libraries`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "acme-product", owner: "alice" })
    }).then(response => response.json());

    const sharePackage = {
      shareName: "alice-notes",
      member: "alice",
      createdAt: "2026-05-02T00:00:00.000Z",
      files: [
        {
          path: "README.md",
          hash: "h1",
          size: 9,
          contentBase64: Buffer.from("# Project").toString("base64")
        }
      ]
    };

    const uploaded = await fetch(`${baseUrl}/api/libraries/acme-product/shares`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${created.token}`
      },
      body: JSON.stringify(sharePackage)
    }).then(response => response.json());
    assert.equal(uploaded.shareName, "alice-notes");

    const sync = await fetch(`${baseUrl}/api/libraries/acme-product/sync`, {
      headers: { authorization: `Bearer ${created.token}` }
    }).then(response => response.json());
    assert.equal(sync.files.some(file => file.path === "indexes/L0.md"), true);

    const routed = await fetch(`${baseUrl}/api/route`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${created.token}`
      },
      body: JSON.stringify({ library: "acme-product", query: "project", mode: "documents" })
    }).then(response => response.json());
    assert.equal(routed.results.length, 1);
  });
});
```

- [ ] **Step 2: Run failing server tests**

Run: `node --test tests/server-api.test.js`

Expected: FAIL with missing server exports.

- [ ] **Step 3: Implement HTTP utilities**

Create `server/lib/http-utils.js` with:

```js
const fs = require("node:fs");
const path = require("node:path");

async function readJsonRequest(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString("utf8");
  return body ? JSON.parse(body) : {};
}

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

function sendError(response, statusCode, error) {
  sendJson(response, statusCode, { error: error.message || String(error) });
}

function serveStatic(response, filePath, contentType) {
  response.writeHead(200, { "content-type": contentType });
  response.end(fs.readFileSync(filePath));
}

function staticContentType(filePath) {
  if (filePath.endsWith(".js")) return "text/javascript";
  if (filePath.endsWith(".css")) return "text/css";
  if (filePath.endsWith(".html")) return "text/html";
  return "text/plain";
}

module.exports = { readJsonRequest, sendError, sendJson, serveStatic, staticContentType };
```

- [ ] **Step 4: Implement server**

Create `server/index.js` with a `createServer({ dataDir, port })` export and CLI start behavior. The server must:

```js
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { parseBearerToken } = require("./lib/auth");
const { createStore } = require("./lib/library-store");
const { writeShare, reindexLibrary } = require("./lib/indexer");
const { routeQuery } = require("./lib/router");
const { readJsonRequest, sendError, sendJson, serveStatic, staticContentType } = require("./lib/http-utils");
const { safeJoin, walkFiles } = require("./lib/fs-utils");

function snapshotLibrary(store, libraryName, token) {
  store.assertPermission(libraryName, token, "sync");
  const dir = store.libraryDir(libraryName);
  const files = walkFiles(dir)
    .filter(relativePath => !["members.json", "invites.json", "audit.log"].includes(relativePath))
    .map(relativePath => ({
      path: relativePath,
      contentBase64: fs.readFileSync(path.join(dir, relativePath)).toString("base64")
    }));
  return { library: libraryName, files };
}

function createServer({ dataDir = path.join(process.cwd(), "data"), clientDir = path.join(process.cwd(), "client") } = {}) {
  const store = createStore({ dataDir });
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");
      const token = parseBearerToken(request.headers);

      if (request.method === "GET" && url.pathname === "/api/health") {
        return sendJson(response, 200, { ok: true });
      }

      if (request.method === "POST" && url.pathname === "/api/libraries") {
        const body = await readJsonRequest(request);
        return sendJson(response, 200, store.createLibrary({ name: body.name, owner: body.owner }));
      }

      if (request.method === "GET" && url.pathname === "/api/libraries") {
        const libraries = fs.readdirSync(path.join(dataDir, "libraries"), { withFileTypes: true })
          .filter(entry => entry.isDirectory())
          .filter(entry => store.getMemberRole(entry.name, token))
          .map(entry => ({ name: entry.name, role: store.getMemberRole(entry.name, token) }));
        return sendJson(response, 200, { libraries });
      }

      const inviteMatch = /^\/api\/invites\/([^/]+)\/join$/.exec(url.pathname);
      if (request.method === "POST" && inviteMatch) {
        const body = await readJsonRequest(request);
        return sendJson(response, 200, store.joinInvite({ token: inviteMatch[1], member: body.member }));
      }

      const libraryMatch = /^\/api\/libraries\/([^/]+)(?:\/(.+))?$/.exec(url.pathname);
      if (libraryMatch) {
        const libraryName = libraryMatch[1];
        const rest = libraryMatch[2] || "";

        if (request.method === "GET" && rest === "") {
          const role = store.getMemberRole(libraryName, token);
          if (!role) throw new Error("Permission denied for read");
          return sendJson(response, 200, { name: libraryName, role });
        }

        if (request.method === "DELETE" && rest.startsWith("members/")) {
          const member = decodeURIComponent(rest.slice("members/".length));
          store.removeMember({ libraryName, actorToken: token, member });
          return sendJson(response, 200, { ok: true });
        }

        if (request.method === "POST" && rest === "invites") {
          const body = await readJsonRequest(request);
          return sendJson(response, 200, store.createInvite({ libraryName, actorToken: token, role: body.role }));
        }

        if (request.method === "GET" && rest === "shares") {
          store.assertPermission(libraryName, token, "read");
          const sharesDir = path.join(store.libraryDir(libraryName), "shares");
          const shares = fs.existsSync(sharesDir)
            ? fs.readdirSync(sharesDir, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => ({ name: entry.name }))
            : [];
          return sendJson(response, 200, { shares });
        }

        if (request.method === "GET" && rest.startsWith("shares/")) {
          store.assertPermission(libraryName, token, "read");
          const shareName = decodeURIComponent(rest.slice("shares/".length));
          const manifestPath = path.join(store.libraryDir(libraryName), "shares", shareName, "manifest.json");
          return sendJson(response, 200, JSON.parse(fs.readFileSync(manifestPath, "utf8")));
        }

        if (request.method === "GET" && rest === "file") {
          store.assertPermission(libraryName, token, "read");
          const requestedPath = url.searchParams.get("path");
          const filePath = safeJoin(store.libraryDir(libraryName), requestedPath);
          return sendJson(response, 200, {
            path: requestedPath,
            contentBase64: fs.readFileSync(filePath).toString("base64")
          });
        }

        if (request.method === "POST" && rest === "shares") {
          const body = await readJsonRequest(request);
          const result = writeShare({ store, libraryName, actorToken: token, sharePackage: body });
          return sendJson(response, 200, result);
        }

        if (request.method === "GET" && rest === "sync") {
          return sendJson(response, 200, snapshotLibrary(store, libraryName, token));
        }

        if (request.method === "POST" && rest === "reindex") {
          reindexLibrary({ store, libraryName, actorToken: token });
          return sendJson(response, 200, { ok: true });
        }
      }

      if (request.method === "POST" && url.pathname === "/api/route") {
        const body = await readJsonRequest(request);
        return sendJson(response, 200, routeQuery({
          store,
          libraryName: body.library,
          actorToken: token,
          query: body.query,
          mode: body.mode,
          shareName: body.shareName
        }));
      }

      const staticPath = url.pathname === "/" ? "/index.html" : url.pathname;
      const filePath = path.join(clientDir, staticPath);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        return serveStatic(response, filePath, staticContentType(filePath));
      }

      return sendJson(response, 404, { error: "Not found" });
    } catch (error) {
      return sendError(response, /Permission denied|Unauthorized/.test(error.message) ? 403 : 400, error);
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 4317);
  createServer().listen(port, () => {
    console.log(`oh-share-it server listening on http://localhost:${port}`);
  });
}

module.exports = { createServer };
```

- [ ] **Step 5: Run server tests**

Run: `node --test tests/server-api.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/index.js server/lib/http-utils.js tests/server-api.test.js
git commit -m "feat: expose share-it http api"
```

### Task 9: CLI

**Files:**
- Create: `cli/share-it.js`
- Create: `tests/cli.test.js`

- [ ] **Step 1: Write CLI tests**

Create `tests/cli.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const path = require("node:path");
const { makeTempDir, writeFile } = require("./helpers/tmp");
const { createServer } = require("../server/index");

function runCli(args, cwd, env = {}) {
  const result = childProcess.spawnSync(process.execPath, [path.join(__dirname, "..", "cli", "share-it.js"), ...args], {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(`CLI failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
  return result.stdout.trim();
}

async function withServer(fn) {
  const root = makeTempDir();
  const server = createServer({ dataDir: path.join(root, "data") });
  await new Promise(resolve => server.listen(0, resolve));
  try {
    await fn(`http://127.0.0.1:${server.address().port}`, root);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test("CLI can create, bind, share, sync, and query", async () => {
  await withServer(async (baseUrl, root) => {
    const workdir = path.join(root, "work");
    writeFile(workdir, "share-it.rules", "+ README.md");
    writeFile(workdir, "README.md", "# Agent Skill Context");
    const home = path.join(root, "home");

    const created = JSON.parse(runCli(["library", "create", "acme-product", "--server", baseUrl, "--member", "alice"], workdir, { HOME: home }));
    runCli(["bind", "--server", baseUrl, "--library", "acme-product"], workdir, { HOME: home });
    runCli(["share", "--name", "alice-notes"], workdir, { HOME: home });
    runCli(["sync"], workdir, { HOME: home });
    const query = JSON.parse(runCli(["query", "agent skill"], workdir, { HOME: home }));

    assert.equal(created.library, "acme-product");
    assert.equal(query.results.length > 0, true);
  });
});
```

- [ ] **Step 2: Run failing CLI tests**

Run: `node --test tests/cli.test.js`

Expected: FAIL with missing CLI file.

- [ ] **Step 3: Implement CLI**

Create `cli/share-it.js` as an executable CommonJS script. It must include:

```js
#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { buildSharePackage } = require("../server/lib/packager");
const { ensureDir, readJsonFile, replaceDirAtomic, safeJoin, writeJsonFile } = require("../server/lib/fs-utils");

function homeDir() {
  return process.env.HOME || process.env.USERPROFILE;
}

function credentialPath() {
  return path.join(homeDir(), ".oh-share-it", "credentials.json");
}

function bindingPath(cwd = process.cwd()) {
  return path.join(cwd, ".oh-share-it", "binding.json");
}

function readCredentials() {
  return readJsonFile(credentialPath(), { credentials: [] });
}

function saveCredential(credential) {
  const state = readCredentials();
  state.credentials = state.credentials.filter(existing => !(existing.server === credential.server && existing.library === credential.library && existing.member === credential.member));
  state.credentials.push(credential);
  writeJsonFile(credentialPath(), state);
}

function readBinding() {
  const binding = readJsonFile(bindingPath(), null);
  if (!binding) throw new Error("Missing .oh-share-it/binding.json. Run bind or join first.");
  return binding;
}

function credentialFor(binding) {
  const state = readCredentials();
  const credential = state.credentials.find(item => item.server === binding.server && item.library === binding.library);
  if (!credential) throw new Error("Missing credential for bound server/library.");
  return credential;
}

async function requestJson(url, { method = "GET", token = null, body = null } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || `HTTP ${response.status}`);
  return json;
}

async function main(argv) {
  const [command, subcommand, ...rest] = argv;
  if (command === "library" && subcommand === "create") {
    const name = rest[0];
    const server = rest[rest.indexOf("--server") + 1];
    const member = rest[rest.indexOf("--member") + 1];
    const created = await requestJson(`${server}/api/libraries`, { method: "POST", body: { name, owner: member } });
    saveCredential({ server, library: created.library, member: created.member, token: created.token });
    console.log(JSON.stringify(created));
    return;
  }

  if (command === "bind") {
    const server = rest[rest.indexOf("--server") + 1];
    const library = rest[rest.indexOf("--library") + 1];
    writeJsonFile(bindingPath(), {
      server,
      library,
      member: "",
      syncPath: `.oh-share-it/public/${library}`
    });
    console.log(JSON.stringify({ server, library }));
    return;
  }

  if (command === "share") {
    const binding = readBinding();
    const credential = credentialFor(binding);
    const shareName = rest[rest.indexOf("--name") + 1];
    const pkg = buildSharePackage({ root: process.cwd(), shareName, member: credential.member });
    const uploaded = await requestJson(`${binding.server}/api/libraries/${binding.library}/shares`, {
      method: "POST",
      token: credential.token,
      body: pkg
    });
    console.log(JSON.stringify(uploaded));
    return;
  }

  if (command === "sync") {
    const binding = readBinding();
    const credential = credentialFor(binding);
    const snapshot = await requestJson(`${binding.server}/api/libraries/${binding.library}/sync`, { token: credential.token });
    const target = path.join(process.cwd(), binding.syncPath);
    replaceDirAtomic(target, `${target}.tmp`, tempDir => {
      for (const file of snapshot.files) {
        const out = safeJoin(tempDir, file.path);
        ensureDir(path.dirname(out));
        fs.writeFileSync(out, Buffer.from(file.contentBase64, "base64"));
      }
    });
    console.log(JSON.stringify({ synced: snapshot.files.length, library: binding.library }));
    return;
  }

  if (command === "query") {
    const binding = readBinding();
    const credential = credentialFor(binding);
    const query = [subcommand, ...rest].filter(Boolean).join(" ");
    const routed = await requestJson(`${binding.server}/api/route`, {
      method: "POST",
      token: credential.token,
      body: { library: binding.library, query, mode: "documents" }
    });
    console.log(JSON.stringify(routed));
    return;
  }

  throw new Error(`Unknown command: ${argv.join(" ")}`);
}

if (require.main === module) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Add invite, join, list, and read CLI branches**

Insert these branches in `main(argv)` before the final unknown-command error:

```js
if (command === "invite" && subcommand === "create") {
  const binding = readBinding();
  const credential = credentialFor(binding);
  const role = rest[rest.indexOf("--role") + 1];
  const invite = await requestJson(`${binding.server}/api/libraries/${binding.library}/invites`, {
    method: "POST",
    token: credential.token,
    body: { role }
  });
  console.log(JSON.stringify(invite));
  return;
}

if (command === "join") {
  const inviteToken = rest[rest.indexOf("--invite") + 1] || subcommand;
  const server = rest[rest.indexOf("--server") + 1];
  const member = rest[rest.indexOf("--member") + 1];
  const joined = await requestJson(`${server}/api/invites/${inviteToken}/join`, {
    method: "POST",
    body: { member }
  });
  saveCredential({ server, library: joined.library, member: joined.member, token: joined.token });
  writeJsonFile(bindingPath(), {
    server,
    library: joined.library,
    member: joined.member,
    syncPath: `.oh-share-it/public/${joined.library}`
  });
  console.log(JSON.stringify(joined));
  return;
}

if (command === "libraries") {
  const server = rest[rest.indexOf("--server") + 1];
  const state = readCredentials();
  const credential = state.credentials.find(item => item.server === server) || state.credentials[0];
  const listed = await requestJson(`${credential.server}/api/libraries`, { token: credential.token });
  console.log(JSON.stringify(listed));
  return;
}

if (command === "list") {
  const binding = readBinding();
  const credential = credentialFor(binding);
  const listed = await requestJson(`${binding.server}/api/libraries/${binding.library}/shares`, {
    token: credential.token
  });
  console.log(JSON.stringify(listed));
  return;
}

if (command === "read") {
  const binding = readBinding();
  const requested = [subcommand, ...rest].filter(Boolean).join(" ");
  const syncRoot = path.join(process.cwd(), binding.syncPath);
  const localPath = requested.startsWith("oh://")
    ? requested.split(`/shares/`)[1]
    : requested;
  const target = safeJoin(syncRoot, localPath);
  console.log(fs.readFileSync(target, "utf8"));
  return;
}
```

The `read` branch must always resolve paths through `safeJoin(syncRoot, localPath)`.

- [ ] **Step 5: Run CLI tests**

Run: `node --test tests/cli.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add cli/share-it.js tests/cli.test.js
git commit -m "feat: add share-it cli"
```

### Task 10: Client

**Files:**
- Create: `client/index.html`
- Create: `client/app.js`
- Create: `client/styles.css`
- Create: `tests/client-smoke.test.js`

- [ ] **Step 1: Write client smoke test**

Create `tests/client-smoke.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("client shell references app assets and library UI", () => {
  const html = fs.readFileSync("client/index.html", "utf8");
  assert.match(html, /Oh Share It/);
  assert.match(html, /app.js/);
  assert.match(html, /styles.css/);
});

test("client app calls library endpoints", () => {
  const app = fs.readFileSync("client/app.js", "utf8");
  assert.match(app, /\/api\/libraries/);
  assert.match(app, /\/api\/route/);
});
```

- [ ] **Step 2: Run failing client test**

Run: `node --test tests/client-smoke.test.js`

Expected: FAIL because client files do not exist.

- [ ] **Step 3: Create client HTML**

Create `client/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Oh Share It</title>
    <link rel="stylesheet" href="/styles.css">
  </head>
  <body>
    <main class="shell">
      <aside class="sidebar">
        <div class="brand">Oh Share It</div>
        <button id="refresh">Refresh</button>
        <div id="libraries" class="list"></div>
      </aside>
      <section class="content">
        <header class="toolbar">
          <input id="token" aria-label="Bearer token">
          <input id="query" aria-label="Query synced context">
          <button id="route">Route</button>
        </header>
        <section id="detail" class="detail"></section>
      </section>
    </main>
    <script src="/app.js"></script>
  </body>
</html>
```

- [ ] **Step 4: Create client app**

Create `client/app.js`:

```js
const state = { token: "", selectedLibrary: null };

function authHeaders() {
  return state.token ? { authorization: `Bearer ${state.token}` } : {};
}

async function getJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), ...authHeaders() }
  });
  return response.json();
}

function renderLibraries(libraries) {
  const root = document.querySelector("#libraries");
  root.innerHTML = "";
  for (const library of libraries) {
    const button = document.createElement("button");
    button.textContent = `${library.name} · ${library.role}`;
    button.onclick = () => {
      state.selectedLibrary = library.name;
      renderLibrary(library.name);
    };
    root.appendChild(button);
  }
}

async function renderLibrary(name) {
  const detail = document.querySelector("#detail");
  const sync = await getJson(`/api/libraries/${name}/sync`);
  const l0 = sync.files.find(file => file.path === "indexes/L0.md");
  detail.innerHTML = `<h1>${name}</h1><pre>${atob(l0.contentBase64)}</pre>`;
}

async function refresh() {
  state.token = document.querySelector("#token").value.trim();
  const data = await getJson("/api/libraries");
  renderLibraries(data.libraries || []);
}

async function route() {
  const query = document.querySelector("#query").value.trim();
  const detail = document.querySelector("#detail");
  const data = await getJson("/api/route", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ library: state.selectedLibrary, query, mode: "documents" })
  });
  detail.innerHTML = `<h1>Route Results</h1><pre>${JSON.stringify(data, null, 2)}</pre>`;
}

document.querySelector("#refresh").addEventListener("click", refresh);
document.querySelector("#route").addEventListener("click", route);
```

- [ ] **Step 5: Create client styles**

Create `client/styles.css`:

```css
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #171717;
  background: #f5f7f8;
}

.shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 280px 1fr;
}

.sidebar {
  border-right: 1px solid #d8dee4;
  background: #ffffff;
  padding: 16px;
}

.brand {
  font-weight: 700;
  margin-bottom: 16px;
}

.toolbar {
  display: grid;
  grid-template-columns: minmax(180px, 320px) 1fr auto;
  gap: 8px;
  padding: 12px;
  border-bottom: 1px solid #d8dee4;
  background: #ffffff;
}

button,
input {
  min-height: 34px;
  border: 1px solid #ccd3da;
  border-radius: 6px;
  background: #ffffff;
  padding: 0 10px;
}

button {
  cursor: pointer;
}

.list {
  display: grid;
  gap: 6px;
}

.list button {
  text-align: left;
}

.detail {
  padding: 16px;
}

pre {
  overflow: auto;
  padding: 12px;
  background: #ffffff;
  border: 1px solid #d8dee4;
  border-radius: 6px;
}
```

- [ ] **Step 6: Run client test**

Run: `node --test tests/client-smoke.test.js`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add client/index.html client/app.js client/styles.css tests/client-smoke.test.js
git commit -m "feat: add library browser client"
```

### Task 11: Agent Skill

**Files:**
- Create: `skills/oh-share-it/SKILL.md`
- Create: `tests/skill-doc.test.js`

- [ ] **Step 1: Write skill doc test**

Create `tests/skill-doc.test.js`:

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("oh-share-it skill documents slash commands and default workflow", () => {
  const skill = fs.readFileSync("skills/oh-share-it/SKILL.md", "utf8");
  assert.match(skill, /\/share-it/);
  assert.match(skill, /\/share-me/);
  assert.match(skill, /share-it\.rules/);
  assert.match(skill, /\.oh-share-it\/binding\.json/);
  assert.match(skill, /sync and browse/i);
});
```

- [ ] **Step 2: Run failing skill test**

Run: `node --test tests/skill-doc.test.js`

Expected: FAIL because the skill file does not exist.

- [ ] **Step 3: Create skill**

Create `skills/oh-share-it/SKILL.md`:

```markdown
---
name: oh-share-it
description: Use when the user asks to share local context, join a context library, sync shared context, or query oh-share-it from a coding agent.
---

# Oh Share It

Use this skill for `/share-it`, `/share-me`, `/share-me join`, `/share-me libraries`, and `/share-me query`.

## Default Model

The default workflow is sync and browse. Routing is optional.

Read `.oh-share-it/binding.json` to learn the active server and library. Credentials live outside the repository in `~/.oh-share-it/credentials.json`.

## `/share-it`

1. Read `share-it.rules`.
2. Tell the user which library is bound in `.oh-share-it/binding.json`.
3. Run `node cli/share-it.js share --name alice-api-notes`.
4. Report the target library, share name, and upload count.

## `/share-me`

1. Run `node cli/share-it.js sync`.
2. Read `.oh-share-it/public/acme-product/indexes/L0.md` after replacing `acme-product` with the bound library from `.oh-share-it/binding.json`.
3. Follow L1 and L2 references as needed.
4. Use the synced library as external context; do not treat routing as required.

## `/share-me join <invite-token>`

Run `node cli/share-it.js join --invite osi_invite_example --server http://localhost:4317 --member alice` after replacing the example invite, server, and member with the user's values.

## `/share-me libraries`

Run `node cli/share-it.js libraries` and explain which libraries the current credential can access.

## `/share-me query "..."`

Run `node cli/share-it.js query "..."`. Use returned directories, documents, or chunks as suggestions. The agent still decides what to read.
```

- [ ] **Step 4: Run skill test**

Run: `node --test tests/skill-doc.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add skills/oh-share-it/SKILL.md tests/skill-doc.test.js
git commit -m "feat: document oh-share-it skill"
```

### Task 12: End-to-End Verification

**Files:**
- Modify: no source files unless verification exposes a concrete failure.

- [ ] **Step 1: Run full tests**

Run: `npm test`

Expected: PASS for all tests.

- [ ] **Step 2: Run server smoke test**

Run:

```bash
PORT=4317 npm start
```

Expected: the process prints `oh-share-it server listening on http://localhost:4317`.

Stop the server with `Ctrl-C` after confirming the message.

- [ ] **Step 3: Run CLI smoke flow manually**

In a temporary directory, run:

```bash
mkdir -p /tmp/oh-share-it-smoke
cd /tmp/oh-share-it-smoke
printf '+ README.md\n' > share-it.rules
printf '# Smoke Context\n' > README.md
node /Users/beiyanliu/Desktop/oh-share-it/cli/share-it.js library create smoke --server http://localhost:4317 --member alice
node /Users/beiyanliu/Desktop/oh-share-it/cli/share-it.js bind --server http://localhost:4317 --library smoke
node /Users/beiyanliu/Desktop/oh-share-it/cli/share-it.js share --name alice-smoke
node /Users/beiyanliu/Desktop/oh-share-it/cli/share-it.js sync
node /Users/beiyanliu/Desktop/oh-share-it/cli/share-it.js query smoke
```

Expected:

- `.oh-share-it/binding.json` exists.
- `.oh-share-it/public/smoke/indexes/L0.md` exists.
- query output contains at least one result.

- [ ] **Step 4: Review generated runtime data**

Run:

```bash
find data/libraries -maxdepth 4 -type f | sort | head -40
```

Expected: files appear under `data/libraries/smoke/` with `library.json`, `members.json`, `indexes/L0.md`, and `shares/alice-smoke/manifest.json`.

- [ ] **Step 5: Commit verification fixes**

If Step 1 through Step 4 exposed a concrete failure and you fixed it, commit only those fixes:

```bash
git add package.json .gitignore server client cli skills tests
git commit -m "fix: stabilize share-it mvp verification"
```

If no fixes were required, do not create an empty commit.

## Spec Coverage Checklist

- Share rules: Task 3 and Task 4.
- Multiple libraries: Task 5 and Task 8.
- Invite-based joining: Task 5, Task 8, and Task 9.
- Member removal and access denial: Task 5 and Task 8.
- Workdir binding: Task 9 and Task 11.
- User-level credentials: Task 9.
- Server filesystem library storage: Task 5, Task 6, and Task 8.
- Resource/Memory/Skill classification: Task 6.
- L0/L1/L2 indexes: Task 6.
- Sync-and-browse default workflow: Task 9 and Task 11.
- Optional routing: Task 7, Task 8, and Task 9.
- Client library browser: Task 10.
- End-to-end verification: Task 12.
