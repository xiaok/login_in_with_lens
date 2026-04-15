import {
  PublicClient,
  evmAddress,
  mainnet,
  testnet,
  type Account,
  type AccountAvailable,
  type SessionClient,
} from "@lens-protocol/client";
import {
  createAccountWithUsername,
  fetchAccount,
  fetchAccountsAvailable,
  fetchMeDetails,
} from "@lens-protocol/client/actions";
import { account as accountMetadata } from "@lens-protocol/metadata";
import { StorageClient, immutable } from "@lens-chain/storage-client";

import { createDefaultStorageProvider } from "./storage";
import type {
  CreateLensAccountInput,
  LensAuthenticatedResult,
  LensLoginConfig,
  LensSignInResult,
  ResumeLensSessionResult,
} from "./types";
import {
  LENS_CHAIN_ID,
  assertOk,
  normalizeAccountOption,
  normalizeUsername,
  profileFromAccount,
  setStatus,
  suggestedUsername,
} from "./utils";

type PendingState = {
  walletAddress: string;
  accounts: ReadonlyArray<AccountAvailable>;
};

export class LensLoginClient {
  private readonly client: PublicClient;
  private pendingState: PendingState | null = null;

  constructor(private readonly config: LensLoginConfig) {
    this.client = PublicClient.create({
      environment: config.environment === "mainnet" ? mainnet : testnet,
      origin: config.origin,
      storage:
        config.storage ??
        createDefaultStorageProvider(`login-with-lens:${config.environment}:${config.appAddress}`),
    });
  }

  async signIn(): Promise<LensSignInResult> {
    const walletAddress = await this.config.wallet.getAddress();

    setStatus(this.config.onStatusChange, "checking_accounts");

    const available = await fetchAccountsAvailable(this.client, {
      managedBy: evmAddress(walletAddress),
      includeOwned: true,
    });
    const accounts = assertOk(available, "Failed to fetch available Lens accounts").items;

    this.pendingState = {
      walletAddress,
      accounts,
    };

    if (accounts.length === 0) {
      setStatus(this.config.onStatusChange, "needs_account_creation");
      return {
        status: "needs_account_creation",
        walletAddress,
        suggestedUsername: suggestedUsername(walletAddress),
      };
    }

    if (accounts.length === 1) {
      return this.authenticateWithAccount(accounts[0], walletAddress);
    }

    setStatus(this.config.onStatusChange, "needs_account_selection");

    return {
      status: "needs_account_selection",
      walletAddress,
      accounts: accounts.map(normalizeAccountOption),
    };
  }

  async selectAccount(accountAddress: string): Promise<LensAuthenticatedResult> {
    if (!this.pendingState) {
      throw new Error("No pending sign-in state. Call signIn() first.");
    }

    const account = this.pendingState.accounts.find(
      (item) => item.account.address.toLowerCase() === accountAddress.toLowerCase(),
    );

    if (!account) {
      throw new Error(`Lens account ${accountAddress} is not available for the connected wallet.`);
    }

    return this.authenticateWithAccount(account, this.pendingState.walletAddress);
  }

  async createAccount(input: CreateLensAccountInput): Promise<LensAuthenticatedResult> {
    if (!this.pendingState) {
      const walletAddress = await this.config.wallet.getAddress();
      this.pendingState = { walletAddress, accounts: [] };
    }

    if (!this.config.wallet.handleLensOperation) {
      throw new Error("createAccount() requires wallet.handleLensOperation to be provided.");
    }

    const localName = normalizeUsername(input.username);
    if (!localName) {
      throw new Error("A valid Lens username is required.");
    }

    setStatus(this.config.onStatusChange, "creating_account");

    const walletAddress = this.pendingState.walletAddress;
    const onboarding = await this.client.login({
      onboardingUser: {
        wallet: evmAddress(walletAddress),
        app: evmAddress(this.config.appAddress),
      },
      signMessage: this.config.wallet.signMessage,
    });
    const onboardingSession = assertOk(onboarding, "Failed to authenticate onboarding session");

    const storage = StorageClient.create();
    const metadata = accountMetadata({
      name: input.name,
      bio: input.bio,
      picture: input.picture,
      coverPicture: input.coverPicture,
    });
    const upload = await storage.uploadAsJson(metadata, {
      acl: immutable(LENS_CHAIN_ID[this.config.environment]),
    });

    const createResult = await createAccountWithUsername(onboardingSession, {
      username: {
        localName,
      },
      metadataUri: upload.uri,
      enableSignless: input.enableSignless,
    });
    const operation = assertOk(createResult, "Failed to create Lens account");
    await this.config.wallet.handleLensOperation(operation);

    const account = await this.waitForAccount(localName);
    return this.authenticateOwnedAccount(account.address, walletAddress);
  }

