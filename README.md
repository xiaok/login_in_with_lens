# Login With Lens

`./login_with_lens` contains a headless Lens login SDK plus a small demo app.

Chinese documentation: [README.zh-CN.md](./README.zh-CN.md)

## Structure

- `core/`: framework-agnostic TypeScript SDK for wallet-based Lens sign-in
- `demo/`: Privy-powered demo showing wallet connect, account selection/creation, and profile fetch

## What the SDK does

The SDK is designed to feel like a login provider integration rather than a one-off script:

1. Detect the connected wallet address
2. Query Lens accounts available to that wallet
3. If one account exists, log in directly
4. If multiple accounts exist, return a selection step to the host app
5. If no account exists, return an onboarding step so the host app can create one
6. After authentication, fetch the Lens profile and return a normalized result

The SDK does not render UI. The host website owns the UX.

## Quick start

Install the package and create a wallet adapter:

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
      return signer.signMessage({ message });
    },
    async handleLensOperation(request) {
      return executeTransactionRequest(request);
    },
  },
});

const result = await lens.signIn();
```

Handle the returned step:

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
- `wallet`: adapter that can provide address and SIWE signature
- `storage`: optional Lens SDK storage provider
- `onStatusChange`: optional callback for flow state changes

Methods:

- `signIn()`
- `selectAccount(accountAddress)`
- `createAccount({ username, name, bio, picture, coverPicture, enableSignless })`
- `resumeSession()`
- `logout()`

## Wallet adapter contract

The core package intentionally does not depend on Privy, wagmi, ethers, or a UI framework.

```ts
type LensWalletAdapter = {
  getAddress(): Promise<string>;
  signMessage(message: string): Promise<string>;
  handleLensOperation?: (request: { __typename: string }) => Promise<string>;
};
```

`handleLensOperation` is only required for create-account flows because Lens account creation may return a sponsored or self-funded transaction request.

## Demo

The demo is a Vite React app that uses Privy for wallet connectivity and the headless SDK for Lens logic.

It is configured to allow both wallet login and email login. For email login to work end-to-end, enable email in the Privy Dashboard and allow Privy embedded wallets for the app, because Lens authentication still requires an EVM wallet signature.

Environment variables:

```bash
VITE_PRIVY_APP_ID=
VITE_LENS_APP_ADDRESS=
VITE_LENS_ENVIRONMENT=testnet
```

Run it from `login_with_lens/demo`:

```bash
pnpm install
pnpm dev
```

## Notes

- `mainnet` and `testnet` are both supported through config.
- Session persistence uses `localStorage` by default in browser environments.
- The demo only shows one reference UX. Production sites should replace it with their own account picker and onboarding flow.
