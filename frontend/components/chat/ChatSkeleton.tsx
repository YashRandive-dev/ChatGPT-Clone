import { Skeleton } from '@/components/ui/Misc';

export function ChatSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="h-14 px-4 py-3">
        <Skeleton className="h-8 w-40" />
      </div>
      <div className="flex-1" />
      <div className="mx-auto w-full max-w-3xl px-4 pb-6">
        <Skeleton className="h-[104px] w-full rounded-[26px]" />
      </div>
    </div>
  );
}
