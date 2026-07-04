import type { NextRequest } from "next/server";

import {
  deactivateAdminRow,
  upsertStylist,
} from "@/lib/salu/control-room";
import { idFromRequest, withAdminDelete, withAdminMutation } from "../_helpers";

export async function POST(request: NextRequest) {
  return withAdminMutation(request, upsertStylist);
}

export async function PATCH(request: NextRequest) {
  return withAdminMutation(request, upsertStylist);
}

export async function DELETE(request: NextRequest) {
  return withAdminDelete(idFromRequest(request, "stylist_id"), (id) =>
    deactivateAdminRow("stylists", "stylist_id", id),
  );
}
