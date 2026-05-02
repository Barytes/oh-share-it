const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { makeTempDir } = require("./helpers/tmp");
const { createStore } = require("../server/lib/library-store");
const { sha256 } = require("../server/lib/fs-utils");
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

test("writeShare derives uploader and file integrity from server state", () => {
  const root = makeTempDir();
  const store = createStore({ dataDir: path.join(root, "data") });
  const owner = store.createLibrary({ name: "acme-product", owner: "alice" });
  const invite = store.createInvite({
    libraryName: "acme-product",
    actorToken: owner.token,
    role: "contributor"
  });
  const contributor = store.joinInvite({ token: invite.token, member: "bob" });
  const contents = Buffer.from("trusted bytes");

  writeShare({
    store,
    libraryName: "acme-product",
    actorToken: contributor.token,
    sharePackage: {
      shareName: "spoof-attempt",
      member: "mallory",
      createdAt: "2000-01-01T00:00:00.000Z",
      files: [
        {
          path: "README.md",
          hash: "fake-hash",
          size: 999999,
          contentBase64: contents.toString("base64")
        }
      ]
    }
  });

  const manifest = JSON.parse(fs.readFileSync(
    path.join(root, "data", "libraries", "acme-product", "shares", "spoof-attempt", "manifest.json"),
    "utf8"
  ));
  assert.equal(manifest.member, "bob");
  assert.notEqual(manifest.createdAt, "2000-01-01T00:00:00.000Z");
  assert.equal(manifest.entries[0].hash, sha256(contents));
  assert.equal(manifest.entries[0].size, contents.length);
  assert.equal(manifest.entries[0].updatedAt, manifest.createdAt);
});

test("reindexLibrary rebuilds missing share-level indexes and classified files", () => {
  const root = makeTempDir();
  const store = createStore({ dataDir: path.join(root, "data") });
  const owner = store.createLibrary({ name: "acme-product", owner: "alice" });
  writeShare({ store, libraryName: "acme-product", actorToken: owner.token, sharePackage: samplePackage() });

  const shareDir = path.join(root, "data", "libraries", "acme-product", "shares", "alice-api-notes");
  fs.rmSync(path.join(shareDir, "indexes"), { recursive: true, force: true });
  fs.rmSync(path.join(shareDir, "resources"), { recursive: true, force: true });
  fs.rmSync(path.join(shareDir, "skills"), { recursive: true, force: true });
  fs.rmSync(path.join(shareDir, "memories"), { recursive: true, force: true });

  reindexLibrary({ store, libraryName: "acme-product", actorToken: owner.token });

  assert.equal(fs.existsSync(path.join(shareDir, "indexes", "L0.md")), true);
  assert.equal(fs.existsSync(path.join(shareDir, "indexes", "L1.md")), true);
  assert.equal(fs.existsSync(path.join(shareDir, "indexes", "L2.json")), true);
  assert.equal(fs.existsSync(path.join(shareDir, "resources", "README.md")), true);
  assert.equal(fs.existsSync(path.join(shareDir, "skills", ".codex", "skills", "context", "SKILL.md")), true);
  assert.equal(fs.existsSync(path.join(shareDir, "memories", "notes", "2026-05-02-handoff.md")), true);
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

test("routeQuery returns empty document results when L2 is missing", () => {
  const root = makeTempDir();
  const store = createStore({ dataDir: path.join(root, "data") });
  const owner = store.createLibrary({ name: "acme-product", owner: "alice" });

  const result = routeQuery({
    store,
    libraryName: "acme-product",
    actorToken: owner.token,
    query: "agent skill context"
  });

  assert.deepEqual(result, {
    query: "agent skill context",
    mode: "documents",
    results: []
  });
});

test("routeQuery rejects unsupported modes", () => {
  const root = makeTempDir();
  const store = createStore({ dataDir: path.join(root, "data") });
  const owner = store.createLibrary({ name: "acme-product", owner: "alice" });
  writeShare({ store, libraryName: "acme-product", actorToken: owner.token, sharePackage: samplePackage() });
  reindexLibrary({ store, libraryName: "acme-product", actorToken: owner.token });

  assert.throws(
    () => routeQuery({
      store,
      libraryName: "acme-product",
      actorToken: owner.token,
      query: "agent skill context",
      mode: "bad"
    }),
    /Unsupported route mode/
  );
});

test("routeQuery returns directories without chunks in directory mode", () => {
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
    mode: "directories"
  });

  assert.equal(result.results[0].directory, "shares/alice-api-notes/memories/notes");
  assert.equal(Object.hasOwn(result.results[0], "chunk"), false);
});

test("routeQuery filters results by shareName", () => {
  const root = makeTempDir();
  const store = createStore({ dataDir: path.join(root, "data") });
  const owner = store.createLibrary({ name: "acme-product", owner: "alice" });
  writeShare({ store, libraryName: "acme-product", actorToken: owner.token, sharePackage: samplePackage() });
  writeShare({
    store,
    libraryName: "acme-product",
    actorToken: owner.token,
    sharePackage: {
      ...samplePackage(),
      shareName: "bob-api-notes",
      member: "bob"
    }
  });
  reindexLibrary({ store, libraryName: "acme-product", actorToken: owner.token });

  const result = routeQuery({
    store,
    libraryName: "acme-product",
    actorToken: owner.token,
    query: "skill context",
    shareName: "bob-api-notes"
  });

  assert.equal(result.results.length > 0, true);
  assert.equal(result.results.every(entry => entry.uri.includes("/shares/bob-api-notes/")), true);
});

test("routeQuery sorts equal-score results by URI", () => {
  const root = makeTempDir();
  const store = createStore({ dataDir: path.join(root, "data") });
  const owner = store.createLibrary({ name: "acme-product", owner: "alice" });
  for (const shareName of ["zeta-api-notes", "alpha-api-notes"]) {
    writeShare({
      store,
      libraryName: "acme-product",
      actorToken: owner.token,
      sharePackage: {
        ...samplePackage(),
        shareName
      }
    });
  }
  reindexLibrary({ store, libraryName: "acme-product", actorToken: owner.token });

  const l2Path = path.join(root, "data", "libraries", "acme-product", "indexes", "L2.json");
  const l2 = JSON.parse(fs.readFileSync(l2Path, "utf8"));
  l2.entries.sort((left, right) => right.uri.localeCompare(left.uri));
  fs.writeFileSync(l2Path, JSON.stringify(l2, null, 2));

  const result = routeQuery({
    store,
    libraryName: "acme-product",
    actorToken: owner.token,
    query: "project"
  });

  assert.deepEqual(
    result.results.map(entry => entry.uri),
    [
      "oh://library/acme-product/shares/alpha-api-notes/resources/README.md",
      "oh://library/acme-product/shares/zeta-api-notes/resources/README.md"
    ]
  );
});

test("routeQuery returns no results when query has no tokens", () => {
  const root = makeTempDir();
  const store = createStore({ dataDir: path.join(root, "data") });
  const owner = store.createLibrary({ name: "acme-product", owner: "alice" });
  writeShare({ store, libraryName: "acme-product", actorToken: owner.token, sharePackage: samplePackage() });
  reindexLibrary({ store, libraryName: "acme-product", actorToken: owner.token });

  const result = routeQuery({
    store,
    libraryName: "acme-product",
    actorToken: owner.token,
    query: " ..."
  });

  assert.deepEqual(result.results, []);
});
