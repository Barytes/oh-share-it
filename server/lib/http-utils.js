const fs = require("node:fs");
const path = require("node:path");

async function readJsonRequest(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString("utf8");
  return body ? JSON.parse(body) : {};
}

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

function sendError(response, statusCode, error) {
  sendJson(response, statusCode, { error: error.message || String(error) });
}

function serveStatic(response, filePath, contentType) {
  response.writeHead(200, { "content-type": contentType });
  response.end(fs.readFileSync(filePath));
}

function staticContentType(filePath) {
  if (filePath.endsWith(".js")) return "text/javascript";
  if (filePath.endsWith(".css")) return "text/css";
  if (filePath.endsWith(".html")) return "text/html";
  return "text/plain";
}

module.exports = { readJsonRequest, sendError, sendJson, serveStatic, staticContentType };
