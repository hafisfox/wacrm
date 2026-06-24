import { NextResponse } from "next/server";

import { loadSaluSystemHealth } from "@/lib/salu/queries";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(await loadSaluSystemHealth());
  } catch (error) {
    console.error("[salu/system-health] failed:", error);
    return NextResponse.json(
      { error: "Failed to load system health" },
      { status: 500 },
    );
  }
}
