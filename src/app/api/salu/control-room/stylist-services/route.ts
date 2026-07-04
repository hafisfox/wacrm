import type { NextRequest } from "next/server";

import {
  deactivateAdminRow,
  upsertStylistService,
} from "@/lib/salu/control-room";
import { idFromRequest, withAdminDelete, withAdminMutation } from "../_helpers";

export async function POST(request: NextRequest) {
  return withAdminMutation(request, upsertStylistService);
}

export async function PATCH(request: NextRequest) {
  return withAdminMutation(request, upsertStylistService);
}

export async function DELETE(request: NextRequest) {
  return withAdminDelete(
    idFromRequest(request, "stylist_service_id"),
    (id) => deactivateAdminRow("stylist_services", "stylist_service_id", id),
  );
}
