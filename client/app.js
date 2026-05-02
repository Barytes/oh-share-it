const state = {
  token: "",
  libraries: [],
  selectedLibrary: null,
  selectedShare: null
};

const els = {
  token: document.querySelector("#token"),
  refresh: document.querySelector("#refresh"),
  status: document.querySelector("#status"),
  libraries: document.querySelector("#libraries"),
  selectedTitle: document.querySelector("#selected-title"),
  libraryMeta: document.querySelector("#library-meta"),
  indexes: document.querySelector("#indexes"),
  shares: document.querySelector("#shares"),
  detailHeading: document.querySelector("#detail-heading"),
  detail: document.querySelector("#detail"),
  sync: document.querySelector("#sync"),
  members: document.querySelector("#members"),
  invites: document.querySelector("#invites"),
  inviteRole: document.querySelector("#invite-role"),
  inviteCreate: document.querySelector("#invite-create"),
  reindex: document.querySelector("#reindex"),
  routeForm: document.querySelector("#route-form"),
  query: document.querySelector("#query"),
  routeMode: document.querySelector("#route-mode")
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setSafeHtml(element, html) {
  element.replaceChildren();
  element.insertAdjacentHTML("afterbegin", html);
}

function authHeaders() {
  return state.token ? { authorization: `Bearer ${state.token}` } : {};
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      ...authHeaders()
    }
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `Request failed with ${response.status}`);
  }
  return data;
}

