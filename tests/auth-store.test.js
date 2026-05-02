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

test("invite is single-use and removed member cannot rejoin with consumed invite", () => {
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
    () => store.joinInvite({ token: invite.token, member: "carol" }),
    /Invite is invalid or revoked/
  );

  store.removeMember({
    libraryName: "acme-product",
    actorToken: ownerCredential.token,
    member: "bob"
  });

  assert.equal(store.getMemberRole("acme-product", reader.token), null);
  assert.throws(
    () => store.joinInvite({ token: invite.token, member: "bob" }),
    /Invite is invalid or revoked/
  );
});

test("only allowed invite roles can be created", () => {
  const root = makeTempDir();
  const store = createStore({ dataDir: path.join(root, "data") });
  const ownerCredential = store.createLibrary({ name: "acme-product", owner: "alice" });
  const adminInvite = store.createInvite({
    libraryName: "acme-product",
    actorToken: ownerCredential.token,
    role: "admin"
  });
  const adminCredential = store.joinInvite({ token: adminInvite.token, member: "bob" });

  for (const role of ["reader", "contributor"]) {
    assert.equal(
      store.createInvite({
        libraryName: "acme-product",
        actorToken: adminCredential.token,
        role
      }).role,
      role
    );
  }

  for (const actorToken of [ownerCredential.token, adminCredential.token]) {
    assert.throws(
      () => store.createInvite({ libraryName: "acme-product", actorToken, role: "owner" }),
      /Invalid invite role/
    );
    assert.throws(
      () => store.createInvite({ libraryName: "acme-product", actorToken, role: "wizard" }),
      /Invalid invite role/
    );
  }
});

test("invalid library names throw", () => {
  const root = makeTempDir();
  const store = createStore({ dataDir: path.join(root, "data") });

  for (const name of ["", ".", "..", "team/acme", "team\\acme"]) {
    assert.throws(
      () => store.createLibrary({ name, owner: "alice" }),
      /Invalid library name/
    );
  }

  assert.equal(store.createLibrary({ name: "acme-product", owner: "alice" }).library, "acme-product");
});

test("duplicate library creation is rejected without replacing owner", () => {
  const root = makeTempDir();
  const store = createStore({ dataDir: path.join(root, "data") });
  const ownerCredential = store.createLibrary({ name: "acme-product", owner: "alice" });

  assert.throws(
    () => store.createLibrary({ name: "acme-product", owner: "mallory" }),
    /Library already exists/
  );
  assert.equal(store.getMemberRole("acme-product", ownerCredential.token), "owner");
});
