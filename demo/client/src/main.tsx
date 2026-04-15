import React from "react";
import ReactDOM from "react-dom/client";
import { PrivyProvider } from "@privy-io/react-auth";
import { chains } from "@lens-chain/sdk/viem";
import { Buffer } from "buffer";

import { App } from "./App";
import "./styles.css";

if (!("Buffer" in globalThis)) {
  (globalThis as typeof globalThis & { Buffer: typeof Buffer }).Buffer = Buffer;
}

const privyAppId = import.meta.env.VITE_PRIVY_APP_ID;
const lensEnvironment = import.meta.env.VITE_LENS_ENVIRONMENT === "mainnet" ? "mainnet" : "testnet";
const defaultChain = lensEnvironment === "mainnet" ? chains.mainnet : chains.testnet;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PrivyProvider
      appId={privyAppId}
      config={{
        appearance: {
          showWalletLoginFirst: true,
          theme: "light",
        },
        loginMethods: ["wallet", "email"],
        defaultChain,
        supportedChains: [defaultChain],
        embeddedWallets: {
          ethereum: {
            createOnLogin: "users-without-wallets",
          },
        },
      }}
    >
      <App />
    </PrivyProvider>
  </React.StrictMode>,
);
