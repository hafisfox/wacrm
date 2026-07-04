import type { NextRequest } from "next/server";

import {
  deactivateAdminRow,
  upsertStylistAvailability,
} from "@/lib/salu/control-room";
import { idFromRequest, withAdminDelete, withAdminMutation } from "../_helpers";

export async function POST(request: NextRequest) {
  return withAdminMutation(request, upsertStylistAvailability);
}

export async function PATCH(request: NextRequest) {
  return withAdminMutation(request, upsertStylistAvailability);
}

export async function DELETE(request: NextRequest) {
  return withAdminDelete(
    idFromRequest(request, "stylist_availability_id"),
    (id) =>
      deactivateAdminRow(
        "stylist_availability",
        "stylist_availability_id",
        id,
      ),
  );
}
