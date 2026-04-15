import type { Account, AccountAvailable } from "@lens-protocol/client";

import type { LensAccountOption, LensEnvironment, LensLoginStatus } from "./types";

export const LENS_CHAIN_ID: Record<LensEnvironment, number> = {
  mainnet: 232,
  testnet: 37111,
};

export function assertOk<T, E extends Error>(
  result: { isErr(): boolean; _unsafeUnwrap(): T; _unsafeUnwrapErr(): E },
  message: string,
): T {
  if (result.isErr()) {
    throw new Error(`${message}: ${result._unsafeUnwrapErr().message}`);
  }

  return result._unsafeUnwrap();
}

export function normalizeAccountOption(item: AccountAvailable): LensAccountOption {
  const account = item.account;
  const role = item.__typename === "AccountManaged" ? "manager" : "owner";

  return {
    accountAddress: account.address,
    ownerAddress: account.owner,
    username: account.username?.value ?? null,
    localName: account.username?.localName ?? null,
    displayName: account.metadata?.name ?? null,
    pictureUrl: pickMediaUrl(account.metadata?.picture),
    role,
    raw: item,
  };
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

export function profileFromAccount(account: Account, me: any) {
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
    account,
    me,
  };
}

export function suggestedUsername(walletAddress: string): string {
  return `lens-${walletAddress.slice(2, 8).toLowerCase()}`;
}

export function normalizeUsername(localName: string): string {
  return localName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function setStatus(
  onStatusChange: ((status: LensLoginStatus) => void) | undefined,
  status: LensLoginStatus,
): void {
  onStatusChange?.(status);
}
