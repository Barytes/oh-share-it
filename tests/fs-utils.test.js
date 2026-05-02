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
