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

test("server accepts share uploads larger than the generic JSON limit", async () => {
  await withServer(async baseUrl => {
    const created = await createLibrary(baseUrl);
    const largeContents = Buffer.alloc(1024 * 1024 + 16, "x");
    const { response, json } = await requestJson(`${baseUrl}/api/libraries/acme-product/shares`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${created.token}`
      },
      body: JSON.stringify({
        shareName: "large-context",
        member: "spoofed",
        createdAt: "2000-01-01T00:00:00.000Z",
        files: [
          {
            path: "large.md",
            hash: "fake",
            size: 1,
            contentBase64: largeContents.toString("base64")
          }
        ]
      })
    });

    assert.equal(response.status, 200);
    assert.equal(json.entries.length, 1);
    assert.equal(json.entries[0].size, largeContents.length);
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

test("server rejects dot-segment aliases to library metadata files", async () => {
  await withServer(async baseUrl => {
    const created = await createLibrary(baseUrl);
    const reader = await createReader(baseUrl, created.token);
    await uploadSampleShare(baseUrl, created.token);

    const publicFile = await requestJson(
      `${baseUrl}/api/libraries/acme-product/file?path=${encodeURIComponent("indexes/L0.md")}`,
      { headers: { authorization: `Bearer ${reader.token}` } }
    );
    assert.equal(publicFile.response.status, 200);
    assert.equal(typeof publicFile.json.contentBase64, "string");

    for (const aliasPath of ["x/../members.json", "shares/foo/../../invites.json"]) {
      const { response, json } = await requestJson(
        `${baseUrl}/api/libraries/acme-product/file?path=${encodeURIComponent(aliasPath)}`,
        { headers: { authorization: `Bearer ${reader.token}` } }
      );

      assert.notEqual(response.status, 200);
      assert.equal(typeof json.error, "string");
      assert.equal(Object.hasOwn(json, "contentBase64"), false);
    }
  });
});

test("server returns library metadata with generated index metadata", async () => {
  await withServer(async baseUrl => {
    const created = await createLibrary(baseUrl);
    await uploadSampleShare(baseUrl, created.token);

    const { response, json } = await requestJson(`${baseUrl}/api/libraries/acme-product`, {
      headers: { authorization: `Bearer ${created.token}` }
    });

    assert.equal(response.status, 200);
    assert.equal(json.name, "acme-product");
    assert.equal(json.description, "");
    assert.equal(typeof json.createdAt, "string");
    assert.equal(json.role, "owner");
    assert.deepEqual(
      json.indexes.map(index => index.path).sort(),
      ["indexes/L0.md", "indexes/L1.md", "indexes/L2.json"]
    );
    assert.equal(json.indexes.every(index => typeof index.size === "number" && index.size > 0), true);
    assert.equal(json.indexes.some(index => Object.hasOwn(index, "contentBase64")), false);
  });
});

test("server lists shares with manifest summary data", async () => {
  await withServer(async baseUrl => {
    const created = await createLibrary(baseUrl);
    await uploadSampleShare(baseUrl, created.token);

    const { response, json } = await requestJson(`${baseUrl}/api/libraries/acme-product/shares`, {
      headers: { authorization: `Bearer ${created.token}` }
    });

    assert.equal(response.status, 200);
    assert.equal(json.shares.length, 1);
    assert.equal(json.shares[0].name, "alice-notes");
    assert.equal(json.shares[0].shareName, "alice-notes");
    assert.equal(json.shares[0].member, "alice");
    assert.equal(typeof json.shares[0].createdAt, "string");
    assert.equal(json.shares[0].createdAt === "2026-05-02T00:00:00.000Z", false);
    assert.equal(json.shares[0].entryCount, 1);
    assert.equal(json.shares[0].fileCount, 1);
    assert.equal(typeof json.shares[0].uploadedAt, "string");
  });
});

test("server returns share manifest with share index metadata", async () => {
  await withServer(async baseUrl => {
    const created = await createLibrary(baseUrl);
    await uploadSampleShare(baseUrl, created.token);

    const { response, json } = await requestJson(`${baseUrl}/api/libraries/acme-product/shares/alice-notes`, {
      headers: { authorization: `Bearer ${created.token}` }
    });

    assert.equal(response.status, 200);
    assert.equal(json.shareName, "alice-notes");
    assert.equal(json.member, "alice");
    assert.equal(json.entries.length, 1);
    assert.deepEqual(
      json.indexes.map(index => index.path).sort(),
      ["indexes/L0.md", "indexes/L1.md", "indexes/L2.json"]
    );
    assert.equal(json.indexes.some(index => Object.hasOwn(index, "contentBase64")), false);
  });
});

test("server removes members through the members endpoint", async () => {
  await withServer(async baseUrl => {
    const created = await createLibrary(baseUrl);
    const reader = await createReader(baseUrl, created.token);

    const removed = await requestJson(`${baseUrl}/api/libraries/acme-product/members/bob`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${created.token}` }
    });
    assert.equal(removed.response.status, 200);
    assert.equal(removed.json.ok, true);

    const listed = await requestJson(`${baseUrl}/api/libraries/acme-product/members`, {
      headers: { authorization: `Bearer ${created.token}` }
    });
    assert.deepEqual(listed.json.members.map(member => member.member), ["alice"]);

    const rejected = await requestJson(`${baseUrl}/api/libraries/acme-product`, {
      headers: { authorization: `Bearer ${reader.token}` }
    });
    assert.equal(rejected.response.status, 403);
  });
});

