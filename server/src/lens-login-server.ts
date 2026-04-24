import { randomUUID } from "node:crypto";

import {
  PublicClient,
  evmAddress,
  mainnet,
  testnet,
  type SessionClient,
} from "@lens-protocol/client";
import {
  fetchAccount,
  fetchAccountsAvailable,
  fetchAuthenticatedSessions,
  fetchMeDetails,
} from "@lens-protocol/client/actions";

import { MemoryStorageProvider } from "./storage";
import type {
  LensAuthenticatedSession,
  LensChallengeRequest,
  LensChallengeResponse,
  LensProfile,
  LensServerConfig,
  LensVerifiedSession,
} from "./types";
import {
  assertOk,
  normalizeAccountOption,
  normalizeAuthenticatedSession,
  profileFromAccount,
} from "./utils";

const DEFAULT_FLOW_TTL_MS = 1000 * 60 * 10;
const DEFAULT_SESSION_TTL_MS = 1000 * 60 * 60 * 24;

type FlowState = {
  challengeId: string;
  client: PublicClient;
  storage: MemoryStorageProvider;
  createdAt: number;
};

type SessionState = {
  storage: MemoryStorageProvider;
  createdAt: number;
  lastUsedAt: number;
};

export class LensLoginServer {
  private readonly flows = new Map<string, FlowState>();
  private readonly sessions = new Map<string, SessionState>();
  private readonly flowTtlMs: number;
  private readonly sessionTtlMs: number;

  constructor(private readonly config: LensServerConfig) {
    this.flowTtlMs = normalizeTtl(config.flowTtlMs, DEFAULT_FLOW_TTL_MS, "flowTtlMs");
    this.sessionTtlMs = normalizeTtl(
      config.sessionTtlMs,
      DEFAULT_SESSION_TTL_MS,
      "sessionTtlMs",
    );
  }

  async listAvailableAccounts(walletAddress: string) {
    const client = this.createClient();
    const managedBy = evmAddress(requireNonEmptyString(walletAddress, "walletAddress"));
    const result = await fetchAccountsAvailable(client, {
      managedBy,
      includeOwned: true,
    });

    return assertOk(result, "Failed to fetch available Lens accounts").items.map(
      normalizeAccountOption,
    );
  }

  async createChallenge(input: LensChallengeRequest): Promise<LensChallengeResponse> {
    this.cleanupExpiredSessions();

    const storage = new MemoryStorageProvider();
    const client = this.createClient(storage);
    const walletAddress = evmAddress(requireNonEmptyString(input.walletAddress, "walletAddress"));
    const accountAddress = evmAddress(
      requireNonEmptyString(input.accountAddress, "accountAddress"),
    );
    const role = requireChallengeRole(input.role);

    const challenge = await client.challenge(
      role === "accountManager"
        ? {
            accountManager: {
              account: accountAddress,
              manager: walletAddress,
              app: evmAddress(this.config.appAddress),
            },
          }
        : {
            accountOwner: {
              account: accountAddress,
              owner: walletAddress,
              app: evmAddress(this.config.appAddress),
            },
          },
    );
    const value = assertOk(challenge, "Failed to create Lens challenge");

    const flowId = randomUUID();
    this.flows.set(flowId, {
      challengeId: value.id,
      client,
      storage,
      createdAt: Date.now(),
    });

    return {
      flowId,
      challengeId: value.id,
      message: value.text,
    };
  }

  async verifyChallenge(input: {
    flowId: string;
    challengeId: string;
    signature: string;
  }): Promise<LensVerifiedSession> {
    this.cleanupExpiredSessions();

    const flowId = requireNonEmptyString(input.flowId, "flowId");
    const challengeId = requireNonEmptyString(input.challengeId, "challengeId");
    const signature = requireNonEmptyString(input.signature, "signature");
    const flow = this.flows.get(flowId);
    if (!flow) {
      throw new Error("Unknown or expired Lens auth flow.");
    }

    if (flow.challengeId !== challengeId) {
      throw new Error("Challenge id does not match the active auth flow.");
    }

    this.flows.delete(flowId);

    const authenticated = await flow.client.authenticate({
      id: challengeId,
      signature: signature as `0x${string}`,
    });
    const sessionClient = assertOk(authenticated, "Failed to authenticate Lens signature");

    const appSessionId = randomUUID();
    this.sessions.set(appSessionId, {
      storage: flow.storage,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    });

    try {
      return await this.buildVerifiedSession(appSessionId, sessionClient);
    } catch (error) {
      this.sessions.delete(appSessionId);
      throw error;
    }
  }

