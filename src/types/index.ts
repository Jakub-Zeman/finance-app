export type TransactionType = "income" | "expense";

export interface Category {
  id?: number;
  name: string;
  color: string;
  icon: string;
  type: TransactionType | "both";
}

export interface Transaction {
  id?: number;
  amount: number;
  type: TransactionType;
  categoryId: number;
  description: string;
  date: string; // ISO date string YYYY-MM-DD
  tags: string[];
  notes?: string;
}

export interface Budget {
  id?: number;
  categoryId: number;
  amount: number;
  month: string; // YYYY-MM
}

export interface TransactionWithCategory extends Transaction {
  category?: Category;
}

export interface BudgetWithCategory extends Budget {
  category?: Category;
  spent: number;
}

export interface CategoryRule {
  id?: number;
  pattern: string; // matches transaction description (case-insensitive)
  categoryId: number;
}
