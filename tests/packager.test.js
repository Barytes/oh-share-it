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

test("buildSharePackage excludes repository metadata with broad allow rules", () => {
  const root = makeTempDir();
  writeFile(root, "share-it.rules", "+ **");
  writeFile(root, ".git", "gitdir: /Users/alice/project/.git/worktrees/share-it-mvp");
  writeFile(root, ".oh-share-it/state.json", "{}");
  writeFile(root, "notes.txt", "hello");

  const pkg = buildSharePackage({ root, shareName: "safe-notes", member: "alice" });

  assert.deepEqual(pkg.files.map(file => file.path).sort(), ["notes.txt"]);
  assert.equal(pkg.files[0].hash, "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824");
  assert.equal(pkg.files[0].size, 5);

  const exactMetadataRoot = makeTempDir();
  writeFile(exactMetadataRoot, "share-it.rules", "+ **");
  writeFile(exactMetadataRoot, ".oh-share-it", "state");
  writeFile(exactMetadataRoot, "notes.txt", "hello");

  const exactMetadataPkg = buildSharePackage({
    root: exactMetadataRoot,
    shareName: "safe-notes",
    member: "alice"
  });

  assert.deepEqual(exactMetadataPkg.files.map(file => file.path).sort(), ["notes.txt"]);
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
