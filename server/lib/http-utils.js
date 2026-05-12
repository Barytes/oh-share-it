const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const DEFAULT_JSON_BODY_LIMIT_BYTES = 1024 * 1024;
const PUBLIC_ERROR_MESSAGES = {
  400: "Bad request",
  401: "Unauthorized",
  403: "Forbidden",
  404: "Not found",
  413: "Payload too large",
  500: "Internal server error"
};

function statusError(statusCode, message = PUBLIC_ERROR_MESSAGES[statusCode]) {
  const error = new Error(message || http.STATUS_CODES[statusCode] || "Request failed");
  error.statusCode = statusCode;
  return error;
}

async function readJsonRequest(request, { maxBytes = DEFAULT_JSON_BODY_LIMIT_BYTES } = {}) {
  const chunks = [];
  let receivedBytes = 0;

  for await (const chunk of request) {
    receivedBytes += chunk.length;
    if (receivedBytes > maxBytes) {
      throw statusError(413);
    }
    chunks.push(chunk);
  }

  const body = Buffer.concat(chunks).toString("utf8");
  return body ? JSON.parse(body) : {};
}

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

function sendError(response, statusCode, error) {
  const publicMessage = PUBLIC_ERROR_MESSAGES[statusCode]
    || http.STATUS_CODES[statusCode]
    || PUBLIC_ERROR_MESSAGES[500];
  sendJson(response, statusCode, { error: publicMessage });
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

module.exports = { readJsonRequest, sendError, sendJson, serveStatic, staticContentType, statusError };
