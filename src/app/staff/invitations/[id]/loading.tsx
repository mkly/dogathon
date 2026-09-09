import { SuspenseFallback } from "@/components/page-view-transition";
import { InvitationRouteLoading } from "@/components/route-status";

export default function Loading() {
  return (
    <SuspenseFallback>
      <InvitationRouteLoading />
    </SuspenseFallback>
  );
}
