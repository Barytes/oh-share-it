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
  const shareIndexesDir = path.join(libraryDir, "shares", "alice-api-notes", "indexes");
  const shareL0Path = path.join(shareIndexesDir, "L0.md");
  const shareL1Path = path.join(shareIndexesDir, "L1.md");
  const shareL2Path = path.join(shareIndexesDir, "L2.json");
  assert.equal(fs.existsSync(shareL0Path), true);
  assert.equal(fs.existsSync(shareL1Path), true);
  assert.equal(fs.existsSync(shareL2Path), true);

  const shareL0 = fs.readFileSync(shareL0Path, "utf8");
  const shareL1 = fs.readFileSync(shareL1Path, "utf8");
  const shareL2 = JSON.parse(fs.readFileSync(shareL2Path, "utf8"));
  assert.match(shareL0, /alice-api-notes/);
  assert.match(shareL1, /oh:\/\/library\/acme-product\/shares\/alice-api-notes/);
  assert.equal(shareL2.entries.length, 3);
  assert.equal(shareL2.entries.some(entry => entry.type === "memory"), true);

  const libraryL0 = fs.readFileSync(path.join(libraryDir, "indexes", "L0.md"), "utf8");
  const libraryL2 = JSON.parse(fs.readFileSync(path.join(libraryDir, "indexes", "L2.json"), "utf8"));
  assert.match(libraryL0, /acme-product/);
  assert.match(libraryL0, /alice-api-notes/);
  assert.equal(libraryL2.entries.length, 3);
  assert.equal(libraryL2.entries.some(entry => entry.type === "skill"), true);
});

test("writeShare preserves existing share and library index when replacement has invalid path", () => {
  const root = makeTempDir();
  const store = createStore({ dataDir: path.join(root, "data") });
  const owner = store.createLibrary({ name: "acme-product", owner: "alice" });
  writeShare({ store, libraryName: "acme-product", actorToken: owner.token, sharePackage: samplePackage() });

  const libraryDir = path.join(root, "data", "libraries", "acme-product");
  const shareDir = path.join(libraryDir, "shares", "alice-api-notes");
  const manifestPath = path.join(shareDir, "manifest.json");
  const oldManifest = fs.readFileSync(manifestPath, "utf8");
  const invalidReplacement = {
    ...samplePackage(),
    files: [
      {
        path: "../escape.md",
        hash: "bad",
        size: 3,
        contentBase64: Buffer.from("bad").toString("base64")
      }
    ]
  };

  assert.throws(
    () => writeShare({
      store,
      libraryName: "acme-product",
      actorToken: owner.token,
      sharePackage: invalidReplacement
    }),
    /Invalid share file path/
  );

  assert.equal(fs.existsSync(path.join(shareDir, "raw", "README.md")), true);
  assert.equal(fs.readFileSync(manifestPath, "utf8"), oldManifest);

  const libraryL2 = JSON.parse(fs.readFileSync(path.join(libraryDir, "indexes", "L2.json"), "utf8"));
  const readmeEntry = libraryL2.entries.find(entry => entry.sourcePath === "README.md");
  assert.ok(readmeEntry);
  assert.equal(fs.existsSync(path.join(libraryDir, readmeEntry.rawPath)), true);
});

test("writeShare rejects ambiguous share file paths", () => {
  const root = makeTempDir();
  const store = createStore({ dataDir: path.join(root, "data") });
  const owner = store.createLibrary({ name: "acme-product", owner: "alice" });

  for (const [index, filePath] of ["a/../b.md", "./b.md", "", "a//b.md", "a\\.\\b.md", "a\\..\\b.md"].entries()) {
    assert.throws(
      () => writeShare({
        store,
        libraryName: "acme-product",
        actorToken: owner.token,
        sharePackage: {
          ...samplePackage(),
          shareName: `invalid-${index}`,
          files: [
            {
              path: filePath,
              hash: "bad",
              size: 3,
              contentBase64: Buffer.from("bad").toString("base64")
            }
          ]
        }
      }),
      /Invalid share file path/
    );
  }
});

test("writeShare rejects duplicate share file paths after normalization", () => {
  const root = makeTempDir();
  const store = createStore({ dataDir: path.join(root, "data") });
  const owner = store.createLibrary({ name: "acme-product", owner: "alice" });

  for (const [index, paths] of [
    ["docs/a.md", "docs\\a.md"],
    ["docs/a.md", "docs/a.md"],
    ["docs/A.md", "docs/a.md"]
  ].entries()) {
    assert.throws(
      () => writeShare({
        store,
        libraryName: "acme-product",
        actorToken: owner.token,
        sharePackage: {
          ...samplePackage(),
          shareName: `duplicate-${index}`,
          files: paths.map((filePath, fileIndex) => ({
            path: filePath,
            hash: `h${fileIndex}`,
            size: 3,
            contentBase64: Buffer.from(`dupe-${fileIndex}`).toString("base64")
          }))
        }
      }),
      /Duplicate share file path/
    );
  }
});

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
