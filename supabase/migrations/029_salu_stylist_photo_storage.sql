-- Public images are required because WhatsApp retrieves stylist cards from the
-- stored image URL. Writes stay server-side behind the admin-only route.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'salu-stylist-photos',
  'salu-stylist-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
