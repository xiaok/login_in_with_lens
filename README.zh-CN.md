# Login With Lens 中文文档

`Login With Lens` 是一个无 UI 的 Lens 登录 SDK，目标是让宿主网站像接入一个登录提供方一样，把 `Lens account` 登录能力接进去。

这个目录包含两部分：

- `core/`：纯 TypeScript 的 headless SDK
- `demo/`：使用 Privy 演示邮箱/钱包登录、Lens 账号选择、账号创建和 profile 拉取

## 能力概览

SDK 负责这几步：

1. 获取当前钱包地址
2. 查询这个钱包可用的 Lens account
3. 如果只有一个账号，直接登录
4. 如果有多个账号，返回“需要宿主网站选择账号”
5. 如果没有账号，返回“需要宿主网站创建账号”
6. 登录成功后拉取 Lens profile，并返回统一结构

SDK 本身不渲染 UI，账号选择、创建表单、登录按钮都由接入方自己控制。

## 目录结构

- `core/src/index.ts`：SDK 出口
- `core/src/lens-login.ts`：主登录流程编排
- `core/src/types.ts`：对外类型
- `demo/src/App.tsx`：演示页
- `demo/src/privy-wallet-adapter.ts`：Privy 到 SDK 的钱包适配层

## 快速接入

先创建一个钱包适配器，再初始化 SDK：

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
    bio: "Built with Lens",
  });
  console.log(next.profile);
}
```

## 对外 API

`createLensLogin(config)`

配置项：

- `appAddress`：Lens app 地址
- `environment`：`"mainnet"` 或 `"testnet"`
- `origin`：可选，非浏览器环境下可显式传入
- `wallet`：钱包适配器
- `storage`：可选，自定义 Lens session 存储
- `onStatusChange`：可选，监听流程状态变化

实例方法：

- `signIn()`
- `selectAccount(accountAddress)`
- `createAccount({ username, name, bio, picture, coverPicture, enableSignless })`
- `resumeSession()`
- `logout()`

## 钱包适配器约定

SDK 不绑定 Privy、wagmi、ethers 或 React。

```ts
type LensWalletAdapter = {
  getAddress(): Promise<string>;
  signMessage(message: string): Promise<string>;
  handleLensOperation?: (request: { __typename: string }) => Promise<string>;
};
```

其中：

- `getAddress`：返回当前 EVM 地址
- `signMessage`：给 Lens 的 SIWE challenge 做签名
- `handleLensOperation`：只在创建账号等需要发送交易请求时才需要

## Demo 使用方式

`demo/` 是一个 Vite + React 示例，使用 Privy 做登录入口。

环境变量：

```bash
VITE_PRIVY_APP_ID=
VITE_LENS_APP_ADDRESS=
VITE_LENS_ENVIRONMENT=testnet
```

运行方式：

```bash
cd demo
pnpm install
pnpm dev
```

## 关于邮箱登录

demo 当前支持：

- 钱包登录
- 邮箱登录

但需要注意，Lens 最终仍然依赖 EVM 钱包签名，所以邮箱登录场景下仍然需要 Privy 的 embedded wallet。demo 已配置：

- `loginMethods: ["wallet", "email"]`
- `embeddedWallets.ethereum.createOnLogin = "users-without-wallets"`

如果你在页面里看不到 email 登录，一般不是代码问题，而是 Privy Dashboard 里还没有开启 email 或 embedded wallet。

## 独立提交建议

如果你准备把这个目录单独作为仓库提交，建议至少保留这些文件：

- `.gitignore`
- `README.md`
- `README.zh-CN.md`
- `core/`
- `demo/`

如果后续你准备发 npm 包，再补：

- 根目录 `package.json`
- workspace 配置
- 构建脚本
- 版本发布说明
