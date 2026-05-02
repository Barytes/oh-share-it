#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { buildSharePackage } = require("../server/lib/packager");
const {
  ensureDir,
  readJsonFile,
  replaceDirAtomic,
  safeJoin,
  writeJsonFile
} = require("../server/lib/fs-utils");

const STARTER_RULES = [
  "# Explicitly allow files to share. Deny rules win.",
  "+ README.md",
  "+ docs/**",
  "- **/.env",
  "- **/.git/**",
  "- **/node_modules/**",
  "- **/dist/**",
  "- **/*.log",
  ""
].join("\n");

function homeDir() {
  const dir = process.env.HOME || process.env.USERPROFILE;
  if (!dir) throw new Error("Unable to locate home directory for credentials.");
  return dir;
}

function credentialPath() {
  return path.join(homeDir(), ".oh-share-it", "credentials.json");
}

function bindingPath(cwd = process.cwd()) {
  return path.join(cwd, ".oh-share-it", "binding.json");
}

function writePrivateJsonFile(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.chmodSync(path.dirname(filePath), 0o700);
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
}

function readCredentials() {
  const state = readJsonFile(credentialPath(), { credentials: [] });
  return { credentials: Array.isArray(state.credentials) ? state.credentials : [] };
}

function saveCredential(credential) {
  const state = readCredentials();
  state.credentials = state.credentials.filter(existing => !(
    existing.server === credential.server &&
    existing.library === credential.library &&
    existing.member === credential.member
  ));
  state.credentials.push(credential);
  writePrivateJsonFile(credentialPath(), state);
}

function readBinding() {
  const binding = readJsonFile(bindingPath(), null);
  if (!binding) throw new Error("Missing .oh-share-it/binding.json. Run bind or join first.");
  return binding;
}

function readBindingOrNull() {
  return readJsonFile(bindingPath(), null);
}

function findCredential({ server, library, member = "" }) {
  const state = readCredentials();
  return state.credentials.find(item => (
    item.server === server &&
    item.library === library &&
    (!member || item.member === member)
  )) || null;
}

function credentialFor(binding) {
  const credential = findCredential(binding);
  if (!credential) {
    throw new Error("Missing credential for bound server/library. Run join or library create first.");
  }
  return credential;
}

function flag(args, name, fallback = undefined) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`Missing value for ${name}`);
  return value;
}

function requireValue(value, message) {
  if (!value) throw new Error(message);
  return value;
}

function trimServer(server) {
  return requireValue(server, "Missing --server").replace(/\/+$/, "");
}

function optionalAdminToken(args) {
  return flag(args, "--admin-token", process.env.OH_SHARE_IT_ADMIN_TOKEN || null);
}

