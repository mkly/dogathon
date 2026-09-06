const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function formatDate(date: Date | string) {
  return dateFormatter.format(new Date(date));
}

export function formatDateTime(date: Date | string) {
  return dateTimeFormatter.format(new Date(date));
}

export function formatMonthlyAmount(monthlyUsd: number) {
  return usdFormatter.format(monthlyUsd);
}

export function sponsorshipStatusLabel(status: "active" | "ended") {
  return status === "active" ? "Active" : "Ended";
}
