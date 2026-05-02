const { normalizeRelativePath } = require("./fs-utils");

function parseShareRules(contents) {
  const allow = [];
  const deny = [];
  for (const rawLine of String(contents).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const prefix = line[0];
    const pattern = line.slice(1).trim();
    if (!pattern) continue;
    if (prefix === "+") allow.push(pattern);
    if (prefix === "-") deny.push(pattern);
  }
  return { allow, deny };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function patternToRegex(pattern) {
  const normalized = normalizeRelativePath(pattern);
  let source = "";
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];
    if (char === "*" && next === "*") {
      const after = normalized[index + 2];
      if (after === "/") {
        source += "(?:.*/)?";
        index += 2;
      } else {
        source += ".*";
        index += 1;
      }
    } else if (char === "*") {
      source += "[^/]*";
    } else {
      source += escapeRegex(char);
    }
  }
  return new RegExp(`^${source}$`);
}

function matchesAny(relativePath, patterns) {
  const normalized = normalizeRelativePath(relativePath);
  return patterns.some((pattern) => patternToRegex(pattern).test(normalized));
}

function isAllowedByShareRules(relativePath, rules) {
  if (!matchesAny(relativePath, rules.allow)) return false;
  if (matchesAny(relativePath, rules.deny)) return false;
  return true;
}

module.exports = { isAllowedByShareRules, parseShareRules, patternToRegex };
