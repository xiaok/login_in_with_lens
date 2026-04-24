import { createServer } from "node:http";

import { createLensLoginServer } from "@login-with-lens/server";

const MAX_JSON_BODY_BYTES = 64 * 1024;
const EVM_ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const HEX_PATTERN = /^0x[a-fA-F0-9]+$/;

const port = readPortEnv("PORT", 8787);
const clientOrigin = process.env.DEMO_CLIENT_ORIGIN ?? "http://localhost:5173";
const appAddress =
  process.env.DEMO_LENS_APP_ADDRESS ?? "0xC75A89145d765c396fd75CbD16380Eb184Bd2ca7";
const environment = normalizeEnvironment(process.env.DEMO_LENS_ENVIRONMENT);
const flowTtlMs = readPositiveNumberEnv("DEMO_LENS_FLOW_TTL_MS");
const sessionTtlMs = readPositiveNumberEnv("DEMO_LENS_SESSION_TTL_MS");

const lens = createLensLoginServer({
  appAddress,
  environment,
  origin: clientOrigin,
  flowTtlMs,
  sessionTtlMs,
});

const server = createServer(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  try {
    if (request.method === "GET" && request.url === "/api/health") {
      return sendJson(response, 200, { ok: true });
    }

    if (request.method === "POST" && request.url === "/api/accounts/available") {
      const body = await readJsonBody(request);
      const items = await lens.listAvailableAccounts(requireAddressField(body, "walletAddress"));
      return sendJson(response, 200, items);
    }

    if (request.method === "POST" && request.url === "/api/auth/challenge") {
      const body = await readJsonBody(request);
      const challenge = await lens.createChallenge({
        walletAddress: requireAddressField(body, "walletAddress"),
        accountAddress: requireAddressField(body, "accountAddress"),
        role: requireRoleField(body, "role"),
      });
      return sendJson(response, 200, challenge);
    }

    if (request.method === "POST" && request.url === "/api/auth/verify") {
      const body = await readJsonBody(request);
      const verified = await lens.verifyChallenge({
        flowId: requireStringField(body, "flowId"),
        challengeId: requireStringField(body, "challengeId"),
        signature: requireSignatureField(body, "signature"),
      });
      return sendJson(response, 200, verified);
    }

    if (request.method === "GET" && request.url === "/api/sessions/current") {
      const sessionId = requireSessionId(request);
      const current = await lens.getCurrentSession(sessionId);
      return sendJson(response, 200, current);
    }

    if (request.method === "GET" && request.url === "/api/sessions/authenticated") {
      const sessionId = requireSessionId(request);
      const sessions = await lens.listAuthenticatedSessions(sessionId);
      return sendJson(response, 200, sessions);
    }

    if (request.method === "POST" && request.url === "/api/sessions/logout") {
      const sessionId = requireSessionId(request);
      await lens.logout(sessionId);
      return sendJson(response, 200, { ok: true });
    }

    sendJson(response, 404, { error: "Route not found." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown server error";
    sendJson(response, 400, { error: message });
  }
});

server.listen(port, () => {
  console.log(`login-with-lens demo server listening on http://localhost:${port}`);
});

function requireSessionId(request: { headers: { [key: string]: string | string[] | undefined } }) {
  const sessionId = request.headers["x-lens-app-session"];

  if (typeof sessionId !== "string" || !sessionId) {
    throw new Error("Missing x-lens-app-session header.");
  }

  return sessionId;
}

function setCorsHeaders(response: {
  setHeader(name: string, value: string): void;
}) {
  response.setHeader("Access-Control-Allow-Origin", clientOrigin);
  response.setHeader("Access-Control-Allow-Headers", "content-type,x-lens-app-session");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Vary", "Origin");
}

function sendJson(
  response: {
    writeHead(statusCode: number, headers: Record<string, string>): void;
    end(body: string): void;
  },
  statusCode: number,
  body: unknown,
) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request: {
  on(event: "data", listener: (chunk: Buffer | string) => void): void;
  on(event: "end", listener: () => void): void;
  on(event: "error", listener: (error: Error) => void): void;
}) {
  const chunks: Buffer[] = [];
  let bytes = 0;
  let rejected = false;

  await new Promise<void>((resolve, reject) => {
    request.on("data", (chunk) => {
      if (rejected) {
        return;
      }

      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytes += buffer.byteLength;

      if (bytes > MAX_JSON_BODY_BYTES) {
        rejected = true;
        reject(new Error(`JSON body must be ${MAX_JSON_BODY_BYTES} bytes or smaller.`));
        return;
      }

      chunks.push(buffer);
    });
    request.on("end", () => resolve());
    request.on("error", (error) => reject(error));
  });

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

function normalizeEnvironment(value: string | undefined): "mainnet" | "testnet" {
  if (!value || value === "testnet") {
    return "testnet";
  }

  if (value === "mainnet") {
    return "mainnet";
  }

  throw new Error("DEMO_LENS_ENVIRONMENT must be mainnet or testnet.");
}

function readPositiveNumberEnv(name: string): number | undefined {
  const value = process.env[name];
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number of milliseconds.`);
  }

  return parsed;
}

function readPortEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`${name} must be an integer from 1 to 65535.`);
  }

  return parsed;
}

function requireBodyObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Request body must be a JSON object.");
  }

  return value as Record<string, unknown>;
}

function requireStringField(value: unknown, field: string): string {
  const body = requireBodyObject(value);
  const candidate = body[field];

  if (typeof candidate !== "string" || candidate.trim() === "") {
    throw new Error(`${field} is required.`);
  }

  return candidate;
}

function requireAddressField(value: unknown, field: string): string {
  const address = requireStringField(value, field);

  if (!EVM_ADDRESS_PATTERN.test(address)) {
    throw new Error(`${field} must be a valid EVM address.`);
  }

  return address;
}

function requireSignatureField(value: unknown, field: string): string {
  const signature = requireStringField(value, field);

  if (!HEX_PATTERN.test(signature) || signature.length % 2 !== 0) {
    throw new Error(`${field} must be a hex signature.`);
  }

  return signature;
}

function requireRoleField(
  value: unknown,
  field: string,
): "accountOwner" | "accountManager" {
  const role = requireStringField(value, field);

  if (role !== "accountOwner" && role !== "accountManager") {
    throw new Error(`${field} must be accountOwner or accountManager.`);
  }

  return role;
}
