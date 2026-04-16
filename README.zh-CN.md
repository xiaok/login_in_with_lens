# Login With Lens 中文文档

一套用于接入 Lens 登录的轻量级构件。

`@login-with-lens/core` 负责浏览器侧流程：发现钱包可用的 Lens account、让用户选择账号、在没有账号时创建账号，并返回可直接使用的 Lens session 和 profile 数据。

`@login-with-lens/server` 负责服务端原语：创建 challenge、验证签名、恢复 session、查询已认证 session、注销 session。

这个仓库不提供现成 UI，也不强制规定 HTTP API。你可以自己决定产品交互、路由设计和会话模型。

English version: [README.md](./README.md)

## 仓库结构

- `core/`：浏览器 SDK，入口是 `createLensLogin(...)`
- `server/`：服务端 SDK，入口是 `createLensLoginServer(...)`
- `demo/client/`：Vite + React + Privy 示例
- `demo/server/`：最小 Node 服务端示例

## 先选接入方式

- 只需要浏览器侧 Lens 登录：用 `@login-with-lens/core`
- 需要后端托管 challenge / verify 流程，并维护应用自己的 session：再加上 `@login-with-lens/server`

## 登录流程图

```text
连接钱包
   |
   v
lens.signIn()
   |
   +--> checking_accounts
          |
          +--> 没有可用 Lens account
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
          +--> 只有一个可用 Lens account
          |      |
          |      +--> authenticating
          |      +--> fetching_profile
          |      `--> authenticated
          |
          `--> 有多个可用 Lens account
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

如果你走后端 challenge 流程，那么在账号选定之后，到最终应用登录完成之前，通常还会插入 `requesting_challenge -> verifying_signature` 两个状态。

## 安装

这个仓库里的包当前是按本地包方式消费的。demo 里的依赖写法是：

```json
{
  "@login-with-lens/core": "file:../../core",
  "@login-with-lens/server": "file:../../server"
}
```

消费方项目还需要安装 Lens 的 peer dependencies：

```bash
pnpm add @lens-protocol/client @lens-protocol/metadata @lens-chain/storage-client
```

如果你只使用服务端包，则不需要 `@lens-protocol/metadata` 和 `@lens-chain/storage-client`。

## 浏览器侧快速接入

### 1. 创建 Lens client

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
        throw new Error("钱包返回了非字符串签名。");
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

只有在你允许用户创建 Lens account 时，`handleLensOperation` 才是必需的。一个真实的钱包适配器示例可以看 [demo/client/src/privy-wallet-adapter.ts](./demo/client/src/privy-wallet-adapter.ts)。

### 2. 页面启动时恢复已有 session

```ts
const restored = await lens.resumeSession();

