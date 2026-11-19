(async()=>{
 let expected=null;const status=document.querySelector('#status'),match=document.querySelector('#match');
 try{
 const id=new URLSearchParams(location.search).get('id');if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id||''))throw Error('ID verifikasi tidak valid.');
 const c=window.GMPI_SUPABASE_CONFIG,db=window.supabase.createClient(c.url,c.publishableKey,{auth:{persistSession:false}});
 const {data,error}=await db.rpc('verify_surat',{document_id:id});if(error)throw Error('Layanan verifikasi belum tersedia. Hubungi pengelola.');
 const d=data?.[0];if(!d)throw Error('Surat tidak ditemukan atau belum disetujui.');
 status.textContent=d.status==='revoked'?'DICABUT — jangan gunakan surat ini':'Disetujui secara internal';expected=d.final_sha256;
 for(const t of [`Nomor: ${d.number}`,`Tanggal surat: ${d.letter_date}`,`Penandatangan: ${d.signer_name}`,`Disetujui: ${d.decided_at}`,`SHA-256 PDF final: ${d.final_sha256}`]){const p=document.createElement('p');p.style.overflowWrap='anywhere';p.textContent=t;document.querySelector('#details').append(p);}
 }catch(e){status.textContent=e.message;}
 document.querySelector('#file').onchange=async e=>{try{match.textContent='';if(!expected)throw Error('Data verifikasi belum tersedia.');const f=e.target.files[0];if(!f)return;if(f.size>15*1024*1024)throw Error('Maksimal 15 MB.');const h=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await f.arrayBuffer()))).map(b=>b.toString(16).padStart(2,'0')).join('');match.textContent=h===expected?'File cocok dengan arsip. Tetap perhatikan status pencabutan di atas.':'TIDAK COCOK — file berbeda dari PDF final dalam arsip.';}catch(e){match.textContent=e.message;}};
})();
