import type { NextRequest } from "next/server";

import {
  deactivateAdminRow,
  upsertAvailability,
} from "@/lib/salu/control-room";
import { idFromRequest, withAdminDelete, withAdminMutation } from "../_helpers";

export async function POST(request: NextRequest) {
  return withAdminMutation(request, upsertAvailability);
}

export async function PATCH(request: NextRequest) {
  return withAdminMutation(request, upsertAvailability);
}

export async function DELETE(request: NextRequest) {
  return withAdminDelete(idFromRequest(request, "availability_id"), (id) =>
    deactivateAdminRow("availability", "availability_id", id),
  );
}
