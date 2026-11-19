import { Sidebar, Skeleton } from 'erxes-ui';

/** The sidebar's inbox groups while their code or counts load, so they don't pop in. */
export const NavSkeleton = () => (
  <Sidebar.Group variant="compact" aria-hidden>
    <div className="flex flex-col gap-2 px-2 py-1">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-4 w-36" />
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-4 w-24" />
    </div>
  </Sidebar.Group>
);
