import { createClient } from 'npm:@supabase/supabase-js@2';
import { PDFDocument, StandardFonts, rgb } from 'npm:pdf-lib@1.17.1';
import QRCode from 'npm:qrcode@1.5.4';
const URL = Deno.env.get('SUPABASE_URL')!;
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const site = Deno.env.get('SURAT_SITE_ORIGIN') || '';
const cors = {'Access-Control-Allow-Origin':site,'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS'};
const db = createClient(URL, KEY, {auth:{persistSession:false}});
const bucket = db.storage.from('surat-private');
const hash = async (a:Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',a))).map(x=>x.toString(16).padStart(2,'0')).join('');
function ok<T>(r:{data:T,error:any}):T {if(r.error) throw Error(r.error.message); return r.data;}
function text(v:unknown,max:number) {const s=String(v||'').trim(); if(!s || s.length>max) throw Error('Data wajib belum lengkap atau terlalu panjang.'); return s;}
function ascii(s:string){return s.replace(/[^\x20-\x7E]/g,'?');}
Deno.serve(async req => {
 if(req.method==='OPTIONS') return new Response(null,{headers:cors});
 try {
  if(req.method!=='POST' || !/^https:\/\//.test(site)) throw Error('Konfigurasi SURAT_SITE_ORIGIN HTTPS belum siap.');
  const token=(req.headers.get('authorization')||'').replace(/^Bearer /,'');
  const user=ok(await db.auth.getUser(token)).user; if(!user) throw Error('Silakan masuk kembali.');
  const profiles=ok(await db.from('admin_profiles').select('role').eq('email',user.email?.toLowerCase()).eq('active',true));
  const signer=ok(await db.from('surat_signers').select('*').eq('user_id',user.id).eq('active',true).maybeSingle());
  const staff=profiles.some(p=>['owner','registrar'].includes(p.role));
  if(!staff&&!signer) throw Error('Tidak memiliki akses surat.');
  const f=await req.formData(), action=String(f.get('action'));
  if(action==='submit') {
   if(!staff) throw Error('Hanya petugas administrasi dapat mengajukan.');
   const file=f.get('pdf'); if(!(file instanceof File)||file.size>10*1024*1024) throw Error('Unggah PDF maksimal 10 MB.');
   const bytes=new Uint8Array(await file.arrayBuffer());
   if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-') throw Error('File bukan PDF.');
   await PDFDocument.load(bytes); // rejects malformed/encrypted documents
   const number=text(f.get('number'),150), subject=text(f.get('subject'),200), recipient=text(f.get('recipient'),200);
   const date=String(f.get('date')); if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Error('Tanggal tidak valid.');
   const id=crypto.randomUUID(), path=`${id}/source.pdf`;
   ok(await bucket.upload(path,bytes,{contentType:'application/pdf',upsert:false}));
   const r=await db.from('surat_documents').insert({id,number,subject,recipient,letter_date:date,creator:user.id,source_path:path,source_sha256:await hash(bytes)});
   if(r.error){await bucket.remove([path]); throw Error(r.error.code==='23505'?'Nomor surat sudah terdaftar.':r.error.message);}
   return Response.json({message:'Surat diajukan. Menunggu persetujuan Ketua.'},{headers:cors});
  }
  const id=text(f.get('id'),36);
  const d=ok(await db.from('surat_documents').select('*').eq('id',id).single());
  if(action==='preview'||action==='download') {
   if(action==='download' && d.status!=='approved') throw Error('PDF tidak tersedia untuk pengiriman; belum disetujui atau dicabut.');
   const result=ok(await bucket.createSignedUrl(action==='preview'?d.source_path:d.final_path,60));
   return Response.json({url:result.signedUrl},{headers:cors});
  }
  if(!signer) throw Error('Hanya akun Ketua yang ditetapkan dapat memutuskan.');
  if(action==='reject'||action==='revoke') {
   const reason=text(f.get('reason'),500), from=action==='reject'?'pending':'approved', to=action==='reject'?'rejected':'revoked';
   const row=ok(await db.from('surat_documents').update({status:to,reason,decided_by:user.id,...(action==='reject'?{decided_at:new Date().toISOString()}: {})}).eq('id',id).eq('status',from).select('id'));
   if(!row.length) throw Error('Status sudah berubah. Muat ulang daftar.');
   return Response.json({message:'Status diperbarui.'},{headers:cors});
  }
  if(action!=='approve'||d.status!=='pending'||f.get('consent')!=='yes') throw Error('Persetujuan eksplisit diperlukan pada surat menunggu.');
  const sig=f.get('signature'); if(!(sig instanceof File)||sig.size>1024*1024) throw Error('Pilih tanda tangan PNG maksimal 1 MB.');
  const source=ok(await bucket.download(d.source_path)); const bytes=new Uint8Array(await source.arrayBuffer());
  if(await hash(bytes)!==d.source_sha256) throw Error('Integritas sumber tidak sesuai.');
  const pdf=await PDFDocument.load(bytes), font=await pdf.embedFont(StandardFonts.Helvetica);
  const signature=await pdf.embedPng(await sig.arrayBuffer());
  const qr=await pdf.embedPng(await QRCode.toDataURL(`${site}/surat-verifikasi.html?id=${id}`,{errorCorrectionLevel:'M',margin:2}));
  // Separate endorsement page avoids covering arbitrary Word/Docs source layouts.
  const p=pdf.addPage([595,842]);
  const draw=(s:string,x:number,y:number,size=11)=>p.drawText(ascii(s),{x,y,size,font,color:rgb(.08,.22,.18)});
  draw('GMPI SIDOARJO - LEMBAR PERSETUJUAN INTERNAL',40,780,15);
  draw('Lampiran pengesahan untuk seluruh halaman PDF sebelumnya.',40,752);
  const numberLines=ascii('Nomor: '+d.number).match(/.{1,90}/g)||[]; numberLines.forEach((line,i)=>draw(line,40,730-i*12,9)); draw(`Tanggal surat: ${d.letter_date}`,40,697);
  draw(`ID verifikasi: ${id}`,40,675,10);
  const nameLines=ascii('Persetujuan oleh: '+signer.display_name).match(/.{1,75}/g)||[]; nameLines.forEach((line,i)=>draw(line,40,635-i*14,10));
  const scale=Math.min(180/signature.width,80/signature.height);
  p.drawImage(signature,{x:40,y:515,width:signature.width*scale,height:signature.height*scale});
  draw('Ketua / penandatangan yang ditetapkan',40,492);
  const when=new Date().toISOString(); draw('Disetujui: '+when,40,465,10);
  p.drawImage(qr,{x:40,y:280,width:150,height:150});
  draw('Pindai QR untuk status terbaru. PDF yang dicabut tidak berlaku.',40,250,10);
  draw('Verifikasi internal GMPI - bukan TTE tersertifikasi.',40,225,11);
  draw('Jangan mengubah PDF ini. Hash file final dapat diperiksa di halaman QR.',40,200,9);
  const final=await pdf.save(), path=`${id}/final-${crypto.randomUUID()}.pdf`;
  ok(await bucket.upload(path,final,{contentType:'application/pdf',upsert:false}));
  const result=await db.from('surat_documents').update({status:'approved',final_path:path,final_sha256:await hash(final),signer_name:signer.display_name,decided_by:user.id,decided_at:when}).eq('id',id).eq('status','pending').select('id');
  if(result.error||!result.data?.length){await bucket.remove([path]);throw Error('Status berubah atau penyimpanan gagal. Muat ulang.');}
  return Response.json({message:'PDF disetujui dan diarsipkan. Tanda tangan PNG tidak disimpan terpisah.'},{headers:cors});
 } catch(e){return Response.json({error:e instanceof Error?e.message:'Gagal memproses surat.'},{status:400,headers:cors});}
});
