const fs = require("node:fs");
const path = require("node:path");
const { classifyPath } = require("./classifier");
const {
  ensureDir,
  readJsonFile,
  replaceDirAtomic,
  safeJoin,
  sha256,
  walkFiles,
  writeJsonFile
} = require("./fs-utils");

const SHARE_NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/;

function previewText(contents) {
  return contents.replace(/\s+/g, " ").trim().slice(0, 180);
}

function classifiedDirFor(type) {
  if (type === "skill") return "skills";
  if (type === "memory") return "memories";
  return "resources";
}

function assertShareName(shareName) {
  if (typeof shareName !== "string" || !SHARE_NAME_PATTERN.test(shareName)) {
    throw new Error(`Invalid share name: ${shareName}`);
  }
}

function validateShareFilePath(relativePath) {
  if (typeof relativePath !== "string") {
    throw new Error(`Invalid share file path: ${relativePath}`);
  }

  const normalized = relativePath.replaceAll("\\", "/");
  if (
    normalized === "" ||
    path.posix.isAbsolute(normalized) ||
    path.win32.isAbsolute(relativePath)
  ) {
    throw new Error(`Invalid share file path: ${relativePath}`);
  }

  const segments = normalized.split("/");
  if (segments.some(segment => segment === "" || segment === "." || segment === "..")) {
    throw new Error(`Invalid share file path: ${relativePath}`);
  }

  return normalized;
}

function writeFileSafe(root, relativePath, contents) {
  const target = safeJoin(root, relativePath);
  ensureDir(path.dirname(target));
  fs.writeFileSync(target, contents);
}

function assertUniqueSourcePaths(files) {
  const sourcePaths = new Set();
  for (const { sourcePath } of files) {
    const duplicateKey = sourcePath.toLowerCase();
    if (sourcePaths.has(duplicateKey)) {
      throw new Error(`Duplicate share file path: ${sourcePath}`);
    }
    sourcePaths.add(duplicateKey);
  }
}

function packageFiles(sharePackage) {
  if (!Array.isArray(sharePackage.files)) {
    throw new Error("Invalid share package files");
  }

  const files = sharePackage.files.map(file => ({
    sourcePath: validateShareFilePath(file.path),
    contents: Buffer.from(file.contentBase64 || "", "base64")
  }));
  assertUniqueSourcePaths(files);
  return files;
}

function rawFiles(shareDir) {
  const rawDir = path.join(shareDir, "raw");
  if (!fs.existsSync(rawDir)) return [];

  const files = walkFiles(rawDir).map(sourcePath => ({
    sourcePath: validateShareFilePath(sourcePath),
    contents: fs.readFileSync(safeJoin(rawDir, sourcePath))
  }));
  assertUniqueSourcePaths(files);
  return files;
}

function writeShareContents({ shareDir, libraryName, shareName, member, createdAt, files }) {
  const entries = [];
  for (const { sourcePath, contents } of files) {
    writeFileSafe(path.join(shareDir, "raw"), sourcePath, contents);

    const classification = classifyPath(sourcePath);
    const classifiedDir = classifiedDirFor(classification.type);
    writeFileSafe(path.join(shareDir, classifiedDir), sourcePath, contents);

    entries.push({
      uri: `oh://library/${libraryName}/shares/${shareName}/${classifiedDir}/${sourcePath}`,
      shareName,
      sourcePath,
      rawPath: `shares/${shareName}/raw/${sourcePath}`,
      classifiedPath: `shares/${shareName}/${classifiedDir}/${sourcePath}`,
      type: classification.type,
      tags: classification.tags,
      hash: sha256(contents),
      size: contents.length,
      updatedAt: createdAt,
      preview: previewText(contents.toString("utf8"))
    });
  }

  writeJsonFile(path.join(shareDir, "manifest.json"), {
    shareName,
    member,
    createdAt,
    entries
  });
  writeIndexes({ baseDir: shareDir, title: shareName, entries });
  return entries;
}

