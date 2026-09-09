import { SuspenseFallback } from "@/components/page-view-transition";
import { PublicRouteLoading } from "@/components/route-status";

export default function Loading() {
  return (
    <SuspenseFallback>
      <PublicRouteLoading />
    </SuspenseFallback>
  );
}
