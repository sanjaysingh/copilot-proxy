import { createServer as createHttpServer } from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { clearCopilotTokenCache, getAuthStatus, pollDeviceFlow, startDeviceFlow } from "./auth.js";
import { clearConfig } from "./config.js";
import { fetchCopilotModels, proxyChatCompletion } from "./copilot.js";
import { HttpError, toOpenAiError } from "./errors.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, "../public");

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

function setCors(response) {
  response.setHeader("Access-Control-Allow-Origin", process.env.COPILOT_PROXY_CORS_ORIGIN || "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type,X-API-Key");
}

function hasValidProxyApiKey(request) {
  const expected = process.env.COPILOT_PROXY_API_KEY;
  if (!expected) {
    return true;
  }

  const authorization = request.headers.authorization || "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length) : "";
  return bearer === expected || request.headers["x-api-key"] === expected;
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;
    if (size > 4 * 1024 * 1024) {
      throw new HttpError(413, "Request body is too large.");
    }
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Request body must be valid JSON.");
  }
}

function routeRequiresApiKey(pathname) {
  return pathname.startsWith("/v1/") || pathname.startsWith("/api/");
}

async function serveIndex(response) {
  const html = await fs.readFile(path.join(PUBLIC_DIR, "index.html"), "utf8");
  response.statusCode = 200;
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.end(html);
}

async function handleRequest(request, response) {
  setCors(response);

  if (request.method === "OPTIONS") {
    response.statusCode = 204;
    response.end();
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);
  const pathname = url.pathname;

  if (routeRequiresApiKey(pathname) && !hasValidProxyApiKey(request)) {
    throw new HttpError(401, "Invalid proxy API key.");
  }

  if (request.method === "GET" && (pathname === "/" || pathname === "/index.html")) {
    await serveIndex(response);
    return;
  }

  if (request.method === "GET" && pathname === "/health") {
    sendJson(response, 200, { status: "ok" });
    return;
  }

  if (request.method === "GET" && pathname === "/api/auth/status") {
    sendJson(response, 200, await getAuthStatus());
    return;
  }

  if (request.method === "POST" && pathname === "/api/auth/device/start") {
    sendJson(response, 200, await startDeviceFlow());
    return;
  }

  if (request.method === "POST" && pathname === "/api/auth/device/poll") {
    const body = await readJsonBody(request);
    if (!body.device_code) {
      throw new HttpError(400, "`device_code` is required.");
    }

    sendJson(response, 200, await pollDeviceFlow(body.device_code));
    return;
  }

  if (request.method === "POST" && pathname === "/api/auth/logout") {
    await clearConfig();
    clearCopilotTokenCache();
    sendJson(response, 200, { status: "logged_out" });
    return;
  }

  if (request.method === "GET" && pathname === "/v1/models") {
    sendJson(response, 200, await fetchCopilotModels());
    return;
  }

  if (request.method === "GET" && pathname.startsWith("/v1/models/")) {
    const id = decodeURIComponent(pathname.slice("/v1/models/".length));
    const models = await fetchCopilotModels();
    const model = models.data.find((candidate) => candidate.id === id);
    if (!model) {
      throw new HttpError(404, `Model not found: ${id}`);
    }

    sendJson(response, 200, model);
    return;
  }

  if (request.method === "POST" && pathname === "/v1/chat/completions") {
    const body = await readJsonBody(request);
    await proxyChatCompletion(body, response);
    return;
  }

  throw new HttpError(404, "Not found.");
}

export function createServer() {
  return createHttpServer((request, response) => {
    handleRequest(request, response).catch((error) => {
      if (response.writableEnded) {
        return;
      }

      const statusCode = error.statusCode || 500;
      sendJson(response, statusCode, toOpenAiError(error));
    });
  });
}

export async function startServer({ host = "127.0.0.1", port = 4141, output = console } = {}) {
  const server = createServer();

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });

  const address = server.address();
  const url = `http://${address.address === "::" ? "localhost" : address.address}:${address.port}`;
  output.log(`copilot-proxy listening at ${url}`);
  output.log(`Open the chat UI at ${url}`);
  output.log(`OpenAI base URL: ${url}/v1`);

  return server;
}
