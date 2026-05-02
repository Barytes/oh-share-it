const test = require("node:test");
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { makeTempDir, writeFile, readJson } = require("./helpers/tmp");
const { createServer } = require("../server/index");

const CLI_PATH = path.join(__dirname, "..", "cli", "share-it.js");

function runCli(args, cwd, env = {}) {
  return new Promise((resolve, reject) => {
    const child = childProcess.spawn(process.execPath, [CLI_PATH, ...args], {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", chunk => {
      stdout += chunk;
    });
    child.stderr.on("data", chunk => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", status => {
      if (status !== 0) {
        reject(new Error(`CLI failed
ARGS: ${args.join(" ")}
STDOUT:
${stdout}
STDERR:
${stderr}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

function runCliSync(args, cwd, env = {}) {
  const result = childProcess.spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(`CLI failed
ARGS: ${args.join(" ")}
STDOUT:
${result.stdout}
STDERR:
${result.stderr}`);
  }
  return result.stdout.trim();
}

async function withServer(fn) {
  const root = makeTempDir();
  const server = createServer({ dataDir: path.join(root, "data") });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    await fn(`http://127.0.0.1:${server.address().port}`, root);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

test("CLI can create, bind, share, sync, read, list, and query", async () => {
  await withServer(async (baseUrl, root) => {
    const workdir = path.join(root, "work");
    writeFile(workdir, "share-it.rules", [
      "+ README.md",
      "+ docs/**",
      "- **/.env"
    ].join("\n"));
    writeFile(workdir, "README.md", "# Agent Skill Context\nUse shared indexes for project context.\n");
    writeFile(workdir, "docs/notes.md", "Agent skills need a clear public layer.\n");
    writeFile(workdir, "docs/.env", "SECRET=not-shared\n");
    const home = path.join(root, "home");

    const created = JSON.parse(await runCli(["library", "create", "acme-product", "--server", baseUrl, "--member", "alice"], workdir, { HOME: home }));
    const bound = JSON.parse(runCliSync(["bind", "--server", baseUrl, "--library", "acme-product"], workdir, { HOME: home }));
    const uploaded = JSON.parse(await runCli(["share", "--name", "alice-notes"], workdir, { HOME: home }));
    const synced = JSON.parse(await runCli(["sync"], workdir, { HOME: home }));
    const listed = JSON.parse(await runCli(["list"], workdir, { HOME: home }));
    const l0 = runCliSync(["read", "indexes/L0.md"], workdir, { HOME: home });
    const query = JSON.parse(await runCli(["query", "agent skill"], workdir, { HOME: home }));

    assert.equal(created.library, "acme-product");
    assert.equal(bound.syncPath, ".oh-share-it/public/acme-product");
    assert.equal(uploaded.shareName, "alice-notes");
    assert.equal(synced.library, "acme-product");
    assert.equal(fs.existsSync(path.join(workdir, ".oh-share-it", "public", "acme-product", "shares", "alice-notes", "raw", "README.md")), true);
    assert.deepEqual(listed.shares.map(share => share.name), ["alice-notes"]);
    assert.match(l0, /acme-product/);
    assert.equal(query.results.length > 0, true);

    const binding = readJson(path.join(workdir, ".oh-share-it", "binding.json"));
    const credentials = readJson(path.join(home, ".oh-share-it", "credentials.json"));
    assert.equal(binding.member, "alice");
    assert.equal(credentials.credentials.length, 1);
    assert.equal(credentials.credentials[0].token, created.token);
  });
});

test("CLI can create invites, join as another member, discover libraries, and read synced files", async () => {
  await withServer(async (baseUrl, root) => {
    const ownerWorkdir = path.join(root, "owner-work");
    const readerWorkdir = path.join(root, "reader-work");
    const ownerHome = path.join(root, "owner-home");
    const readerHome = path.join(root, "reader-home");

    writeFile(ownerWorkdir, "share-it.rules", "+ README.md\n");
    writeFile(ownerWorkdir, "README.md", "# Reader Visible Context\n");

    await runCli(["library", "create", "team-library", "--server", baseUrl, "--member", "alice"], ownerWorkdir, { HOME: ownerHome });
    runCliSync(["bind", "--server", baseUrl, "--library", "team-library"], ownerWorkdir, { HOME: ownerHome });
    await runCli(["share", "--name", "team-notes"], ownerWorkdir, { HOME: ownerHome });
    const invite = JSON.parse(await runCli(["invite", "create", "--role", "reader"], ownerWorkdir, { HOME: ownerHome }));

    fs.mkdirSync(readerWorkdir, { recursive: true });
    const joined = JSON.parse(await runCli(["join", "--invite", invite.token, "--server", baseUrl, "--member", "bob"], readerWorkdir, { HOME: readerHome }));
    const libraries = JSON.parse(await runCli(["libraries", "--server", baseUrl], readerWorkdir, { HOME: readerHome }));
    const synced = JSON.parse(await runCli(["sync"], readerWorkdir, { HOME: readerHome }));
    const readme = runCliSync(["read", "shares/team-notes/raw/README.md"], readerWorkdir, { HOME: readerHome });

    assert.equal(invite.library, "team-library");
    assert.equal(joined.member, "bob");
    assert.equal(joined.role, "reader");
    assert.deepEqual(libraries.libraries, [{ name: "team-library", role: "reader" }]);
    assert.equal(synced.library, "team-library");
    assert.match(readme, /Reader Visible Context/);
  });
});
