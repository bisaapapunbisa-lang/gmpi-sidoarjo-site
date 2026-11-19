(() => {
 const $=s=>document.querySelector(s), msg=s=>$('#message').textContent=s;
 if(!window.supabase||!window.GMPI_SUPABASE_CONFIG){msg('Konfigurasi atau library tidak termuat. Coba muat ulang.');return;}
 const cfg=window.GMPI_SUPABASE_CONFIG, db=window.supabase.createClient(cfg.url,cfg.publishableKey);
 let signer=false, selected=null, busy=false;
 const check=r=>{if(r.error) throw r.error;return r.data;};
 const node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
 async function run(fn){if(busy)return;busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);try{await fn();}catch(e){msg('Gagal: '+e.message+' Jika tabel/fungsi belum tersedia, minta pengelola mengaktifkan migrasi dan Edge Function surat.');}finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);}}
 async function call(action,id,form){const body=form?new FormData(form):new FormData();body.set('action',action);if(id)body.set('id',id); const {data,error}=await db.functions.invoke('surat',{body});if(error){let detail;try{detail=await error.context.json();}catch{}throw Error(detail?.error||error.message);}if(data.error)throw Error(data.error);return data;}
 async function load(){
  const session=check(await db.auth.getSession()).session;
  $('#login').hidden=!!session;$('#app').hidden=!session;if(!session)return;
  $('#identity').textContent=session.user.email;
  signer=!!check(await db.from('surat_signers').select('user_id').eq('user_id',session.user.id).eq('active',true).maybeSingle());
  const roles=check(await db.from('admin_profiles').select('role').eq('email',session.user.email.toLowerCase()).eq('active',true));
  const staff=roles.some(r=>['owner','registrar'].includes(r.role));$('#submission').hidden=!staff;
  if(!staff&&!signer){$('#list').textContent='Akun tidak memiliki akses administrasi surat.';return;}
  const docs=check(await db.from('surat_documents').select('*').order('created_at',{ascending:false}).limit(200));
  $('#list').replaceChildren();if(!docs.length)$('#list').textContent='Belum ada surat.';
  for(const d of docs){const card=node('article','');card.append(node('h3',d.number),node('p',`${d.letter_date} • ${d.subject}`),node('p','Penerima: '+d.recipient),node('strong',({pending:'Menunggu Ketua',approved:'Disetujui',rejected:'Ditolak',revoked:'Dicabut'})[d.status]));if(d.reason)card.append(node('p','Alasan: '+d.reason));
   const btn=(label,fn)=>{const b=node('button',label);b.onclick=()=>run(fn);card.append(b);};
   btn('Periksa PDF sumber',async()=>{const r=await call('preview',d.id);selected=d.id;$('#approval').reset();$('#preview').src=r.url;$('#preview-link').href=r.url;$('#review-title').textContent=d.number+' — '+d.subject;$('#review').hidden=false;$('#approval').hidden=!(signer&&d.status==='pending');$('#review').scrollIntoView({behavior:'smooth'});});
   if(d.status==='approved')btn('Buka / unduh PDF final',async()=>{const r=await call('download',d.id);const a=node('a','Klik di sini untuk membuka PDF final (60 detik)');a.href=r.url;a.target='_blank';a.rel='noopener';$('#message').replaceChildren(a);});
   if(signer&&['pending','approved'].includes(d.status))btn(d.status==='pending'?'Tolak':'Cabut',async()=>{const reason=prompt('Alasan keputusan (wajib):');if(!reason?.trim())return;const form=new FormData();form.set('action',d.status==='pending'?'reject':'revoke');form.set('id',d.id);form.set('reason',reason);const result=await db.functions.invoke('surat',{body:form});if(result.error||result.data?.error)throw Error(result.data?.error||result.error.message);msg('Keputusan disimpan.');$('#review').hidden=true;await load();});
   $('#list').append(card);
  }
 }
 $('#login-form').onsubmit=e=>{e.preventDefault();run(async()=>{const f=new FormData(e.target);check(await db.auth.signInWithPassword({email:f.get('email'),password:f.get('password')}));e.target.reset();msg('Berhasil masuk.');await load();});};
 $('#submit-form').onsubmit=e=>{e.preventDefault();run(async()=>{const r=await call('submit',null,e.target);msg(r.message);e.target.reset();await load();});};
 $('#approval').onsubmit=e=>{e.preventDefault();run(async()=>{const r=await call('approve',selected,e.target);msg(r.message);e.target.reset();$('#review').hidden=true;await load();});};
 $('#refresh').onclick=()=>run(load);
 $('#logout').onclick=()=>run(async()=>{check(await db.auth.signOut());$('#list').replaceChildren();$('#preview').src='about:blank';$('#review').hidden=true;$('#approval').reset();msg('Anda telah keluar.');await load();});
 run(load);
})();
