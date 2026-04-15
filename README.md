# Login With Lens

`./login_with_lens` contains:

- `core/`: the browser SDK, centered around `createLensLogin(...)`
- `server/`: the server SDK for Lens authentication primitives
- `demo/client/`: a Privy-based frontend demo
- `demo/server/`: a minimal backend demo

Chinese documentation: [README.zh-CN.md](./README.zh-CN.md)

## Overview

`core` is a minimal browser SDK for Lens flows:

- wallet connection
- account discovery
- account selection
- account creation
- profile retrieval

`server` is a minimal server SDK for Lens authentication:

- challenge creation
- signed challenge verification
- session resume
- authenticated-session lookup
- logout

The SDK packages do not define an HTTP API contract.

If you want REST endpoints, GraphQL endpoints, RPC methods, or framework-specific handlers, build them in your own app or follow the demo implementation.

## Core Quick Start

```ts
import { createLensLogin } from "@login-with-lens/core";

const lens = createLensLogin({
  appAddress: "0xYOUR_LENS_APP_ADDRESS",
  environment: "mainnet",
  origin: window.location.origin,
  wallet: {
    async getAddress() {
      return wallet.address;
    },
    async signMessage(message) {
      return provider.request({
        method: "personal_sign",
        params: [message, wallet.address],
      });
    },
    async handleLensOperation(request) {
      return executeLensTransaction(request);
    },
  },
});

const result = await lens.signIn();
```

Handle the next step:

```ts
if (result.status === "authenticated") {
  console.log(result.profile);
}

if (result.status === "needs_account_selection") {
  const next = await lens.selectAccount(result.accounts[0].accountAddress);
  console.log(next.profile);
}

if (result.status === "needs_account_creation") {
  const next = await lens.createAccount({
    username: result.suggestedUsername,
    name: "Alice",
    bio: "Built with Login With Lens",
  });
  console.log(next.profile);
}
```

## Core API

`createLensLogin(config)`

- `appAddress`: Lens app address
- `environment`: `"mainnet"` or `"testnet"`
- `origin`: optional non-browser origin override
- `wallet`: adapter that provides address, signing, and optional transaction execution
- `storage`: optional Lens SDK storage for browser-side Lens sessions
- `onStatusChange`: optional flow status callback

Methods:

- `signIn()`
- `selectAccount(accountAddress)`
- `createAccount({ username, name, bio, picture, coverPicture, enableSignless })`
- `resumeSession()`
- `logout()`

## Wallet Adapter

```ts
type LensWalletAdapter = {
  getAddress(): Promise<string>;
  signMessage(message: string): Promise<string>;
  handleLensOperation?: (request: { __typename: string }) => Promise<string>;
};
```

`handleLensOperation` is only required for account-creation flows that may return a sponsored or self-funded transaction request.

## Server SDK

The `server/` package exposes Lens authentication primitives to your backend. It does not require a specific HTTP API shape.

Typical usage:

```ts
import { createLensLoginServer } from "@login-with-lens/server";

const server = createLensLoginServer({
  appAddress: "0xYOUR_LENS_APP_ADDRESS",
  environment: "mainnet",
  origin: "https://your-app.com",
});

const challenge = await server.createChallenge({
  walletAddress: "0x...",
  accountAddress: "0x...",
  role: "accountOwner",
});

const verified = await server.verifyChallenge({
  flowId: challenge.flowId,
  challengeId: challenge.challengeId,
  signature: "0x...",
});
```

From there, your own backend decides how to expose those operations to the client.

## Demo

The demo is intentionally where the HTTP API is defined.

- `demo/client`: Vite + React + Privy
- `demo/server`: Node server using `@login-with-lens/server`

Client environment variables:

```bash
VITE_PRIVY_APP_ID=
VITE_LENS_APP_ADDRESS=
VITE_LENS_ENVIRONMENT=testnet
VITE_LENS_SERVER_URL=http://localhost:8787
```

Server environment variables:

```bash
PORT=8787
DEMO_CLIENT_ORIGIN=http://localhost:5173
DEMO_LENS_APP_ADDRESS=0xC75A89145d765c396fd75CbD16380Eb184Bd2ca7
DEMO_LENS_ENVIRONMENT=testnet
```

Run the demo:

```bash
cd demo/server
pnpm install
pnpm dev

cd ../client
pnpm install
pnpm dev
```

For email login to work end-to-end, enable both email login and embedded wallets in the Privy Dashboard, because Lens authentication still requires an EVM wallet signature.
