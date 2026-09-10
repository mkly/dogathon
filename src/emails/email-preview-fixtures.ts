import { createElement, type ReactElement } from "react";

import { SponsorUpdateEmail } from "./sponsor-update-email.tsx";
import { SponsorshipChoiceEmail } from "./sponsorship-choice-email.tsx";

export const EMAIL_PREVIEW_WIDTHS = [320, 390, 600] as const;

export type EmailPreviewFixture = {
  element: ReactElement;
  name: string;
};

/** Representative local-only messages for visual checks; none are delivered. */
export const EMAIL_PREVIEW_FIXTURES: EmailPreviewFixture[] = [
  {
    name: "regular-update-with-photo",
    element: createElement(SponsorUpdateEmail, {
      rescueName: "Pawcast Rescue",
      companionName: "Biscuit",
      updateSubject: "Biscuit found the sunniest spot",
      teaser:
        "Biscuit spent the afternoon greeting volunteers and settling in for a sunny nap.",
      updatePageUrl: "https://pawcast.example/rescue/updates/biscuit",
      photoUrl: "https://images.example/biscuit.jpg",
      type: "regular",
    }),
  },
  {
    name: "graduation-without-photo",
    element: createElement(SponsorUpdateEmail, {
      rescueName: "Pawcast Rescue",
      companionName: "Juniper",
      updateSubject: "Juniper is home",
      teaser: "Juniper has joined a family of her own.",
      updatePageUrl: "https://pawcast.example/rescue/updates/juniper",
      sponsorshipSelectionUrl:
        "https://pawcast.example/rescue/sponsor/next?token=preview-token",
      type: "graduation",
    }),
  },
  {
    name: "sponsorship-transferred-with-photo",
    element: createElement(SponsorshipChoiceEmail, {
      companionName: "Mochi",
      companionPhotoUrl: "https://images.example/mochi.jpg",
      monthlyCents: 2500,
      organizationName: "Pawcast Rescue",
      sponsorName: "Pat",
      type: "transferred",
    }),
  },
  {
    name: "sponsorship-ended",
    element: createElement(SponsorshipChoiceEmail, {
      monthlyCents: 2500,
      organizationName: "Pawcast Rescue",
      sponsorName: "Pat",
      type: "ended",
    }),
  },
];
