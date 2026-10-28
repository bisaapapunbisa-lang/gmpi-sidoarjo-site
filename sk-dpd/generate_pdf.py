#!/usr/bin/env python3
"""Membuat SK DPD GMPI Sidoarjo dalam PDF bersih (tanpa watermark).

Sumber nama sama dengan generate_sk.py (struktur organisasi di Admin).
Jalankan:  PYTHONPATH=/home/user/.work/pylib python3 generate_pdf.py
"""
import os

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.platypus import (BaseDocTemplate, Frame, Image, KeepTogether,
                                PageBreak, PageTemplate, Paragraph, Spacer, Table,
                                TableStyle)

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'SK-DPD-GMPI-Sidoarjo-2023-2028.pdf')
LOGO = '/home/user/.work/logo-gmpi-transparan.png'
if not os.path.exists(LOGO):
    LOGO = os.path.join(HERE, '..', 'logo-gmpi-restorasi-1000.png')

SK_NOMOR = '023/SK/DPP-GMPI/V/2026'
SK_TANGGAL = '05 Juni 2026'
PERIODE = '2023-2028'

DATA = [
    ('Dewan Penasehat', [
        'GW THODY, SH., MH.',
        'Grace Evi Ekawati, S.E., S.H., M.Hum.',
        'Drs. Ec. Bambang Rudyanto, SH., MH., ACIArb., CTL., Kurator & Pengurus',
        'Samsudin',
    ]),
    ('Dewan Pembina', [
        'Ir. HERU PURWANTO',
        'Ir. IWAN PURWANTO',
        'Yuto Handarusidi, S.Psi., M.H., MBA',
        'KURNIA AFIFATURROHMAH, S.,Psi',
    ]),
    ('Ketua', ['HASMIN MARJAN']),
    ('Sekretaris', ['SENTOT A.I.']),
    ('Bendahara', ["NU'JIZAH, M.Pd.I"]),
    ('Ketua Harian I', ['RONY ARDIANSYAH']),
    ('Ketua Harian II', ['FAIZAL RIZZA ACHYANSYAH MALAWAT']),
    ('Divisi Organisasi Keanggotaan Dan Kaderisasi (OKK)', [
        'BERNARDINUS SELAMA', 'NOVI ISNAWATI']),
    ('Divisi Ekonomi', ['HERDY ARLIANTO']),
    ('Divisi Pariwisata', ['NUR BANI YUSUF']),
    ('Divisi Tenaga Kerja', ['BAGAS OKKY PRASETYA', 'RIZKY']),
    ('Divisi Hukum Dan Hak Asasi Manusia (HAM)', [
        'ABD GOFUR., S.H., M.H.',
        'GW THODY, S.H., M.H.',
        'Drs. Ec. Bambang Rudyanto, SH., MH., ACIArb., CTL., Kurator & Pengurus',
    ]),
    ('Divisi Politik', ['PUJIHARTO']),
    ('Divisi Agama', ["MAS'UDIN. S.Pd."]),
    ('Divisi Sosial', ['SYAMSUDDIZUHRY']),
    ('Divisi Informasi Dan Komunikasi', [
        'TRISTIANTO WIJAYA', 'ARJU HERMAN', 'AGUS SUBAKTI., S.T., S.H., CDLA.']),
    ('Divisi Pertahanan Dan Keamanan', [
        'HENDRO', 'JOSEP BENNY TUAT ANSSY', 'SAMUEL RETTA']),
    ('Divisi Hubungan Masyarakat (HUMAS)', ['ACHMAT FATONI']),
    ('Divisi Pemberdayaan Perempuan', ['KANTI RAHAYU']),
]

F = 'Times-Roman'
FB = 'Times-Bold'


def st(name, size=11, font=F, align=TA_LEFT, leading=None, space_after=0, space_before=0):
    return ParagraphStyle(name, fontName=font, fontSize=size,
                          leading=leading or size * 1.25, alignment=align,
                          spaceAfter=space_after, spaceBefore=space_before)


S = {
    'p': st('p'),
    'c': st('c', align=TA_CENTER),
    'kop1': st('kop1', 14, FB, TA_CENTER, 17),
    'kop2': st('kop2', 26, FB, TA_CENTER, 30),
    'kop3': st('kop3', 13, FB, TA_CENTER, 16, space_after=2),
    'kop4': st('kop4', 8.5, align=TA_CENTER, leading=11),
    'judul': st('judul', 13, FB, TA_CENTER, 16),
    'judul2': st('judul2', 12, FB, TA_CENTER, 15),
    'body': st('body', 11, leading=14.5, align=TA_LEFT),
    'cell': st('cell', 10, leading=13),
    'cellc': st('cellc', 10, leading=13, align=TA_CENTER),
    'cellh': st('cellh', 10.5, FB, TA_CENTER, 13),
    'small': st('small', 8.5, leading=11),
}


