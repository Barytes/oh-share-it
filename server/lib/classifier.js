function classifyPath(relativePath) {
  const lower = relativePath.toLowerCase();
  const tags = [];

  if (lower.endsWith("skill.md") || lower.includes("/skills/") || lower.includes("runbook")) {
    tags.push("agent", "workflow");
    return { type: "skill", tags };
  }

  if (
    lower.includes("handoff") ||
    lower.includes("retro") ||
    lower.includes("retrospective") ||
    lower.includes("meeting") ||
    lower.includes("notes/") ||
    /\d{4}-\d{2}-\d{2}/.test(lower)
  ) {
    tags.push("history");
    return { type: "memory", tags };
  }

  if (lower.includes("decision") || lower.includes("adr")) tags.push("decision");
  if (lower.includes("architecture") || lower.includes("architectue")) tags.push("architecture");
  if (lower.includes("reference")) tags.push("reference");
  return { type: "resource", tags };
}

module.exports = { classifyPath };
