import { useEffect, useMemo, useState } from "react";
import { useTransactionStore } from "../../stores/useTransactionStore";
import { useCategoryStore } from "../../stores/useCategoryStore";
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
import { format, parseISO } from "date-fns";

export function DashboardPage() {
  const { transactions, fetchTransactions } = useTransactionStore();
  const { categories, fetchCategories }     = useCategoryStore();
  const [csvOpen, setCsvOpen] = useState(false);

  useEffect(() => {
    fetchCategories();
    fetchTransactions();
  }, []);

  const currentMonth = getCurrentMonth();

  const summary = useMemo(() => {
    const currentTxs = transactions.filter((tx) => tx.date.startsWith(currentMonth));
    const income     = currentTxs.filter((tx) => tx.type === "income").reduce((s, tx) => s + tx.amount, 0);
    const expenses   = currentTxs.filter((tx) => tx.type === "expense").reduce((s, tx) => s + tx.amount, 0);
    const balance    = transactions.reduce((s, tx) => s + (tx.type === "income" ? tx.amount : -tx.amount), 0);
    return { income, expenses, balance, count: currentTxs.length };
  }, [transactions, currentMonth]);

  const last6Months = getLast6Months();

  const monthlyData = useMemo(() => {
    return last6Months.map((month) => {
      const txs      = transactions.filter((tx) => tx.date.startsWith(month));
      const income   = txs.filter((tx) => tx.type === "income").reduce((s, tx) => s + tx.amount, 0);
      const expenses = txs.filter((tx) => tx.type === "expense").reduce((s, tx) => s + tx.amount, 0);
      return { month: format(parseISO(month + "-01"), "MMM"), income, expenses, net: income - expenses };
    });
  }, [transactions]);

  const categoryBreakdown = useMemo(() => {
    const currentExpenses = transactions.filter(
      (tx) => tx.type === "expense" && tx.date.startsWith(currentMonth)
    );
    const byCategory = new Map<number, number>();
    for (const tx of currentExpenses) {
      byCategory.set(tx.categoryId, (byCategory.get(tx.categoryId) || 0) + tx.amount);
    }
    return Array.from(byCategory.entries())
      .map(([catId, amount]) => {
        const cat = categories.find((c) => c.id === catId);
        return { name: cat?.name || "Unknown", value: amount, color: cat?.color || "#888" };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [transactions, categories, currentMonth]);

  const recentTransactions = transactions.slice(0, 8);

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm">{getMonthLabel(currentMonth)}</p>
        </div>
        <Button onClick={() => setCsvOpen(true)} className="gap-2 shrink-0">
          <Upload className="h-4 w-4" />
          <span className="hidden sm:inline">Import CSV</span>
          <span className="sm:hidden">Import</span>
        </Button>
      </div>

      {/* Summary Cards — 2-col on mobile, 4-col on large */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <SummaryCard
          title="Total Balance"
          value={formatCurrency(summary.balance)}
          icon={<Wallet className="h-4 w-4" />}
          color="text-primary"
        />
        <SummaryCard
          title="Income This Month"
          value={formatCurrency(summary.income)}
          icon={<TrendingUp className="h-4 w-4" />}
          color="text-green-500"
        />
        <SummaryCard
          title="Expenses This Month"
          value={formatCurrency(summary.expenses)}
          icon={<TrendingDown className="h-4 w-4" />}
          color="text-red-500"
        />
        <SummaryCard
          title="Transactions"
          value={summary.count.toString()}
          icon={<ArrowLeftRight className="h-4 w-4" />}
          color="text-purple-500"
          suffix="this month"
        />
      </div>

      {/* Charts — stack on mobile, side-by-side on large */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm md:text-base">Monthly Overview</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
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
          <CardTitle className="text-sm md:text-base">Net Cash Flow (6 months)</CardTitle>
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
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
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
          <CardTitle className="text-sm md:text-base">Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {recentTransactions.length === 0 ? (
            <div className="text-muted-foreground text-sm text-center py-6 space-y-3">
              <p>No transactions yet</p>
              <Button variant="outline" onClick={() => setCsvOpen(true)} className="gap-2">
                <Upload className="h-4 w-4" />
                Import your first bank statement
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
      <CardContent className="p-4 md:p-6">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs md:text-sm text-muted-foreground leading-tight">{title}</p>
          <span className={color}>{icon}</span>
        </div>
        <p className="text-lg md:text-2xl font-bold leading-tight">{value}</p>
        {suffix && <p className="text-xs text-muted-foreground mt-0.5">{suffix}</p>}
      </CardContent>
    </Card>
  );
}
