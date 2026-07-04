import { NextResponse } from "next/server";

import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { loadControlRoomData } from "@/lib/salu/control-room";

export async function GET() {
  try {
    await requireRole("viewer");
    return NextResponse.json(await loadControlRoomData());
  } catch (error) {
    return toErrorResponse(error);
  }
}
