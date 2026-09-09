import { AdminRouteLoading } from "@/components/route-status";
import { SuspenseFallback } from "@/components/page-view-transition";

export default function Loading() {
  return (
    <SuspenseFallback>
      <AdminRouteLoading variant="sponsors" />
    </SuspenseFallback>
  );
}