if (restored.status === "authenticated") {
  setProfile(restored.profile);
}
```

### 3. 发起登录，并根据返回状态分支

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

### 4. 由 UI 继续后续动作

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

### 5. 退出登录

```ts
await lens.logout();
setProfile(null);
setStatus("idle");
```

## 状态说明

`LensLoginStatus` 是这个仓库里出现过的完整状态集合。其中一部分由 `@login-with-lens/core` 直接发出，另一部分是 demo 在接入后端 challenge 流程时使用的应用层状态。

| 状态 | 来源 | 含义 | 典型下一步 |
| --- | --- | --- | --- |
| `idle` | core | 还没开始流程，或用户已经退出。 | 展示登录按钮。 |
| `checking_accounts` | core | `signIn()` 正在查询当前钱包可用的 Lens account。 | 显示 loading。 |
| `requesting_challenge` | 应用 / 服务端流程 | 前端正在请求后端生成 challenge。 | 等待 challenge message 返回。 |
| `verifying_signature` | 应用 / 服务端流程 | 用户已经签名，后端正在校验签名并建立 session。 | 保持等待态。 |
| `needs_account_selection` | core | 当前钱包下有多个可用 Lens account。 | 让用户选择一个账号，然后调用 `selectAccount(accountAddress)`。 |
| `needs_account_creation` | core | 当前钱包还没有 Lens account。 | 展示创建表单，然后调用 `createAccount(...)`。 |
| `authenticating` | core | SDK 正在把选中的账号变成有效的 Lens session。 | 等待。 |
| `creating_account` | core | SDK 正在上传 metadata 并发起创建账号操作。 | 等待，并确保实现了 `handleLensOperation`。 |
| `fetching_profile` | core | 认证已经成功，SDK 正在拉取 profile 详情。 | 等待。 |
| `authenticated` | core 或应用 | Lens session 已就绪，profile 数据也可用了。 | 渲染登录后的页面。 |
| `error` | 应用 | 你的应用把当前流程标记成失败。 | 展示错误，并允许用户重试。 |

补充说明：

- `requesting_challenge`、`verifying_signature`、`error` 不是 `@login-with-lens/core` 自动发出的状态，而是很适合在应用里自己维护的 UI 状态。
- `selectAccount()` 必须建立在 `signIn()` 已经返回 `needs_account_selection` 的前提下。
- `createAccount()` 虽然可以直接调用，但推荐流程仍然是 `signIn() -> needs_account_creation -> createAccount(...)`。

## Core API 一览

| 方法 | 返回值 | 适合在什么时候调用 |
| --- | --- | --- |
| `signIn()` | `authenticated` 或下一步状态结果 | 启动登录流程 |
| `selectAccount(accountAddress)` | `authenticated` | 钱包下有多个 Lens account 时 |
| `createAccount(input)` | `authenticated` | 钱包还没有 Lens account 时 |
| `resumeSession()` | `authenticated` 或 `not_authenticated` | 页面启动时恢复浏览器侧 Lens session |
| `logout()` | `void` | 清空当前 Lens session |

`signIn()` 可能返回三种结果：

- `authenticated`：当前信息已经足够，直接完成登录
- `needs_account_selection`：当前钱包下有多个 Lens account，需要用户选择
- `needs_account_creation`：当前钱包下还没有 Lens account，需要先创建

## 服务端接入方式

如果你希望 challenge / verify 由后端处理，并且应用自己维护一层 app session，那么用 `@login-with-lens/server`。

### 最小服务端示例

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

`verified` 里包含：

- `appSessionId`：你自己的应用可以保存到 cookie、header 或 localStorage 的 session id
- `profile`：当前认证后的 Lens profile
- `authenticatedSessions`：这个账号当前的 Lens 已认证 session 列表

### 前端 challenge 调用示例

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

[demo/server](./demo/server) 展示了一种最小 HTTP 暴露方式。SDK 本身并不要求你必须用 REST、GraphQL 或某个固定框架。

## Demo

如果你想看完整联调流程，直接看 demo 最快。

- [demo/client](./demo/client)：Vite + React + Privy
- [demo/server](./demo/server)：基于 `@login-with-lens/server` 的 Node 服务

前端环境变量：

```bash
VITE_PRIVY_APP_ID=
VITE_LENS_APP_ADDRESS=
VITE_LENS_ENVIRONMENT=testnet
VITE_LENS_SERVER_URL=http://localhost:8787
```

后端环境变量：

```bash
PORT=8787
DEMO_CLIENT_ORIGIN=http://localhost:5173
DEMO_LENS_APP_ADDRESS=0xC75A89145d765c396fd75CbD16380Eb184Bd2ca7
DEMO_LENS_ENVIRONMENT=testnet
```

运行方式：

```bash
cd demo/server
pnpm install
pnpm dev

cd ../client
pnpm install
pnpm dev
```

如果你用 Privy 的邮箱登录，请同时在 Privy Dashboard 打开 email login 和 embedded wallets，因为 Lens 认证仍然需要一次 EVM 钱包签名。
