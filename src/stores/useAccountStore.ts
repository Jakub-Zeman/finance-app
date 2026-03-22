import { create } from "zustand";
import { db } from "../db/database";
import type { Account } from "../types";

interface AccountStore {
  accounts: Account[];
  fetchAccounts: () => Promise<void>;
  addAccount: (account: Omit<Account, "id">) => Promise<number>;
  updateAccount: (id: number, data: Partial<Account>) => Promise<void>;
  deleteAccount: (id: number) => Promise<void>;
}

export const useAccountStore = create<AccountStore>((set) => ({
  accounts: [],

  fetchAccounts: async () => {
    const accounts = await db.accounts.toArray();
    set({ accounts });
  },

  addAccount: async (account) => {
    const id = await db.accounts.add(account);
    const accounts = await db.accounts.toArray();
    set({ accounts });
    return id as number;
  },

  updateAccount: async (id, data) => {
    await db.accounts.update(id, data);
    const accounts = await db.accounts.toArray();
    set({ accounts });
  },

  deleteAccount: async (id) => {
    await db.accounts.delete(id);
    // Unlink transactions — set accountId to undefined
    const txs = await db.transactions.where("accountId").equals(id).toArray();
    await Promise.all(
      txs.map((tx) => db.transactions.update(tx.id!, { accountId: undefined }))
    );
    const accounts = await db.accounts.toArray();
    set({ accounts });
  },
}));
