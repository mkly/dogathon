import {
  constructStripeEvent,
  processStripeEvent,
  stripeWebhookSecret,
} from "@/lib/stripe-billing";
import { revalidatePublicRoster } from "@/lib/public-roster-cache";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "Missing Stripe signature" }, { status: 400 });

  let event;
  try {
    event = constructStripeEvent(await request.text(), signature, stripeWebhookSecret());
  } catch (error) {
    console.error("Stripe webhook signature verification failed", error);
    return Response.json({ error: "Invalid Stripe webhook" }, { status: 400 });
  }

  try {
    await processStripeEvent(event);
    revalidatePublicRoster();
    return Response.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook processing failed", error);
    return Response.json({ error: "Stripe webhook processing failed" }, { status: 500 });
  }
}
