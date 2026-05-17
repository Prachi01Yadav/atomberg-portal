import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface User {
  id: string;
  email: string;
  full_name: string;
  role: "employee" | "manager" | "admin";
  manager_id: string | null;
  department: string | null;
  created_at: string;
}

export default function UserManagement() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data: users = [] } = useQuery({
    queryKey: ["all-users"],
    queryFn: async () => {
      const { data } = await api.get<User[]>("/api/v1/users");
      return data;
    },
  });

  const managers = users.filter((u) => u.role === "manager" || u.role === "admin");
  const groupedManagerMap: Record<string, User[]> = {};
  for (const u of users) {
    if (u.role !== "employee") continue;
    const mgr = u.manager_id ?? "none";
    if (!groupedManagerMap[mgr]) groupedManagerMap[mgr] = [];
    groupedManagerMap[mgr].push(u);
  }

  return (
    <div className="p-6 space-y-6">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold">Users</h1>
          <p className="text-sm text-slate-500">Org hierarchy + role management.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm"
        >
          + Add user
        </button>
      </header>

      {showCreate && (
        <CreateUserForm
          managers={managers}
          onDone={() => {
            setShowCreate(false);
            qc.invalidateQueries({ queryKey: ["all-users"] });
          }}
        />
      )}

      <section className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white border rounded-xl p-4">
          <h2 className="font-semibold mb-3">All users</h2>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="text-left p-2">Name</th>
                <th className="text-left p-2">Email</th>
                <th className="text-left p-2">Role</th>
                <th className="text-left p-2">Dept</th>
                <th className="text-left p-2">Manager</th>
                <th className="text-left p-2 w-32">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <UserRow key={u.id} u={u} managers={managers} onChange={() => qc.invalidateQueries({ queryKey: ["all-users"] })} />
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-white border rounded-xl p-4">
          <h2 className="font-semibold mb-3">Org hierarchy</h2>
          <ul className="space-y-3 text-sm">
            {managers.map((m) => (
              <li key={m.id}>
                <div className="font-medium">
                  {m.full_name}{" "}
                  <span className="text-xs text-slate-500">({m.role})</span>
                </div>
                <ul className="ml-6 mt-1 space-y-1 text-xs text-slate-600">
                  {(groupedManagerMap[m.id] ?? []).map((emp) => (
                    <li key={emp.id}>↳ {emp.full_name}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}

function UserRow({
  u,
  managers,
  onChange,
}: {
  u: User;
  managers: User[];
  onChange: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [fullName, setFullName] = useState(u.full_name);
  const [role, setRole] = useState<User["role"]>(u.role);
  const [department, setDepartment] = useState(u.department ?? "");
  const [managerId, setManagerId] = useState(u.manager_id ?? "");

  const updateMut = useMutation({
    mutationFn: () =>
      api.patch(`/api/v1/users/${u.id}`, {
        full_name: fullName,
        role,
        department: department || null,
        manager_id: managerId || null,
      }),
    onSuccess: () => {
      setEditing(false);
      onChange();
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/api/v1/users/${u.id}`),
    onSuccess: () => onChange(),
  });

  const managerName =
    managers.find((m) => m.id === u.manager_id)?.full_name ?? "—";

  const roleCls =
    u.role === "admin"
      ? "bg-purple-100 text-purple-800"
      : u.role === "manager"
      ? "bg-blue-100 text-blue-800"
      : "bg-slate-100 text-slate-700";

  if (editing) {
    return (
      <tr className="border-t bg-slate-50">
        <td className="p-2">
          <input
            className="w-full border rounded px-2 py-1 text-xs"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </td>
        <td className="p-2 text-xs text-slate-500">{u.email}</td>
        <td className="p-2">
          <select
            className="border rounded px-1 py-0.5 text-xs"
            value={role}
            onChange={(e) => setRole(e.target.value as User["role"])}
          >
            <option value="employee">employee</option>
            <option value="manager">manager</option>
            <option value="admin">admin</option>
          </select>
        </td>
        <td className="p-2">
          <input
            className="w-full border rounded px-2 py-1 text-xs"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          />
        </td>
        <td className="p-2">
          <select
            className="border rounded px-1 py-0.5 text-xs w-full"
            value={managerId}
            onChange={(e) => setManagerId(e.target.value)}
          >
            <option value="">— none —</option>
            {managers
              .filter((m) => m.id !== u.id)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name}
                </option>
              ))}
          </select>
        </td>
        <td className="p-2 flex gap-1">
          <button
            type="button"
            onClick={() => updateMut.mutate()}
            disabled={updateMut.isPending}
            className="text-xs px-2 py-0.5 bg-brand-600 text-white rounded"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-xs px-2 py-0.5 border rounded"
          >
            Cancel
          </button>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t">
      <td className="p-2 font-medium">{u.full_name}</td>
      <td className="p-2 text-xs">{u.email}</td>
      <td className="p-2">
        <span className={`text-xs px-2 py-0.5 rounded ${roleCls}`}>{u.role}</span>
      </td>
      <td className="p-2 text-xs">{u.department ?? "—"}</td>
      <td className="p-2 text-xs">{managerName}</td>
      <td className="p-2 flex gap-2">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="text-xs text-brand-600 hover:underline"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirm(`Delete user ${u.full_name}? This cannot be undone.`))
              deleteMut.mutate();
          }}
          className="text-xs text-red-600 hover:underline"
        >
          Delete
        </button>
      </td>
    </tr>
  );
}

function CreateUserForm({ managers, onDone }: { managers: User[]; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"employee" | "manager" | "admin">("employee");
  const [department, setDepartment] = useState("");
  const [managerId, setManagerId] = useState("");

  const mut = useMutation({
    mutationFn: () =>
      api.post("/api/v1/users", {
        email,
        full_name: fullName,
        password,
        role,
        department: department || null,
        manager_id: managerId || null,
      }),
    onSuccess: () => onDone(),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    mut.mutate();
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border rounded-xl p-4 grid grid-cols-2 gap-3">
      <label className="text-sm">
        Full name
        <input
          required
          className="mt-1 w-full border rounded px-2 py-1"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
      </label>
      <label className="text-sm">
        Email
        <input
          type="email"
          required
          className="mt-1 w-full border rounded px-2 py-1"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      <label className="text-sm">
        Password
        <input
          type="password"
          required
          minLength={6}
          className="mt-1 w-full border rounded px-2 py-1"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <label className="text-sm">
        Role
        <select
          className="mt-1 w-full border rounded px-2 py-1"
          value={role}
          onChange={(e) => setRole(e.target.value as any)}
        >
          <option value="employee">Employee</option>
          <option value="manager">Manager</option>
          <option value="admin">Admin</option>
        </select>
      </label>
      <label className="text-sm">
        Department
        <input
          className="mt-1 w-full border rounded px-2 py-1"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
        />
      </label>
      <label className="text-sm">
        Manager
        <select
          className="mt-1 w-full border rounded px-2 py-1"
          value={managerId}
          onChange={(e) => setManagerId(e.target.value)}
        >
          <option value="">— none —</option>
          {managers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.full_name}
            </option>
          ))}
        </select>
      </label>
      <div className="col-span-2 flex gap-2">
        <button
          type="submit"
          disabled={mut.isPending}
          className="px-4 py-1.5 bg-brand-600 text-white rounded text-sm"
        >
          Create user
        </button>
        <button type="button" onClick={onDone} className="px-4 py-1.5 border rounded text-sm">
          Cancel
        </button>
      </div>
      {mut.isError && (
        <p className="col-span-2 text-sm text-red-600">
          {(mut.error as any)?.response?.data?.detail ?? "Failed"}
        </p>
      )}
    </form>
  );
}
