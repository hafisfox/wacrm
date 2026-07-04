import { NextResponse, type NextRequest } from "next/server";

import {
  ForbiddenError,
  requireRole,
  toErrorResponse,
  UnauthorizedError,
} from "@/lib/auth/account";
import {
  CONTROL_ROOM_MUTATION_ROLE,
  loadControlRoomData,
} from "@/lib/salu/control-room";

export async function readJson(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  return body && typeof body === "object" ? body : {};
}

export function idFromRequest(request: NextRequest, key: string) {
  return request.nextUrl.searchParams.get(key) || "";
}

export async function withAdminMutation(
  request: NextRequest,
  mutate: (body: Record<string, unknown>) => Promise<void>,
) {
  try {
    await requireRole(CONTROL_ROOM_MUTATION_ROLE);
    const body = (await readJson(request)) as Record<string, unknown>;
    await mutate(body);
    return NextResponse.json(await loadControlRoomData());
  } catch (error) {
    return controlRoomError(error);
  }
}

export async function withAdminDelete(
  id: string,
  mutate: (id: string) => Promise<void>,
) {
  try {
    await requireRole(CONTROL_ROOM_MUTATION_ROLE);
    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }
    await mutate(id);
    return NextResponse.json(await loadControlRoomData());
  } catch (error) {
    return controlRoomError(error);
  }
}

export function controlRoomError(error: unknown) {
  if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
    return toErrorResponse(error);
  }
  const message = error instanceof Error ? error.message : "Invalid request";
  return NextResponse.json({ error: message }, { status: 400 });
}
