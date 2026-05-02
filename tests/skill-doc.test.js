const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

test("oh-share-it skill documents slash commands and default workflow", () => {
  const skill = fs.readFileSync("skills/oh-share-it/SKILL.md", "utf8");

  assert.match(skill, /\/share-it/);
  assert.match(skill, /\/share-me(?:\s|`)/);
  assert.match(skill, /\/share-me join/);
  assert.match(skill, /\/share-me libraries/);
  assert.match(skill, /\/share-me query/);
  assert.match(skill, /share-it\.rules/);
  assert.match(skill, /\.oh-share-it\/binding\.json/);
  assert.match(skill, /~\/\.oh-share-it\/credentials\.json/);
  assert.match(skill, /sync and browse/i);
});

test("oh-share-it skill gives practical cli commands and secret guidance", () => {
  const skill = fs.readFileSync("skills/oh-share-it/SKILL.md", "utf8");

  assert.match(skill, /node cli\/share-it\.js share --name/);
  assert.match(skill, /node cli\/share-it\.js sync/);
  assert.match(skill, /node cli\/share-it\.js join --invite/);
  assert.match(skill, /node cli\/share-it\.js libraries/);
  assert.match(skill, /node cli\/share-it\.js query/);
  assert.match(skill, /secrets/i);
  assert.match(skill, /share-it\.rules intent/i);
});
