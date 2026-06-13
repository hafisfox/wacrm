import { NextResponse } from "next/server";

import {
  hasMinRole,
  isAccountRole,
  type AccountRole,
} from "@/lib/auth/roles";
import { findAccessibleSaluContact } from "@/lib/salu/access";
import { loadSaluCustomerDetails, setSaluHumanMode } from "@/lib/salu/crm";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("account_id, account_role")
      .eq("user_id", user.id)
      .maybeSingle();

    const accountId = profile?.account_id as string | undefined;
    const accountRole = profile?.account_role as AccountRole | undefined;
    if (!accountId || !isAccountRole(accountRole)) {
      return NextResponse.json(
        { error: "Your profile is not linked to an account." },
        { status: 403 },
      );
    }

    if (!hasMinRole(accountRole, "agent")) {
      return NextResponse.json(
        { error: "You need agent access to pause or resume the Salu bot." },
        { status: 403 },
      );
    }

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
      supabase,
      accountId,
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
    console.error("[salu/takeover] failed:", error);
    return NextResponse.json(
      { error: "Failed to update Salu takeover state" },
      { status: 500 },
    );
  }
}
