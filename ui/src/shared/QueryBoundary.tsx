import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { type ReactNode, Suspense } from 'react';
import { ErrorBoundary, type FallbackProps } from 'react-error-boundary';
import { useLocation } from 'react-router-dom';
import { ListError } from './List.tsx';

const Failed = ({ error, resetErrorBoundary }: FallbackProps) => (
  <ListError
    error={error instanceof Error ? error : new Error(String(error))}
    retry={resetErrorBoundary}
  />
);

/**
 * Where a part of the page that suspends on its queries waits and fails, alone: `fallback` while
 * it first loads, the list error with Try again when it can't. Once shown, it stays while the
 * next data loads in a transition, so a filter or a pick keeps the old content up instead of a
 * skeleton. A new address, such as another filter, pipeline or conversation, asks a failed query
 * again, as Try again does.
 */
export const QueryBoundary = ({
  fallback,
  children,
}: {
  fallback: ReactNode;
  children: ReactNode;
}) => {
  const { search } = useLocation();

  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary onReset={reset} resetKeys={[search]} FallbackComponent={Failed}>
          <Suspense fallback={fallback}>{children}</Suspense>
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
};
