const fs = require("node:fs");
const path = require("node:path");
const { classifyPath } = require("./classifier");
const { ensureDir, replaceDirAtomic, safeJoin, writeJsonFile } = require("./fs-utils");

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

function writeShare({ store, libraryName, actorToken, sharePackage }) {
  store.assertPermission(libraryName, actorToken, "upload");
  assertShareName(sharePackage.shareName);
  const files = sharePackage.files.map(file => ({
    file,
    sourcePath: validateShareFilePath(file.path)
  }));

  const libraryDir = store.libraryDir(libraryName);
  const sharesDir = path.join(libraryDir, "shares");
  const shareDir = safeJoin(sharesDir, sharePackage.shareName);
  const tempShareDir = safeJoin(sharesDir, `.tmp-${sharePackage.shareName}-${process.pid}`);

  let entries = [];
  replaceDirAtomic(shareDir, tempShareDir, nextShareDir => {
    entries = [];
    for (const { file, sourcePath } of files) {
      const decoded = Buffer.from(file.contentBase64, "base64");

      writeFileSafe(path.join(nextShareDir, "raw"), sourcePath, decoded);

      const classification = classifyPath(sourcePath);
      const classifiedDir = classifiedDirFor(classification.type);
      writeFileSafe(path.join(nextShareDir, classifiedDir), sourcePath, decoded);

      entries.push({
        uri: `oh://library/${libraryName}/shares/${sharePackage.shareName}/${classifiedDir}/${sourcePath}`,
        shareName: sharePackage.shareName,
        sourcePath,
        rawPath: `shares/${sharePackage.shareName}/raw/${sourcePath}`,
        classifiedPath: `shares/${sharePackage.shareName}/${classifiedDir}/${sourcePath}`,
        type: classification.type,
        tags: classification.tags,
        hash: file.hash,
        size: file.size,
        updatedAt: sharePackage.createdAt,
        preview: previewText(decoded.toString("utf8"))
      });
    }

    writeJsonFile(path.join(nextShareDir, "manifest.json"), {
      shareName: sharePackage.shareName,
      member: sharePackage.member,
      createdAt: sharePackage.createdAt,
      entries
    });
    writeIndexes({
      baseDir: nextShareDir,
      title: sharePackage.shareName,
      entries
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

function reindexLibrary({ store, libraryName, actorToken }) {
  store.assertPermission(libraryName, actorToken, "reindex");
  writeLibraryIndexes({ libraryName, libraryDir: store.libraryDir(libraryName) });
}

module.exports = { reindexLibrary, writeShare, writeLibraryIndexes };
