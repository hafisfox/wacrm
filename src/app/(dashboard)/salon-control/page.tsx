import { SalonControlClient } from "./salon-control-client";
import { loadControlRoomData } from "@/lib/salu/control-room";

export const dynamic = "force-dynamic";

export default async function SalonControlPage() {
  const data = await loadControlRoomData();
  return <SalonControlClient initialData={data} />;
}