function writeShare({ store, libraryName, actorToken, sharePackage }) {
  const actor = store.assertPermission(libraryName, actorToken, "upload");
  assertShareName(sharePackage.shareName);
  const files = packageFiles(sharePackage);

  const libraryDir = store.libraryDir(libraryName);
  const sharesDir = path.join(libraryDir, "shares");
  const shareDir = safeJoin(sharesDir, sharePackage.shareName);
  const tempShareDir = safeJoin(sharesDir, `.tmp-${sharePackage.shareName}-${process.pid}`);
  const createdAt = new Date().toISOString();

  let entries = [];
  replaceDirAtomic(shareDir, tempShareDir, nextShareDir => {
    entries = writeShareContents({
      shareDir: nextShareDir,
      libraryName,
      shareName: sharePackage.shareName,
      member: actor.member,
      createdAt,
      files
    });
  });

  writeLibraryIndexes({ libraryName, libraryDir });
  return { shareName: sharePackage.shareName, entries };
}

function writeIndexes({ baseDir, title, entries }) {
  ensureDir(path.join(baseDir, "indexes"));
  fs.writeFileSync(path.join(baseDir, "indexes", "L0.md"), [
    `# ${title}`,
    "",
    `Shares indexed: ${new Set(entries.map(entry => entry.shareName)).size}`,
    `Resources: ${entries.filter(entry => entry.type === "resource").length}`,
    `Memories: ${entries.filter(entry => entry.type === "memory").length}`,
    `Skills: ${entries.filter(entry => entry.type === "skill").length}`,
    "",
    "## Recommended Next Reads",
    ...entries.slice(0, 10).map(entry => `- ${entry.uri}`)
  ].join("\n") + "\n");

  fs.writeFileSync(path.join(baseDir, "indexes", "L1.md"), [
    `# ${title} Overview`,
    "",
    ...["resource", "memory", "skill"].map(type => {
      const rows = entries.filter(entry => entry.type === type);
      return [`## ${type}`, ...rows.map(entry => `- ${entry.uri} - ${entry.preview}`)].join("\n");
    })
  ].join("\n\n") + "\n");

  writeJsonFile(path.join(baseDir, "indexes", "L2.json"), { entries });
}

function readShareEntries(libraryDir) {
  const sharesDir = path.join(libraryDir, "shares");
  if (!fs.existsSync(sharesDir)) return [];

  return fs.readdirSync(sharesDir, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .filter(entry => !entry.name.startsWith("."))
    .flatMap(entry => {
      const manifestPath = path.join(sharesDir, entry.name, "manifest.json");
      if (!fs.existsSync(manifestPath)) return [];
      return JSON.parse(fs.readFileSync(manifestPath, "utf8")).entries;
    });
}

function writeLibraryIndexes({ libraryName, libraryDir }) {
  const entries = readShareEntries(libraryDir);
  writeIndexes({ baseDir: libraryDir, title: libraryName, entries });
}

function reindexShare({ libraryName, sharesDir, shareName }) {
  assertShareName(shareName);
  const shareDir = safeJoin(sharesDir, shareName);
  const manifest = readJsonFile(path.join(shareDir, "manifest.json"), {});
  const files = rawFiles(shareDir);
  const createdAt = manifest.createdAt || new Date().toISOString();
  const member = manifest.member || "unknown";
  const tempShareDir = safeJoin(sharesDir, `.tmp-reindex-${shareName}-${process.pid}`);

  replaceDirAtomic(shareDir, tempShareDir, nextShareDir => {
    writeShareContents({
      shareDir: nextShareDir,
      libraryName,
      shareName,
      member,
      createdAt,
      files
    });
  });
}

function reindexLibrary({ store, libraryName, actorToken }) {
  store.assertPermission(libraryName, actorToken, "reindex");
  const libraryDir = store.libraryDir(libraryName);
  const sharesDir = path.join(libraryDir, "shares");
  if (fs.existsSync(sharesDir)) {
    for (const entry of fs.readdirSync(sharesDir, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        reindexShare({ libraryName, sharesDir, shareName: entry.name });
      }
    }
  }
  writeLibraryIndexes({ libraryName, libraryDir });
}

module.exports = { reindexLibrary, writeShare, writeLibraryIndexes };
