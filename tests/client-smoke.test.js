const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("client shell references app assets and library UI", () => {
  const html = fs.readFileSync("client/index.html", "utf8");

  assert.match(html, /Oh Share It/);
  assert.match(html, /app.js/);
  assert.match(html, /styles.css/);
  assert.match(html, /Bearer token/);
  assert.match(html, /libraries/i);
});

test("client app calls library browser endpoints", () => {
  const app = fs.readFileSync("client/app.js", "utf8");

  for (const endpoint of [
    "/api/libraries",
    "/api/route",
    "/sync",
    "/file",
    "/members",
    "/reindex"
  ]) {
    assert.match(app, new RegExp(endpoint.replaceAll("/", "\\/")));
  }
});

test("client app exposes escaping helpers and avoids raw innerHTML rendering", () => {
  const app = fs.readFileSync("client/app.js", "utf8");

  assert.match(app, /function escapeHtml/);
  assert.match(app, /function setSafeHtml/);
  assert.doesNotMatch(app, /\.innerHTML\s*=/);
});
