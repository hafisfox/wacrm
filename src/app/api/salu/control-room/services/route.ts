import type { NextRequest } from "next/server";

import {
  deactivateAdminRow,
  upsertService,
} from "@/lib/salu/control-room";
import { idFromRequest, withAdminDelete, withAdminMutation } from "../_helpers";

export async function POST(request: NextRequest) {
  return withAdminMutation(request, upsertService);
}

export async function PATCH(request: NextRequest) {
  return withAdminMutation(request, upsertService);
}

export async function DELETE(request: NextRequest) {
  return withAdminDelete(idFromRequest(request, "service_id"), (id) =>
    deactivateAdminRow("services", "service_id", id),
  );
}
