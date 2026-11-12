-- Tambah pilihan divisi tanpa mengubah data pendaftaran, hak akses, atau pilihan lama.
-- Dilakukan dalam satu transaksi oleh sistem migrasi Supabase.
do $migration$
declare
  new_divisions text[] := array[
    'Divisi Agama',
    'Divisi Ekonomi',
    'Divisi Hukum dan Hak Asasi Manusia (HAM)',
    'Divisi Pariwisata',
    'Divisi Pemberdayaan Perempuan',
    'Divisi Pertahanan & Keamanan Anggota',
    'Divisi Politik',
    'Divisi Sosial',
    'Divisi Tenaga Kerja',
    'Litbang',
    'Organ Keanggotaan & Kaderisasi',
    'Publikasi/Media'
  ];
  marker text := quote_literal('Seluruh bidang (Ketua DPD)');
  extra_literals text;
  target regprocedure;
  definition text;
  original_check text;
begin
  select string_agg(quote_literal(value), ', ' order by ordinality)
    into extra_literals from unnest(new_divisions) with ordinality as items(value, ordinality);

  -- Ambil fungsi yang saat ini aktif, pertahankan semua logika dan hak aksesnya;
  -- hentikan transaksi jika struktur fungsi tidak lagi sesuai yang diperiksa.
  foreach target in array array[
    'public.submit_member_registration(text,text,text,date,text,text,text,text,text,text,text,text,text,text,text,text,text)'::regprocedure,
    'public.owner_update_member_registration(uuid,jsonb)'::regprocedure
  ] loop
    definition := pg_get_functiondef(target);
    if (length(definition) - length(replace(definition, marker, ''))) / length(marker) <> 1 then
      raise exception 'Validasi bidang pada fungsi % tidak sesuai; migrasi dibatalkan.', target;
    end if;
    execute replace(definition, marker, marker || ', ' || extra_literals);
  end loop;

  -- Perluas CHECK yang sudah ada, bukan mengganti logika validasi yang lain.
  select pg_get_expr(conbin, conrelid) into original_check
    from pg_constraint
   where conrelid = 'public.member_registrations'::regclass
     and conname = 'member_registrations_division_check' and contype = 'c';
  if original_check is null then
    raise exception 'Validasi kolom bidang tidak ditemukan; migrasi dibatalkan.';
  end if;
  alter table public.member_registrations drop constraint member_registrations_division_check;
  execute format('alter table public.member_registrations add constraint member_registrations_division_check check ((%s) or division = any (%L::text[]))', original_check, new_divisions::text);
end
$migration$;
