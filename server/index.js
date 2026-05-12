const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { parseBearerToken } = require("./lib/auth");
const { createStore } = require("./lib/library-store");
const { reindexLibrary, writeShare } = require("./lib/indexer");
const { routeQuery } = require("./lib/router");
const { readJsonRequest, sendError, sendJson, serveStatic, staticContentType } = require("./lib/http-utils");
const { normalizeRelativePath, readJsonFile, safeJoin, walkFiles } = require("./lib/fs-utils");

const INDEX_PATHS = ["indexes/L0.md", "indexes/L1.md", "indexes/L2.json"];
const SENSITIVE_LIBRARY_PATH_ROOTS = new Set([
  "members.json",
  "invites.json",
  "audit.log",
  ".internal",
  "secrets"
]);
const DEFAULT_SHARE_UPLOAD_LIMIT_BYTES = 25 * 1024 * 1024;

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

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function isLoopbackHost(host) {
  return host === "127.0.0.1" || host === "localhost" || host === "::1";
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

function indexMetadata(rootDir, relativePath) {
  const filePath = safeJoin(rootDir, relativePath);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null;

  const stat = fs.statSync(filePath);
  return {
    path: relativePath,
    size: stat.size,
    updatedAt: stat.mtime.toISOString()
  };
}

function listIndexMetadata(rootDir) {
  return INDEX_PATHS.map(relativePath => indexMetadata(rootDir, relativePath)).filter(Boolean);
}

function validateReadableLibraryPath(requestedPath) {
  if (typeof requestedPath !== "string" || requestedPath === "") {
    throw new Error("Missing file path");
  }

  if (
    path.posix.isAbsolute(requestedPath.replaceAll("\\", "/")) ||
    path.win32.isAbsolute(requestedPath)
  ) {
    throw new HttpError(403, "File is not readable");
  }

  const normalized = normalizeRelativePath(requestedPath);
  const segments = normalized.split("/");
  if (
    normalized === "" ||
    segments.some(segment => segment === "" || segment === "." || segment === "..")
  ) {
    throw new HttpError(403, "File is not readable");
  }

  return normalized;
}

function canonicalRelativePath(rootDir, filePath) {
  return path.relative(path.resolve(rootDir), filePath).replaceAll("\\", "/");
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

function libraryDetail(store, libraryName, token) {
  const role = store.getMemberRole(libraryName, token);
  if (!role) throw new Error("Permission denied for read");

  const libraryDir = store.libraryDir(libraryName);
  const metadata = readJsonFile(path.join(libraryDir, "library.json"), {
    name: libraryName,
    description: "",
    createdAt: null
  });

  return {
    ...metadata,
    name: metadata.name || libraryName,
    role,
    indexes: listIndexMetadata(libraryDir)
  };
}

function shareSummary(sharesDir, shareName) {
  const shareDir = safeJoin(sharesDir, shareName);
  const manifestPath = path.join(shareDir, "manifest.json");
  const manifest = readJsonFile(manifestPath, null);
  if (!manifest) return { name: shareName, shareName };

  const entries = Array.isArray(manifest.entries) ? manifest.entries : [];
  return {
    name: shareName,
    shareName: manifest.shareName || shareName,
    member: manifest.member,
    createdAt: manifest.createdAt,
    uploadedAt: fs.statSync(manifestPath).mtime.toISOString(),
    entryCount: entries.length,
    fileCount: entries.length
  };
}

function listShares(store, libraryName, token) {
  store.assertPermission(libraryName, token, "read");
  const sharesDir = path.join(store.libraryDir(libraryName), "shares");
  if (!fs.existsSync(sharesDir)) return { shares: [] };

  const shares = fs.readdirSync(sharesDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .filter(entry => !entry.name.startsWith("."))
    .map(entry => shareSummary(sharesDir, entry.name));
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

function listInvites(store, libraryName, token) {
  return store.listInvites({ libraryName, actorToken: token });
}

function readShareManifest(store, libraryName, shareName, token) {
  store.assertPermission(libraryName, token, "read");
  const sharesDir = path.join(store.libraryDir(libraryName), "shares");
  const shareDir = safeJoin(sharesDir, shareName);
  const manifestPath = path.join(shareDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new HttpError(404, "Share not found");
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  return { ...manifest, indexes: listIndexMetadata(shareDir) };
}

function readLibraryFile(store, libraryName, requestedPath, token) {
  store.assertPermission(libraryName, token, "read");
  const libraryDir = store.libraryDir(libraryName);
  const normalizedPath = validateReadableLibraryPath(requestedPath);
  const filePath = safeJoin(libraryDir, normalizedPath);
  const relativePath = canonicalRelativePath(libraryDir, filePath);
  if (!isSyncableLibraryPath(relativePath)) {
    throw new HttpError(403, "File is not readable");
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new HttpError(404, "File not found");
  }

  return {
    path: relativePath,
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

function handleLibraryRoute({ request, response, store, url, token, libraryName, rest, shareUploadLimitBytes }) {
  if (request.method === "GET" && rest === "") {
    return sendJson(response, 200, libraryDetail(store, libraryName, token));
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

  if (request.method === "GET" && rest === "invites") {
    return sendJson(response, 200, listInvites(store, libraryName, token));
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
    return readJsonRequest(request, { maxBytes: shareUploadLimitBytes }).then(body => {
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

async function handleApiRequest({ request, response, dataDir, store, url, adminToken, shareUploadLimitBytes }) {
  const token = requestToken(request);

  if (request.method === "GET" && url.pathname === "/api/health") {
    return sendJson(response, 200, { ok: true });
  }

  if (request.method === "POST" && url.pathname === "/api/libraries") {
    if (adminToken && token !== adminToken) {
      throw new HttpError(403, "Permission denied for library creation");
    }
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
      rest,
      shareUploadLimitBytes
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
  clientDir = path.join(process.cwd(), "client"),
  adminToken = "",
  shareUploadLimitBytes = DEFAULT_SHARE_UPLOAD_LIMIT_BYTES
} = {}) {
  const store = createStore({ dataDir });

  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://localhost");

      if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
        return await handleApiRequest({
          request,
          response,
          dataDir,
          store,
          url,
          adminToken,
          shareUploadLimitBytes
        });
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
  const host = process.env.HOST || "127.0.0.1";
  const adminToken = process.env.OH_SHARE_IT_ADMIN_TOKEN || "";
  if (!adminToken && !isLoopbackHost(host)) {
    console.error("Refusing to bind outside localhost without OH_SHARE_IT_ADMIN_TOKEN.");
    process.exit(1);
  }
  const shareUploadLimitBytes = parsePositiveInteger(
    process.env.OH_SHARE_IT_UPLOAD_LIMIT_BYTES,
    DEFAULT_SHARE_UPLOAD_LIMIT_BYTES
  );
  createServer({ adminToken, shareUploadLimitBytes }).listen(port, host, () => {
    console.log(`oh-share-it server listening on http://${host}:${port}`);
  });
}

module.exports = { createServer, isSensitiveLibraryPath, isSyncableLibraryPath };
