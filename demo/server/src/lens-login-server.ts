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
  private readonly sessionTtlMs: number;

  constructor(private readonly config: LensServerConfig) {
    this.sessionTtlMs = config.sessionTtlMs ?? 1000 * 60 * 60 * 24;
  }

  async listAvailableAccounts(walletAddress: string) {
    const client = this.createClient();
    const result = await fetchAccountsAvailable(client, {
      managedBy: evmAddress(walletAddress),
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
    const challenge = await client.challenge(
      input.role === "accountManager"
        ? {
            accountManager: {
              account: evmAddress(input.accountAddress),
              manager: evmAddress(input.walletAddress),
              app: evmAddress(this.config.appAddress),
            },
          }
        : {
            accountOwner: {
              account: evmAddress(input.accountAddress),
              owner: evmAddress(input.walletAddress),
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

    const flow = this.flows.get(input.flowId);
    if (!flow) {
      throw new Error("Unknown or expired Lens auth flow.");
    }

    if (flow.challengeId !== input.challengeId) {
      throw new Error("Challenge id does not match the active auth flow.");
    }

    const authenticated = await flow.client.authenticate({
      id: input.challengeId,
      signature: input.signature as `0x${string}`,
    });
    const sessionClient = assertOk(authenticated, "Failed to authenticate Lens signature");

    const appSessionId = randomUUID();
    this.sessions.set(appSessionId, {
      storage: flow.storage,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    });
    this.flows.delete(input.flowId);

    return this.buildVerifiedSession(appSessionId, sessionClient);
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

    const session = this.sessions.get(appSessionId);
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
      if (now - flow.createdAt > this.sessionTtlMs) {
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

export function createLensLoginServer(config: LensServerConfig): LensLoginServer {
  return new LensLoginServer(config);
}
