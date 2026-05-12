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

test("replaceDirAtomic rejects tempDir inside targetDir and preserves target contents", () => {
  const root = makeTempDir();
  const target = path.join(root, "public");
  ensureDir(target);
  writeFile(target, "old.txt", "old");

  let error;
  try {
    replaceDirAtomic(target, path.join(target, ".tmp"), next => {
      writeFile(next, "new.txt", "new");
    });
  } catch (caught) {
    error = caught;
  }

  assert.ok(error);
  assert.equal(fs.existsSync(path.join(target, "old.txt")), true);
  assert.equal(fs.readFileSync(path.join(target, "old.txt"), "utf8"), "old");
  assert.match(error.message, /inside target/);
  assert.equal(fs.existsSync(path.join(target, "new.txt")), false);
});

test("replaceDirAtomic preserves target and cleans tempDir when writer throws", () => {
  const root = makeTempDir();
  const target = path.join(root, "public");
  const temp = path.join(root, "next");
  ensureDir(target);
  writeFile(target, "old.txt", "old");

  assert.throws(() => {
    replaceDirAtomic(target, temp, next => {
      writeFile(next, "new.txt", "new");
      throw new Error("write failed");
    });
  }, /write failed/);

  assert.equal(fs.readFileSync(path.join(target, "old.txt"), "utf8"), "old");
  assert.equal(fs.existsSync(path.join(temp, "new.txt")), false);
});

test("sha256 returns stable hashes", () => {
  assert.equal(sha256("hello"), "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
});
