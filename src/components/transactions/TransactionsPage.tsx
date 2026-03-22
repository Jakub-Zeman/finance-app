import { useEffect, useState, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useTransactionStore } from "../../stores/useTransactionStore";
import { useCategoryStore } from "../../stores/useCategoryStore";
import type { Transaction } from "../../types";
import { formatCurrency, formatDate } from "../../lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Badge } from "../ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { TransactionForm } from "./TransactionForm";
import { CSVImport } from "./CSVImport";
import { Plus, Upload, Search, Pencil, Trash2 } from "lucide-react";

export function TransactionsPage() {
  const location = useLocation();
  const { transactions, fetchTransactions, deleteTransaction, bulkDeleteTransactions, deleteAllTransactions } = useTransactionStore();
  const { categories, fetchCategories } = useCategoryStore();

  const [formOpen, setFormOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  // Support pre-selecting a category when navigating from Categories page
  const [filterCategory, setFilterCategory] = useState<string>(
    location.state?.categoryId ? String(location.state.categoryId) : "all"
  );
  const [filterMonth, setFilterMonth] = useState<string>("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  useEffect(() => {
    fetchCategories();
    fetchTransactions();
  }, []);

  // If navigation state passes a category, update filter
  useEffect(() => {
    if (location.state?.categoryId) {
      setFilterCategory(String(location.state.categoryId));
    }
  }, [location.state]);

  // Clear selection when filters change
  useEffect(() => {
    setSelected(new Set());
  }, [search, filterType, filterCategory, filterMonth]);

  const months = useMemo(() => {
    const set = new Set(transactions.map((tx) => tx.date.slice(0, 7)));
    return Array.from(set).sort().reverse();
  }, [transactions]);

  const filtered = useMemo(() => {
    return transactions.filter((tx) => {
      if (filterType !== "all" && tx.type !== filterType) return false;
      // Compare as strings to handle both number and string categoryId from DB
      if (filterCategory !== "all" && String(tx.categoryId) !== filterCategory) return false;
      if (filterMonth !== "all" && !tx.date.startsWith(filterMonth)) return false;
      if (search && !tx.description.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [transactions, filterType, filterCategory, filterMonth, search]);

  const totals = useMemo(() => {
    const income = filtered.filter((tx) => tx.type === "income").reduce((s, tx) => s + tx.amount, 0);
    const expenses = filtered.filter((tx) => tx.type === "expense").reduce((s, tx) => s + tx.amount, 0);
    return { income, expenses };
  }, [filtered]);

  const filteredIds = filtered.map((tx) => tx.id!).filter(Boolean);
  const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredIds));
    }
  }

  function toggleOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkDelete() {
    if (!window.confirm(`Delete ${selected.size} selected transaction(s)?`)) return;
    await bulkDeleteTransactions(Array.from(selected));
    setSelected(new Set());
  }

  async function handleDeleteAll() {
    if (!window.confirm(`Delete ALL ${transactions.length} transactions? This cannot be undone.`)) return;
    await deleteAllTransactions();
    setSelected(new Set());
  }

  function handleEdit(tx: Transaction) {
    setEditing(tx);
    setFormOpen(true);
  }

  function handleAdd() {
    setEditing(null);
    setFormOpen(true);
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      {/* Header — title left, buttons right; on mobile buttons go below */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl md:text-2xl font-bold">Transactions</h1>
          <p className="text-muted-foreground text-sm">{filtered.length} of {transactions.length} transactions</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {someSelected && (
            <Button variant="destructive" size="sm" onClick={handleBulkDelete} className="gap-1.5">
              <Trash2 className="h-3.5 w-3.5" />
              Delete {selected.size}
            </Button>
          )}
          {transactions.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleDeleteAll} className="gap-1.5 border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground">
              <Trash2 className="h-3.5 w-3.5" />
              Delete All
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setCsvOpen(true)} className="gap-1.5">
            <Upload className="h-3.5 w-3.5" />
            <span className="hidden xs:inline">Import CSV</span>
            <span className="xs:hidden">Import</span>
          </Button>
          <Button size="sm" onClick={handleAdd} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden xs:inline">Add Transaction</span>
            <span className="xs:hidden">Add</span>
          </Button>
        </div>
      </div>

      {/* Summary Bar — numbers auto-shrink to fit */}
      <div className="grid grid-cols-3 gap-2 md:gap-4">
        <div className="bg-green-50 border border-green-200 rounded-lg p-2 md:p-3 overflow-hidden">
          <p className="text-xs text-green-600 font-medium">Income</p>
          <p className="text-sm md:text-base font-bold text-green-700 truncate">{formatCurrency(totals.income)}</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-2 md:p-3 overflow-hidden">
          <p className="text-xs text-red-600 font-medium">Expenses</p>
          <p className="text-sm md:text-base font-bold text-red-700 truncate">{formatCurrency(totals.expenses)}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 md:p-3 overflow-hidden">
          <p className="text-xs text-blue-600 font-medium">Net</p>
          <p className={`text-sm md:text-base font-bold truncate ${totals.income - totals.expenses >= 0 ? "text-blue-700" : "text-red-700"}`}>
            {formatCurrency(totals.income - totals.expenses)}
          </p>
        </div>
      </div>

      {/* Filters row 1: search + type + month */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search transactions..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="income">Income</SelectItem>
            <SelectItem value="expense">Expense</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterMonth} onValueChange={setFilterMonth}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Months</SelectItem>
            {months.map((m) => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Filters row 2: category chips */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setFilterCategory("all")}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
            filterCategory === "all"
              ? "bg-foreground text-background border-foreground"
              : "bg-background border-input hover:bg-accent"
          }`}
        >
          All categories
        </button>
        {categories.map((cat) => {
          const active = filterCategory === String(cat.id);
          return (
            <button
              key={cat.id}
              onClick={() => setFilterCategory(active ? "all" : String(cat.id))}
              className="px-3 py-1 rounded-full text-xs font-medium border transition-all"
              style={
                active
                  ? { backgroundColor: cat.color, borderColor: cat.color, color: "#fff" }
                  : { backgroundColor: "transparent", borderColor: "#e2e8f0", color: "inherit" }
              }
            >
              {cat.icon} {cat.name}
            </button>
          );
        })}
      </div>

      {/* Transaction Table */}
      <div className="border rounded-lg overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <p className="text-sm">No transactions found</p>
            <Button variant="link" onClick={handleAdd} className="mt-2">Add your first transaction</Button>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-muted text-sm">
              <tr>
                <th className="p-3 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="rounded border-gray-300 cursor-pointer"
                  />
                </th>
                <th className="text-left p-3 font-medium">Date</th>
                <th className="text-left p-3 font-medium">Description</th>
                <th className="text-left p-3 font-medium">Category</th>
                <th className="text-left p-3 font-medium">Tags</th>
                <th className="text-right p-3 font-medium">Amount</th>
                <th className="p-3 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((tx) => (
                <tr
                  key={tx.id}
                  className={`border-t transition-colors ${selected.has(tx.id!) ? "bg-primary/5" : "hover:bg-muted/50"}`}
                >
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={selected.has(tx.id!)}
                      onChange={() => toggleOne(tx.id!)}
                      className="rounded border-gray-300 cursor-pointer"
                    />
                  </td>
                  <td className="p-3 text-sm text-muted-foreground whitespace-nowrap">{formatDate(tx.date)}</td>
                  <td className="p-3">
                    <div>
                      <p className="text-sm font-medium">{tx.description}</p>
                      {tx.notes && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{tx.notes}</p>}
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-1.5 text-sm">
                      <span>{tx.category?.icon}</span>
                      <span>{tx.category?.name ?? "—"}</span>
                    </div>
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                      {tx.tags.slice(0, 2).map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs px-1.5 py-0">{tag}</Badge>
                      ))}
                    </div>
                  </td>
                  <td className="p-3 text-right">
                    <span className={`text-sm font-semibold ${tx.type === "income" ? "text-green-600" : "text-red-600"}`}>
                      {tx.type === "income" ? "+" : "-"}{formatCurrency(tx.amount)}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(tx)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => tx.id && deleteTransaction(tx.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <TransactionForm open={formOpen} onClose={() => { setFormOpen(false); setEditing(null); }} editing={editing} />
      <CSVImport open={csvOpen} onClose={() => setCsvOpen(false)} />
    </div>
  );
}
