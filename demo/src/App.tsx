import { useEffect, useMemo, useState } from "react";
import { useConnectOrCreateWallet, usePrivy, useWallets } from "@privy-io/react-auth";

import {
  createLensLogin,
  type CreateLensAccountInput,
  type LensAccountOption,
  type LensEnvironment,
  type LensLoginStatus,
  type LensProfile,
} from "@login-with-lens/core";

import { createPrivyLensWalletAdapter } from "./privy-wallet-adapter";

const LENS_LOGO = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 80 20" width="96" height="24"><path fill="#2C2D30" d="M24.89 4.18c-1.44 0-2.74.57-3.73 1.48l-.1-.05A5.74 5.74 0 0 0 15.35.25a5.74 5.74 0 0 0-5.72 5.36l-.1.05A5.46 5.46 0 0 0 5.8 4.18 5.8 5.8 0 0 0 0 10c0 2.78 2.75 5.16 3.43 5.7a19.1 19.1 0 0 0 11.92 4.06c4.51 0 8.7-1.5 11.9-4.06.7-.54 3.44-2.92 3.44-5.7a5.8 5.8 0 0 0-5.8-5.8ZM74.53 16.91c3.19 0 5.47-1.3 5.47-3.91 0-1.88-1.18-3.2-3.75-4.16l-.66-.25c-1.02-.38-1.63-.73-1.63-1.38 0-1.47 3.27-.9 4.98-.5l.9-2.77c-1.06-.32-2.2-.57-3.84-.57-3.26 0-5.38 1.63-5.38 3.92 0 1.71 1.2 2.8 2.85 3.5l1.15.5c1.47.63 2.2.9 2.2 1.54 0 .58-.82 1.07-2.2 1.07-1.06 0-2.2-.17-3.43-.41l-.4 2.93c.89.25 2.11.5 3.74.5Zm-15.82-.16h3.26V8.92c0-1.71.9-2.7 2.37-2.7 1.47 0 2.28 1.07 2.28 2.78v7.75h3.26v-8c0-3.26-1.79-5.54-5.54-5.54-3.35 0-5.63 2.28-5.63 5.55v8Zm-14.36.16c1.14 0 2.04-.16 2.86-.49l-.33-3.01c-2.29.49-4.98.57-4.98-2.13v-7.5h-3.26v7.83c0 3.5 2.04 5.3 5.71 5.3Zm2.37-6.93c0 5.28 3.74 7 7.1 7 1.33 0 2.7-.27 3.73-.7l-.4-2.88c-1.08.31-2.2.42-3.23.42-2.09 0-4.01-.7-4.01-3.54v-.55c0-2.23 1.1-3.42 2.74-3.42 1.08 0 1.98.62 1.98 1.8 0 1.42-1.9 2.06-5.3 1.95l.16 1.88c4.29 1.22 8.32-.1 8.32-3.92 0-2.7-2.06-4.57-5.03-4.57-3.58 0-6.06 2.55-6.06 6.53Z"></path></svg>`;

