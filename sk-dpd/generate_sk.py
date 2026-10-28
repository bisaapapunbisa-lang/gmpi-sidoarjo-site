#!/usr/bin/env python3
"""Membuat SK DPD GMPI Sidoarjo (.docx) dengan nama pengurus terisi.

Nama diambil dari halaman Admin > Struktur organisasi.
Jabatan yang belum ada namanya DILEWATI (tidak dicetak).

Jalankan:  PYTHONPATH=/home/user/.work/pylib python3 generate_sk.py
Hasil   :  SK-DPD-GMPI-Sidoarjo-2023-2028.docx (folder ini)
"""
import os
from docx import Document
from docx.enum.table import WD_ALIGN_VERTICAL, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt

HERE = os.path.dirname(os.path.abspath(__file__))
LOGO = '/home/user/.work/logo-gmpi-transparan.png'
if not os.path.exists(LOGO):
    LOGO = os.path.join(HERE, '..', 'logo-gmpi-restorasi-1000.png')
OUT = os.path.join(HERE, 'SK-DPD-GMPI-Sidoarjo-2023-2028.docx')

SK_NOMOR = '023/SK/DPP-GMPI/V/2026'
SK_TANGGAL = '05 Juni 2026'
PERIODE = '2023-2028'

# (jabatan, [nama tiap orang]) -- "" akan dilewati
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
        'BERNARDINUS SELAMA',
        'NOVI ISNAWATI',
    ]),
    ('Divisi Ekonomi', ['HERDY ARLIANTO']),
    ('Divisi Pariwisata', ['NUR BANI YUSUF']),
    ('Divisi Tenaga Kerja', [
        'BAGAS OKKY PRASETYA',
        'RIZKY',
    ]),
    ('Divisi Hukum Dan Hak Asasi Manusia (HAM)', [
        'ABD GOFUR., S.H., M.H.',
        'GW THODY, S.H., M.H.',
        'Drs. Ec. Bambang Rudyanto, SH., MH., ACIArb., CTL., Kurator & Pengurus',
    ]),
    ('Divisi Politik', ['PUJIHARTO']),
    ('Divisi Agama', ["MAS'UDIN. S.Pd."]),
    ('Divisi Sosial', ['SYAMSUDDIZUHRY']),
    ('Divisi Informasi Dan Komunikasi', [
        'TRISTIANTO WIJAYA',
        'ARJU HERMAN',
        'AGUS SUBAKTI., S.T., S.H., CDLA.',
    ]),
    ('Divisi Pertahanan Dan Keamanan', [
        'HENDRO',
        'JOSEP BENNY TUAT ANSSY',
        'SAMUEL RETTA',
    ]),
    ('Divisi Hubungan Masyarakat (HUMAS)', ['ACHMAT FATONI']),
    ('Divisi Pemberdayaan Perempuan', ['KANTI RAHAYU']),
]

FONT = 'Times New Roman'


def set_cell_borders(cell, sz=6):
    tcPr = cell._tc.get_or_add_tcPr()
    borders = OxmlElement('w:tcBorders')
    for edge in ('top', 'left', 'bottom', 'right'):
        el = OxmlElement(f'w:{edge}')
        el.set(qn('w:val'), 'single')
        el.set(qn('w:sz'), str(sz))
        el.set(qn('w:color'), '000000')
        borders.append(el)
    tcPr.append(borders)


def fixed_layout(table, widths_cm):
    """Kunci lebar kolom supaya tidak diubah otomatis oleh Word."""
    table.autofit = False
    tbl = table._tbl
    layout = OxmlElement('w:tblLayout')
    layout.set(qn('w:type'), 'fixed')
    tbl.tblPr.append(layout)
    grid = tbl.find(qn('w:tblGrid'))
    if grid is not None:
        for gc, w in zip(grid.findall(qn('w:gridCol')), widths_cm):
            gc.set(qn('w:w'), str(int(w * 567)))
    for row in table.rows:
        for cell, w in zip(row.cells, widths_cm):
            cell.width = Cm(w)


def para(doc, text='', size=11, bold=False, align=None, space_after=0,
         space_before=0, underline=False):
    p = doc.add_paragraph()
    pf = p.paragraph_format
    pf.space_after = Pt(space_after)
    pf.space_before = Pt(space_before)
    if align is not None:
        p.alignment = align
    if text:
        r = p.add_run(text)
        r.font.name = FONT
        r.font.size = Pt(size)
        r.bold = bold
        r.underline = underline
    return p


