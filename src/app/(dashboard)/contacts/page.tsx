import { ContactsClient } from "./contacts-client";

import { loadSaluCustomersPage } from "@/lib/salu/queries";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const { customers, metrics } = await loadSaluCustomersPage();

  return <ContactsClient customers={customers} metrics={metrics} />;
}
