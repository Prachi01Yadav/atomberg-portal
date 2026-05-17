import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";

const DEMO_USERS = [
  { email: "admin@demo.com", label: "Demo Admin (HR)", role: "admin" },
  { email: "manager1@demo.com", label: "Manager One (Operations)", role: "manager" },
  { email: "manager2@demo.com", label: "Manager Two (Sales)", role: "manager" },
  { email: "emp1@demo.com", label: "Employee 1 (Operations)", role: "employee" },
  { email: "emp2@demo.com", label: "Employee 2 (Operations)", role: "employee" },
  { email: "emp3@demo.com", label: "Employee 3 (Sales)", role: "employee" },
  { email: "emp4@demo.com", label: "Employee 4 (Sales)", role: "employee" },
];

export default function SSOMock() {
  const navigate = useNavigate();
  const [error, setError] = useState("");

  const exchangeMut = useMutation({
    mutationFn: (email: string) =>
      api.post("/api/v1/sso/callback", { code: email, state: "demo" }),
    onSuccess: ({ data }) => {
      localStorage.setItem("access_token", data.access_token);
      localStorage.setItem("refresh_token", data.refresh_token);
      window.location.href = "/";
    },
    onError: () => setError("SSO exchange failed"),
  });

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-blue-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8 max-w-md w-full">
        <div className="text-center mb-4">
          <h1 className="text-2xl font-bold">Microsoft Entra ID</h1>
          <p className="text-xs text-slate-500 mt-1">
            (mock SSO picker for hackathon demo — choose an identity)
          </p>
        </div>
        <div className="space-y-2">
          {DEMO_USERS.map((u) => (
            <button
              type="button"
              key={u.email}
              onClick={() => exchangeMut.mutate(u.email)}
              disabled={exchangeMut.isPending}
              className="w-full text-left p-3 border rounded-lg hover:border-brand-500 hover:bg-brand-50 transition"
            >
              <p className="font-medium">{u.label}</p>
              <p className="text-xs text-slate-500">{u.email}</p>
            </button>
          ))}
        </div>
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
        <button
          type="button"
          onClick={() => navigate("/login")}
          className="text-xs text-slate-500 hover:underline mt-4 block mx-auto"
        >
          ← Back to password login
        </button>
      </div>
    </div>
  );
}
