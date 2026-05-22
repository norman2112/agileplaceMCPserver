import { AsyncLocalStorage } from "node:async_hooks";
import { resolveAccountConfig } from "./accounts.mjs";

const accountStorage = new AsyncLocalStorage();

export function withAccountContext(accountName, fn) {
  const account = resolveAccountConfig(accountName);
  return accountStorage.run(account, fn);
}

export function getActiveAccountConfig() {
  const active = accountStorage.getStore();
  if (active) return active;
  return resolveAccountConfig("default");
}

