import { SuspenseFallback } from "@/components/page-view-transition";
import { SignInRouteLoading } from "@/components/route-status";

export default function Loading() {
  return (
    <SuspenseFallback>
      <SignInRouteLoading />
    </SuspenseFallback>
  );
}
