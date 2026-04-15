import type {
  Account,
  AccountAvailable,
  MeResult,
  SessionClient,
} from "@lens-protocol/client";
import type { LensStorageProvider } from "./storage";

export type LensEnvironment = "mainnet" | "testnet";

export type LensLoginStatus =
  | "idle"
  | "checking_accounts"
  | "needs_account_selection"
  | "needs_account_creation"
  | "authenticating"
  | "creating_account"
  | "fetching_profile"
  | "authenticated"
  | "error";

export type LensAccountRole = "owner" | "manager";

export type LensAccountOption = {
  accountAddress: string;
  ownerAddress: string;
  username: string | null;
  localName: string | null;
  displayName: string | null;
  pictureUrl: string | null;
  role: LensAccountRole;
  raw: AccountAvailable;
};

export type LensProfile = {
  accountAddress: string;
  ownerAddress: string;
  username: string | null;
  localName: string | null;
  displayName: string | null;
  bio: string | null;
  pictureUrl: string | null;
  coverPictureUrl: string | null;
  signless: boolean;
  sponsored: boolean;
  account: Account;
  me: MeResult;
};

export type LensAuthenticatedResult = {
  status: "authenticated";
  sessionClient: SessionClient;
  profile: LensProfile;
};

export type LensNeedsAccountSelectionResult = {
  status: "needs_account_selection";
  walletAddress: string;
  accounts: LensAccountOption[];
};

export type LensNeedsAccountCreationResult = {
  status: "needs_account_creation";
  walletAddress: string;
  suggestedUsername: string;
};

export type LensSignInResult =
  | LensAuthenticatedResult
  | LensNeedsAccountSelectionResult
  | LensNeedsAccountCreationResult;

export type CreateLensAccountInput = {
  username: string;
  name?: string;
  bio?: string;
  picture?: string;
  coverPicture?: string;
  enableSignless?: boolean;
};

export type LensOperationExecutor = (request: { __typename: string }) => Promise<string>;

export type LensWalletAdapter = {
  getAddress(): Promise<string>;
  signMessage(message: string): Promise<string>;
  handleLensOperation?: LensOperationExecutor;
};

export type LensLoginConfig = {
  appAddress: string;
  environment: LensEnvironment;
  origin?: string;
  namespace?: string;
  storage?: LensStorageProvider;
  wallet: LensWalletAdapter;
  onStatusChange?: (status: LensLoginStatus) => void;
};

export type ResumeLensSessionResult =
  | LensAuthenticatedResult
  | { status: "not_authenticated" };