export function App() {
  const { ready, authenticated, logout } = usePrivy();
  const { wallets, ready: walletsReady } = useWallets();
  const { connectOrCreateWallet } = useConnectOrCreateWallet();

  const environment = (import.meta.env.VITE_LENS_ENVIRONMENT === "mainnet"
    ? "mainnet"
    : "testnet") as LensEnvironment;
  const appAddress = import.meta.env.VITE_LENS_APP_ADDRESS;

  const [status, setStatus] = useState<LensLoginStatus>("idle");
  const [message, setMessage] = useState<string>("");
  const [profile, setProfile] = useState<LensProfile | null>(null);
  const [options, setOptions] = useState<LensAccountOption[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateLensAccountInput>({
    username: "",
    name: "",
    bio: "",
  });

  const wallet = wallets[0];

  const lens = useMemo(() => {
    if (!wallet || !appAddress) {
      return null;
    }

    return createPrivyLensWalletAdapter(wallet, environment).then((adapter) =>
      createLensLogin({
        appAddress,
        environment,
        origin: window.location.origin,
        wallet: adapter,
        onStatusChange: setStatus,
      }),
    );
  }, [appAddress, environment, wallet]);

  useEffect(() => {
    if (authenticated) {
      setMessage("Wallet connected. You can continue with Lens sign-in.");
    }
  }, [authenticated]);

  async function handleLensLogin() {
    setMessage("");

    try {
      if (!walletsReady) {
        setMessage("Waiting for Privy wallets to become ready.");
        return;
      }

      if (!wallet) {
        await connectOrCreateWallet();
        setMessage("Wallet connected. Click the button again to continue with Lens.");
        return;
      }

      const client = await lens;
      if (!client) {
        throw new Error("Lens client could not be initialized.");
      }

      const result = await client.signIn();

      if (result.status === "authenticated") {
        setProfile(result.profile);
        setOptions([]);
        setShowCreate(false);
        return;
      }

      if (result.status === "needs_account_selection") {
        setOptions(result.accounts);
        setShowCreate(false);
        setForm((current) => ({
          ...current,
          username: current.username || result.accounts[0]?.localName || "",
        }));
        return;
      }

      setOptions([]);
      setShowCreate(true);
      setForm((current) => ({
        ...current,
        username: current.username || result.suggestedUsername,
      }));
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown Lens login error";
      setStatus("error");
      setMessage(reason);
    }
  }

  async function handleSelectAccount(accountAddress: string) {
    try {
      const client = await lens;
      if (!client) {
        throw new Error("Lens client is not ready.");
      }

      const result = await client.selectAccount(accountAddress);
      setProfile(result.profile);
      setOptions([]);
      setShowCreate(false);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Failed to select Lens account";
      setStatus("error");
      setMessage(reason);
    }
  }

  async function handleCreateAccount() {
    try {
      const client = await lens;
      if (!client) {
        throw new Error("Lens client is not ready.");
      }

      const result = await client.createAccount(form);
      setProfile(result.profile);
      setOptions([]);
      setShowCreate(false);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Failed to create Lens account";
      setStatus("error");
      setMessage(reason);
    }
  }

  async function handleLogout() {
    const client = await lens;
    await client?.logout();
    await logout();
    setProfile(null);
    setOptions([]);
    setShowCreate(false);
    setStatus("idle");
    setMessage("");
  }

  return (
    <div className="page-shell">
      <section className="hero-card">
        <div className="logo-row">
          <span className="logo-mark" dangerouslySetInnerHTML={{ __html: LENS_LOGO }} />
          <span className="eyebrow">Headless login SDK demo</span>
        </div>

        <h1>Login with Lens</h1>
        <p className="lede">
          Privy handles the wallet connection. The SDK handles Lens account discovery, account
          selection, onboarding, and profile hydration.
        </p>

        <div className="toolbar">
          <button className="primary-button" onClick={handleLensLogin}>
            Login with Lens
          </button>
          <button className="ghost-button" onClick={handleLogout}>
            Reset session
          </button>
        </div>

        <dl className="status-grid">
          <div>
            <dt>Privy</dt>
            <dd>{ready ? "ready" : "booting"}</dd>
          </div>
          <div>
            <dt>Wallet</dt>
            <dd>{wallet?.address ?? "not connected"}</dd>
          </div>
          <div>
            <dt>Lens flow</dt>
            <dd>{status}</dd>
          </div>
        </dl>

        {message ? <p className="message">{message}</p> : null}
      </section>

      {options.length > 0 ? (
        <section className="panel">
          <h2>Select a Lens account</h2>
          <div className="stack">
            {options.map((option) => (
              <button
                key={option.accountAddress}
                className="account-row"
                onClick={() => handleSelectAccount(option.accountAddress)}
              >
                <span>
                  <strong>{option.displayName ?? option.username ?? option.accountAddress}</strong>
                  <small>{option.username ?? "No username yet"}</small>
                </span>
                <span className="pill">{option.role}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {showCreate ? (
        <section className="panel">
          <h2>Create a Lens account</h2>
          <div className="form-grid">
            <label>
              Username
              <input
                value={form.username}
                onChange={(event) => setForm((current) => ({ ...current, username: event.target.value }))}
                placeholder="lens-alice"
              />
            </label>
            <label>
              Name
              <input
                value={form.name ?? ""}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                placeholder="Alice"
              />
            </label>
            <label>
              Bio
              <textarea
                rows={3}
                value={form.bio ?? ""}
                onChange={(event) => setForm((current) => ({ ...current, bio: event.target.value }))}
                placeholder="Building with Lens"
              />
            </label>
          </div>
          <button className="primary-button" onClick={handleCreateAccount}>
            Create account and continue
          </button>
        </section>
      ) : null}

      {profile ? (
        <section className="panel profile-panel">
          <h2>Lens profile</h2>
          <div className="profile-card">
            <div className="avatar">
              {profile.pictureUrl ? <img src={profile.pictureUrl} alt={profile.displayName ?? "Lens avatar"} /> : profile.displayName?.slice(0, 1) ?? "L"}
            </div>
            <div className="stack compact">
              <strong>{profile.displayName ?? "Unnamed profile"}</strong>
              <span>{profile.username ?? "No username"}</span>
              <span>{profile.bio ?? "No bio yet"}</span>
              <code>{profile.accountAddress}</code>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
