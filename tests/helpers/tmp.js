const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function makeTempDir(prefix = "oh-share-it-") {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFile(root, relativePath, contents) {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
  return target;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

module.exports = { makeTempDir, writeFile, readJson };