def kop():
    out = []
    if os.path.exists(LOGO):
        out.append(Image(LOGO, width=2.5 * cm, height=2.5 * cm * 955 / 854))
        out.append(Spacer(1, 4))
    out += [
        Paragraph('DEWAN PIMPINAN PUSAT', S['kop1']),
        Paragraph('GMPI', S['kop2']),
        Paragraph('GERAKAN MILITANSI PEJUANG INDONESIA', S['kop3']),
        Paragraph('Sekretariat : Jl. Dharmawangsa II Grand Taruma B.21 Desa Sukamakmur', S['kop4']),
        Paragraph('Kecamatan Telukjambe Timur Kabupaten Karawang', S['kop4']),
        Paragraph('Email : dppgmpi01@gmail.com&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;'
                  'Telp/WA : 085882100267', S['kop4']),
        Spacer(1, 6),
    ]
    rule = Table([['']], colWidths=[16.5 * cm], rowHeights=[1])
    rule.setStyle(TableStyle([('LINEBELOW', (0, 0), (-1, -1), 1.6, colors.black)]))
    out += [rule, Spacer(1, 14)]
    return out


def numbered_block(label, items, avail=16.5 * cm):
    """label | tanda | isi, seperti SK asli."""
    rows = []
    for i, (mark, body) in enumerate(items):
        rows.append([
            Paragraph(f'{label} :' if i == 0 else '', S['body']),
            Paragraph(mark, S['body']),
            Paragraph(body, S['body']),
        ])
    t = Table(rows, colWidths=[3.0 * cm, 0.8 * cm, avail - 3.8 * cm])
    t.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
    ]))
    return t


def diktum(rows, avail=16.5 * cm):
    data = [[Paragraph(a, S['body']), Paragraph(b, S['body'])] for a, b in rows]
    t = Table(data, colWidths=[3.0 * cm, avail - 3.0 * cm])
    t.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    return t


