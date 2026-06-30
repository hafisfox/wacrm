import { describe, expect, it } from "vitest";

import {
  customerIsIdle,
  formatOpsAge,
  formatOpsCountdown,
  matchesCustomerOpsFilter,
  matchesCustomerSearch,
  paymentQueueLabel,
  paymentQueueTone,
} from "./ops";

const now = new Date("2026-06-30T12:00:00.000Z");

describe("Salu ops helpers", () => {
  it("formats queue age and countdown labels", () => {
    expect(formatOpsAge("2026-06-30T11:40:00.000Z", { now })).toBe(
      "20m ago",
    );
    expect(formatOpsCountdown("2026-06-30T12:45:00.000Z", { now })).toBe(
      "in 45m",
    );
    expect(formatOpsCountdown("2026-06-30T10:00:00.000Z", { now })).toBe(
      "2h overdue",
    );
  });

  it("classifies payment queue severity from status and expiry", () => {
    expect(
      paymentQueueTone(
        {
          status: "pending",
          payment_status: "pending",
          hold_expires_at: "2026-06-30T13:00:00.000Z",
        },
        { now },
      ),
    ).toBe("warn");

    expect(
      paymentQueueTone(
        {
          status: "pending",
          payment_status: "pending",
          hold_expires_at: "2026-06-30T11:00:00.000Z",
        },
        { now },
      ),
    ).toBe("danger");

    expect(paymentQueueLabel({ payment_status: "refund_required" })).toBe(
      "Refund review",
    );
  });

  it("filters customer memory by ops state", () => {
    const customer = {
      phone: "+919999999999",
      human_mode: true,
      last_seen_at: "2026-06-29T12:00:00.000Z",
    };

    expect(matchesCustomerOpsFilter(customer, "handoff", { now })).toBe(true);
    expect(matchesCustomerOpsFilter(customer, "recent", { now })).toBe(true);
    expect(matchesCustomerOpsFilter(customer, "payment", { now })).toBe(false);
  });

  it("detects idle customers and searches salon memory fields", () => {
    const idle = {
      customer_name: "Riya",
      phone: "+919000000000",
      preferred_services_summary: "Hair spa",
    };

    expect(customerIsIdle(idle)).toBe(true);
    expect(matchesCustomerSearch(idle, "spa")).toBe(true);
    expect(matchesCustomerSearch(idle, "makeup")).toBe(false);
  });
});
