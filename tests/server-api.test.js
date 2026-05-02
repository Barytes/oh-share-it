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
