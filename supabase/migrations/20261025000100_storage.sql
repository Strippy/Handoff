-- File storage. Two buckets:
--   public-files  : listing images and clips, avatars, chat attachments. Anyone can view by URL.
--   private-files : project zips (scans and deal deliveries). Never public; the API functions hand
--                   out short-lived signed links only to the people entitled to them.
-- Everyone uploads into a folder named after their own user id, so nobody can overwrite or claim
-- someone else's file.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('public-files', 'public-files', true, 52428800, array['image/*', 'video/*']),
  ('private-files', 'private-files', false, 52428800, null)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "public-files: upload into your own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'public-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "public-files: delete your own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'public-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "private-files: upload into your own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'private-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
