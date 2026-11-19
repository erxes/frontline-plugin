import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { type ReactNode, Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

/**
 * Where a part of the page that suspends on its queries waits and fails, alone: `fallback` while
 * it first loads, `renderError` with the error's message when it can't. Once shown, it stays while the
 * next data loads in a transition, so a filter or a pick keeps the old content up instead of a
 * skeleton. A change of `resetKeys` asks a failed query again.
 */
export const QueryBoundary = ({
  fallback,
  renderError,
  resetKeys,
  children,
}: {
  fallback: ReactNode;
  renderError: (message: string) => ReactNode;
  resetKeys?: unknown[];
  children: ReactNode;
}) => (
  <QueryErrorResetBoundary>
    {({ reset }) => (
      <ErrorBoundary
        onReset={reset}
        resetKeys={resetKeys}
        fallbackRender={({ error }) =>
          renderError(error instanceof Error ? error.message : String(error))
        }
      >
        <Suspense fallback={fallback}>{children}</Suspense>
      </ErrorBoundary>
    )}
  </QueryErrorResetBoundary>
);
