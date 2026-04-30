import assert from "node:assert/strict";
import { test } from "node:test";
import { fallbackModels, normalizeModelList, withSystemPrompt } from "../src/openai.js";

test("withSystemPrompt prepends an environment system prompt without mutating input", () => {
  const body = {
    model: "gpt-4o",
    messages: [{ role: "user", content: "Hello" }]
  };

  const next = withSystemPrompt(body, "Be brief.");

  assert.deepEqual(body.messages, [{ role: "user", content: "Hello" }]);
  assert.deepEqual(next.messages, [
    { role: "system", content: "Be brief." },
    { role: "user", content: "Hello" }
  ]);
});

test("withSystemPrompt sets a default model when omitted", () => {
  const next = withSystemPrompt({
    messages: [{ role: "user", content: "Hello" }]
  });

  assert.equal(next.model, process.env.COPILOT_PROXY_DEFAULT_MODEL || "gpt-4.1");
});

test("withSystemPrompt rejects malformed messages", () => {
  assert.throws(() => withSystemPrompt({ messages: "hello" }), /messages/);
});

test("normalizeModelList returns OpenAI list shape", () => {
  const result = normalizeModelList(["gpt-4.1", { id: "gpt-4o", owned_by: "github" }]);

  assert.equal(result.object, "list");
  assert.deepEqual(result.data.map((model) => model.id), ["gpt-4.1", "gpt-4o"]);
});

test("fallbackModels includes the default model once", () => {
  const result = fallbackModels();

  assert.equal(result.object, "list");
  assert.ok(result.data.some((model) => model.id === "gpt-4.1"));
  assert.equal(new Set(result.data.map((model) => model.id)).size, result.data.length);
});