  async getCurrentSession(appSessionId: string): Promise<LensVerifiedSession> {
    const sessionClient = await this.resumeSession(appSessionId);
    return this.buildVerifiedSession(appSessionId, sessionClient);
  }

  async listAuthenticatedSessions(appSessionId: string): Promise<LensAuthenticatedSession[]> {
    const sessionClient = await this.resumeSession(appSessionId);
    const result = await fetchAuthenticatedSessions(sessionClient);

    return assertOk(result, "Failed to list Lens authenticated sessions").items.map(
      normalizeAuthenticatedSession,
    );
  }

  async logout(appSessionId: string): Promise<void> {
    const sessionClient = await this.resumeSession(appSessionId);
    const result = await sessionClient.logout();
    assertOk(result, "Failed to log out Lens session");
    this.sessions.delete(appSessionId);
  }

  private async buildVerifiedSession(
    appSessionId: string,
    sessionClient: SessionClient,
  ): Promise<LensVerifiedSession> {
    const meResult = await fetchMeDetails(sessionClient);
    const me = assertOk(meResult, "Failed to fetch Lens session details");
    const accountResult = await fetchAccount(sessionClient, {
      address: me.loggedInAs.account.address,
    });
    const account = assertOk(accountResult, "Failed to fetch Lens profile");

    if (!account) {
      throw new Error("Lens profile was not found after authentication.");
    }

    const sessions = await this.listSessionsForClient(sessionClient);
    return {
      appSessionId,
      profile: profileFromAccount(account, me),
      authenticatedSessions: sessions,
    };
  }

  private async listSessionsForClient(sessionClient: SessionClient) {
    const result = await fetchAuthenticatedSessions(sessionClient);
    return assertOk(result, "Failed to list Lens authenticated sessions").items.map(
      normalizeAuthenticatedSession,
    );
  }

  private async resumeSession(appSessionId: string): Promise<SessionClient> {
    this.cleanupExpiredSessions();

    const session = this.sessions.get(requireNonEmptyString(appSessionId, "appSessionId"));
    if (!session) {
      throw new Error("Unknown or expired application session.");
    }

    const client = this.createClient(session.storage);
    const resumed = await client.resumeSession();
    const sessionClient = assertOk(resumed, "Failed to resume Lens session");

    session.lastUsedAt = Date.now();
    return sessionClient;
  }

  private createClient(storage?: MemoryStorageProvider) {
    return PublicClient.create({
      environment: this.config.environment === "mainnet" ? mainnet : testnet,
      origin: this.config.origin,
      storage,
    });
  }

  private cleanupExpiredSessions(): void {
    const now = Date.now();

    for (const [flowId, flow] of this.flows.entries()) {
      if (now - flow.createdAt > this.flowTtlMs) {
        this.flows.delete(flowId);
      }
    }

    for (const [sessionId, session] of this.sessions.entries()) {
      if (now - session.lastUsedAt > this.sessionTtlMs) {
        this.sessions.delete(sessionId);
      }
    }
  }
}

function normalizeTtl(value: number | undefined, fallback: number, name: string): number {
  if (value === undefined) {
    return fallback;
  }

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number of milliseconds.`);
  }

  return value;
}

function requireNonEmptyString(value: string, name: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function requireChallengeRole(role: LensChallengeRequest["role"]): LensChallengeRequest["role"] {
  if (role !== "accountOwner" && role !== "accountManager") {
    throw new Error("role must be accountOwner or accountManager.");
  }

  return role;
}

export function createLensLoginServer(config: LensServerConfig): LensLoginServer {
  return new LensLoginServer(config);
}
