export type LensEnvironment = "mainnet" | "testnet";

export type LensAccountRole = "owner" | "manager";

export type LensAccountOption = {
  accountAddress: string;
  ownerAddress: string;
  username: string | null;
  localName: string | null;
  displayName: string | null;
  pictureUrl: string | null;
  role: LensAccountRole;
};

export type LensAuthenticatedSession = {
  authenticationId: string;
  app: string;
  signer: string;
  browser: string | null;
  device: string | null;
  os: string | null;
  origin: string | null;
  createdAt: string;
  updatedAt: string;
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
};

export type LensServerConfig = {
  appAddress: string;
  environment: LensEnvironment;
  origin?: string;
  sessionTtlMs?: number;
};

export type LensChallengeRequest = {
  walletAddress: string;
  accountAddress: string;
  role: "accountOwner" | "accountManager";
};

export type LensChallengeResponse = {
  flowId: string;
  challengeId: string;
  message: string;
};

export type LensVerifiedSession = {
  appSessionId: string;
  profile: LensProfile;
  authenticatedSessions: LensAuthenticatedSession[];
};
