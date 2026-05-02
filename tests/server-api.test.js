const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { makeTempDir } = require("./helpers/tmp");
const { createServer, isSensitiveLibraryPath, isSyncableLibraryPath } = require("../server/index");

async function withServer(fn) {
  const root = makeTempDir();
  const server = createServer({ dataDir: `${root}/data`, port: 0 });
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  try {
    await fn(`http://127.0.0.1:${port}`, root);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  const json = await response.json();
  return { response, json };
}

async function createLibrary(baseUrl) {
  const { json } = await requestJson(`${baseUrl}/api/libraries`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "acme-product", owner: "alice" })
  });
  return json;
}

async function createReader(baseUrl, ownerToken) {
  const { json: invite } = await requestJson(`${baseUrl}/api/libraries/acme-product/invites`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ownerToken}`
    },
    body: JSON.stringify({ role: "reader" })
  });
  const { json: reader } = await requestJson(`${baseUrl}/api/invites/${invite.token}/join`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ member: "bob" })
  });
  return reader;
}

async function uploadSampleShare(baseUrl, token) {
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

  const { json } = await requestJson(`${baseUrl}/api/libraries/acme-product/shares`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`
    },
    body: JSON.stringify(sharePackage)
  });
  return json;
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
    const created = await createLibrary(baseUrl);
    const uploaded = await uploadSampleShare(baseUrl, created.token);
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

test("server rejects direct reads of library metadata files", async () => {
  await withServer(async baseUrl => {
    const created = await createLibrary(baseUrl);
    const reader = await createReader(baseUrl, created.token);

    for (const token of [created.token, reader.token]) {
      for (const sensitivePath of ["members.json", "invites.json", "audit.log"]) {
        const { response, json } = await requestJson(
          `${baseUrl}/api/libraries/acme-product/file?path=${encodeURIComponent(sensitivePath)}`,
          { headers: { authorization: `Bearer ${token}` } }
        );

        assert.notEqual(response.status, 200);
        assert.equal(typeof json.error, "string");
        assert.equal(Object.hasOwn(json, "contentBase64"), false);
      }
    }
  });
});

test("server allows direct reads of generated index files", async () => {
  await withServer(async baseUrl => {
    const created = await createLibrary(baseUrl);
    await uploadSampleShare(baseUrl, created.token);

    const { response, json } = await requestJson(
      `${baseUrl}/api/libraries/acme-product/file?path=${encodeURIComponent("indexes/L0.md")}`,
      { headers: { authorization: `Bearer ${created.token}` } }
    );

    assert.equal(response.status, 200);
    assert.equal(json.path, "indexes/L0.md");
    assert.match(Buffer.from(json.contentBase64, "base64").toString("utf8"), /acme-product/);
  });
});

test("server sync excludes sensitive library paths", async () => {
  await withServer(async (baseUrl, root) => {
    const created = await createLibrary(baseUrl);
    await uploadSampleShare(baseUrl, created.token);

    const libraryDir = path.join(root, "data", "libraries", "acme-product");
    fs.mkdirSync(path.join(libraryDir, ".internal"), { recursive: true });
    fs.mkdirSync(path.join(libraryDir, "secrets"), { recursive: true });
    fs.writeFileSync(path.join(libraryDir, ".internal", "state.json"), "{}");
    fs.writeFileSync(path.join(libraryDir, "secrets", "token.txt"), "secret");

    const { json } = await requestJson(`${baseUrl}/api/libraries/acme-product/sync`, {
      headers: { authorization: `Bearer ${created.token}` }
    });
    const paths = json.files.map(file => file.path);

    for (const sensitivePath of ["members.json", "invites.json", "audit.log"]) {
      assert.equal(paths.includes(sensitivePath), false);
    }
    assert.equal(paths.some(filePath => filePath.startsWith(".internal/")), false);
    assert.equal(paths.some(filePath => filePath.startsWith("secrets/")), false);
  });
});

test("library path sensitivity helpers reject metadata roots and nested sensitive paths", () => {
  for (const sensitivePath of [
    "members.json",
    "invites.json",
    "audit.log",
    "members.json/history",
    "invites.json/archive",
    "audit.log/old",
    ".internal/state.json",
    "secrets/token.txt"
  ]) {
    assert.equal(isSensitiveLibraryPath(sensitivePath), true);
    assert.equal(isSyncableLibraryPath(sensitivePath), false);
  }

  for (const publicPath of ["indexes/L0.md", "shares/alice-notes/manifest.json"]) {
    assert.equal(isSensitiveLibraryPath(publicPath), false);
    assert.equal(isSyncableLibraryPath(publicPath), true);
  }
});

test("owner can list sanitized library members", async () => {
  await withServer(async baseUrl => {
    const created = await createLibrary(baseUrl);
    await createReader(baseUrl, created.token);

    const { response, json } = await requestJson(`${baseUrl}/api/libraries/acme-product/members`, {
      headers: { authorization: `Bearer ${created.token}` }
    });

    assert.equal(response.status, 200);
    assert.deepEqual(
      json.members.map(member => ({ member: member.member, role: member.role, library: member.library })),
      [
        { member: "alice", role: "owner", library: "acme-product" },
        { member: "bob", role: "reader", library: "acme-product" }
      ]
    );
    assert.equal(json.members.some(member => Object.hasOwn(member, "token")), false);
  });
});

test("reader cannot list library members", async () => {
  await withServer(async baseUrl => {
    const created = await createLibrary(baseUrl);
    const reader = await createReader(baseUrl, created.token);

    const { response, json } = await requestJson(`${baseUrl}/api/libraries/acme-product/members`, {
      headers: { authorization: `Bearer ${reader.token}` }
    });

    assert.equal(response.status, 403);
    assert.equal(typeof json.error, "string");
  });
});