  async resumeSession(): Promise<ResumeLensSessionResult> {
    const resumed = await this.client.resumeSession();

    if (resumed.isErr()) {
      return { status: "not_authenticated" };
    }

    return this.buildAuthenticatedResult(resumed.value);
  }

  async logout(): Promise<void> {
    const resumed = await this.client.resumeSession();

    if (resumed.isErr()) {
      return;
    }

    const result = await resumed.value.logout();
    assertOk(result, "Failed to logout Lens session");
    this.pendingState = null;
    setStatus(this.config.onStatusChange, "idle");
  }

  private async authenticateWithAccount(
    item: AccountAvailable,
    walletAddress: string,
  ): Promise<LensAuthenticatedResult> {
    setStatus(this.config.onStatusChange, "authenticating");

    const result =
      item.__typename === "AccountManaged"
        ? await this.client.login({
            accountManager: {
              account: evmAddress(item.account.address),
              manager: evmAddress(walletAddress),
              app: evmAddress(this.config.appAddress),
            },
            signMessage: this.config.wallet.signMessage,
          })
        : await this.client.login({
            accountOwner: {
              account: evmAddress(item.account.address),
              owner: evmAddress(walletAddress),
              app: evmAddress(this.config.appAddress),
            },
            signMessage: this.config.wallet.signMessage,
          });

    const sessionClient = assertOk(result, "Failed to login with Lens account");
    return this.buildAuthenticatedResult(sessionClient);
  }

  private async buildAuthenticatedResult(
    sessionClient: SessionClient,
  ): Promise<LensAuthenticatedResult> {
    setStatus(this.config.onStatusChange, "fetching_profile");

    const meResult = await fetchMeDetails(sessionClient);
    const me = assertOk(meResult, "Failed to fetch Lens session details");
    const accountResult = await fetchAccount(sessionClient, {
      address: me.loggedInAs.account.address,
    });
    const account = assertOk(accountResult, "Failed to fetch Lens profile");

    if (!account) {
      throw new Error("Lens profile was not found after authentication.");
    }

    setStatus(this.config.onStatusChange, "authenticated");
    this.pendingState = null;

    return {
      status: "authenticated",
      sessionClient,
      profile: profileFromAccount(account, me),
    };
  }

  private async waitForAccount(localName: string, attempts = 20, delayMs = 1500): Promise<Account> {
    for (let index = 0; index < attempts; index += 1) {
      const result = await fetchAccount(this.client, {
        username: {
          localName,
        },
      });
      const account = assertOk(result, "Failed to poll newly created Lens account");

      if (account) {
        return account;
      }

      await new Promise((resolve) => globalThis.setTimeout(resolve, delayMs));
    }

    throw new Error(`Lens account "${localName}" was not indexed in time.`);
  }

  private async authenticateOwnedAccount(
    accountAddress: string,
    walletAddress: string,
  ): Promise<LensAuthenticatedResult> {
    setStatus(this.config.onStatusChange, "authenticating");

    const result = await this.client.login({
      accountOwner: {
        account: evmAddress(accountAddress),
        owner: evmAddress(walletAddress),
        app: evmAddress(this.config.appAddress),
      },
      signMessage: this.config.wallet.signMessage,
    });

    const sessionClient = assertOk(result, "Failed to login with the newly created Lens account");
    return this.buildAuthenticatedResult(sessionClient);
  }
}

export function createLensLogin(config: LensLoginConfig): LensLoginClient {
  return new LensLoginClient(config);
}
