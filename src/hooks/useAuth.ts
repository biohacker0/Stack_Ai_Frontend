import { useEffect } from "react";
import { login, checkAuthStatus } from "@/lib/api/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export function useAuth() {
  const queryClient = useQueryClient();
  const { data: authStatus, isLoading: isChecking } = useQuery({
    queryKey: ["authStatus"],
    queryFn: checkAuthStatus,
    retry: false,
  });

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: () => {
      // Invalidate and refetch auth status
      queryClient.invalidateQueries({ queryKey: ["authStatus"] });
    },
  });

  useEffect(() => {
    if (!isChecking && !authStatus?.authenticated) {
      loginMutation.mutate();
    }
  }, [isChecking, authStatus?.authenticated]);

  return {
    isAuthenticated: authStatus?.authenticated ?? false,
    isLoading: isChecking || loginMutation.isPending,
  };
}
