# Login With Lens 中文文档

`./login_with_lens` 包含四部分：

- `core/`：浏览器 SDK，核心入口是 `createLensLogin(...)`
- `server/`：服务端 SDK，提供 Lens 认证相关原语
- `demo/client/`：基于 Privy 的前端演示
- `demo/server/`：最小后端演示

## 概览

`core` 是一个最小化的浏览器 SDK，负责：

- 连接钱包
- 拉取可用 Lens account
- 选择 account
- 创建 account
- 读取 profile

`server` 是一个最小化的服务端 SDK，负责：

- 创建 challenge
- 验证签名后的 challenge
- 恢复 session
- 查询 authenticated sessions
- 注销 session

SDK 本身不规定 HTTP API 结构。

如果你要暴露 REST、GraphQL、RPC 或者某个框架专用 handler，都由接入方自己决定；demo 只提供一个参考实现。

## Core 快速接入

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

根据状态继续：

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

配置项：

- `appAddress`：Lens app 地址
- `environment`：`"mainnet"` 或 `"testnet"`
- `origin`：可选，非浏览器环境下可显式传入
- `wallet`：钱包适配器
- `storage`：可选，浏览器侧 Lens session 存储
- `onStatusChange`：可选，监听流程状态变化

实例方法：

- `signIn()`
- `selectAccount(accountAddress)`
- `createAccount({ username, name, bio, picture, coverPicture, enableSignless })`
- `resumeSession()`
- `logout()`

## 钱包适配器

```ts
type LensWalletAdapter = {
  getAddress(): Promise<string>;
  signMessage(message: string): Promise<string>;
  handleLensOperation?: (request: { __typename: string }) => Promise<string>;
};
```

其中 `handleLensOperation` 只在创建账号等需要发送链上请求时才需要。

## Server SDK

`server/` 提供的是 Lens 认证原语，不要求固定的 HTTP API 形式。

典型用法：

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

至于这些能力如何通过你的后端暴露给前端，由你的应用自己决定。

## Demo

demo 里才定义了 HTTP API，作为一个参考实现：

- `demo/client`：Vite + React + Privy
- `demo/server`：Node 服务端，使用 `@login-with-lens/server`

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

