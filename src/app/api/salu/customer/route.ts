import { NextResponse } from "next/server";

import { findAccessibleSaluContact } from "@/lib/salu/access";
import { loadSaluCustomerDetails } from "@/lib/salu/crm";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
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
      .select("account_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const accountId = profile?.account_id as string | undefined;
    if (!accountId) {
      return NextResponse.json(
        { error: "Your profile is not linked to an account." },
        { status: 403 },
      );
    }

    const url = new URL(request.url);
    const phone = url.searchParams.get("phone") ?? "";
    if (!phone.trim()) {
      return NextResponse.json(
        { error: "phone is required" },
        { status: 400 },
      );
    }

    const contact = await findAccessibleSaluContact(supabase, accountId, phone);
    if (!contact) {
      return NextResponse.json(
        { error: "Contact not found for this account." },
        { status: 404 },
      );
    }

    const details = await loadSaluCustomerDetails(contact.phone || phone);

    return NextResponse.json({ contact, details });
  } catch (error) {
    console.error("[salu/customer] failed:", error);
    return NextResponse.json(
      { error: "Failed to load Salu customer details" },
      { status: 500 },
    );
  }
}
