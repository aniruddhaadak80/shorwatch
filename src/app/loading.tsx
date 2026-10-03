import { Loading as LoadingPanel } from "@/components/ui";

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <LoadingPanel label="Reading the bench" />
    </div>
  );
}