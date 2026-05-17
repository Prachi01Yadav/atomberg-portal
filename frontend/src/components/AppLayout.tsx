import { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth, type UserRole } from "@/lib/auth";
import { api } from "@/lib/api";

interface NavItem {
  to: string;
  label: string;
  roles: UserRole[];
}

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", roles: ["employee"] },
  { to: "/goals", label: "My Goals", roles: ["employee"] },
  { to: "/checkins", label: "Check-ins", roles: ["employee"] },
  { to: "/manager", label: "Team Dashboard", roles: ["manager"] },
  { to: "/manager/checkins", label: "Team Check-ins", roles: ["manager"] },
  { to: "/manager/shared-goals", label: "Shared Goals", roles: ["manager", "admin"] },
  { to: "/manager/risk", label: "AI Risk", roles: ["manager", "admin"] },
  { to: "/admin", label: "Admin Dashboard", roles: ["admin"] },
  { to: "/admin/cycles", label: "Cycles", roles: ["admin"] },
  { to: "/admin/users", label: "Users", roles: ["admin"] },
  { to: "/admin/audit", label: "Audit Log", roles: ["admin"] },
  { to: "/admin/escalations", label: "Escalations", roles: ["admin"] },
  { to: "/admin/notifications", label: "Notifications", roles: ["admin"] },
  { to: "/analytics", label: "Analytics", roles: ["manager", "admin"] },
  { to: "/reports", label: "Reports", roles: ["manager", "admin"] },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const { data: sys } = useQuery({
    queryKey: ["system-info"],
    queryFn: async () =>
      (await api.get<{
        ai_mode: string;
        blockchain_mode: string;
        sso_mode: string;
        email_mode: string;
        teams_mode: string;
      }>("/api/v1/system/info")).data,
    staleTime: 60_000,
    enabled: !!user,
  });
  if (!user) return <>{children}</>;
  const items = NAV.filter((n) => n.roles.includes(user.role));

  const roleBadge: Record<UserRole, { label: string; cls: string }> = {
    employee: { label: "Employee", cls: "bg-blue-50 text-blue-700 border-blue-200" },
    manager: { label: "Manager (L1)", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    admin: { label: "Admin / HR", cls: "bg-purple-50 text-purple-700 border-purple-200" },
  };
  const rb = roleBadge[user.role];

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col">
        <div className="px-5 py-5 border-b border-slate-100">
          <Link
            to="/"
            className="font-brand text-3xl bg-gradient-to-r from-brand-600 to-accent-600 bg-clip-text text-transparent leading-none"
          >
            AtomBerg
          </Link>
          <p className="text-[11px] text-slate-400 mt-2 tracking-wide">
            Goal Setting & Tracking
          </p>
        </div>

        <div className="px-4 pt-3 pb-2">
          <span className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded border ${rb.cls}`}>
            {rb.label}
          </span>
        </div>

        <nav className="flex-1 py-2 overflow-y-auto">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end
              className={({ isActive }) =>
                `flex items-center gap-3 mx-2 px-3 py-2 text-sm rounded-lg transition border-l-2 ${
                  isActive
                    ? "border-brand-600 bg-brand-50 text-brand-700 font-semibold"
                    : "border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`
              }
            >
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        {sys && (
          <div className="mx-3 mb-3 p-3 rounded-lg bg-slate-50 border border-slate-100 text-[10px] text-slate-500 space-y-1">
            <p className="font-semibold uppercase tracking-wider text-slate-400">System mode</p>
            <p className="text-[9px] text-slate-400 leading-snug pb-1 border-b border-slate-100 mb-1">
              Amber = mock/demo (no external keys). Green = live integration.
            </p>
            <ModeBadge label="AI" mode={sys.ai_mode} />
            <ModeBadge label="Chain" mode={sys.blockchain_mode} />
            <ModeBadge label="SSO" mode={sys.sso_mode} />
            <ModeBadge label="Email" mode={sys.email_mode} />
            <ModeBadge label="Teams" mode={sys.teams_mode} />
          </div>
        )}
        <div className="p-4 border-t border-slate-100 bg-white">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-400 to-accent-500 text-white flex items-center justify-center font-semibold text-sm shadow">
              {user.full_name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate text-slate-900">{user.full_name}</p>
              <p className="text-xs text-slate-500 truncate">{user.department ?? user.email}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            className="mt-3 w-full text-xs text-slate-600 hover:text-red-600 hover:bg-red-50 py-1.5 rounded border border-slate-200 hover:border-red-200 transition"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}

function ModeBadge({ label, mode }: { label: string; mode: string }) {
  const live = mode === "live";
  return (
    <div className="flex justify-between items-center">
      <span className="text-slate-500">{label}</span>
      <span
        className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
          live ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
        }`}
      >
        {mode}
      </span>
    </div>
  );
}
