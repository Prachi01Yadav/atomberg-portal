import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";

const ROLE_ACCOUNTS = [
  {
    role: "employee",
    label: "Employee",
    initial: "E",
    color: "from-blue-500 to-blue-600",
    email: "emp1@demo.com",
    password: "Emp@123",
    desc: "Create goals · log quarterly check-ins",
  },
  {
    role: "manager",
    label: "Manager (L1)",
    initial: "M",
    color: "from-emerald-500 to-emerald-600",
    email: "manager1@demo.com",
    password: "Mgr@123",
    desc: "Approve goals · review team check-ins · push shared KPIs",
  },
  {
    role: "admin",
    label: "Admin / HR",
    initial: "A",
    color: "from-purple-500 to-purple-600",
    email: "admin@demo.com",
    password: "Admin@123",
    desc: "Configure cycles · org hierarchy · audit · escalations",
  },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [mode, setMode] = useState<"pick" | "manual">("pick");

  const { data: sysPublic } = useQuery({
    queryKey: ["system-info-public"],
    queryFn: async () =>
      (
        await api.get<{
          ai_mode: string;
          blockchain_mode: string;
          sso_mode: string;
          email_mode: string;
          teams_mode: string;
        }>("/api/v1/system/info")
      ).data,
    staleTime: 60_000,
    retry: 1,
  });

  async function signIn(em: string, pw: string) {
    setError("");
    setSubmitting(true);
    try {
      await login(em, pw);
      navigate("/");
    } catch {
      setError("Invalid email or password");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleManual(e: FormEvent) {
    e.preventDefault();
    await signIn(email, password);
  }

  async function handleSSO() {
    setError("");
    try {
      const { data } = await api.get<{ url: string; mode: string }>("/api/v1/sso/initiate");
      if (data.mode === "mock") navigate(data.url);
      else window.location.href = data.url;
    } catch {
      setError("SSO not available");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50">
      {/* soft orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-brand-100 rounded-full opacity-40 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-purple-100 rounded-full opacity-40 blur-3xl" />
      </div>

      <div className="relative w-full max-w-3xl">
        <div className="text-center mb-8">
          <h1 className="font-brand text-7xl bg-gradient-to-r from-brand-600 to-accent-600 bg-clip-text text-transparent leading-tight pb-1">
            AtomBerg
          </h1>
          <p className="text-slate-600 mt-3 text-lg">Goal Setting &amp; Tracking Portal</p>
          <p className="text-slate-500 text-xs mt-1">
            AI Coach · Blockchain Audit · Real-time
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-card border border-slate-100 p-8 space-y-5">
          {mode === "pick" ? (
            <>
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-800">
                  Choose a role to demo
                </h2>
                <button
                  type="button"
                  onClick={() => setMode("manual")}
                  className="text-xs text-slate-500 hover:text-slate-800"
                >
                  Use email + password
                </button>
              </div>

              <div className="grid sm:grid-cols-3 gap-3">
                {ROLE_ACCOUNTS.map((r) => (
                  <button
                    key={r.role}
                    type="button"
                    disabled={submitting}
                    onClick={() => signIn(r.email, r.password)}
                    className="group text-left rounded-xl border-2 border-slate-200 p-4 hover:border-brand-500 hover:shadow-lg transition disabled:opacity-50"
                  >
                    <div
                      className={`w-12 h-12 rounded-lg bg-gradient-to-br ${r.color} text-white text-xl font-bold flex items-center justify-center shadow`}
                    >
                      {r.initial}
                    </div>
                    <p className="font-bold mt-3 text-slate-900">{r.label}</p>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">{r.desc}</p>
                    <p className="text-xs text-brand-600 font-medium mt-2 group-hover:underline">
                      Sign in →
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1 font-mono">
                      {r.email}
                    </p>
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 text-xs text-slate-400 pt-1">
                <hr className="flex-1 border-slate-200" />
                <span>or</span>
                <hr className="flex-1 border-slate-200" />
              </div>

              <button
                type="button"
                onClick={handleSSO}
                className="w-full border-2 border-slate-300 hover:border-brand-400 hover:bg-blue-50 py-3 rounded-lg flex items-center justify-center gap-2 text-sm font-medium transition"
              >
                Sign in with Microsoft Entra ID (SSO)
              </button>

              <details className="text-xs text-slate-500 pt-1">
                <summary className="cursor-pointer hover:text-slate-800">
                  All demo accounts
                </summary>
                <table className="mt-2 text-xs w-full">
                  <thead className="text-slate-400">
                    <tr>
                      <th className="text-left">Email</th>
                      <th className="text-left">Password</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono">
                    {[
                      ["admin@demo.com", "Admin@123"],
                      ["manager1@demo.com", "Mgr@123"],
                      ["manager2@demo.com", "Mgr@123"],
                      ["emp1@demo.com", "Emp@123"],
                      ["emp2@demo.com", "Emp@123"],
                      ["emp3@demo.com", "Emp@123"],
                      ["emp4@demo.com", "Emp@123"],
                    ].map(([e, p]) => (
                      <tr key={e}>
                        <td>{e}</td>
                        <td>{p}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </>
          ) : (
            <form onSubmit={handleManual} className="space-y-3">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-semibold">Sign in</h2>
                <button
                  type="button"
                  onClick={() => setMode("pick")}
                  className="text-xs text-slate-500 hover:text-slate-800"
                >
                  ← back to role picker
                </button>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full bg-brand-600 hover:bg-brand-700 text-white font-medium py-2.5 rounded-lg transition disabled:opacity-50"
              >
                {submitting ? "Signing in…" : "Sign in"}
              </button>
            </form>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 p-2 rounded">
              {error}
            </p>
          )}

          <details className="rounded-lg border border-slate-200 bg-slate-50/80 p-3 text-xs text-slate-600">
            <summary className="cursor-pointer font-semibold text-slate-700 select-none">
              For judges: demo URLs &amp; mock vs live (~1 min)
            </summary>
            <ul className="mt-2 space-y-1.5 list-disc pl-4 leading-relaxed">
              <li>
                <strong>UI:</strong> this page&apos;s origin ({typeof window !== "undefined" ? window.location.origin : "—"}
                ) · <strong>API docs:</strong>{" "}
                <code className="text-[10px] bg-white px-1 rounded">
                  {typeof window !== "undefined"
                    ? `${window.location.protocol}//${window.location.hostname}:8000/docs`
                    : "http://127.0.0.1:8000/docs"}
                </code>
              </li>
              <li>
                <strong>Health:</strong>{" "}
                <code className="text-[10px] bg-white px-1 rounded">…:8000/health</code> ·{" "}
                <strong>Modes JSON:</strong>{" "}
                <code className="text-[10px] bg-white px-1 rounded">GET /api/v1/system/info</code>
              </li>
              <li>
                After login, open the sidebar <strong>System mode</strong> block:{" "}
                <span className="text-amber-700 font-medium">amber</span> = mock/offline integrations;{" "}
                <span className="text-emerald-700 font-medium">live</span> = real keys configured.
              </li>
              <li>
                Full-screen cheat sheet: open{" "}
                <code className="text-[10px] bg-white px-1 rounded">atomquest/docs/demo-judge-slide.html</code> in a
                browser.
              </li>
              <li>
                If <strong>Submit all goals</strong> fails with wrong total: run{" "}
                <code className="text-[10px] bg-white px-1 rounded">atomquest/scripts/demo-prep.ps1</code> to remove stray
                drafts, or delete draft rows on My Goals.
              </li>
            </ul>
            {sysPublic && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(
                  [
                    ["AI", sysPublic.ai_mode],
                    ["Chain", sysPublic.blockchain_mode],
                    ["SSO", sysPublic.sso_mode],
                    ["Email", sysPublic.email_mode],
                    ["Teams", sysPublic.teams_mode],
                  ] as const
                ).map(([k, v]) => (
                  <span
                    key={k}
                    className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      v === "live" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {k}: {v}
                  </span>
                ))}
              </div>
            )}
          </details>
        </div>

        <p className="text-center text-xs text-slate-400 mt-4">
          Built for AtomQuest Hackathon 1.0 · React · FastAPI · PostgreSQL · Redis · Claude · Polygon
        </p>
      </div>
    </div>
  );
}

