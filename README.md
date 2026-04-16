# Login With Lens

Lightweight building blocks for adding Lens sign-in to your app.

`@login-with-lens/core` handles the browser-side flow: discover Lens accounts for a wallet, let the user choose one, create an account when needed, and return a ready-to-use Lens session plus profile data.

`@login-with-lens/server` gives you backend primitives for challenge creation, signature verification, session resume, authenticated-session lookup, and logout.

This repo does not ship UI components or a fixed HTTP API. You keep control of the UX, routes, and session model.

中文文档: [README.zh-CN.md](./README.zh-CN.md)

## Packages

- `core/`: browser SDK centered around `createLensLogin(...)`
- `server/`: server SDK centered around `createLensLoginServer(...)`
- `demo/client/`: Vite + React + Privy example
- `demo/server/`: minimal Node backend example

## Choose a Flow

- Use `@login-with-lens/core` if the browser can own the Lens session directly.
- Add `@login-with-lens/server` if you want a backend-managed challenge flow and an app session on top of the Lens session.

## Sign-In Flow

```text
Connect wallet
   |
   v
lens.signIn()
   |
   +--> checking_accounts
          |
          +--> no available Lens accounts
          |      |
          |      v
          |   needs_account_creation
          |      |
          |      v
          |   lens.createAccount(...)
          |      |
          |      +--> creating_account
          |      +--> authenticating
          |      +--> fetching_profile
          |      `--> authenticated
          |
          +--> one available Lens account
          |      |
          |      +--> authenticating
          |      +--> fetching_profile
          |      `--> authenticated
          |
          `--> multiple available Lens accounts
                 |
                 v
           needs_account_selection
                 |
                 v
        lens.selectAccount(accountAddress)
                 |
                 +--> authenticating
                 +--> fetching_profile
                 `--> authenticated
```

If you use a backend challenge flow, insert `requesting_challenge -> verifying_signature` between account selection and the final authenticated app session.

## Installation

The packages in this repository are currently consumed as local packages. The demo wires them in with `file:` dependencies:

```json
{
  "@login-with-lens/core": "file:../../core",
  "@login-with-lens/server": "file:../../server"
}
```

In the consuming app, install the Lens peer dependencies as well:

```bash
pnpm add @lens-protocol/client @lens-protocol/metadata @lens-chain/storage-client
```

If you only use the server package, `@lens-protocol/metadata` and `@lens-chain/storage-client` are not required. 

## Client Quick Start

### 1. Create the Lens client

```ts
import { createLensLogin } from "@login-with-lens/core";

const lens = createLensLogin({
  appAddress: "0xYOUR_LENS_APP_ADDRESS",
  environment: "testnet",
  origin: window.location.origin,
  wallet: {
    async getAddress() {
      return wallet.address;
    },
    async signMessage(message: string) {
      const signature = await provider.request({
        method: "personal_sign",
        params: [message, wallet.address],
      });

      if (typeof signature !== "string") {
        throw new Error("Wallet returned a non-string signature.");
      }

      return signature;
    },
    async handleLensOperation(request) {
      return executeLensOperation(request);
    },
  },
  onStatusChange(status) {
    setStatus(status);
  },
});
```

`handleLensOperation` is only required if you allow account creation. A real adapter example lives in [demo/client/src/privy-wallet-adapter.ts](./demo/client/src/privy-wallet-adapter.ts).

### 2. Restore an existing session on app boot

```ts
const restored = await lens.resumeSession();

if (restored.status === "authenticated") {
  setProfile(restored.profile);
}
```

### 3. Start sign-in and branch by result

```ts
async function handleLensSignIn() {
  const result = await lens.signIn();

  if (result.status === "authenticated") {
    setProfile(result.profile);
    return;
  }

  if (result.status === "needs_account_selection") {
    setAccountOptions(result.accounts);
    return;
  }

  if (result.status === "needs_account_creation") {
    setCreateForm({
      username: result.suggestedUsername,
      name: "",
      bio: "",
    });
  }
}
```

### 4. Continue from the UI

```ts
async function handleSelectAccount(accountAddress: string) {
  const result = await lens.selectAccount(accountAddress);
  setProfile(result.profile);
}

async function handleCreateAccount() {
  const result = await lens.createAccount({
    username: form.username,
    name: form.name,
    bio: form.bio,
    enableSignless: true,
  });

  setProfile(result.profile);
}
```

### 5. Logout

```ts
await lens.logout();
setProfile(null);
setStatus("idle");
```

## Status Reference

`LensLoginStatus` is the full set of states used by this repo. Some are emitted by `@login-with-lens/core`, and some are app-level states used by the demo when a backend challenge flow is involved.

