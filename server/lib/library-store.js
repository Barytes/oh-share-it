const fs = require("node:fs");
const path = require("node:path");
const { can, createToken } = require("./auth");
const { ensureDir, readJsonFile, safeJoin, writeJsonFile } = require("./fs-utils");

function createStore({ dataDir }) {
  const librariesDir = path.join(dataDir, "libraries");
  ensureDir(librariesDir);

  function libraryDir(name) {
    return safeJoin(librariesDir, name);
  }

  function membersPath(name) {
    return path.join(libraryDir(name), "members.json");
  }

  function invitesPath(name) {
    return path.join(libraryDir(name), "invites.json");
  }

  function audit(name, event) {
    const line = JSON.stringify({ at: new Date().toISOString(), ...event }) + "\n";
    fs.appendFileSync(path.join(libraryDir(name), "audit.log"), line);
  }

  function readMembers(name) {
    return readJsonFile(membersPath(name), { members: [] });
  }

  function writeMembers(name, value) {
    writeJsonFile(membersPath(name), value);
  }

  function readInvites(name) {
    return readJsonFile(invitesPath(name), { invites: [] });
  }

  function writeInvites(name, value) {
    writeJsonFile(invitesPath(name), value);
  }

  function findMemberByToken(name, token) {
    return readMembers(name).members.find(member => member.token === token) || null;
  }

  function getMemberRole(name, token) {
    const member = findMemberByToken(name, token);
    return member ? member.role : null;
  }

  function assertPermission(name, token, permission) {
    const member = findMemberByToken(name, token);
    if (!member || !can(member.role, permission)) {
      throw new Error(`Permission denied for ${permission}`);
    }
    return member;
  }

  function createLibrary({ name, owner }) {
    const dir = libraryDir(name);
    ensureDir(path.join(dir, "shares"));
    ensureDir(path.join(dir, "indexes"));
    writeJsonFile(path.join(dir, "library.json"), {
      name,
      description: "",
      createdAt: new Date().toISOString()
    });
    const credential = { library: name, member: owner, role: "owner", token: createToken("osi_member") };
    writeMembers(name, { members: [credential] });
    writeInvites(name, { invites: [] });
    audit(name, { type: "library.created", actor: owner });
    return credential;
  }

  function createInvite({ libraryName, actorToken, role }) {
    const actor = assertPermission(libraryName, actorToken, "invite");
    const state = readInvites(libraryName);
    const invite = {
      token: createToken("osi_invite"),
      library: libraryName,
      role,
      createdBy: actor.member,
      createdAt: new Date().toISOString(),
      revoked: false
    };
    state.invites.push(invite);
    writeInvites(libraryName, state);
    audit(libraryName, { type: "invite.created", actor: actor.member, role });
    return invite;
  }

  function joinInvite({ token, member }) {
    const libraries = fs.readdirSync(librariesDir, { withFileTypes: true }).filter(entry => entry.isDirectory());
    for (const entry of libraries) {
      const state = readInvites(entry.name);
      const invite = state.invites.find(candidate => candidate.token === token);
      if (invite && !invite.revoked) {
        const credential = {
          library: invite.library,
          member,
          role: invite.role,
          token: createToken("osi_member")
        };
        const members = readMembers(invite.library);
        members.members = members.members.filter(existing => existing.member !== member);
        members.members.push(credential);
        writeMembers(invite.library, members);
        audit(invite.library, { type: "member.joined", actor: member, role: invite.role });
        return credential;
      }
    }
    throw new Error("Invite is invalid or revoked");
  }

  function removeMember({ libraryName, actorToken, member }) {
    const actor = assertPermission(libraryName, actorToken, "members");
    const state = readMembers(libraryName);
    state.members = state.members.filter(existing => existing.member !== member);
    writeMembers(libraryName, state);
    audit(libraryName, { type: "member.removed", actor: actor.member, member });
  }

  return {
    assertPermission,
    createInvite,
    createLibrary,
    getMemberRole,
    joinInvite,
    libraryDir,
    removeMember
  };
}

module.exports = { createStore };
