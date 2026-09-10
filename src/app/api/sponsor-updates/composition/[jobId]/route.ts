import {
  EmailCompositionJobNotFoundError,
  getEmailComposition,
} from "@/lib/email-composition-queue";
import { requireApiOrganization } from "@/lib/organization-access";
import { uuidSchema } from "@/lib/uuid";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;
  if (!uuidSchema.safeParse(jobId).success)
    return Response.json(
      { error: "Composition job not found" },
      { status: 404 },
    );
  const access = await requireApiOrganization(request.headers, {
    sponsorUpdate: ["manage"],
  });
  if (!access.ok) return access.response;
  try {
    return Response.json({
      job: await getEmailComposition(access.context.orgId, jobId),
    });
  } catch (error) {
    if (error instanceof EmailCompositionJobNotFoundError)
      return Response.json(
        { error: "Composition job not found" },
        { status: 404 },
      );
    throw error;
  }
}
