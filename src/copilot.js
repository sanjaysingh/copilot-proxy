import { Readable } from "node:stream";
import { getCopilotAccess } from "./auth.js";
import { COPILOT_HEADERS, DEFAULT_COPILOT_API_URL } from "./constants.js";
import { HttpError } from "./errors.js";
import { fallbackModels, normalizeModelList, withSystemPrompt } from "./openai.js";

function trimTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

async function createCopilotRequest(pathname, options = {}) {
  const access = await getCopilotAccess();
  const baseUrl = trimTrailingSlash(
    process.env.COPILOT_API_URL || access.endpoints?.api || DEFAULT_COPILOT_API_URL
  );

  return fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${access.token}`,
      ...COPILOT_HEADERS,
      ...options.headers
    }
  });
}

export async function fetchCopilotModels() {
  try {
    const response = await createCopilotRequest("/models");
    const data = await readJsonResponse(response);
    if (!response.ok) {
      return fallbackModels();
    }

    return normalizeModelList(data);
  } catch (error) {
    if (error.statusCode === 401) {
      throw error;
    }
    return fallbackModels();
  }
}

export async function proxyChatCompletion(requestBody, nodeResponse) {
  const body = withSystemPrompt(requestBody);
  const response = await createCopilotRequest("/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  nodeResponse.statusCode = response.status;
  for (const [key, value] of response.headers.entries()) {
    if (["content-type", "cache-control"].includes(key.toLowerCase())) {
      nodeResponse.setHeader(key, value);
    }
  }

  if (!response.ok) {
    const data = await readJsonResponse(response);
    throw new HttpError(response.status, data.message || data.error?.message || "GitHub Copilot request failed", data);
  }

  if (!response.body) {
    nodeResponse.end();
    return;
  }

  Readable.fromWeb(response.body).pipe(nodeResponse);
}
