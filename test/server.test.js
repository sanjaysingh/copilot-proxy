import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createServer } from "../src/server.js";

const previousApiKey = process.env.COPILOT_PROXY_API_KEY;

afterEach(() => {
  if (previousApiKey === undefined) {
    delete process.env.COPILOT_PROXY_API_KEY;
  } else {
    process.env.COPILOT_PROXY_API_KEY = previousApiKey;
  }
});

async function withServer(callback) {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const address = server.address();
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("health endpoint returns ok", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
  });
});

test("optional proxy API key protects API routes", async () => {
  process.env.COPILOT_PROXY_API_KEY = "secret";

  await withServer(async (baseUrl) => {
    const blocked = await fetch(`${baseUrl}/api/auth/status`);
    assert.equal(blocked.status, 401);

    const allowed = await fetch(`${baseUrl}/api/auth/status`, {
      headers: { Authorization: "Bearer secret" }
    });
    assert.equal(allowed.status, 200);
  });
});
