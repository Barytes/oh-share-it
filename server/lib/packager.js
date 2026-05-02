const fs = require("node:fs");
const path = require("node:path");
const { parseShareRules, isAllowedByShareRules } = require("./share-rules");
const { sha256, walkFiles } = require("./fs-utils");

function isPackageMetadataPath(relativePath) {
  return (
    relativePath === ".git" ||
    relativePath === ".oh-share-it" ||
    relativePath.startsWith(".git/") ||
    relativePath.startsWith(".oh-share-it/")
  );
}

function buildSharePackage({ root, shareName, member }) {
  const rulesPath = path.join(root, "share-it.rules");
  if (!fs.existsSync(rulesPath)) {
    throw new Error("Missing share-it.rules");
  }

  const rules = parseShareRules(fs.readFileSync(rulesPath, "utf8"));
  const files = walkFiles(root)
    .filter(relativePath => relativePath !== "share-it.rules")
    .filter(relativePath => !isPackageMetadataPath(relativePath))
    .filter(relativePath => isAllowedByShareRules(relativePath, rules))
    .map(relativePath => {
      const absolutePath = path.join(root, relativePath);
      const buffer = fs.readFileSync(absolutePath);
      return {
        path: relativePath,
        hash: sha256(buffer),
        size: buffer.length,
        contentBase64: buffer.toString("base64")
      };
    });

  if (files.length === 0) {
    throw new Error("No files matched share-it.rules");
  }

  return {
    shareName,
    member,
    createdAt: new Date().toISOString(),
    files
  };
}

module.exports = { buildSharePackage };
