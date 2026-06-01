import { useQuery } from "@tanstack/react-query";

export function useRcPoolStatus() {
  const { data } = useQuery<{ active: number }>({
    queryKey: ["/api/chat/rc-pool-status"],
    queryFn: async () => {
      const res = await fetch("/api/chat/rc-pool-status");
      return res.json() as Promise<{ active: number }>;
    },
    staleTime: 60 * 1000,
    retry: false,
  });
  return { hasPoolKeys: (data?.active ?? 0) > 0 };
}
