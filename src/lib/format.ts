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

export function sponsorshipStatusLabel(status: "active" | "ended") {
  return status === "active" ? "Active" : "Ended";
}

export function sponsorshipEndedReasonLabel(reason: "unavailable" | "canceled" | null) {
  return reason === "unavailable" ? "No longer available" : reason === "canceled" ? "Canceled" : "—";
}
