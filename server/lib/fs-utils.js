const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function normalizeRelativePath(relativePath) {
  return String(relativePath).replaceAll("\\", "/").replace(/^\/+/, "");
}

function safeJoin(root, relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  const target = path.resolve(root, normalized);
  const resolvedRoot = path.resolve(root);
  if (target !== resolvedRoot && !target.startsWith(resolvedRoot + path.sep)) {
    throw new Error(`Path escapes outside root: ${relativePath}`);
  }
  return target;
}

function readJsonFile(filePath, fallback = undefined) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonFile(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function walkFiles(root) {
  const output = [];
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      if (entry.isFile()) output.push(path.relative(root, fullPath).replaceAll("\\", "/"));
    }
  }
  if (fs.existsSync(root)) visit(root);
  return output;
}

function removeDir(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

function replaceDirAtomic(targetDir, tempDir, writer) {
  removeDir(tempDir);
  ensureDir(tempDir);
  writer(tempDir);
  removeDir(targetDir);
  fs.renameSync(tempDir, targetDir);
}

module.exports = {
  ensureDir,
  normalizeRelativePath,
  readJsonFile,
  removeDir,
  replaceDirAtomic,
  safeJoin,
  sha256,
  walkFiles,
  writeJsonFile
};