def build():
    doc = BaseDocTemplate(OUT, pagesize=A4,
                          leftMargin=2.5 * cm, rightMargin=2.0 * cm,
                          topMargin=2.0 * cm, bottomMargin=2.0 * cm,
                          title='SK Pengurus DPD GMPI Kabupaten Sidoarjo 2023-2028',
                          author='DPP GMPI')
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id='n')
    doc.addPageTemplates([PageTemplate(id='all', frames=[frame])])

    story = []
    story += kop()

    story += [
        Paragraph('SURAT KEPUTUSAN KETUA UMUM', S['judul']),
        Paragraph('GERAKAN MILITANSI PEJUANG INDONESIA (GMPI)', S['judul']),
        Paragraph(f'Nomor : {SK_NOMOR}', S['judul2']),
        Spacer(1, 12),
        Paragraph('Tentang', S['c']),
        Spacer(1, 8),
        Paragraph('PENGUKUHAN PENGURUS', S['judul2']),
        Paragraph('DEWAN PIMPINAN DAERAH GERAKAN MILITANSI PEJUANG INDONESIA', S['judul2']),
        Paragraph('(DPD GMPI) KABUPATEN SIDOARJO PROVINSI JAWA TIMUR', S['judul2']),
        Paragraph(f'PERIODE {PERIODE}', S['judul2']),
        Spacer(1, 18),
    ]

    story.append(numbered_block('Menimbang', [
        ('a.', 'Bahwa dalam rangka membangun organisasi Gerakan Militansi Pejuang Indonesia (GMPI) '
               'yang besar dan menjangkau seluruh wilayah di Negara Kesatuan Republik Indonesia (NKRI) '
               'maka dinilai perlu untuk membentuk struktur kepengurusan di berbagai wilayah '
               'Provinsi/Kota/Kabupaten/Kecamatan/Desa;'),
        ('b.', 'Bahwa setelah adanya Keputusan Ketua Umum GMPI untuk membentuk Dewan Pimpinan Daerah '
               'Kabupaten Sidoarjo, maka perlu dibentuk/ditunjuk Kepengurusan DPD GMPI Kabupaten '
               'Sidoarjo untuk mendukung terwujudnya cita-cita dan tujuan organisasi;'),
        ('c.', 'Bahwa oleh karena itu DPP GMPI perlu mengeluarkan Surat Keputusan (SK) tentang '
               'pembentukan Kepengurusan DPD GMPI Kabupaten Sidoarjo Provinsi Jawa Timur.'),
    ]))
    story.append(Spacer(1, 6))
    story.append(numbered_block('Mengingat', [
        ('1.', 'Anggaran Dasar dan Anggaran Rumah Tangga GMPI;'),
        ('2.', 'Rapat Dewan Pimpinan Pusat.'),
    ]))

    # -------- halaman 2 --------
    story.append(PageBreak())
    story += [
        Paragraph('MEMUTUSKAN', S['judul']),
        Spacer(1, 14),
        diktum([
            ('Menetapkan :', 'PENGUKUHAN PENGURUS DEWAN PIMPINAN DAERAH GERAKAN MILITANSI '
                             'PEJUANG INDONESIA (DPD GMPI) KABUPATEN SIDOARJO PROVINSI JAWA TIMUR '
                             f'PERIODE {PERIODE};'),
        ]),
        Spacer(1, 6),
        diktum([
            ('PERTAMA :', 'Mengukuhkan nama-nama yang terlampir sebagai pengurus DPD GMPI '
                          'Kabupaten Sidoarjo Provinsi Jawa Timur;'),
            ('KEDUA :', 'Pengurus tersebut pada diktum pertama memiliki kewajiban untuk menjalankan '
                        'program kerjanya secara tanggung jawab;'),
            ('KETIGA :', 'Keputusan ini berlaku sejak tanggal ditetapkan dan akan diadakan perbaikan '
                         'seperlunya apabila ada kekeliruan dalam penetapannya.'),
        ]),
        Spacer(1, 24),
    ]

    ttd = Table([
        ['', Paragraph('Ditetapkan di : Karawang', S['p'])],
        ['', Paragraph(f'Pada tanggal&nbsp; : {SK_TANGGAL}', S['p'])],
        ['', Paragraph('Ketua Umum Gerakan Militansi', S['p'])],
        ['', Paragraph('Pejuang Indonesia (GMPI)', S['p'])],
    ], colWidths=[8.5 * cm, 8.0 * cm])
    ttd.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
    ]))
    story += [ttd, Spacer(1, 52), Paragraph('MUHAMAD SAYEGI', ParagraphStyle(
        'ttdname', parent=S['c'], underline=1)), Spacer(1, 20)]

    story.append(Paragraph('Tembusan kepada YTH :', ParagraphStyle('t', parent=S['p'], fontName=FB)))
    for i, line in enumerate([
        'Bupati Kabupaten Sidoarjo;',
        'Ketua DPRD Kabupaten Sidoarjo;',
        'Kapolres Kabupaten Sidoarjo;',
        'Dandim 0816 Kabupaten Sidoarjo;',
        'Kepala Kejaksaan Negeri Kabupaten Sidoarjo;',
        'Arsip.',
    ], 1):
        story.append(Paragraph(f'{i}. {line}', S['p']))

    # -------- lampiran --------
    story.append(PageBreak())
    story += [
        Paragraph('Lampiran&nbsp; :&nbsp; Surat Keputusan Ketua Umum GMPI', S['p']),
        Paragraph(f'Nomor&nbsp;&nbsp;&nbsp;&nbsp; :&nbsp; {SK_NOMOR}', S['p']),
        Paragraph(f'Tanggal&nbsp;&nbsp; :&nbsp; {SK_TANGGAL}', S['p']),
        Paragraph(f'Tentang&nbsp;&nbsp; :&nbsp; Pengurus DPD Kabupaten Sidoarjo Periode {PERIODE}', S['p']),
        Spacer(1, 16),
        Paragraph('SUSUNAN PENGURUS DEWAN PIMPINAN DAERAH', S['judul2']),
        Paragraph('GERAKAN MILITANSI PEJUANG INDONESIA (DPD GMPI)', S['judul2']),
        Paragraph('KABUPATEN SIDOARJO PROVINSI JAWA TIMUR', S['judul2']),
        Paragraph(f'PERIODE {PERIODE}', S['judul2']),
        Spacer(1, 12),
    ]

    rows = [[Paragraph('NO', S['cellh']), Paragraph('JABATAN', S['cellh']),
             Paragraph('NAMA', S['cellh'])]]
    merges = []
    nomor = 0
    for jabatan, names in DATA:
        names = [n for n in names if n.strip()]
        if not names:
            continue
        start = len(rows)
        for i, nama in enumerate(names):
            nomor += 1
            rows.append([
                Paragraph(str(nomor), S['cellc']),
                Paragraph(jabatan if i == 0 else '', S['cell']),
                Paragraph(nama, S['cell']),
            ])
        if len(names) > 1:
            merges.append(('SPAN', (1, start), (1, len(rows) - 1)))

    table = Table(rows, colWidths=[1.5 * cm, 8.0 * cm, 7.0 * cm], repeatRows=1)
    style = [
        ('GRID', (0, 0), (-1, -1), 0.6, colors.black),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (0, 0), (0, -1), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
    ] + merges
    table.setStyle(TableStyle(style))

    story.append(table)
    story.append(Spacer(1, 10))
    story.append(Paragraph('Susunan ini disalin dari struktur organisasi DPD GMPI Kabupaten '
                           'Sidoarjo dan dapat disesuaikan apabila terdapat perubahan.', S['small']))

    doc.build(story)
    print('tersimpan:', OUT, '|', nomor, 'orang')


if __name__ == '__main__':
    build()
