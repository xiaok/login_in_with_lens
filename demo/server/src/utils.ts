import type { Account, AccountAvailable, MeResult } from "@lens-protocol/client";

import type {
  LensAccountOption,
  LensAuthenticatedSession,
  LensProfile,
} from "./types";

export function assertOk<T, E extends Error>(
  result: { isErr(): boolean; _unsafeUnwrap(): T; _unsafeUnwrapErr(): E },
  message: string,
): T {
  if (result.isErr()) {
    throw new Error(`${message}: ${result._unsafeUnwrapErr().message}`);
  }

  return result._unsafeUnwrap();
}

export function pickMediaUrl(media: unknown): string | null {
  if (!media) {
    return null;
  }

  if (typeof media === "string") {
    return media;
  }

  if (typeof media === "object") {
    const candidate = media as Record<string, unknown>;
    const original =
      "original" in candidate && typeof candidate.original === "object" && candidate.original
        ? (candidate.original as Record<string, unknown>)
        : null;
    const direct = candidate.raw ?? candidate.uri ?? candidate.item ?? original?.url;
    if (typeof direct === "string") {
      return direct;
    }
  }

  return null;
}

export function normalizeAccountOption(item: AccountAvailable): LensAccountOption {
  return {
    accountAddress: item.account.address,
    ownerAddress: item.account.owner,
    username: item.account.username?.value ?? null,
    localName: item.account.username?.localName ?? null,
    displayName: item.account.metadata?.name ?? null,
    pictureUrl: pickMediaUrl(item.account.metadata?.picture),
    role: item.__typename === "AccountManaged" ? "manager" : "owner",
  };
}

export function profileFromAccount(account: Account, me: MeResult): LensProfile {
  return {
    accountAddress: account.address,
    ownerAddress: account.owner,
    username: account.username?.value ?? null,
    localName: account.username?.localName ?? null,
    displayName: account.metadata?.name ?? null,
    bio: account.metadata?.bio ?? null,
    pictureUrl: pickMediaUrl(account.metadata?.picture),
    coverPictureUrl: pickMediaUrl(account.metadata?.coverPicture),
    signless: Boolean(me.isSignless),
    sponsored: Boolean(me.isSponsored),
  };
}

export function normalizeAuthenticatedSession(session: {
  authenticationId: string;
  app: string;
  signer: string;
  browser: string | null;
  device: string | null;
  os: string | null;
  origin: URL | null;
  createdAt: Date;
  updatedAt: Date;
}): LensAuthenticatedSession {
  return {
    authenticationId: session.authenticationId,
    app: session.app,
    signer: session.signer,
    browser: session.browser,
    device: session.device,
    os: session.os,
    origin: session.origin?.toString() ?? null,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
  };
}
