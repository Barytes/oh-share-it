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

function isInside(parentDir, childDir) {
  const relative = path.relative(path.resolve(parentDir), path.resolve(childDir));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function makeBackupDir(targetDir) {
  const parent = path.dirname(targetDir);
  const name = path.basename(targetDir);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const suffix = crypto.randomBytes(6).toString("hex");
    const backupDir = path.join(parent, `${name}.backup-${process.pid}-${suffix}`);
    if (!fs.existsSync(backupDir)) return backupDir;
  }
  throw new Error(`Unable to create backup path for ${targetDir}`);
}

function replaceDirAtomic(targetDir, tempDir, writer) {
  const resolvedTarget = path.resolve(targetDir);
  const resolvedTemp = path.resolve(tempDir);
  if (resolvedTarget === resolvedTemp || isInside(resolvedTarget, resolvedTemp)) {
    throw new Error(`tempDir must not be inside targetDir: ${tempDir}`);
  }
  if (isInside(resolvedTemp, resolvedTarget)) {
    throw new Error(`targetDir must not be inside tempDir: ${targetDir}`);
  }

  removeDir(tempDir);
  ensureDir(tempDir);
  try {
    writer(tempDir);
  } catch (error) {
    removeDir(tempDir);
    throw error;
  }

  if (!fs.existsSync(targetDir)) {
    fs.renameSync(tempDir, targetDir);
    return;
  }

  const backupDir = makeBackupDir(targetDir);
  fs.renameSync(targetDir, backupDir);
  try {
    fs.renameSync(tempDir, targetDir);
  } catch (error) {
    if (!fs.existsSync(targetDir) && fs.existsSync(backupDir)) {
      fs.renameSync(backupDir, targetDir);
    }
    throw error;
  }
  removeDir(backupDir);
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
