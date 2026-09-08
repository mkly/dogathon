const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

const wholeUsdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const centsUsdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatDate(date: Date | string) {
  return dateFormatter.format(new Date(date));
}

export function formatDateTime(date: Date | string) {
  return dateTimeFormatter.format(new Date(date));
}

export function formatMonthlyAmount(monthlyCents: number) {
  const formatter = monthlyCents % 100 === 0 ? wholeUsdFormatter : centsUsdFormatter;
  return formatter.format(monthlyCents / 100);
}

export function sponsorshipStatusLabel(status: "active" | "awaiting" | "ended") {
  switch (status) {
    case "active": return "Active";
    case "awaiting": return "Awaiting a new companion";
    case "ended": return "Ended";
  }
}

export function sponsorshipEndedReasonLabel(
  reason: "adopted" | "unavailable" | "canceled" | null,
) {
  switch (reason) {
    case "adopted": return "Adopted";
    case "unavailable": return "No longer available";
    case "canceled": return "Canceled";
    default: return "—";
  }
}
