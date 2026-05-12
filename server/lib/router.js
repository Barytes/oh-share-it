const fs = require("node:fs");
const path = require("node:path");

const ROUTE_MODES = new Set(["documents", "directories", "chunks"]);

function tokenize(value) {
  return String(value).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function scoreEntry(entry, queryTokens) {
  const haystack = tokenize([
    entry.uri,
    entry.sourcePath,
    entry.type,
    ...(entry.tags || []),
    entry.preview
  ].join(" "));
  return queryTokens.reduce((score, token) => score + haystack.filter(item => item.includes(token)).length, 0);
}

function routeQuery({ store, libraryName, actorToken, query, mode = "documents", shareName = null }) {
  store.assertPermission(libraryName, actorToken, "route");
  if (!ROUTE_MODES.has(mode)) {
    throw new Error(`Unsupported route mode: ${mode}`);
  }

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    return { query, mode, results: [] };
  }

  const libraryDir = store.libraryDir(libraryName);
  const l2Path = path.join(libraryDir, "indexes", "L2.json");
  if (!fs.existsSync(l2Path)) {
    return { query, mode, results: [] };
  }

  const l2 = JSON.parse(fs.readFileSync(l2Path, "utf8"));
  const scored = l2.entries
    .filter(entry => !shareName || entry.shareName === shareName)
    .map(entry => ({ entry, score: scoreEntry(entry, queryTokens) }))
    .filter(row => row.score > 0)
    .sort((left, right) => right.score - left.score || left.entry.uri.localeCompare(right.entry.uri))
    .slice(0, 10);

  const results = scored.map(({ entry, score }) => {
    const base = {
      uri: entry.uri,
      path: `${libraryName}/${entry.classifiedPath}`,
      type: entry.type,
      score,
      why: `Matched ${queryTokens.join(", ")} against path, type, tags, or preview.`
    };
    if (mode === "directories") {
      return { ...base, directory: path.dirname(entry.classifiedPath) };
    }
    if (mode === "chunks") {
      return { ...base, chunk: entry.preview };
    }
    return base;
  });

  return { query, mode, results };
}

module.exports = { routeQuery, tokenize };
