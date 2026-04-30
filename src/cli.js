import { clearCopilotTokenCache, getAuthStatus, loginWithDeviceFlow } from "./auth.js";
import { clearConfig, getConfigPath } from "./config.js";
import { startServer } from "./server.js";

function parseOptions(args) {
  const options = {};

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (!value.startsWith("--")) {
      continue;
    }

    const [key, inlineValue] = value.slice(2).split("=", 2);
    options[key] = inlineValue ?? args[index + 1] ?? true;
    if (inlineValue === undefined && args[index + 1] && !args[index + 1].startsWith("--")) {
      index += 1;
    }
  }

  return options;
}

function printHelp(output = console) {
  output.log(`copilot-proxy

Usage:
  copilot-proxy serve [--host 127.0.0.1] [--port 4141]
  copilot-proxy auth login
  copilot-proxy auth status
  copilot-proxy auth logout

Environment:
  COPILOT_PROXY_SYSTEM_PROMPT   System prompt prepended to every chat request
  COPILOT_PROXY_DEFAULT_MODEL   Default model when a request omits model
  COPILOT_PROXY_API_KEY         Optional local API key for /v1 and /api routes
  COPILOT_GITHUB_TOKEN          GitHub OAuth or fine-grained token for Copilot
  GH_TOKEN, GITHUB_TOKEN        Fallback GitHub token environment variables
`);
}

async function runAuthCommand(args, output) {
  const subcommand = args[0] || "status";

  if (subcommand === "login") {
    await loginWithDeviceFlow({ output });
    output.log(`Credentials saved to ${getConfigPath()}`);
    return;
  }

  if (subcommand === "status") {
    const status = await getAuthStatus();
    output.log(status.authenticated
      ? `Authenticated via ${status.source}.`
      : "Not authenticated. Run `copilot-proxy auth login`.");
    return;
  }

  if (subcommand === "logout") {
    await clearConfig();
    clearCopilotTokenCache();
    output.log("Stored credentials removed.");
    return;
  }

  throw new Error(`Unknown auth command: ${subcommand}`);
}

export async function runCli(args, { output = console } = {}) {
  const command = args[0] || "serve";

  if (command === "help" || command === "--help" || command === "-h") {
    printHelp(output);
    return;
  }

  if (command === "auth") {
    await runAuthCommand(args.slice(1), output);
    return;
  }

  if (command === "serve" || command === "start") {
    const options = parseOptions(args.slice(1));
    const host = String(options.host || process.env.HOST || process.env.COPILOT_PROXY_HOST || "127.0.0.1");
    const port = Number(options.port || process.env.PORT || process.env.COPILOT_PROXY_PORT || 4141);

    if (!Number.isInteger(port) || port <= 0) {
      throw new Error(`Invalid port: ${options.port}`);
    }

    await startServer({ host, port, output });
    return;
  }

  throw new Error(`Unknown command: ${command}. Run \`copilot-proxy help\`.`);
}
