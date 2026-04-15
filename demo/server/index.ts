import "dotenv/config";
import { createServer } from "node:http";

import { createLensLoginServer } from "@login-with-lens/server";

const port = Number(process.env.PORT ?? 8787);
const clientOrigin = process.env.DEMO_CLIENT_ORIGIN ?? "http://localhost:5173";
const appAddress =
  process.env.DEMO_LENS_APP_ADDRESS ?? "0xC75A89145d765c396fd75CbD16380Eb184Bd2ca7";
const environment = process.env.DEMO_LENS_ENVIRONMENT === "mainnet" ? "mainnet" : "testnet";

const lens = createLensLoginServer({
  appAddress,
  environment,
  origin: clientOrigin,
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
      const body = await readJsonBody<{ walletAddress: string }>(request);
      const items = await lens.listAvailableAccounts(body.walletAddress);
      return sendJson(response, 200, items);
    }

    if (request.method === "POST" && request.url === "/api/auth/challenge") {
      const body = await readJsonBody<{
        walletAddress: string;
        accountAddress: string;
        role: "accountOwner" | "accountManager";
      }>(request);
      const challenge = await lens.createChallenge(body);
      return sendJson(response, 200, challenge);
    }

    if (request.method === "POST" && request.url === "/api/auth/verify") {
      const body = await readJsonBody<{
        flowId: string;
        challengeId: string;
        signature: string;
      }>(request);
      const verified = await lens.verifyChallenge(body);
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
  });
  response.end(JSON.stringify(body));
}

async function readJsonBody<T>(request: {
  on(event: "data", listener: (chunk: Buffer) => void): void;
  on(event: "end", listener: () => void): void;
  on(event: "error", listener: (error: Error) => void): void;
}) {
  const chunks: Buffer[] = [];

  await new Promise<void>((resolve, reject) => {
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve());
    request.on("error", (error) => reject(error));
  });

  if (chunks.length === 0) {
    return {} as T;
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}
