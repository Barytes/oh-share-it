const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { parseBearerToken } = require("./lib/auth");
const { createStore } = require("./lib/library-store");
const { reindexLibrary, writeShare } = require("./lib/indexer");
const { routeQuery } = require("./lib/router");
const { readJsonRequest, sendError, sendJson, serveStatic, staticContentType } = require("./lib/http-utils");
const { normalizeRelativePath, readJsonFile, safeJoin, walkFiles } = require("./lib/fs-utils");

const SENSITIVE_LIBRARY_PATH_ROOTS = new Set([
  "members.json",
  "invites.json",
  "audit.log",
  ".internal",
  "secrets"
]);

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function decodePathPart(value) {
  return decodeURIComponent(value);
}

function requestToken(request) {
  return parseBearerToken(request.headers);
}

function requireToken(request) {
  const token = requestToken(request);
  if (!token) throw new Error("Permission denied");
  return token;
}

function errorStatus(error) {
  if (error.statusCode) return error.statusCode;
  if (/Permission denied|Unauthorized/.test(error.message)) return 403;
  return 400;
}

function listLibraries({ dataDir, store, token }) {
  const librariesDir = path.join(dataDir, "libraries");
  if (!fs.existsSync(librariesDir)) return [];

  return fs.readdirSync(librariesDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .flatMap(entry => {
      const role = token ? store.getMemberRole(entry.name, token) : null;
      return role ? [{ name: entry.name, role }] : [];
    });
}

function isSensitiveLibraryPath(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  return Array.from(SENSITIVE_LIBRARY_PATH_ROOTS).some(root => (
    normalized === root || normalized.startsWith(`${root}/`)
  ));
}

function isSyncableLibraryPath(relativePath) {
  return !isSensitiveLibraryPath(relativePath);
}

function snapshotLibrary(store, libraryName, token) {
  store.assertPermission(libraryName, token, "sync");
  const libraryDir = store.libraryDir(libraryName);
  const files = walkFiles(libraryDir)
    .filter(isSyncableLibraryPath)
    .sort()
    .map(relativePath => ({
      path: relativePath,
      contentBase64: fs.readFileSync(path.join(libraryDir, relativePath)).toString("base64")
    }));
  return { library: libraryName, files };
}

function listShares(store, libraryName, token) {
  store.assertPermission(libraryName, token, "read");
  const sharesDir = path.join(store.libraryDir(libraryName), "shares");
  if (!fs.existsSync(sharesDir)) return { shares: [] };

  const shares = fs.readdirSync(sharesDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .filter(entry => !entry.name.startsWith("."))
    .map(entry => ({ name: entry.name }));
  return { shares };
}

function listMembers(store, libraryName, token) {
  store.assertPermission(libraryName, token, "members");
  const membersPath = path.join(store.libraryDir(libraryName), "members.json");
  const state = readJsonFile(membersPath, { members: [] });
  return {
    members: state.members.map(member => ({
      member: member.member,
      role: member.role,
      library: member.library
    }))
  };
}

function readShareManifest(store, libraryName, shareName, token) {
  store.assertPermission(libraryName, token, "read");
  const sharesDir = path.join(store.libraryDir(libraryName), "shares");
  const manifestPath = safeJoin(sharesDir, `${shareName}/manifest.json`);
  if (!fs.existsSync(manifestPath)) {
    throw new HttpError(404, "Share not found");
  }
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

function readLibraryFile(store, libraryName, requestedPath, token) {
  store.assertPermission(libraryName, token, "read");
  if (!requestedPath) throw new Error("Missing file path");
  if (!isSyncableLibraryPath(requestedPath)) {
    throw new HttpError(403, "File is not readable");
  }

  const filePath = safeJoin(store.libraryDir(libraryName), requestedPath);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new HttpError(404, "File not found");
  }

  return {
    path: requestedPath,
    contentBase64: fs.readFileSync(filePath).toString("base64")
  };
}

function serveClientFile({ clientDir, url, response }) {
  const staticPath = url.pathname === "/" ? "index.html" : decodePathPart(url.pathname.replace(/^\/+/, ""));
  const filePath = safeJoin(clientDir, staticPath);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return false;
  }

  serveStatic(response, filePath, staticContentType(filePath));
  return true;
}

function handleLibraryRoute({ request, response, store, url, token, libraryName, rest }) {
  if (request.method === "GET" && rest === "") {
    const role = store.getMemberRole(libraryName, token);
    if (!role) throw new Error("Permission denied for read");
    return sendJson(response, 200, { name: libraryName, role });
  }

  if (request.method === "GET" && rest === "members") {
    return sendJson(response, 200, listMembers(store, libraryName, token));
  }

  if (request.method === "DELETE" && rest.startsWith("members/")) {
    const member = decodePathPart(rest.slice("members/".length));
    store.removeMember({ libraryName, actorToken: token, member });
    return sendJson(response, 200, { ok: true });
  }

  if (request.method === "POST" && rest === "invites") {
    return readJsonRequest(request).then(body => {
      const invite = store.createInvite({ libraryName, actorToken: token, role: body.role });
      sendJson(response, 200, invite);
    });
  }

  if (request.method === "GET" && rest === "shares") {
    return sendJson(response, 200, listShares(store, libraryName, token));
  }

  if (request.method === "GET" && rest.startsWith("shares/")) {
    const shareName = decodePathPart(rest.slice("shares/".length));
    return sendJson(response, 200, readShareManifest(store, libraryName, shareName, token));
  }

  if (request.method === "GET" && rest === "file") {
    const requestedPath = url.searchParams.get("path");
    return sendJson(response, 200, readLibraryFile(store, libraryName, requestedPath, token));
  }

  if (request.method === "POST" && rest === "shares") {
    return readJsonRequest(request).then(body => {
      const result = writeShare({ store, libraryName, actorToken: token, sharePackage: body });
      sendJson(response, 200, result);
    });
  }

  if (request.method === "GET" && rest === "sync") {
    return sendJson(response, 200, snapshotLibrary(store, libraryName, token));
  }

  if (request.method === "POST" && rest === "reindex") {
    reindexLibrary({ store, libraryName, actorToken: token });
    return sendJson(response, 200, { ok: true });
  }

  return false;
}

async function handleApiRequest({ request, response, dataDir, store, url }) {
  const token = requestToken(request);

  if (request.method === "GET" && url.pathname === "/api/health") {
    return sendJson(response, 200, { ok: true });
  }

  if (request.method === "POST" && url.pathname === "/api/libraries") {
    const body = await readJsonRequest(request);
    return sendJson(response, 200, store.createLibrary({ name: body.name, owner: body.owner }));
  }

  if (request.method === "GET" && url.pathname === "/api/libraries") {
    return sendJson(response, 200, { libraries: listLibraries({ dataDir, store, token }) });
  }

  const inviteMatch = /^\/api\/invites\/([^/]+)\/join$/.exec(url.pathname);
  if (request.method === "POST" && inviteMatch) {
    const body = await readJsonRequest(request);
    return sendJson(response, 200, store.joinInvite({
      token: decodePathPart(inviteMatch[1]),
      member: body.member
    }));
  }

  const libraryMatch = /^\/api\/libraries\/([^/]+)(?:\/(.*))?$/.exec(url.pathname);
  if (libraryMatch) {
    const libraryName = decodePathPart(libraryMatch[1]);
    const rest = libraryMatch[2] ? decodePathPart(libraryMatch[2]) : "";
    const handled = await handleLibraryRoute({
      request,
      response,
      store,
      url,
      token,
      libraryName,
      rest
    });
    if (handled !== false) return handled;
  }

  if (request.method === "POST" && url.pathname === "/api/route") {
    const body = await readJsonRequest(request);
    return sendJson(response, 200, routeQuery({
      store,
      libraryName: body.library,
      actorToken: requireToken(request),
      query: body.query,
      mode: body.mode,
      shareName: body.shareName
    }));
  }

  return sendJson(response, 404, { error: "Not found" });
}

function createServer({
  dataDir = path.join(process.cwd(), "data"),
  clientDir = path.join(process.cwd(), "client")
} = {}) {
  const store = createStore({ dataDir });

  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");

      if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
        return await handleApiRequest({ request, response, dataDir, store, url });
      }

      if (serveClientFile({ clientDir, url, response })) return;
      return sendJson(response, 404, { error: "Not found" });
    } catch (error) {
      return sendError(response, errorStatus(error), error);
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT || 4317);
  createServer().listen(port, () => {
    console.log(`oh-share-it server listening on http://localhost:${port}`);
  });
}

module.exports = { createServer, isSensitiveLibraryPath, isSyncableLibraryPath };
