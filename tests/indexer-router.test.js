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
