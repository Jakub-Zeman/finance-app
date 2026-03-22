import { create } from "zustand";
import { db } from "../db/database";
import type { Budget, BudgetWithCategory } from "../types";
import { getCurrentMonth } from "../lib/utils";

interface BudgetStore {
  budgets: BudgetWithCategory[];
  loading: boolean;
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  fetchBudgets: (month?: string) => Promise<void>;
  addBudget: (budget: Omit<Budget, "id">) => Promise<void>;
  updateBudget: (id: number, budget: Partial<Budget>) => Promise<void>;
  deleteBudget: (id: number) => Promise<void>;
}

async function getBudgetsWithSpending(month: string): Promise<BudgetWithCategory[]> {
  const budgets = await db.budgets.where("month").equals(month).toArray();
  const cats = await db.categories.toArray();
  const catMap = new Map(cats.map((c) => [c.id!, c]));

  const monthStart = month + "-01";
  const monthEnd = month + "-31";
  const txs = await db.transactions
    .where("date")
    .between(monthStart, monthEnd, true, true)
    .toArray();

  return budgets.map((b) => {
    const spent = txs
      .filter((tx) => tx.categoryId === b.categoryId && tx.type === "expense")
      .reduce((sum, tx) => sum + tx.amount, 0);
    return { ...b, category: catMap.get(b.categoryId), spent };
  });
}

export const useBudgetStore = create<BudgetStore>((set, get) => ({
  budgets: [],
  loading: false,
  selectedMonth: getCurrentMonth(),

  setSelectedMonth: (month) => {
    set({ selectedMonth: month });
    get().fetchBudgets(month);
  },

  fetchBudgets: async (month) => {
    const m = month || get().selectedMonth;
    set({ loading: true });
    const budgets = await getBudgetsWithSpending(m);
    set({ budgets, loading: false });
  },

  addBudget: async (budget) => {
    await db.budgets.add(budget);
    const budgets = await getBudgetsWithSpending(get().selectedMonth);
    set({ budgets });
  },

  updateBudget: async (id, budget) => {
    await db.budgets.update(id, budget);
    const budgets = await getBudgetsWithSpending(get().selectedMonth);
    set({ budgets });
  },

  deleteBudget: async (id) => {
    await db.budgets.delete(id);
    const budgets = await getBudgetsWithSpending(get().selectedMonth);
    set({ budgets });
  },
}));
