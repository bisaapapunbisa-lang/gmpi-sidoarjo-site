-- GMPI DPC Sidoarjo intake schema.
-- Public/anon/authenticated roles receive no table or storage access.
-- All inserts/uploads must go through a server-side function using secrets held in Vercel.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.citizen_reports (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  contact text not null check (char_length(contact) between 5 and 40),
  district text not null check (district in (
    'Sidoarjo','Buduran','Gedangan','Waru','Sukodono','Taman','Krian','Balongbendo','Tarik',
    'Prambon','Krembung','Porong','Jabon','Tanggulangin','Candi','Tulangan','Wonoayu','Sedati'
  )),
  topic text not null check (topic in ('Lingkungan','Ketidakadilan sosial','Sengketa / persoalan hukum','Hak pekerja','Lainnya')),
  summary text not null check (char_length(summary) between 5 and 5000),
  contact_consent boolean not null check (contact_consent),
  privacy_notice_version text not null,
  status text not null default 'diterima' check (status in ('diterima','ditinjau','ditindaklanjuti','ditutup')),
  created_at timestamptz not null default now(),
  retention_until date
);

create table if not exists public.member_registrations (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (char_length(full_name) between 1 and 160),
  nik text not null check (nik ~ '^[0-9]{16}$'),
  birth_place text not null check (char_length(birth_place) between 1 and 120),
  birth_date date not null check (birth_date <= current_date),
  gender text not null check (gender in ('Laki-laki','Perempuan')),
  phone text not null check (char_length(phone) between 7 and 40),
  district text not null check (district in (
    'Sidoarjo','Buduran','Gedangan','Waru','Sukodono','Taman','Krian','Balongbendo','Tarik',
    'Prambon','Krembung','Porong','Jabon','Tanggulangin','Candi','Tulangan','Wonoayu','Sedati'
  )),
  address text not null check (char_length(address) between 5 and 1000),
  division text not null check (division in (
    'Satgas Brigade — Pengamanan & Aksi Tanggap Darurat',
    'Lembaga Bantuan Hukum / Advokasi Hukum Rakyat',
    'Militansi Perempuan Indonesia (MPI Sidoarjo)',
    'Pemberdayaan Ekonomi & Sosial Masyarakat Desa'
  )),
  pledge_accepted boolean not null check (pledge_accepted),
  privacy_notice_version text not null,
  privacy_acknowledged boolean not null check (privacy_acknowledged),
  ktp_object_key text not null,
  profile_object_key text not null,
  status text not null default 'menunggu_verifikasi' check (status in ('menunggu_verifikasi','ditinjau','diterima','ditolak')),
  created_at timestamptz not null default now(),
  retention_until date
);

create index if not exists citizen_reports_created_at_idx on public.citizen_reports (created_at desc);
create index if not exists citizen_reports_status_idx on public.citizen_reports (status, created_at desc);
create index if not exists member_registrations_created_at_idx on public.member_registrations (created_at desc);
create index if not exists member_registrations_district_idx on public.member_registrations (district, created_at desc);

alter table public.citizen_reports enable row level security;
alter table public.member_registrations enable row level security;

-- Deliberately create no anon/authenticated policies. The browser must never query these tables.
revoke all on table public.citizen_reports from public, anon, authenticated;
revoke all on table public.member_registrations from public, anon, authenticated;
grant all on table public.citizen_reports to service_role;
grant all on table public.member_registrations to service_role;

-- Private storage for KTP/profile images. Keep object keys in the database, never public URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'member-documents',
  'member-documents',
  false,
  5242880,
  array['image/jpeg','image/png']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png'];

-- No storage.objects policies are granted to anon/authenticated users.
-- Generate narrowly scoped signed upload/download URLs from a server-side function only.
comment on table public.member_registrations is 'Highly sensitive personal data. Restrict access to authorized DPC personnel; define retention and deletion before production use.';
comment on table public.citizen_reports is 'Contains private citizen contact and complaint data. Restrict access and define retention before production use.';
