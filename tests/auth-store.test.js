const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { makeTempDir } = require("./helpers/tmp");
const { createStore } = require("../server/lib/library-store");

test("library owner can create an invite and invited user can join", () => {
  const root = makeTempDir();
  const store = createStore({ dataDir: path.join(root, "data") });
  const ownerCredential = store.createLibrary({ name: "acme-product", owner: "alice" });
  const invite = store.createInvite({
    libraryName: "acme-product",
    actorToken: ownerCredential.token,
    role: "contributor"
  });
  const joined = store.joinInvite({ token: invite.token, member: "bob" });

  assert.equal(joined.library, "acme-product");
  assert.equal(joined.member, "bob");
  assert.equal(store.getMemberRole("acme-product", joined.token), "contributor");
});

test("reader cannot upload shares", () => {
  const root = makeTempDir();
  const store = createStore({ dataDir: path.join(root, "data") });
  const ownerCredential = store.createLibrary({ name: "acme-product", owner: "alice" });
  const invite = store.createInvite({
    libraryName: "acme-product",
    actorToken: ownerCredential.token,
    role: "reader"
  });
  const reader = store.joinInvite({ token: invite.token, member: "bob" });
  assert.throws(
    () => store.assertPermission("acme-product", reader.token, "upload"),
    /Permission denied/
  );
});

test("removed member loses access", () => {
  const root = makeTempDir();
  const store = createStore({ dataDir: path.join(root, "data") });
  const ownerCredential = store.createLibrary({ name: "acme-product", owner: "alice" });
  const invite = store.createInvite({
    libraryName: "acme-product",
    actorToken: ownerCredential.token,
    role: "reader"
  });
  const reader = store.joinInvite({ token: invite.token, member: "bob" });
  store.removeMember({
    libraryName: "acme-product",
    actorToken: ownerCredential.token,
    member: "bob"
  });

  assert.equal(store.getMemberRole("acme-product", reader.token), null);
  assert.equal(fs.existsSync(path.join(root, "data", "libraries", "acme-product", "audit.log")), true);
});
