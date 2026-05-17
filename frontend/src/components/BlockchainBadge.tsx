import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface Props {
  goalId: string;
  txHash: string | null;
  verified: boolean;
}

export default function BlockchainBadge({ goalId, txHash, verified }: Props) {
  const { data, isFetching } = useQuery({
    queryKey: ["blockchain-verify", goalId],
    queryFn: async () => {
      const { data } = await api.get<{
        verified: boolean;
        tx_hash: string | null;
        polygon_scan_url: string | null;
      }>(`/api/v1/blockchain/verify/${goalId}`);
      return data;
    },
    enabled: !!txHash,
    staleTime: 60_000,
  });

  const isVerified = data?.verified ?? verified;
  const hash = data?.tx_hash ?? txHash;
  const scanUrl = data?.polygon_scan_url;

  if (!hash && !isVerified) return null;

  if (isFetching && !isVerified) {
    return (
      <span className="text-xs text-slate-500 flex items-center gap-1">
        <span className="inline-block w-3 h-3 border-2 border-slate-300 border-t-brand-600 rounded-full animate-spin" />
        Pending verification
      </span>
    );
  }

  const short = hash ? `${hash.slice(0, 8)}…${hash.slice(-6)}` : "";

  return (
    <a
      href={scanUrl ?? "#"}
      target="_blank"
      rel="noreferrer"
      className={`text-xs inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${
        isVerified
          ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
          : "bg-slate-100 text-slate-600 border border-slate-200"
      }`}
    >
      {isVerified ? "Verified on Polygon" : "Unverified"} {short && `[${short}]`}
    </a>
  );
}
