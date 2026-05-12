const crypto = require("node:crypto");

const ROLE_PERMISSIONS = {
  owner: ["delete", "members", "invite", "upload", "sync", "reindex", "route", "read"],
  admin: ["members", "invite", "upload", "sync", "reindex", "route", "read"],
  contributor: ["upload", "sync", "route", "read"],
  reader: ["sync", "route", "read"]
};

function createToken(prefix) {
  return `${prefix}_${crypto.randomBytes(18).toString("hex")}`;
}

function can(role, permission) {
  return Boolean(ROLE_PERMISSIONS[role] && ROLE_PERMISSIONS[role].includes(permission));
}

function parseBearerToken(headers) {
  const value = headers.authorization || headers.Authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(value);
  return match ? match[1] : null;
}

module.exports = { ROLE_PERMISSIONS, can, createToken, parseBearerToken };
