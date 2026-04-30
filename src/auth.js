import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readConfig, updateConfig } from "./config.js";
import {
  ACCESS_TOKEN_URL,
  COPILOT_CLIENT_ID,
  COPILOT_HEADERS,
  COPILOT_TOKEN_URL,
  DEVICE_CODE_URL
} from "./constants.js";
import { HttpError } from "./errors.js";

const execFileAsync = promisify(execFile);
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

let cachedCopilotToken = null;

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

export async function startDeviceFlow() {
  const response = await fetch(DEVICE_CODE_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...COPILOT_HEADERS
    },
    body: JSON.stringify({
      client_id: COPILOT_CLIENT_ID,
      scope: "read:user"
    })
  });

  const data = await readJsonResponse(response);
  if (!response.ok) {
    throw new HttpError(response.status, data.error_description || data.message || "Unable to start GitHub device login", data);
  }

  return data;
}

export async function pollDeviceFlow(deviceCode) {
  const response = await fetch(ACCESS_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...COPILOT_HEADERS
    },
    body: JSON.stringify({
      client_id: COPILOT_CLIENT_ID,
      device_code: deviceCode,
      grant_type: DEVICE_GRANT
    })
  });

  const data = await readJsonResponse(response);
  if (!response.ok) {
    throw new HttpError(response.status, data.error_description || data.message || "Unable to poll GitHub device login", data);
  }

  if (data.access_token) {
    await updateConfig({
      githubToken: data.access_token,
      githubTokenSource: "device",
      authenticatedAt: new Date().toISOString()
    });
    cachedCopilotToken = null;
    return { status: "success" };
  }

  if (data.error === "authorization_pending") {
    return { status: "pending" };
  }

  if (data.error === "slow_down") {
    return { status: "slow_down" };
  }

  if (data.error === "expired_token") {
    return { status: "expired" };
  }

  if (data.error) {
    throw new HttpError(400, data.error_description || data.error, data);
  }

  return { status: "pending" };
}

export async function loginWithDeviceFlow({ output = console } = {}) {
  const device = await startDeviceFlow();
  output.log("Open this URL in your browser:");
  output.log(`  ${device.verification_uri}`);
  output.log("");
  output.log("Enter this code:");
  output.log(`  ${device.user_code}`);
  output.log("");
  output.log("Waiting for GitHub authorization...");

  let intervalMs = Math.max(1, device.interval || 5) * 1000;
  const expiresAt = Date.now() + (device.expires_in || 900) * 1000;

  while (Date.now() < expiresAt) {
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
    const result = await pollDeviceFlow(device.device_code);

    if (result.status === "success") {
      output.log("GitHub authentication complete.");
      return;
    }

    if (result.status === "slow_down") {
      intervalMs += 5000;
    }

    if (result.status === "expired") {
      throw new HttpError(400, "GitHub device login expired. Start login again.");
    }
  }

  throw new HttpError(400, "GitHub device login expired. Start login again.");
}

async function getGhCliToken() {
  try {
    const { stdout } = await execFileAsync("gh", ["auth", "token"], { timeout: 5000 });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

export async function getGitHubTokenInfo() {
  if (process.env.COPILOT_GITHUB_TOKEN) {
    return { token: process.env.COPILOT_GITHUB_TOKEN, source: "COPILOT_GITHUB_TOKEN" };
  }

  if (process.env.GH_TOKEN) {
    return { token: process.env.GH_TOKEN, source: "GH_TOKEN" };
  }

  if (process.env.GITHUB_TOKEN) {
    return { token: process.env.GITHUB_TOKEN, source: "GITHUB_TOKEN" };
  }

  const config = await readConfig();
  if (config.githubToken) {
    return { token: config.githubToken, source: "device" };
  }

  const ghToken = await getGhCliToken();
  if (ghToken) {
    return { token: ghToken, source: "gh" };
  }

  return { token: null, source: null };
}

export async function getAuthStatus() {
  const tokenInfo = await getGitHubTokenInfo();
  return {
    authenticated: Boolean(tokenInfo.token),
    source: tokenInfo.source
  };
}

export async function getCopilotAccess() {
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (cachedCopilotToken?.token && cachedCopilotToken.expiresAt - 60 > nowSeconds) {
    return cachedCopilotToken;
  }

  const tokenInfo = await getGitHubTokenInfo();
  if (!tokenInfo.token) {
    throw new HttpError(401, "GitHub authentication is required. Run `copilot-proxy auth login` or use the web login.");
  }

  const response = await fetch(COPILOT_TOKEN_URL, {
    headers: {
      Accept: "application/json",
      Authorization: `token ${tokenInfo.token}`,
      ...COPILOT_HEADERS
    }
  });

  const data = await readJsonResponse(response);
  if (!response.ok) {
    const hint = response.status === 403
      ? "GitHub rejected the Copilot token request. Confirm the account has an active Copilot subscription."
      : "Unable to exchange GitHub token for a Copilot token.";
    throw new HttpError(response.status, data.message || hint, data);
  }

  cachedCopilotToken = {
    token: data.token,
    expiresAt: data.expires_at || nowSeconds + 600,
    refreshIn: data.refresh_in,
    endpoints: data.endpoints || {},
    source: tokenInfo.source
  };

  return cachedCopilotToken;
}

export function clearCopilotTokenCache() {
  cachedCopilotToken = null;
}
