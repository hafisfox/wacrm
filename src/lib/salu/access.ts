import type { SupabaseClient } from "@supabase/supabase-js";

import {
  findExistingContact,
  type ExistingContact,
} from "@/lib/contacts/dedupe";

export async function findAccessibleSaluContact(
  db: SupabaseClient,
  accountId: string,
  phone: string,
): Promise<ExistingContact | null> {
  if (!accountId || !phone.trim()) return null;
  return findExistingContact(db, accountId, phone);
}