def bottom_rule(doc, size=12):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(0)
    p.paragraph_format.space_before = Pt(0)
    pPr = p._p.get_or_add_pPr()
    pbdr = OxmlElement('w:pBdr')
    b = OxmlElement('w:bottom')
    b.set(qn('w:val'), 'single')
    b.set(qn('w:sz'), str(size))
    b.set(qn('w:space'), '1')
    b.set(qn('w:color'), '000000')
    pbdr.append(b)
    pPr.append(pbdr)
    return p


def cell_text(cell, text, size=10.5, bold=False, align=WD_ALIGN_PARAGRAPH.LEFT):
    cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
    p = cell.paragraphs[0]
    p.alignment = align
    p.paragraph_format.space_after = Pt(2)
    p.paragraph_format.space_before = Pt(2)
    r = p.add_run(text)
    r.font.name = FONT
    r.font.size = Pt(size)
    r.bold = bold


def numbered_block(doc, label, items):
    t = doc.add_table(rows=1, cols=3)
    widths_cm = (3.0, 0.8, 12.3)
    for i, w in enumerate(widths_cm):
        t.rows[0].cells[i].width = Cm(w)
    cell_text(t.rows[0].cells[0], f'{label} :')
    t.rows[0].cells[0].vertical_alignment = WD_ALIGN_VERTICAL.TOP
    cell_text(t.rows[0].cells[1], items[0][0])
    cell_text(t.rows[0].cells[2], items[0][1])
    for mark, body in items[1:]:
        row = t.add_row()
        for i, w in enumerate(widths_cm):
            row.cells[i].width = Cm(w)
        cell_text(row.cells[0], '')
        cell_text(row.cells[1], mark)
        row.cells[1].vertical_alignment = WD_ALIGN_VERTICAL.TOP
        cell_text(row.cells[2], body)
    fixed_layout(t, widths_cm)
    return t