async function requestJson(url, { method = "GET", token = null, body = null } = {}) {
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        ...(body ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (error) {
    throw new Error(`Server request failed: ${error.message}`);
  }

  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(json.error || `HTTP ${response.status}`);
  return json;
}

function writeBinding({ server, library, member = "" }) {
  const binding = {
    server,
    library,
    member,
    syncPath: syncPathForLibrary(library)
  };
  writeJsonFile(bindingPath(), binding);
  return binding;
}

function validateLibraryName(name) {
  if (typeof name !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(name)) {
    throw new Error(`Invalid library name: ${name}`);
  }
}

function syncPathForLibrary(library) {
  validateLibraryName(library);
  return `.oh-share-it/public/${library}`;
}

function syncRootForBinding(binding) {
  validateLibraryName(binding.library);
  const publicRoot = path.resolve(process.cwd(), ".oh-share-it", "public");
  const target = path.resolve(publicRoot, binding.library);
  if (target !== publicRoot && !target.startsWith(publicRoot + path.sep)) {
    throw new Error(`Sync target escapes public root: ${binding.library}`);
  }
  return target;
}

function resolveLibraryContext(args) {
  const binding = readBindingOrNull();
  const server = flag(args, "--server", binding ? binding.server : undefined);
  const library = flag(args, "--library", binding ? binding.library : undefined);
  return {
    server: trimServer(server),
    library: requireValue(library, "Missing --library")
  };
}

function resolveReadPath(requested) {
  if (!requested.startsWith("oh://")) return requested;
  const match = /^oh:\/\/library\/[^/]+\/(.+)$/.exec(requested);
  if (!match) throw new Error(`Unsupported oh:// URI: ${requested}`);
  return match[1];
}

function createStarterRules(root) {
  const rulesPath = path.join(root, "share-it.rules");
  if (!fs.existsSync(rulesPath)) {
    fs.writeFileSync(rulesPath, STARTER_RULES);
  }
}

async function createLibrary(args) {
  const name = requireValue(args[0], "Missing library name");
  const server = trimServer(flag(args, "--server"));
  const member = requireValue(flag(args, "--member"), "Missing --member");
  const created = await requestJson(`${server}/api/libraries`, {
    method: "POST",
    token: optionalAdminToken(args),
    body: { name, owner: member }
  });
  saveCredential({ server, library: created.library, member: created.member, token: created.token });
  console.log(JSON.stringify(created));
}

async function bindWorkdir(args) {
  const server = trimServer(flag(args, "--server"));
  const library = requireValue(flag(args, "--library"), "Missing --library");
  const credential = findCredential({ server, library });
  const binding = writeBinding({
    server,
    library,
    member: credential ? credential.member : ""
  });
  console.log(JSON.stringify(binding));
}

async function createInvite(args) {
  const context = resolveLibraryContext(args);
  const binding = readBindingOrNull();
  const credential = credentialFor({ ...context, member: binding && binding.library === context.library ? binding.member : "" });
  const role = requireValue(flag(args, "--role"), "Missing --role");
  const invite = await requestJson(`${context.server}/api/libraries/${context.library}/invites`, {
    method: "POST",
    token: credential.token,
    body: { role }
  });
  console.log(JSON.stringify(invite));
}

async function joinLibrary(args) {
  const inviteToken = requireValue(flag(args, "--invite", args[0]), "Missing --invite");
  const server = trimServer(flag(args, "--server"));
  const member = requireValue(flag(args, "--member"), "Missing --member");
  const joined = await requestJson(`${server}/api/invites/${encodeURIComponent(inviteToken)}/join`, {
    method: "POST",
    body: { member }
  });
  saveCredential({ server, library: joined.library, member: joined.member, token: joined.token });
  writeBinding({ server, library: joined.library, member: joined.member });
  console.log(JSON.stringify(joined));
}

async function listLibraries(args) {
  const requestedServer = flag(args, "--server", null);
  const state = readCredentials();
  const credential = requestedServer
    ? state.credentials.find(item => item.server === trimServer(requestedServer))
    : state.credentials[0];
  if (!credential) throw new Error("Missing credential. Run join or library create first.");
  const listed = await requestJson(`${credential.server}/api/libraries`, { token: credential.token });
  console.log(JSON.stringify(listed));
}

async function shareWorkdir(args) {
  const binding = readBinding();
  const credential = credentialFor(binding);
  const shareName = requireValue(flag(args, "--name"), "Missing --name");
  try {
    const pkg = buildSharePackage({ root: process.cwd(), shareName, member: credential.member });
    const uploaded = await requestJson(`${binding.server}/api/libraries/${binding.library}/shares`, {
      method: "POST",
      token: credential.token,
      body: pkg
    });
    console.log(JSON.stringify(uploaded));
  } catch (error) {
    if (error.message === "Missing share-it.rules") {
      createStarterRules(process.cwd());
      throw new Error("Missing share-it.rules. Created a starter share-it.rules; edit it and run share again.");
    }
    throw error;
  }
}

async function syncLibrary() {
  const binding = readBinding();
  const credential = credentialFor(binding);
  const snapshot = await requestJson(`${binding.server}/api/libraries/${binding.library}/sync`, {
    token: credential.token
  });
  const displayPath = syncPathForLibrary(binding.library);
  const target = syncRootForBinding(binding);
  replaceDirAtomic(target, `${target}.tmp`, tempDir => {
    for (const file of snapshot.files) {
      const out = safeJoin(tempDir, file.path);
      ensureDir(path.dirname(out));
      fs.writeFileSync(out, Buffer.from(file.contentBase64, "base64"));
    }
  });
  console.log(JSON.stringify({ synced: snapshot.files.length, library: binding.library, path: displayPath }));
}

async function listShares() {
  const binding = readBinding();
  const credential = credentialFor(binding);
  const listed = await requestJson(`${binding.server}/api/libraries/${binding.library}/shares`, {
    token: credential.token
  });
  console.log(JSON.stringify(listed));
}

function readSyncedFile(args) {
  const binding = readBinding();
  const requested = requireValue(args.join(" ").trim(), "Missing path");
  const syncRoot = syncRootForBinding(binding);
  const target = safeJoin(syncRoot, resolveReadPath(requested));
  console.log(fs.readFileSync(target, "utf8"));
}

async function queryLibrary(args) {
  const binding = readBinding();
  const credential = credentialFor(binding);
  const query = requireValue(args.join(" ").trim(), "Missing query");
  const routed = await requestJson(`${binding.server}/api/route`, {
    method: "POST",
    token: credential.token,
    body: { library: binding.library, query, mode: "documents" }
  });
  console.log(JSON.stringify(routed));
}

async function main(argv) {
  const [command, subcommand, ...rest] = argv;

  if (command === "library" && subcommand === "create") return createLibrary(rest);
  if (command === "invite" && subcommand === "create") return createInvite(rest);
  if (command === "join") return joinLibrary([subcommand, ...rest].filter(Boolean));
  if (command === "bind") return bindWorkdir([subcommand, ...rest].filter(Boolean));
  if (command === "libraries") return listLibraries([subcommand, ...rest].filter(Boolean));
  if (command === "share") return shareWorkdir([subcommand, ...rest].filter(Boolean));
  if (command === "sync") return syncLibrary();
  if (command === "list") return listShares();
  if (command === "read") return readSyncedFile([subcommand, ...rest].filter(Boolean));
  if (command === "query") return queryLibrary([subcommand, ...rest].filter(Boolean));

  throw new Error(`Unknown command: ${argv.join(" ")}`);
}

if (require.main === module) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  bindingPath,
  credentialPath,
  main,
  readCredentials
};
