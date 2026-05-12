const test = require("node:test");
const assert = require("node:assert/strict");
const { parseShareRules, isAllowedByShareRules } = require("../server/lib/share-rules");

test("parseShareRules supports comments, allow, and deny", () => {
  const rules = parseShareRules(`
# comment
+ README.md
+ docs/**
- **/.env
- **/*.log
`);
  assert.deepEqual(rules.allow, ["README.md", "docs/**"]);
  assert.deepEqual(rules.deny, ["**/.env", "**/*.log"]);
});

test("explicit allow is required", () => {
  const rules = parseShareRules("+ docs/**");
  assert.equal(isAllowedByShareRules("src/index.js", rules), false);
});

test("allow pattern matches nested files", () => {
  const rules = parseShareRules("+ docs/**");
  assert.equal(isAllowedByShareRules("docs/decisions/a.md", rules), true);
});

test("deny wins over allow", () => {
  const rules = parseShareRules(`
+ docs/**
- **/*.log
`);
  assert.equal(isAllowedByShareRules("docs/debug.log", rules), false);
});

test("bare filename pattern matches only that normalized relative path", () => {
  const rules = parseShareRules("+ README.md");
  assert.equal(isAllowedByShareRules("README.md", rules), true);
  assert.equal(isAllowedByShareRules("docs/README.md", rules), false);
});