def build():
    doc = Document()
    st = doc.styles['Normal']
    st.font.name = FONT
    st.font.size = Pt(11)
    st.element.rPr.rFonts.set(qn('w:eastAsia'), FONT)

    sec = doc.sections[0]
    sec.page_width, sec.page_height = Cm(21.0), Cm(29.7)
    sec.top_margin, sec.bottom_margin = Cm(2.0), Cm(2.0)
    sec.left_margin, sec.right_margin = Cm(2.5), Cm(2.0)

    # ---------------- KOP ----------------
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_after = Pt(4)
    p.add_run().add_picture(LOGO, width=Cm(2.5))

    para(doc, 'DEWAN PIMPINAN PUSAT', 14, True, WD_ALIGN_PARAGRAPH.CENTER)
    para(doc, 'GMPI', 26, True, WD_ALIGN_PARAGRAPH.CENTER)
    para(doc, 'GERAKAN MILITANSI PEJUANG INDONESIA', 13, True, WD_ALIGN_PARAGRAPH.CENTER, space_after=2)
    para(doc, 'Sekretariat : Jl. Dharmawangsa II Grand Taruma B.21 Desa Sukamakmur', 9,
         False, WD_ALIGN_PARAGRAPH.CENTER, space_after=0)
    para(doc, 'Kecamatan Telukjambe Timur Kabupaten Karawang', 9, False, WD_ALIGN_PARAGRAPH.CENTER, space_after=0)
    para(doc, 'Email : dppgmpi01@gmail.com   |   Telp/WA : 085882100267', 9, False,
         WD_ALIGN_PARAGRAPH.CENTER, space_after=4)
    bottom_rule(doc, 18)
    doc.add_paragraph().paragraph_format.space_after = Pt(2)

    # ---------------- JUDUL ----------------
    para(doc, 'SURAT KEPUTUSAN KETUA UMUM', 13, True, WD_ALIGN_PARAGRAPH.CENTER)
    para(doc, 'GERAKAN MILITANSI PEJUANG INDONESIA (GMPI)', 13, True, WD_ALIGN_PARAGRAPH.CENTER)
    para(doc, f'Nomor : {SK_NOMOR}', 12, True, WD_ALIGN_PARAGRAPH.CENTER, space_before=2, space_after=8)
    para(doc, 'Tentang', 11, False, WD_ALIGN_PARAGRAPH.CENTER, space_after=6)
    para(doc, 'PENGUKUHAN PENGURUS', 12, True, WD_ALIGN_PARAGRAPH.CENTER)
    para(doc, 'DEWAN PIMPINAN DAERAH GERAKAN MILITANSI PEJUANG INDONESIA', 12, True, WD_ALIGN_PARAGRAPH.CENTER)
    para(doc, '(DPD GMPI) KABUPATEN SIDOARJO PROVINSI JAWA TIMUR', 12, True, WD_ALIGN_PARAGRAPH.CENTER)
    para(doc, f'PERIODE {PERIODE}', 12, True, WD_ALIGN_PARAGRAPH.CENTER, space_before=2, space_after=12)

    # ---------------- MENIMBANG / MENGINGAT ----------------
    numbered_block(doc, 'Menimbang', [
        ('a.', 'Bahwa dalam rangka membangun organisasi Gerakan Militansi Pejuang Indonesia (GMPI) '
               'yang besar dan menjangkau seluruh wilayah di Negara Kesatuan Republik Indonesia (NKRI) '
               'maka dinilai perlu untuk membentuk struktur kepengurusan di berbagai wilayah '
               'Provinsi/Kota/Kabupaten/Kecamatan/Desa;'),
        ('b.', 'Bahwa setelah adanya Keputusan Ketua Umum GMPI untuk membentuk Dewan Pimpinan Daerah '
               'Kabupaten Sidoarjo, maka perlu dibentuk/ditunjuk Kepengurusan DPD GMPI Kabupaten '
               'Sidoarjo untuk mendukung terwujudnya cita-cita dan tujuan organisasi;'),
        ('c.', 'Bahwa oleh karena itu DPP GMPI perlu mengeluarkan Surat Keputusan (SK) tentang '
               'pembentukan Kepengurusan DPD GMPI Kabupaten Sidoarjo Provinsi Jawa Timur.'),
    ])
    doc.add_paragraph().paragraph_format.space_after = Pt(2)
    numbered_block(doc, 'Mengingat', [
        ('1.', 'Anggaran Dasar dan Anggaran Rumah Tangga GMPI;'),
        ('2.', 'Rapat Dewan Pimpinan Pusat.'),
    ])

    # ---------------- HALAMAN 2 ----------------
    doc.add_page_break()
    para(doc, 'MEMUTUSKAN', 13, True, WD_ALIGN_PARAGRAPH.CENTER, space_after=10)

    t = doc.add_table(rows=1, cols=2)
    t.rows[0].cells[0].width, t.rows[0].cells[1].width = Cm(3.0), Cm(13.5)
    cell_text(t.rows[0].cells[0], 'Menetapkan :')
    cell_text(t.rows[0].cells[1],
              'PENGUKUHAN PENGURUS DEWAN PIMPINAN DAERAH GERAKAN MILITANSI PEJUANG '
              'INDONESIA (DPD GMPI) KABUPATEN SIDOARJO PROVINSI JAWA TIMUR '
              f'PERIODE {PERIODE};')
    fixed_layout(t, (3.0, 13.5))
    doc.add_paragraph().paragraph_format.space_after = Pt(4)

    t = doc.add_table(rows=1, cols=2)
    t.rows[0].cells[0].width, t.rows[0].cells[1].width = Cm(3.0), Cm(13.5)
    cell_text(t.rows[0].cells[0], 'PERTAMA :')
    cell_text(t.rows[0].cells[1],
              'Mengukuhkan nama-nama yang terlampir sebagai pengurus DPD GMPI Kabupaten '
              'Sidoarjo Provinsi Jawa Timur;')
    for label, body in (
        ('KEDUA :', 'Pengurus tersebut pada diktum pertama memiliki kewajiban untuk menjalankan '
                    'program kerjanya secara tanggung jawab;'),
        ('KETIGA :', 'Keputusan ini berlaku sejak tanggal ditetapkan dan akan diadakan perbaikan '
                     'seperlunya apabila ada kekeliruan dalam penetapannya.'),
    ):
        row = t.add_row()
        row.cells[0].width, row.cells[1].width = Cm(3.0), Cm(13.5)
        cell_text(row.cells[0], label)
        cell_text(row.cells[1], body)
    fixed_layout(t, (3.0, 13.5))

    doc.add_paragraph().paragraph_format.space_after = Pt(10)

    # ---------------- TANDA TANGAN ----------------
    t = doc.add_table(rows=1, cols=2)
    t.rows[0].cells[0].width, t.rows[0].cells[1].width = Cm(8.5), Cm(8.0)
    cell_text(t.rows[0].cells[0], '')
    cell_text(t.rows[0].cells[1], 'Ditetapkan di : Karawang')
    for line in (f'Pada tanggal  : {SK_TANGGAL}',
                 'Ketua Umum Gerakan Militansi',
                 'Pejuang Indonesia (GMPI)'):
        row = t.add_row()
        cell_text(row.cells[0], '')
        cell_text(row.cells[1], line)
    fixed_layout(t, (8.5, 8.0))

    for _ in range(4):
        doc.add_paragraph()
    para(doc, 'MUHAMAD SAYEGI', 11, True, WD_ALIGN_PARAGRAPH.CENTER, underline=True)

    doc.add_paragraph().paragraph_format.space_after = Pt(8)
    para(doc, 'Tembusan kepada YTH :', 11, True)
    for i, line in enumerate([
        'Bupati Kabupaten Sidoarjo;',
        'Ketua DPRD Kabupaten Sidoarjo;',
        'Kapolres Kabupaten Sidoarjo;',
        'Dandim 0816 Kabupaten Sidoarjo;',
        'Kepala Kejaksaan Negeri Kabupaten Sidoarjo;',
        'Arsip.',
    ], 1):
        para(doc, f'{i}. {line}', 11, space_after=1)

    # ---------------- LAMPIRAN ----------------
    doc.add_page_break()
    para(doc, 'Lampiran  :  Surat Keputusan Ketua Umum GMPI', 11, space_after=1)
    para(doc, f'Nomor     :  {SK_NOMOR}', 11, space_after=1)
    para(doc, f'Tanggal   :  {SK_TANGGAL}', 11, space_after=1)
    para(doc, f'Tentang   :  Pengurus DPD Kabupaten Sidoarjo Periode {PERIODE}', 11, space_after=12)

    para(doc, 'SUSUNAN PENGURUS DEWAN PIMPINAN DAERAH', 12, True, WD_ALIGN_PARAGRAPH.CENTER)
    para(doc, 'GERAKAN MILITANSI PEJUANG INDONESIA (DPD GMPI)', 12, True, WD_ALIGN_PARAGRAPH.CENTER)
    para(doc, 'KABUPATEN SIDOARJO PROVINSI JAWA TIMUR', 12, True, WD_ALIGN_PARAGRAPH.CENTER)
    para(doc, f'PERIODE {PERIODE}', 12, True, WD_ALIGN_PARAGRAPH.CENTER, space_after=10)

    table = doc.add_table(rows=1, cols=3)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    widths_cm = (1.5, 8.0, 7.0)
    hdr = table.rows[0]
    for i, label in enumerate(('NO', 'JABATAN', 'NAMA')):
        hdr.cells[i].width = Cm(widths_cm[i])
        cell_text(hdr.cells[i], label, 10.5, True, WD_ALIGN_PARAGRAPH.CENTER)
    hdr._tr.get_or_add_trPr().append(OxmlElement('w:tblHeader'))

    nomor = 0
    for jabatan, names in DATA:
        names = [n for n in names if n.strip()]   # jabatan kosong dilewati
        if not names:
            continue
        first_row = None
        for nama in names:
            nomor += 1
            row = table.add_row()
            for i, w in enumerate(widths_cm):
                row.cells[i].width = Cm(w)
            cell_text(row.cells[0], str(nomor), 10, align=WD_ALIGN_PARAGRAPH.CENTER)
            cell_text(row.cells[2], nama, 10)
            if first_row is None:
                first_row = row
                cell_text(row.cells[1], jabatan, 10)
            else:
                first_row.cells[1].merge(row.cells[1])

    fixed_layout(table, widths_cm)
    for r in table.rows:
        for c in r.cells:
            set_cell_borders(c)

    doc.add_paragraph().paragraph_format.space_after = Pt(6)
    para(doc, 'Susunan ini disalin dari struktur organisasi DPD GMPI Kabupaten Sidoarjo '
              'dan dapat disesuaikan apabila terdapat perubahan.', 9)

    doc.save(OUT)
    print('tersimpan:', OUT, '|', nomor, 'orang')


if __name__ == '__main__':
    build()
