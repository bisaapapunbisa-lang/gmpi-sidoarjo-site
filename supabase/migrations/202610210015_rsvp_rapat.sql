-- GMPI DPD Sidoarjo: Konfirmasi kehadiran rapat (RSVP) dari undangan digital.
-- * Publik TIDAK bisa membaca tabel sama sekali. Publik hanya bisa memanggil:
--   submit_rsvp (kirim jawaban) dan rsvp_counts (rekap angka, tanpa nama).
-- * Peran owner / content_editor / registrar / siaga bisa membaca daftar di Admin tab "Kehadiran".
-- * Hanya Pemilik yang boleh menghapus baris atau mengosongkan daftar (reset_rsvp).
-- * Nama yang sama (huruf besar/kecil diabaikan) hanya dihitung SATU kali:
--   jawaban terbaru menggantikan jawaban lama, jadi anggota bisa mengubah jawabannya
--   cukup dengan mengirim ulang formulir dengan nama yang sama.
-- Aman dijalankan ulang.

-- 1) Tabel
create table if not exists public.rsvp (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  nama text not null check (char_length(nama) between 2 and 60),
  kehadiran text not null check (kehadiran in ('hadir','tidak','belum')),
  alasan text check (alasan is null or char_length(alasan) <= 150)
);
create index if not exists rsvp_created_idx on public.rsvp (created_at desc);
create unique index if not exists rsvp_nama_unik on public.rsvp (lower(nama));

alter table public.rsvp enable row level security;
revoke all on table public.rsvp from public, anon, authenticated;
grant select (id, nama, kehadiran, alasan, created_at) on public.rsvp to authenticated;
grant delete on public.rsvp to authenticated;
grant all on table public.rsvp to service_role;

drop policy if exists "admin membaca rsvp" on public.rsvp;
create policy "admin membaca rsvp" on public.rsvp for select to authenticated
using (public.has_admin_role(array['owner','content_editor','registrar','siaga']::text[]));

drop policy if exists "pemilik menghapus rsvp" on public.rsvp;
create policy "pemilik menghapus rsvp" on public.rsvp for delete to authenticated
using (public.has_admin_role(array['owner']::text[]));

-- 2) Kirim jawaban (tanpa login). Jawaban terbaru mengganti yang lama untuk nama yang sama.
create or replace function public.submit_rsvp(p_nama text, p_kehadiran text, p_alasan text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nama text := left(trim(regexp_replace(coalesce(p_nama, ''), '\s+', ' ', 'g')), 60);
  v_kehadiran text := lower(trim(coalesce(p_kehadiran, '')));
  v_alasan text := nullif(left(trim(coalesce(p_alasan, '')), 150), '');
begin
  if char_length(v_nama) < 2 then
    raise exception 'Nama wajib diisi (minimal 2 huruf).';
  end if;
  if v_kehadiran not in ('hadir','tidak','belum') then
    raise exception 'Pilihan kehadiran tidak dikenal.';
  end if;
  if v_kehadiran = 'tidak' and v_alasan is null then
    raise exception 'Mohon pilih alasan tidak hadir.';
  end if;
  if v_kehadiran <> 'tidak' then
    v_alasan := null;
  end if;

  -- rem darurat terhadap spam
  if (select count(*) from public.rsvp r where r.created_at > now() - interval '10 minutes') >= 100 then
    raise exception 'Terlalu banyak kiriman dalam waktu singkat. Coba lagi beberapa menit lagi.';
  end if;

  insert into public.rsvp (nama, kehadiran, alasan)
  values (v_nama, v_kehadiran, v_alasan)
  on conflict ((lower(nama)))
  do update set kehadiran = excluded.kehadiran,
                alasan = excluded.alasan,
                created_at = now();

  return v_kehadiran;
end;
$$;

-- 3) Rekap angka untuk publik (tanpa nama).
create or replace function public.rsvp_counts()
returns table (hadir bigint, tidak bigint, belum bigint, total bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select count(*) filter (where r.kehadiran = 'hadir'),
         count(*) filter (where r.kehadiran = 'tidak'),
         count(*) filter (where r.kehadiran = 'belum'),
         count(*)
  from public.rsvp r;
$$;

-- 4) Kosongkan daftar (untuk acara berikutnya) — hanya Pemilik.
create or replace function public.reset_rsvp()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare n integer;
begin
  if not public.has_admin_role(array['owner']::text[]) then
    raise exception 'Hanya Pemilik yang boleh mengosongkan daftar.';
  end if;
  delete from public.rsvp;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.submit_rsvp(text, text, text) from public;
revoke all on function public.rsvp_counts() from public;
revoke all on function public.reset_rsvp() from public;
grant execute on function public.submit_rsvp(text, text, text) to anon, authenticated;
grant execute on function public.rsvp_counts() to anon, authenticated;
grant execute on function public.reset_rsvp() to authenticated;
