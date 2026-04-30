import { DEFAULT_MODEL } from "./constants.js";
import { HttpError } from "./errors.js";

export function withSystemPrompt(body, systemPrompt = process.env.COPILOT_PROXY_SYSTEM_PROMPT || "") {
  const messages = Array.isArray(body?.messages) ? body.messages : null;
  if (!messages) {
    throw new HttpError(400, "`messages` must be an array.");
  }

  const next = {
    ...body,
    model: body.model || process.env.COPILOT_PROXY_DEFAULT_MODEL || DEFAULT_MODEL,
    messages: messages.map((message) => ({ ...message }))
  };

  const trimmedPrompt = systemPrompt.trim();
  if (trimmedPrompt) {
    next.messages = [
      { role: "system", content: trimmedPrompt },
      ...next.messages
    ];
  }

  return next;
}

export function fallbackModels() {
  const ids = [
    process.env.COPILOT_PROXY_DEFAULT_MODEL || DEFAULT_MODEL,
    "gpt-4o",
    "gpt-4.1"
  ];
  const uniqueIds = [...new Set(ids.filter(Boolean))];

  return {
    object: "list",
    data: uniqueIds.map((id) => ({
      id,
      object: "model",
      created: 0,
      owned_by: "github-copilot"
    }))
  };
}

export function normalizeModelList(data) {
  if (data?.object === "list" && Array.isArray(data.data)) {
    return data;
  }

  const models = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : null;
  if (!models) {
    return fallbackModels();
  }

  return {
    object: "list",
    data: models.map((model) => {
      if (typeof model === "string") {
        return {
          id: model,
          object: "model",
          created: 0,
          owned_by: "github-copilot"
        };
      }

      return {
        object: "model",
        created: 0,
        owned_by: "github-copilot",
        ...model,
        id: model.id || model.name
      };
    }).filter((model) => model.id)
  };
}
