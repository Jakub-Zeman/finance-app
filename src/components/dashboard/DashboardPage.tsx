import { useEffect, useMemo, useState } from "react";
import { useTransactionStore } from "../../stores/useTransactionStore";
import { useCategoryStore } from "../../stores/useCategoryStore";
import { useAccountStore } from "../../stores/useAccountStore";
import { formatCurrency, getCurrentMonth, getLast6Months, getMonthLabel } from "../../lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { CSVImport } from "../transactions/CSVImport";
import {
  AreaChart, Area,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, TrendingDown, Wallet, ArrowLeftRight, Upload } from "lucide-react";
import { format, parseISO, eachMonthOfInterval, startOfMonth, endOfMonth } from "date-fns";

type FilterMode = "month" | "year" | "custom";

export function DashboardPage() {
  const { transactions, fetchTransactions } = useTransactionStore();
  const { categories, fetchCategories }     = useCategoryStore();
  const { accounts, fetchAccounts }         = useAccountStore();
  const [csvOpen, setCsvOpen] = useState(false);

  // Filter state
  const [filterMode, setFilterMode]       = useState<FilterMode>("month");
  const [filterMonth, setFilterMonth]     = useState(getCurrentMonth());
  const [filterYear, setFilterYear]       = useState(new Date().getFullYear().toString());
  const [filterFrom, setFilterFrom]       = useState("");
  const [filterTo, setFilterTo]           = useState("");
  const [filterAccount, setFilterAccount] = useState<string>("all");

  useEffect(() => {
    fetchCategories();
    fetchTransactions();
    fetchAccounts();
  }, []);

  // Available months & years derived from actual transaction data
  const { availableMonths, availableYears } = useMemo(() => {
    const monthSet = new Set<string>();
    const yearSet  = new Set<string>();
    for (const tx of transactions) {
      monthSet.add(tx.date.substring(0, 7));
      yearSet.add(tx.date.substring(0, 4));
    }
    monthSet.add(getCurrentMonth());
    yearSet.add(new Date().getFullYear().toString());
    return {
      availableMonths: Array.from(monthSet).sort().reverse(),
      availableYears:  Array.from(yearSet).sort().reverse(),
    };
  }, [transactions]);

  // Resolved date range string bounds
  const dateRange = useMemo(() => {
    if (filterMode === "month") {
      return { from: `${filterMonth}-01`, to: `${filterMonth}-31` };
    }
    if (filterMode === "year") {
      return { from: `${filterYear}-01-01`, to: `${filterYear}-12-31` };
    }
    return { from: filterFrom, to: filterTo };
  }, [filterMode, filterMonth, filterYear, filterFrom, filterTo]);

  const unlinkedCount = useMemo(
    () => transactions.filter((tx) => tx.accountId == null).length,
    [transactions]
  );

  // Transactions for the selected period
  const periodTxs = useMemo(() => {
    const dateFiltered = (filterMode === "custom" && (!filterFrom || !filterTo))
      ? transactions
      : transactions.filter((tx) => tx.date >= dateRange.from && tx.date <= dateRange.to);

    return dateFiltered.filter((tx) => {
      if (filterAccount === "none") {
        return tx.accountId == null;
      } else if (filterAccount !== "all") {
        return String(tx.accountId) === filterAccount;
      }
      return true;
    });
  }, [transactions, dateRange, filterMode, filterFrom, filterTo, filterAccount]);

  // Summary cards — always show total balance from ALL transactions
  const summary = useMemo(() => {
    const income   = periodTxs.filter((tx) => tx.type === "income").reduce((s, tx) => s + tx.amount, 0);
    const expenses = periodTxs.filter((tx) => tx.type === "expense").reduce((s, tx) => s + tx.amount, 0);
    const balance  = transactions.reduce((s, tx) => s + (tx.type === "income" ? tx.amount : -tx.amount), 0);
    return { income, expenses, balance, count: periodTxs.length };
  }, [transactions, periodTxs]);

  // Which months to show on the bar/area charts
  const chartMonths = useMemo((): string[] => {
    if (filterMode === "month") {
      // 6-month window ending at selected month
      const [y, m] = filterMonth.split("-").map(Number);
      return Array.from({ length: 6 }, (_, i) => {
        const d = new Date(y, m - 1 - (5 - i), 1);
        return format(d, "yyyy-MM");
      });
    }
    if (filterMode === "year") {
      return Array.from({ length: 12 }, (_, i) =>
        `${filterYear}-${String(i + 1).padStart(2, "0")}`
      );
    }
    if (filterFrom && filterTo) {
      try {
        return eachMonthOfInterval({
          start: startOfMonth(parseISO(filterFrom)),
          end:   endOfMonth(parseISO(filterTo)),
        }).map((d) => format(d, "yyyy-MM"));
      } catch {
        return getLast6Months();
      }
    }
    return getLast6Months();
  }, [filterMode, filterMonth, filterYear, filterFrom, filterTo]);

  const monthlyData = useMemo(() => {
    return chartMonths.map((month) => {
      const txs      = transactions.filter((tx) => tx.date.startsWith(month));
      const income   = txs.filter((tx) => tx.type === "income").reduce((s, tx) => s + tx.amount, 0);
      const expenses = txs.filter((tx) => tx.type === "expense").reduce((s, tx) => s + tx.amount, 0);
      return { month: format(parseISO(month + "-01"), "MMM yy"), income, expenses, net: income - expenses };
    });
  }, [transactions, chartMonths]);

  const categoryBreakdown = useMemo(() => {
    const byCategory = new Map<number, number>();
    for (const tx of periodTxs.filter((tx) => tx.type === "expense")) {
      byCategory.set(tx.categoryId, (byCategory.get(tx.categoryId) || 0) + tx.amount);
    }
    return Array.from(byCategory.entries())
      .map(([catId, amount]) => {
        const cat = categories.find((c) => c.id === catId);
        return { name: cat?.name || "Unknown", value: amount, color: cat?.color || "#888" };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [periodTxs, categories]);

  const recentTransactions = periodTxs.slice(0, 8);

  const periodLabel = useMemo(() => {
    if (filterMode === "month")  return getMonthLabel(filterMonth);
    if (filterMode === "year")   return filterYear;
    if (filterFrom && filterTo)  return `${filterFrom} – ${filterTo}`;
    return "All transactions";
  }, [filterMode, filterMonth, filterYear, filterFrom, filterTo]);

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm">{periodLabel}</p>
        </div>
        <Button onClick={() => setCsvOpen(true)} className="gap-2 shrink-0">
          <Upload className="h-4 w-4" />
          <span className="hidden sm:inline">Import CSV</span>
          <span className="sm:hidden">Import</span>
        </Button>
      </div>

      {/* ── Filter Bar ── */}
      <Card>
        <CardContent className="p-3 md:p-4 space-y-3">
          {/* Mode toggle */}
          <div className="flex rounded-lg overflow-hidden border border-border text-sm font-medium">
            {(["month", "year", "custom"] as FilterMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setFilterMode(mode)}
                className={`flex-1 py-2 capitalize transition-colors ${
                  filterMode === mode
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                {mode === "custom" ? "Range" : mode}
              </button>
            ))}
          </div>

          {/* Month picker */}
          {filterMode === "month" && (
            <select
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {availableMonths.map((m) => (
                <option key={m} value={m}>{getMonthLabel(m)}</option>
              ))}
            </select>
          )}

          {/* Year picker */}
          {filterMode === "year" && (
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          )}

          {/* Custom date range */}
          {filterMode === "custom" && (
            <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
              <div className="flex-1 flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">From</label>
                <input
                  type="date"
                  value={filterFrom}
                  onChange={(e) => setFilterFrom(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
              <div className="flex-1 flex flex-col gap-1">
                <label className="text-xs text-muted-foreground">To</label>
                <input
                  type="date"
                  value={filterTo}
                  onChange={(e) => setFilterTo(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
          )}

          {/* Account selector */}
          {accounts.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Account</label>
              <select value={filterAccount} onChange={(e) => setFilterAccount(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary">
                <option value="all">All accounts</option>
                {accounts.map((a) => <option key={a.id} value={String(a.id)}>{a.icon} {a.name}</option>)}
                {unlinkedCount > 0 && <option value="none">📋 Unlinked</option>}
              </select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <SummaryCard
          title="Total Balance"
          value={formatCurrency(summary.balance)}
          icon={<Wallet className="h-4 w-4" />}
          color="text-primary"
        />
        <SummaryCard
          title="Income"
          value={formatCurrency(summary.income)}
          icon={<TrendingUp className="h-4 w-4" />}
          color="text-green-500"
          suffix={periodLabel}
        />
        <SummaryCard
          title="Expenses"
          value={formatCurrency(summary.expenses)}
          icon={<TrendingDown className="h-4 w-4" />}
          color="text-red-500"
          suffix={periodLabel}
        />
        <SummaryCard
          title="Transactions"
          value={summary.count.toString()}
          icon={<ArrowLeftRight className="h-4 w-4" />}
          color="text-purple-500"
          suffix={periodLabel}
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm md:text-base">Monthly Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="income"   fill="#22c55e" name="Income"   radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenses" fill="#ef4444" name="Expenses" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm md:text-base">Spending by Category</CardTitle>
          </CardHeader>
          <CardContent>
            {categoryBreakdown.length === 0 ? (
              <div className="flex items-center justify-center h-[220px] text-muted-foreground text-sm">
                No expense data
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={categoryBreakdown}
                    cx="50%" cy="50%"
                    innerRadius={50} outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {categoryBreakdown.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                </PieChart>
              </ResponsiveContainer>
            )}
            <div className="space-y-1 mt-2">
              {categoryBreakdown.map((item) => (
                <div key={item.name} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                    <span className="truncate">{item.name}</span>
                  </div>
                  <span className="font-medium ml-2 shrink-0">{formatCurrency(item.value)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Net Cash Flow */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm md:text-base">Net Cash Flow</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={monthlyData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => formatCurrency(Number(v))} />
              <Area type="monotone" dataKey="net" stroke="#3b82f6" fill="url(#netGrad)" name="Net" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Recent Transactions */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm md:text-base">
            Recent Transactions
            {periodTxs.length > 8 && (
              <span className="text-xs text-muted-foreground font-normal ml-2">
                showing 8 of {periodTxs.length}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentTransactions.length === 0 ? (
            <div className="text-muted-foreground text-sm text-center py-6 space-y-3">
              <p>No transactions in this period</p>
              <Button variant="outline" onClick={() => setCsvOpen(true)} className="gap-2">
                <Upload className="h-4 w-4" />
                Import bank statement
              </Button>
            </div>
          ) : (
            <div className="space-y-1">
              {recentTransactions.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between py-2 border-b last:border-0 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-lg shrink-0">{tx.category?.icon || "💰"}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{tx.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {tx.category?.name} · {format(parseISO(tx.date), "MMM d")}
                      </p>
                    </div>
                  </div>
                  <span className={`text-sm font-semibold shrink-0 ${tx.type === "income" ? "text-green-600" : "text-red-600"}`}>
                    {tx.type === "income" ? "+" : "−"}{formatCurrency(tx.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CSVImport open={csvOpen} onClose={() => setCsvOpen(false)} />
    </div>
  );
}

function SummaryCard({
  title, value, icon, color, suffix,
}: {
  title: string; value: string; icon: React.ReactNode; color: string; suffix?: string;
}) {
  return (
    <Card>
      <CardContent className="p-3 md:p-5">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-muted-foreground leading-tight">{title}</p>
          <span className={color}>{icon}</span>
        </div>
        <p className="text-base md:text-xl font-bold leading-tight truncate">{value}</p>
        {suffix && <p className="text-xs text-muted-foreground mt-0.5 truncate">{suffix}</p>}
      </CardContent>
    </Card>
  );
}