| Status | Source | What it means | Typical next step |
| --- | --- | --- | --- |
| `idle` | core | No active flow yet, or the user logged out. | Show the sign-in button. |
| `checking_accounts` | core | `signIn()` is fetching Lens accounts available to the connected wallet. | Keep the UI in a loading state. |
| `requesting_challenge` | app/server flow | The frontend is asking your backend to create a challenge. | Wait for the challenge message. |
| `verifying_signature` | app/server flow | The user signed the challenge and the backend is verifying it. | Keep the UI pending until verification finishes. |
| `needs_account_selection` | core | The wallet can access more than one Lens account. | Let the user choose one, then call `selectAccount(accountAddress)`. |
| `needs_account_creation` | core | The wallet has no Lens account yet. | Show an account-creation form, then call `createAccount(...)`. |
| `authenticating` | core | Lens authentication is in progress for the selected account. | Wait. |
| `creating_account` | core | The SDK is uploading metadata and sending the account-creation operation. | Wait, and make sure `handleLensOperation` is implemented. |
| `fetching_profile` | core | Authentication succeeded and the SDK is loading profile details. | Wait. |
| `authenticated` | core or app | The Lens session is ready and profile data is available. | Render the signed-in app. |
| `error` | app | Your app marked the flow as failed. | Show the error and let the user retry. |

Notes:

- `requesting_challenge`, `verifying_signature`, and `error` are not emitted by `@login-with-lens/core`; they are useful UI states you can set in your own app.
- `selectAccount()` requires a pending result from `signIn()`.
- `createAccount()` can be called directly, but the usual path is `signIn() -> needs_account_creation -> createAccount(...)`.

## Core API

| Method | Returns | Use it when |
| --- | --- | --- |
| `signIn()` | `authenticated` or a next-step result | Start the sign-in flow. |
| `selectAccount(accountAddress)` | `authenticated` | The wallet has more than one Lens account. |
| `createAccount(input)` | `authenticated` | The wallet needs a new Lens account. |
| `resumeSession()` | `authenticated` or `not_authenticated` | Restore a browser-side Lens session on app boot. |
| `logout()` | `void` | Clear the current Lens session. |

`signIn()` returns one of these shapes:

- `authenticated`: the SDK already has enough information to finish the flow.
- `needs_account_selection`: the wallet can access multiple Lens accounts.
- `needs_account_creation`: the wallet does not have a Lens account yet.

## Server-Assisted Flow

Use `@login-with-lens/server` when your backend should own the challenge/verify flow and expose its own app session to the frontend.

### Minimal server example

```ts
import { createLensLoginServer } from "@login-with-lens/server";

const lens = createLensLoginServer({
  appAddress: "0xYOUR_LENS_APP_ADDRESS",
  environment: "testnet",
  origin: "https://your-app.com",
});

const accounts = await lens.listAvailableAccounts("0xWALLET_ADDRESS");

const challenge = await lens.createChallenge({
  walletAddress: "0xWALLET_ADDRESS",
  accountAddress: accounts[0].accountAddress,
  role: accounts[0].role === "manager" ? "accountManager" : "accountOwner",
});

const verified = await lens.verifyChallenge({
  flowId: challenge.flowId,
  challengeId: challenge.challengeId,
  signature: "0xSIGNED_MESSAGE",
});
```

`verified` includes:

- `appSessionId`: the session identifier your app can keep in a cookie, header, or local storage
- `profile`: the authenticated Lens profile
- `authenticatedSessions`: active Lens sessions for that account

### Frontend challenge example

```ts
setStatus("requesting_challenge");

const challenge = await fetch("/api/auth/challenge", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    walletAddress: wallet.address,
    accountAddress: account.accountAddress,
    role: account.role === "manager" ? "accountManager" : "accountOwner",
  }),
}).then((response) => response.json());

setStatus("verifying_signature");

const signature = await walletAdapter.signMessage(challenge.message);

const session = await fetch("/api/auth/verify", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    flowId: challenge.flowId,
    challengeId: challenge.challengeId,
    signature,
  }),
}).then((response) => response.json());

window.localStorage.setItem("lens-app-session", session.appSessionId);
setStatus("authenticated");
```

The demo in [demo/server](./demo/server) shows one way to expose these methods over HTTP. The SDK itself does not force a route shape.

## Demo

The demo is the best place to see the full flow wired together.

- [demo/client](./demo/client): Vite + React + Privy
- [demo/server](./demo/server): Node server using `@login-with-lens/server`

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

For Privy-based email login, enable both email login and embedded wallets in the Privy dashboard. Lens authentication still needs an EVM wallet signature.
