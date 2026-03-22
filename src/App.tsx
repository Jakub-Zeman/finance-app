import { HashRouter as BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./components/layout/Layout";
import { DashboardPage } from "./components/dashboard/DashboardPage";
import { TransactionsPage } from "./components/transactions/TransactionsPage";
import { BudgetsPage } from "./components/budgets/BudgetsPage";
import { CategoriesPage } from "./components/categories/CategoriesPage";
import { AccountsPage } from "./components/accounts/AccountsPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<DashboardPage />} />
          <Route path="transactions" element={<TransactionsPage />} />
          <Route path="budgets" element={<BudgetsPage />} />
          <Route path="categories" element={<CategoriesPage />} />
          <Route path="accounts" element={<AccountsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
