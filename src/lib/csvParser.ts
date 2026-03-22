import Papa from "papaparse";
import type { Transaction } from "../types";

export interface CSVRow {
  date: string;
  description: string;
  amount: string;
  type: string;
  category?: string;
  tags?: string;
  notes?: string;
}

export function parseCSV(file: File): Promise<CSVRow[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<CSVRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data),
      error: (error) => reject(error),
    });
  });
}

export function csvRowToTransaction(
  row: CSVRow,
  categoryId: number
): Omit<Transaction, "id"> {
  return {
    date: row.date,
    description: row.description,
    amount: Math.abs(parseFloat(row.amount)),
    type: (row.type?.toLowerCase() === "income" ? "income" : "expense") as
      | "income"
      | "expense",
    categoryId,
    tags: row.tags ? row.tags.split(",").map((t) => t.trim()) : [],
    notes: row.notes || "",
  };
}

export const CSV_TEMPLATE = `date,description,amount,type,tags,notes
2024-01-15,Monthly salary,5000,income,salary,
2024-01-16,Grocery shopping,120.50,expense,food,Weekly groceries
2024-01-17,Netflix subscription,15.99,expense,entertainment,`;