test("server reindex endpoint regenerates missing library indexes", async () => {
  await withServer(async (baseUrl, root) => {
    const created = await createLibrary(baseUrl);
    await uploadSampleShare(baseUrl, created.token);
    fs.rmSync(path.join(root, "data", "libraries", "acme-product", "indexes"), {
      force: true,
      recursive: true
    });

    const reindexed = await requestJson(`${baseUrl}/api/libraries/acme-product/reindex`, {
      method: "POST",
      headers: { authorization: `Bearer ${created.token}` }
    });
    assert.equal(reindexed.response.status, 200);
    assert.equal(reindexed.json.ok, true);

    const detail = await requestJson(`${baseUrl}/api/libraries/acme-product`, {
      headers: { authorization: `Bearer ${created.token}` }
    });
    assert.deepEqual(
      detail.json.indexes.map(index => index.path).sort(),
      ["indexes/L0.md", "indexes/L1.md", "indexes/L2.json"]
    );
  });
});

test("server serves static client files from the configured client directory", async () => {
  const root = makeTempDir();
  const clientDir = path.join(root, "client");
  fs.mkdirSync(clientDir, { recursive: true });
  fs.writeFileSync(path.join(clientDir, "index.html"), "<main>Share-It</main>");
  fs.writeFileSync(path.join(clientDir, "app.js"), "globalThis.loaded = true;");

  const server = createServer({ dataDir: path.join(root, "data"), clientDir });
  await new Promise(resolve => server.listen(0, resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const index = await fetch(`${baseUrl}/`);
    assert.equal(index.status, 200);
    assert.match(await index.text(), /Share-It/);

    const app = await fetch(`${baseUrl}/app.js`);
    assert.equal(app.status, 200);
    assert.match(app.headers.get("content-type"), /text\/javascript/);
    assert.match(await app.text(), /loaded/);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
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

test("owners can list invites and readers cannot", async () => {
  await withServer(async baseUrl => {
    const created = await createLibrary(baseUrl);
    const invite = await requestJson(`${baseUrl}/api/libraries/acme-product/invites`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${created.token}`
      },
      body: JSON.stringify({ role: "contributor" })
    });
    const reader = await createReader(baseUrl, created.token);

    const listed = await requestJson(`${baseUrl}/api/libraries/acme-product/invites`, {
      headers: { authorization: `Bearer ${created.token}` }
    });

    assert.equal(listed.response.status, 200);
    assert.equal(listed.json.invites.some(item => item.token === invite.json.token), true);
    assert.equal(listed.json.invites.some(item => item.role === "contributor"), true);
    assert.equal(listed.json.invites.every(item => item.library === "acme-product"), true);

    const rejected = await requestJson(`${baseUrl}/api/libraries/acme-product/invites`, {
      headers: { authorization: `Bearer ${reader.token}` }
    });
    assert.equal(rejected.response.status, 403);
    assert.equal(typeof rejected.json.error, "string");
  });
});

test("server rejects oversized JSON request bodies", async () => {
  await withServer(async baseUrl => {
    const oversizedName = "a".repeat(1024 * 1024);
    const { response, json } = await requestJson(`${baseUrl}/api/libraries`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: oversizedName, owner: "alice" })
    });

    assert.equal(response.status, 413);
    assert.deepEqual(json, { error: "Payload too large" });
  });
});

test("server does not expose raw parser or decoder error messages", async () => {
  await withServer(async baseUrl => {
    const malformedJson = await requestJson(`${baseUrl}/api/libraries`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{\"name\":"
    });
    assert.equal(malformedJson.response.status, 400);
    assert.deepEqual(malformedJson.json, { error: "Bad request" });

    const malformedPath = await requestJson(`${baseUrl}/api/libraries/%E0%A4%A`);
    assert.equal(malformedPath.response.status, 400);
    assert.deepEqual(malformedPath.json, { error: "Bad request" });
  });
});

test("server can require an admin token for library creation", async () => {
  const root = makeTempDir();
  const server = createServer({ dataDir: `${root}/data`, adminToken: "bootstrap-secret" });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const denied = await requestJson(`${baseUrl}/api/libraries`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "locked", owner: "alice" })
    });
    assert.equal(denied.response.status, 403);

    const created = await requestJson(`${baseUrl}/api/libraries`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer bootstrap-secret"
      },
      body: JSON.stringify({ name: "locked", owner: "alice" })
    });
    assert.equal(created.response.status, 200);
    assert.equal(created.json.library, "locked");
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
