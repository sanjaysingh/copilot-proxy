# copilot-proxy

An OpenAI-compatible local API server for GitHub Copilot, with GitHub device login and a bundled browser chat UI.

`copilot-proxy` lets OpenAI-compatible tools talk to GitHub Copilot through a local `/v1` API. It handles GitHub device authentication, exchanges your GitHub token for a short-lived Copilot token, prepends an optional system prompt, and proxies chat completions to Copilot.

> This project uses GitHub Copilot APIs behind the scenes. You need an active GitHub Copilot subscription and must follow GitHub's terms for your account and organization.

## Features

- OpenAI-compatible `POST /v1/chat/completions`
- OpenAI-compatible `GET /v1/models`
- GitHub device login from the CLI or bundled web UI
- Optional `COPILOT_PROXY_SYSTEM_PROMPT` applied to every chat request
- Optional local API key protection
- Simple browser chat interface at `/`
- Dependency-light Node.js package that can be installed globally

## Install

```bash
npm install -g @sanjaysingh/copilot-proxy
```

Install directly from GitHub:

```bash
npm install -g github:sanjaysingh/copilot-proxy#main
```

You can also run the project directly from a checkout:

```bash
npm install
npm start
```

## Quick Start

```bash
copilot-proxy auth login
copilot-proxy serve
```

Open the chat UI:

```text
http://127.0.0.1:4141
```

Use the OpenAI-compatible base URL:

```text
http://127.0.0.1:4141/v1
```

Most OpenAI clients require an API key value. If you did not set `COPILOT_PROXY_API_KEY`, any placeholder value is fine.

## Chat Completions

```bash
curl http://127.0.0.1:4141/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4.1",
    "messages": [
      { "role": "user", "content": "Write a haiku about local proxies." }
    ]
  }'
```

Streaming is supported:

```bash
curl http://127.0.0.1:4141/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4.1",
    "stream": true,
    "messages": [
      { "role": "user", "content": "Explain SSE in one paragraph." }
    ]
  }'
```

## Authentication

Interactive login:

```bash
copilot-proxy auth login
```

Check status:

```bash
copilot-proxy auth status
```

Logout:

```bash
copilot-proxy auth logout
```

Credentials from device login are stored in `~/.copilot-proxy/config.json` with user-only file permissions. For non-interactive use, set one of these environment variables instead:

1. `COPILOT_GITHUB_TOKEN`
2. `GH_TOKEN`
3. `GITHUB_TOKEN`

If no stored or environment token is available, `copilot-proxy` will try `gh auth token` as a fallback.

## System Prompt

Set `COPILOT_PROXY_SYSTEM_PROMPT` before starting the server:

```bash
COPILOT_PROXY_SYSTEM_PROMPT="You are concise and always answer with examples." \
  copilot-proxy serve
```

The prompt is prepended as a system message to every `/v1/chat/completions` request.

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `COPILOT_PROXY_HOST` / `HOST` | `127.0.0.1` | Host for the HTTP server |
| `COPILOT_PROXY_PORT` / `PORT` | `4141` | Port for the HTTP server |
| `COPILOT_PROXY_SYSTEM_PROMPT` | unset | System prompt prepended to every chat request |
| `COPILOT_PROXY_DEFAULT_MODEL` | `gpt-4.1` | Model used when a request omits `model` |
| `COPILOT_PROXY_API_KEY` | unset | Optional API key required for `/v1` and `/api` routes |
| `COPILOT_PROXY_CORS_ORIGIN` | `*` | CORS allow-origin value |
| `COPILOT_PROXY_CONFIG_DIR` | `~/.copilot-proxy` | Directory for stored device-login credentials |
| `COPILOT_API_URL` | Copilot token endpoint value | Override the Copilot API base URL |

CLI flags override host and port:

```bash
copilot-proxy serve --host 0.0.0.0 --port 8080
```

If you bind to anything other than localhost, set `COPILOT_PROXY_API_KEY`.

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/` | Browser chat UI |
| `GET` | `/health` | Health check |
| `GET` | `/v1/models` | OpenAI-compatible model list |
| `GET` | `/v1/models/:id` | OpenAI-compatible model metadata |
| `POST` | `/v1/chat/completions` | OpenAI-compatible chat completion proxy |
| `GET` | `/api/auth/status` | Local auth status for the web UI |
| `POST` | `/api/auth/device/start` | Start GitHub device login |
| `POST` | `/api/auth/device/poll` | Poll GitHub device login |
| `POST` | `/api/auth/logout` | Remove stored credentials |

## OpenAI Client Example

```js
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://127.0.0.1:4141/v1",
  apiKey: process.env.COPILOT_PROXY_API_KEY || "local"
});

const response = await client.chat.completions.create({
  model: "gpt-4.1",
  messages: [{ role: "user", content: "Hello from Copilot." }]
});

console.log(response.choices[0].message.content);
```

## Releases

Releases are automated with Release Please. Merge normal PRs into `main` with conventional commit-style squash titles:

- `feat: add model picker` creates a minor release.
- `fix: refresh expired Copilot token` creates a patch release.
- `feat!: change auth config format` creates a major release.

After a releasable commit lands on `main`, the `Release Please` workflow opens or updates a release PR. Merging that release PR updates `package.json`, `package-lock.json`, `.release-please-manifest.json`, and `CHANGELOG.md`, then creates a GitHub Release and tag such as `v0.2.0`.

Users can install a pinned GitHub release tag:

```bash
npm install -g github:sanjaysingh/copilot-proxy#v0.2.0
```

When Release Please creates a GitHub Release, the same workflow runs tests, creates the npm tarball with `npm pack`, and attaches it to the release.

## Development

```bash
npm test
npm start
```

The project intentionally avoids runtime npm dependencies and requires Node.js 18.17 or newer.