function decodeBase64(contentBase64) {
  const bytes = Uint8Array.from(atob(contentBase64 || ""), char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function displayStatus(message) {
  els.status.textContent = message;
}

function setDetail(title, html) {
  els.detailHeading.textContent = title;
  setSafeHtml(els.detail, html);
}

function metadataRows(rows) {
  return rows
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([label, value]) => `
      <div class="meta-item">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(value)}</strong>
      </div>
    `)
    .join("");
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function renderJson(title, value) {
  setDetail(title, `<pre>${escapeHtml(JSON.stringify(value, null, 2))}</pre>`);
}

function renderText(title, text, path) {
  const language = path && path.endsWith(".json") ? "json" : "text";
  let rendered = text;
  if (language === "json") {
    try {
      rendered = JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      rendered = text;
    }
  }
  setDetail(title, `<pre>${escapeHtml(rendered)}</pre>`);
}

function makeButton(label, onClick, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  button.addEventListener("click", onClick);
  return button;
}

function renderLibraries() {
  els.libraries.replaceChildren();
  if (state.libraries.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No authorized libraries found.";
    els.libraries.appendChild(empty);
    return;
  }

  for (const library of state.libraries) {
    const button = makeButton(`${library.name} / ${library.role}`, () => selectLibrary(library.name), "library-button");
    if (library.name === state.selectedLibrary) button.classList.add("active");
    els.libraries.appendChild(button);
  }
}

function renderIndexButtons(libraryName, indexes, shareName = "") {
  const root = shareName ? document.createElement("div") : els.indexes;
  if (!shareName) root.replaceChildren();

  for (const index of indexes || []) {
    const filePath = shareName ? `shares/${shareName}/${index.path}` : index.path;
    const button = makeButton(`${filePath} (${index.size}b)`, () => readFile(filePath), "index-button");
    root.appendChild(button);
  }

  if (shareName) return root;
  if (!indexes || indexes.length === 0) {
    root.appendChild(document.createTextNode("No indexes generated yet."));
  }
}

function renderLibraryMeta(detail) {
  setSafeHtml(els.libraryMeta, metadataRows([
    ["Name", detail.name],
    ["Role", detail.role],
    ["Description", detail.description || "No description"],
    ["Created", formatDate(detail.createdAt)],
    ["Indexes", (detail.indexes || []).length]
  ]));
}

function summarizeEntries(entries) {
  const counts = { resource: 0, memory: 0, skill: 0 };
  for (const entry of entries || []) {
    if (Object.hasOwn(counts, entry.type)) counts[entry.type] += 1;
  }
  return counts;
}

function renderShares(shares) {
  els.shares.replaceChildren();
  if (!shares || shares.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No share folders yet.";
    els.shares.appendChild(empty);
    return;
  }

  for (const share of shares) {
    const item = document.createElement("article");
    item.className = "share-row";
    const summary = metadataRows([
      ["Share", share.shareName || share.name],
      ["Member", share.member],
      ["Files", share.fileCount ?? share.entryCount],
      ["Created", formatDate(share.createdAt)]
    ]);
    setSafeHtml(item, summary);
    item.appendChild(makeButton("Open", () => selectShare(share.shareName || share.name), "small-button"));
    els.shares.appendChild(item);
  }
}

function renderManifest(manifest) {
  const counts = summarizeEntries(manifest.entries);
  const indexButtons = renderIndexButtons(state.selectedLibrary, manifest.indexes, manifest.shareName);
  const indexHost = document.createElement("div");
  indexHost.className = "button-list inline";
  indexHost.append(...indexButtons.childNodes);

  const groups = ["resource", "memory", "skill"].map(type => {
    const entries = (manifest.entries || []).filter(entry => entry.type === type);
    if (entries.length === 0) return "";
    const rows = entries.map(entry => `
      <li>
        <span>${escapeHtml(entry.sourcePath)}</span>
        <button type="button" data-read="${escapeHtml(entry.rawPath)}">Raw</button>
        <button type="button" data-read="${escapeHtml(entry.classifiedPath)}">Indexed</button>
      </li>
    `).join("");
    return `<section class="entry-group"><h4>${escapeHtml(type)} (${entries.length})</h4><ul>${rows}</ul></section>`;
  }).join("");

  setDetail(manifest.shareName, `
    <div class="manifest-summary">
      ${metadataRows([
        ["Share", manifest.shareName],
        ["Member", manifest.member],
        ["Created", formatDate(manifest.createdAt)],
        ["Resources", counts.resource],
        ["Memories", counts.memory],
        ["Skills", counts.skill]
      ])}
    </div>
    <h4>Share indexes</h4>
    <div class="button-list inline" data-share-indexes></div>
    ${groups || "<p>No manifest entries.</p>"}
  `);

  const shareIndexHost = els.detail.querySelector("[data-share-indexes]");
  if (shareIndexHost) shareIndexHost.append(...indexHost.childNodes);

  for (const button of els.detail.querySelectorAll("[data-read]")) {
    button.addEventListener("click", () => readFile(button.getAttribute("data-read")));
  }
}

async function refreshLibraries() {
  state.token = els.token.value.trim();
  state.selectedLibrary = null;
  state.selectedShare = null;
  els.sync.disabled = true;
  els.members.disabled = true;
  els.invites.disabled = true;
  els.inviteRole.disabled = true;
  els.inviteCreate.disabled = true;
  els.reindex.disabled = true;
  displayStatus("Loading libraries...");
  try {
    const data = await requestJson("/api/libraries");
    state.libraries = data.libraries || [];
    renderLibraries();
    displayStatus(`${state.libraries.length} authorized libraries.`);
    if (state.libraries.length > 0) await selectLibrary(state.libraries[0].name);
  } catch (error) {
    state.libraries = [];
    renderLibraries();
    displayStatus(error.message);
  }
}

async function selectLibrary(name) {
  state.selectedLibrary = name;
  state.selectedShare = null;
  renderLibraries();
  els.selectedTitle.textContent = name;
  els.sync.disabled = false;
  els.members.disabled = false;
  els.invites.disabled = false;
  els.inviteRole.disabled = false;
  els.inviteCreate.disabled = false;
  els.reindex.disabled = false;
  displayStatus(`Loading ${name}...`);
  try {
    const [detail, shares] = await Promise.all([
      requestJson(`/api/libraries/${encodeURIComponent(name)}`),
      requestJson(`/api/libraries/${encodeURIComponent(name)}/shares`)
    ]);
    renderLibraryMeta(detail);
    renderIndexButtons(name, detail.indexes);
    renderShares(shares.shares || []);
    renderJson("Library metadata", detail);
    displayStatus(`${name} loaded.`);
  } catch (error) {
    displayStatus(error.message);
  }
}

async function selectShare(shareName) {
  if (!state.selectedLibrary) return;
  state.selectedShare = shareName;
  displayStatus(`Loading share ${shareName}...`);
  try {
    const manifest = await requestJson(
      `/api/libraries/${encodeURIComponent(state.selectedLibrary)}/shares/${encodeURIComponent(shareName)}`
    );
    renderManifest(manifest);
    displayStatus(`${shareName} loaded.`);
  } catch (error) {
    displayStatus(error.message);
  }
}

async function readFile(filePath) {
  if (!state.selectedLibrary) return;
  displayStatus(`Reading ${filePath}...`);
  try {
    const data = await requestJson(
      `/api/libraries/${encodeURIComponent(state.selectedLibrary)}/file?path=${encodeURIComponent(filePath)}`
    );
    renderText(data.path, decodeBase64(data.contentBase64), data.path);
    displayStatus(`${data.path} read.`);
  } catch (error) {
    displayStatus(error.message);
  }
}

async function readSyncSnapshot() {
  if (!state.selectedLibrary) return;
  displayStatus("Reading sync snapshot...");
  try {
    const snapshot = await requestJson(`/api/libraries/${encodeURIComponent(state.selectedLibrary)}/sync`);
    const files = (snapshot.files || []).map(file => file.path).sort();
    setDetail("Sync snapshot", `
      <p>${escapeHtml(files.length)} files available through sync.</p>
      <pre>${escapeHtml(files.join("\n"))}</pre>
    `);
    displayStatus("Sync snapshot loaded.");
  } catch (error) {
    displayStatus(error.message);
  }
}

async function showMembers() {
  if (!state.selectedLibrary) return;
  displayStatus("Loading members...");
  try {
    const data = await requestJson(`/api/libraries/${encodeURIComponent(state.selectedLibrary)}/members`);
    const members = (data.members || []).map(member => ({
      member: member.member,
      role: member.role,
      library: member.library
    }));
    renderJson("Members", { members });
    displayStatus(`${members.length} members visible.`);
  } catch (error) {
    setDetail("Members", `<p>${escapeHtml(error.message)}</p>`);
    displayStatus(error.message);
  }
}

async function showInvites() {
  if (!state.selectedLibrary) return;
  displayStatus("Loading invites...");
  try {
    const data = await requestJson(`/api/libraries/${encodeURIComponent(state.selectedLibrary)}/invites`);
    const invites = (data.invites || []).map(invite => ({
      token: invite.token,
      role: invite.role,
      createdBy: invite.createdBy,
      createdAt: invite.createdAt,
      revoked: invite.revoked,
      consumedBy: invite.consumedBy,
      consumedAt: invite.consumedAt
    }));
    renderJson("Invites", { invites });
    displayStatus(`${invites.length} invites visible.`);
  } catch (error) {
    setDetail("Invites", `<p>${escapeHtml(error.message)}</p>`);
    displayStatus(error.message);
  }
}

async function createInvite() {
  if (!state.selectedLibrary) return;
  const role = els.inviteRole.value;
  displayStatus(`Creating ${role} invite...`);
  try {
    const invite = await requestJson(`/api/libraries/${encodeURIComponent(state.selectedLibrary)}/invites`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role })
    });
    renderJson("Created invite", invite);
    displayStatus(`Invite created for ${invite.role}.`);
  } catch (error) {
    displayStatus(error.message);
  }
}

