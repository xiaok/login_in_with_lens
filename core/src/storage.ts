export type LensStorageProvider = {
  getItem(key: string): Promise<string | null> | string | null;
  setItem(key: string, value: string): Promise<string> | Promise<void> | void | string;
  removeItem(key: string): Promise<string> | Promise<void> | void;
};

export class BrowserStorageProvider implements LensStorageProvider {
  constructor(private readonly prefix: string) {}

  getItem(key: string): string | null {
    if (typeof window === "undefined" || !window.localStorage) {
      return null;
    }
    return window.localStorage.getItem(this.scopedKey(key));
  }

  setItem(key: string, value: string): void {
    if (typeof window === "undefined" || !window.localStorage) {
      return;
    }
    window.localStorage.setItem(this.scopedKey(key), value);
  }

  removeItem(key: string): void {
    if (typeof window === "undefined" || !window.localStorage) {
      return;
    }
    window.localStorage.removeItem(this.scopedKey(key));
  }

  private scopedKey(key: string): string {
    return `${this.prefix}:${key}`;
  }
}

export function createDefaultStorageProvider(namespace: string): LensStorageProvider | undefined {
  if (typeof window === "undefined" || !window.localStorage) {
    return undefined;
  }

  return new BrowserStorageProvider(namespace);
}
