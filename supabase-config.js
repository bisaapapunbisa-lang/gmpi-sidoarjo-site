/*
  Browser-safe Supabase settings. The publishable/anon key is intended for public clients;
  database access must be protected by the RLS policies in Supabase migrations.
  NEVER put the service_role/secret key in this file.
*/
window.GMPI_SUPABASE_CONFIG = Object.freeze({
  url: 'https://iapwzhlcwprzojeruymm.supabase.co',
  publishableKey: '' // Add the project publishable (anon) key here; never use service_role.
});
