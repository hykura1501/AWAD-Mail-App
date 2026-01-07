import type { ReactNode } from "react";

interface QueryErrorHandlerProps {
  error: Error | null;
  isLoading?: boolean;
  children: ReactNode;
  loadingFallback?: ReactNode;
  errorFallback?: ReactNode;
  onRetry?: () => void;
}

/**
 * Wrapper component for handling React Query loading and error states consistently.
 * 
 * @example
 * <QueryErrorHandler 
 *   error={error} 
 *   isLoading={isLoading}
 *   onRetry={() => refetch()}
 * >
 *   <MyDataComponent data={data} />
 * </QueryErrorHandler>
 */
export default function QueryErrorHandler({
  error,
  isLoading = false,
  children,
  loadingFallback,
  errorFallback,
  onRetry,
}: QueryErrorHandlerProps) {
  // Loading state
  if (isLoading) {
    if (loadingFallback) {
      return <>{loadingFallback}</>;
    }

    return (
      <div className="flex items-center justify-center py-8">
        <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Đang tải...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    if (errorFallback) {
      return <>{errorFallback}</>;
    }

    return (
      <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
        <div className="icon-circle bg-red-100 dark:bg-red-900/30 text-red-500 mb-3">
          <span className="material-symbols-outlined">error</span>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 max-w-sm">
          {error.message || "Không thể tải dữ liệu. Vui lòng thử lại."}
        </p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="btn-secondary px-4 py-2 text-sm"
          >
            Thử lại
          </button>
        )}
      </div>
    );
  }

  // Success state
  return <>{children}</>;
}
