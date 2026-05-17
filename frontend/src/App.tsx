import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { useAuth, type UserRole } from "./lib/auth";
import Login from "./pages/Login";
import SSOMock from "./pages/SSOMock";
import GoalSheet from "./pages/employee/GoalSheet";
import CheckinPage from "./pages/employee/CheckinPage";
import EmployeeDashboard from "./pages/employee/EmployeeDashboard";
import TeamDashboard from "./pages/manager/TeamDashboard";
import ApprovalView from "./pages/manager/ApprovalView";
import ManagerCheckinView from "./pages/manager/ManagerCheckinView";
import RiskPanel from "./pages/manager/RiskPanel";
import SharedGoalsPush from "./pages/manager/SharedGoalsPush";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AuditLogPage from "./pages/admin/AuditLogPage";
import CycleManagement from "./pages/admin/CycleManagement";
import UserManagement from "./pages/admin/UserManagement";
import EscalationConfig from "./pages/admin/EscalationConfig";
import NotificationsLog from "./pages/admin/NotificationsLog";
import AnalyticsPage from "./pages/AnalyticsPage";
import ReportsPage from "./pages/ReportsPage";
import NotificationToast from "./components/NotificationToast";
import AppLayout from "./components/AppLayout";

function ProtectedRoute({
  children,
  roles,
}: {
  children: ReactNode;
  roles?: UserRole[];
}) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        Loading…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }
  return <AppLayout>{children}</AppLayout>;
}

function HomeRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "admin") return <Navigate to="/admin" replace />;
  if (user.role === "manager") return <Navigate to="/manager" replace />;
  return <Navigate to="/dashboard" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <NotificationToast />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/sso/mock" element={<SSOMock />} />

        {/* Employee */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute roles={["employee"]}>
              <EmployeeDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/goals"
          element={
            <ProtectedRoute roles={["employee"]}>
              <GoalSheet />
            </ProtectedRoute>
          }
        />
        <Route
          path="/checkins"
          element={
            <ProtectedRoute roles={["employee"]}>
              <CheckinPage />
            </ProtectedRoute>
          }
        />

        {/* Manager */}
        <Route
          path="/manager"
          element={
            <ProtectedRoute roles={["manager", "admin"]}>
              <TeamDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/manager/approve/:employeeId"
          element={
            <ProtectedRoute roles={["manager", "admin"]}>
              <ApprovalView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/manager/checkins"
          element={
            <ProtectedRoute roles={["manager", "admin"]}>
              <ManagerCheckinView />
            </ProtectedRoute>
          }
        />
        <Route
          path="/manager/risk"
          element={
            <ProtectedRoute roles={["manager", "admin"]}>
              <RiskPanel />
            </ProtectedRoute>
          }
        />
        <Route
          path="/manager/shared-goals"
          element={
            <ProtectedRoute roles={["manager", "admin"]}>
              <SharedGoalsPush />
            </ProtectedRoute>
          }
        />

        {/* Admin */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute roles={["admin"]}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/audit"
          element={
            <ProtectedRoute roles={["admin"]}>
              <AuditLogPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/cycles"
          element={
            <ProtectedRoute roles={["admin"]}>
              <CycleManagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/users"
          element={
            <ProtectedRoute roles={["admin"]}>
              <UserManagement />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/escalations"
          element={
            <ProtectedRoute roles={["admin"]}>
              <EscalationConfig />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/notifications"
          element={
            <ProtectedRoute roles={["admin"]}>
              <NotificationsLog />
            </ProtectedRoute>
          }
        />

        {/* Shared analytics + reports for manager & admin */}
        <Route
          path="/analytics"
          element={
            <ProtectedRoute roles={["manager", "admin"]}>
              <AnalyticsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <ProtectedRoute roles={["manager", "admin"]}>
              <ReportsPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/"
          element={
            <ProtectedRoute>
              <HomeRedirect />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
