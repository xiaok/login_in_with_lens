import type { ConnectedWallet } from "@privy-io/react-auth";
import { chains } from "@lens-chain/sdk/viem";
import { handleOperationWith } from "@lens-protocol/client/viem";
import { custom, createWalletClient } from "viem";

import type { LensEnvironment, LensWalletAdapter } from "@login-with-lens/core";

export async function createPrivyLensWalletAdapter(
  wallet: ConnectedWallet,
  environment: LensEnvironment,
): Promise<LensWalletAdapter> {
  const provider = await wallet.getEthereumProvider();
  const chain = environment === "mainnet" ? chains.mainnet : chains.testnet;

  try {
    await wallet.switchChain(chain.id);
  } catch {
    // Some external wallets are already on the desired network or refuse a no-op switch.
  }

  const walletClient = createWalletClient({
    account: wallet.address as `0x${string}`,
    chain,
    transport: custom(provider),
  });

  return {
    async getAddress() {
      return wallet.address;
    },
    async signMessage(message) {
      const signature = await provider.request({
        method: "personal_sign",
        params: [message, wallet.address],
      });

      if (typeof signature !== "string") {
        throw new Error("Privy returned a non-string signature.");
      }

      return signature;
    },
    async handleLensOperation(request) {
      const result = await handleOperationWith(walletClient)(request as never);
      if (result.isErr()) {
        throw new Error(result.error.message);
      }

      return result.value;
    },
  };
}
