"use client";

import { useAuth } from "@/hooks/useAuth";
import { FilePicker } from "@/components/file-picker/FilePicker";
import { Skeleton } from "@/components/ui/skeleton";

export default function Home() {
  const { isAuthenticated, isLoading } = useAuth();

  // Show loading state while authenticating
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="space-y-4 w-full max-w-6xl p-6">
          <Skeleton className="h-12 w-48" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  // Show error if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-2xl font-semibold">Authentication Failed</h2>
          <p className="text-gray-600 mt-2">Please check your credentials</p>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <FilePicker />
    </main>
  );
}
