import { NextResponse } from "next/server";

import {
  ForbiddenError,
  requireRole,
  toErrorResponse,
  UnauthorizedError,
} from "@/lib/auth/account";
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
} from "@/lib/rate-limit";
import { findAccessibleSaluContact } from "@/lib/salu/access";
import { loadSaluCustomerDetails, setSaluHumanMode } from "@/lib/salu/crm";

export async function POST(request: Request) {
  try {
    const ctx = await requireRole("agent");
    const limit = checkRateLimit(`takeover:${ctx.userId}`, RATE_LIMITS.takeover);
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => ({}))) as {
      phone?: string;
      human_mode?: boolean;
      reason?: string;
    };

    if (!body.phone || typeof body.human_mode !== "boolean") {
      return NextResponse.json(
        { error: "phone and human_mode are required" },
        { status: 400 },
      );
    }

    const contact = await findAccessibleSaluContact(
      ctx.supabase,
      ctx.accountId,
      body.phone,
    );
    if (!contact) {
      return NextResponse.json(
        { error: "Contact not found for this account." },
        { status: 404 },
      );
    }

    await setSaluHumanMode(
      contact.phone,
      body.human_mode,
      body.reason || (body.human_mode ? "dashboard_manual_takeover" : "dashboard_resume_bot"),
    );

    const details = await loadSaluCustomerDetails(contact.phone);

    return NextResponse.json({ success: true, contact, details });
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return toErrorResponse(error);
    }
    console.error("[salu/takeover] failed:", error);
    return NextResponse.json(
      { error: "Failed to update Salu takeover state" },
      { status: 500 },
    );
  }
}