async function reindexLibrary() {
  if (!state.selectedLibrary) return;
  displayStatus("Reindexing...");
  try {
    await requestJson(`/api/libraries/${encodeURIComponent(state.selectedLibrary)}/reindex`, { method: "POST" });
    await selectLibrary(state.selectedLibrary);
    displayStatus("Reindex complete.");
  } catch (error) {
    displayStatus(error.message);
  }
}

async function routeQuery(event) {
  event.preventDefault();
  if (!state.selectedLibrary) {
    displayStatus("Select a library before routing.");
    return;
  }
  const query = els.query.value.trim();
  if (!query) {
    displayStatus("Enter a query.");
    return;
  }
  displayStatus("Routing query...");
  try {
    const data = await requestJson("/api/route", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        library: state.selectedLibrary,
        shareName: state.selectedShare || undefined,
        query,
        mode: els.routeMode.value
      })
    });
    renderJson("Route results", data);
    displayStatus(`${(data.results || []).length} route results.`);
  } catch (error) {
    displayStatus(error.message);
  }
}

els.refresh.addEventListener("click", refreshLibraries);
els.token.addEventListener("keydown", event => {
  if (event.key === "Enter") refreshLibraries();
});
els.sync.addEventListener("click", readSyncSnapshot);
els.members.addEventListener("click", showMembers);
els.invites.addEventListener("click", showInvites);
els.inviteCreate.addEventListener("click", createInvite);
els.reindex.addEventListener("click", reindexLibrary);
els.routeForm.addEventListener("submit", routeQuery);
