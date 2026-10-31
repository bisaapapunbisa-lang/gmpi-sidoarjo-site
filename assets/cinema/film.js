/* GMPI cinematic portrait. Deterministic Canvas 2D renderer shared by the
 * accessible web player and the offline 4K H.264 exporter. No remote assets.
 * This is layered 2.5D animation of the original photograph, not generated poses.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GMPIFilm = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const W = 1920, H = 1080, DURATION = 24;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const smooth = (a, b, t) => { const x = clamp((t-a)/(b-a)); return x*x*(3-2*x); };
  const easeOut = x => 1-Math.pow(1-clamp(x), 3);
  const pulse = (t, at, width) => Math.exp(-Math.pow((t-at)/width, 2));
  function random(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s,1664525)+1013904223)>>>0; return s/4294967296; }; }
  const chapters = [
    { time: 0, label: 'Kegelapan' },
    { time: 2.1, label: 'Kebangkitan' },
    { time: 7, label: 'Keteguhan' },
    { time: 12, label: 'Pengabdian' },
    { time: 18.2, label: 'Cahaya perjuangan' }
  ];

  function createRenderer(canvas, assets, options = {}) {
    const ctx = canvas.getContext('2d', { alpha: false });
    const makeCanvas = options.createCanvas || ((w,h) => { const c=document.createElement('canvas'); c.width=w; c.height=h; return c; });
    const rand = random(0x69a4fef0);
    const particles = Array.from({length: 105}, () => ({ x:rand()*W, y:rand()*H, z:.3+rand()*.7, speed:14+rand()*42, phase:rand()*Math.PI*2, size:.7+rand()*2.1 }));
    const rays = Array.from({length: 34}, () => ({ angle:rand()*Math.PI*2, width:.008+rand()*.034, length:.45+rand()*.7, delay:rand()*.18 }));
    const bolts = [
      [[1370,-20],[1308,80],[1340,126],[1252,230],[1280,267],[1190,380],[1215,415],[1150,540]],
      [[1252,230],[1170,245],[1135,310],[1060,342]],
      [[420,-20],[480,95],[451,154],[548,258],[522,310],[620,420],[603,480]]
    ];
    const ember = makeCanvas(64,64), ec = ember.getContext('2d');
    const eg = ec.createRadialGradient(32,32,0,32,32,32);
    eg.addColorStop(0,'rgba(255,248,223,1)');
    eg.addColorStop(.08,'rgba(255,235,174,1)');
    eg.addColorStop(.2,'rgba(255,157,48,.8)');
    eg.addColorStop(.45,'rgba(244,65,12,.22)');
    eg.addColorStop(1,'rgba(220,35,5,0)');
    ec.fillStyle=eg; ec.fillRect(0,0,64,64);
    // A seeded, multi-octave smoke sprite: soft alpha, no hard ellipse edges.
    const smoke = makeCanvas(384,256), sc = smoke.getContext('2d');
    const grids = [8,16,32,64].map(n => ({n, values:Array.from({length:(n+1)*(n+1)},()=>rand())}));
    function noise(g,x,y) {
      const gx=x*g.n, gy=y*g.n, ix=Math.floor(gx), iy=Math.floor(gy);
      let fx=gx-ix, fy=gy-iy; fx=fx*fx*(3-2*fx); fy=fy*fy*(3-2*fy);
      const at=(a,b)=>g.values[b*(g.n+1)+a];
      return (at(ix,iy)*(1-fx)+at(ix+1,iy)*fx)*(1-fy)+(at(ix,iy+1)*(1-fx)+at(ix+1,iy+1)*fx)*fy;
    }
    const sd=sc.createImageData(384,256);
    for(let y=0;y<256;y++) for(let x=0;x<384;x++) {
      const u=x/383,v=y/255;
      const edge=Math.pow(Math.max(0,Math.sin(u*Math.PI)*Math.sin(v*Math.PI)),1.3);
      let n=0; grids.forEach((g,i)=>n+=noise(g,u,v)/(Math.pow(2,i)));
      const a=clamp((n-.48)*1.1)*edge, k=(y*384+x)*4;
      sd.data[k]=155; sd.data[k+1]=164; sd.data[k+2]=174; sd.data[k+3]=Math.round(a*180);
    }
    sc.putImageData(sd,0,0);

    function radial(x,y,r,stops,composite='screen') {
      ctx.save(); ctx.globalCompositeOperation=composite;
      const g=ctx.createRadialGradient(x,y,0,x,y,r);
      stops.forEach(s=>g.addColorStop(s[0],s[1])); ctx.fillStyle=g;
      ctx.fillRect(x-r,y-r,r*2,r*2); ctx.restore();
    }
    function tracked(text,x,y,spacing) {
      const widths=Array.from(text).map(c=>ctx.measureText(c).width);
      let left=x-(widths.reduce((a,b)=>a+b,0)+spacing*(text.length-1))/2;
      ctx.textAlign='left';
      Array.from(text).forEach((c,i)=>{ctx.fillText(c,left,y);left+=widths[i]+spacing;});
      ctx.textAlign='center';
    }
    function metalTitle(t,alpha) {
      if(alpha<=0) return;
      ctx.save(); ctx.globalAlpha=alpha;
      const scale=.965+.035*easeOut((t-3.2)/2.8);
      ctx.translate(960,118+(1-alpha)*18); ctx.scale(scale,scale);
      ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.font='142px Anton';
      ctx.lineJoin='round'; ctx.shadowColor='rgba(226,38,20,.65)'; ctx.shadowBlur=20;
      ctx.strokeStyle='#5e100b'; ctx.lineWidth=12; ctx.strokeText('DPD GMPI',0,5);
      ctx.shadowBlur=0; ctx.strokeStyle='#d6a65b'; ctx.lineWidth=4; ctx.strokeText('DPD GMPI',0,0);
      const g=ctx.createLinearGradient(0,-70,0,65);
      [[0,'#fffef3'],[.17,'#e8edf0'],[.36,'#9ca4ab'],[.47,'#f9ffff'],[.51,'#69727b'],[.72,'#cbd1d5'],[.88,'#ffffff'],[1,'#858d94']].forEach(s=>g.addColorStop(...s));
      ctx.fillStyle=g; ctx.fillText('DPD GMPI',0,0);
      // Moving reflection, clipped to the letterforms by source-atop in a text mask.
      const sheen=ctx.createLinearGradient(-650+(t%9)*160,-70,-420+(t%9)*160,70);
      sheen.addColorStop(0,'rgba(255,255,255,0)');sheen.addColorStop(.5,'rgba(255,255,244,.34)');sheen.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=sheen; ctx.fillText('DPD GMPI',0,0); ctx.restore();
    }
    function subtitle(t,alpha) {
      if(alpha<=0)return;
      ctx.save();ctx.globalAlpha=alpha;ctx.textBaseline='middle';ctx.font='800 27px Inter';
      ctx.shadowColor='#000';ctx.shadowBlur=10;ctx.fillStyle='#f1eee7';
      tracked('GERAKAN MILITANSI PEJUANG INDONESIA',960,207+(1-alpha)*10,2.2);
      ctx.restore();
    }
    function names(t,alpha) {
      if(alpha<=0)return;
      ctx.save();ctx.globalAlpha=alpha;ctx.textAlign='center';ctx.textBaseline='middle';
      const y=879+(1-alpha)*12;
      ctx.shadowColor='#000';ctx.shadowBlur=12;
      ctx.font='29px Anton';ctx.fillStyle='#f7f5ee';
      ctx.fillText('H.M SAYEGI DEWASENA',704,y);ctx.fillText('HASMIN MARJAN SPD',1215,y);
      ctx.shadowBlur=0;ctx.strokeStyle='rgba(219,181,107,.7)';ctx.lineWidth=1;
      [[704,270],[1215,245]].forEach(([x,w])=>{ctx.beginPath();ctx.moveTo(x-w/2,y+24);ctx.lineTo(x+w/2,y+24);ctx.stroke();});
      ctx.font='800 16px Inter';ctx.fillStyle='#eeeae0';tracked('KETUA UMUM GMPI',704,y+44,1.4);
      ctx.fillStyle='#dfbd7b';tracked('KETUA DPD GMPI SIDOARJO',1215,y+44,1.1);ctx.restore();
    }
    function lowerTitles(t,mottoAlpha,sloganAlpha) {
      ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.globalAlpha=mottoAlpha;ctx.font='italic 25px Georgia';ctx.fillStyle='#dec18a';
      ctx.shadowColor='#000';ctx.shadowBlur=8;ctx.fillText('“Setia Bersaudara Sampai Urat Nadi”',960,958);
      ctx.globalAlpha=sloganAlpha;ctx.font='51px Anton';ctx.lineJoin='round';
      ctx.strokeStyle='rgba(218,163,83,.65)';ctx.lineWidth=1.8;ctx.strokeText('KAMI LAHIR BERJUANG UNTUK MASYARAKAT',960,1017);
      const g=ctx.createLinearGradient(0,990,0,1045);g.addColorStop(0,'#ff7360');g.addColorStop(.42,'#e53729');g.addColorStop(1,'#8c100d');
      ctx.fillStyle=g;ctx.shadowBlur=16;ctx.shadowColor='rgba(235,44,17,.35)';ctx.fillText('KAMI LAHIR BERJUANG UNTUK MASYARAKAT',960,1017);ctx.restore();
    }
    function render(time, state={}) {
      const t=clamp(time,0,DURATION), gentle=!!state.gentle;
      const px=gentle?0:clamp(state.pointerX||0,-1,1), py=gentle?0:clamp(state.pointerY||0,-1,1);
      const reveal=smooth(1.65,3.5,t), push=smooth(1.8,20,t);
      const lightning=pulse(t,2.12,.095)+.28*pulse(t,2.38,.17);
      const impact=pulse(t,18.28,.16), afterglow=smooth(18.1,19.4,t)*(1-.48*smooth(20,24,t));
      const flash=clamp(lightning+impact*.95);
      const shake=gentle?0:impact*3.5;
      ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);
      ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';ctx.fillStyle='#030405';ctx.fillRect(0,0,W,H);
      ctx.save();ctx.translate(Math.sin(t*61)*shake,Math.cos(t*47)*shake*.6);
      // Deep background: slow counter-motion makes the foreground push readable.
      ctx.save();ctx.globalAlpha=.13+.69*smooth(.8,2.8,t);
      const bs=1.075-.035*push;
      ctx.translate(960-px*9,540-py*5);ctx.scale(bs,bs);ctx.drawImage(assets.stage,-960,-540,W,H);ctx.restore();
      radial(960,570,650,[[0,`rgba(151,22,10,${.12+reveal*.12+afterglow*.1})`],[.55,'rgba(91,10,6,.09)'],[1,'rgba(0,0,0,0)']]);
      // The original crest occupies its own intermediate depth plane.
      ctx.save();ctx.globalAlpha=reveal*.92;const cs=.96+push*.055;
      ctx.translate(960-px*5,382-py*3);ctx.scale(cs,cs);ctx.shadowColor='#ff5a16';ctx.shadowBlur=25+10*Math.sin(t*.8);
      const ch=220,cw=ch*(assets.crest.width/assets.crest.height);ctx.drawImage(assets.crest,-cw/2,-ch/2,cw,ch);ctx.restore();
      radial(960,405,215,[[0,`rgba(255,126,30,${reveal*(.13+.035*Math.sin(t*1.2)+afterglow*.15)})`],[.4,'rgba(242,58,9,.06)'],[1,'rgba(0,0,0,0)']]);
      // Branching lightning is a single discrete event, never a strobe loop.
      if(lightning>.015) {
        ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=clamp(lightning)*(gentle?.22:1);
        bolts.forEach((points,i)=>{
          ctx.beginPath();points.forEach((p,j)=>j?ctx.lineTo(...p):ctx.moveTo(...p));
          ctx.lineJoin='round';ctx.shadowColor='#a9d9ff';ctx.shadowBlur=30;ctx.strokeStyle='rgba(142,204,255,.65)';ctx.lineWidth=i?3:7;ctx.stroke();
          ctx.shadowBlur=8;ctx.strokeStyle='#f5fbff';ctx.lineWidth=i?1.2:2.5;ctx.stroke();
        });ctx.restore();
      }
      // Rear smoke drifts independently of the foreground embers.
      ctx.save();ctx.globalCompositeOperation='screen';
      for(let i=0;i<5;i++) {
        ctx.globalAlpha=reveal*(.14+i*.014);
        const x=((i*470+t*(i%2?13:-10)+1500)%2400)-650;
        ctx.drawImage(smoke,x,650+Math.sin(t*.22+i)*32,900,360);
      }ctx.restore();
      // Faithful photographic cutouts. Separate translation and scale = 2.5D.
      const figureScale=.665*(.965+.105*push);
      function figure(image,front) {
        ctx.save();const s=figureScale*(front?1.003:1);
        const drift=(front?1:-1)*push*2.5;
        ctx.translate(960+drift+px*(front?15:10),970+py*(front?7:4));
        ctx.scale(s,s);ctx.globalAlpha=reveal;
        ctx.drawImage(image,-680,-980,1360,1130);ctx.restore();
      }
      figure(assets.left,false);figure(assets.right,true);
      // Warm rim light and a soft photographic bloom on the shoulders.
      radial(690,470,250,[[0,`rgba(255,113,36,${reveal*(.045+flash*.13)})`],[1,'rgba(255,60,10,0)']]);
      radial(1270,480,260,[[0,`rgba(255,177,79,${reveal*(.04+flash*.12)})`],[1,'rgba(255,60,10,0)']]);
      // Ground haze occludes the lower edge, not the faces or hands.
      ctx.save();ctx.globalCompositeOperation='screen';
      for(let i=0;i<4;i++){ctx.globalAlpha=reveal*.19;ctx.drawImage(smoke,((i*610-t*17+2600)%2600)-650,825+Math.sin(t*.3+i)*20,1000,300);}
      ctx.restore();
      const floor=ctx.createLinearGradient(0,790,0,H);floor.addColorStop(0,'rgba(3,4,5,0)');floor.addColorStop(.5,'rgba(3,4,5,.62)');floor.addColorStop(1,'rgba(3,4,5,.94)');
      ctx.fillStyle=floor;ctx.fillRect(0,790,W,290);
      // Slow anamorphic energy sweeps, with restrained frequency.
      [7.6,12.7,16.4].forEach((at,i)=>{
        const a=pulse(t,at,.32);if(a<.01)return;
        const x=-300+clamp((t-at+.8)/1.6)*2500,y=520+i*83;
        ctx.save();ctx.globalAlpha=a*(gentle?.2:.62);ctx.translate(x,y);ctx.scale(1,.025);
        radial(0,0,470,[[0,'rgba(255,248,232,.95)'],[.08,'rgba(255,171,83,.7)'],[.35,'rgba(255,57,22,.2)'],[1,'rgba(255,30,0,0)']]);ctx.restore();
        ctx.save();ctx.globalAlpha=a*.2;ctx.strokeStyle='#ffba76';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(x,y,130+(t-at+.8)*130,38+(t-at+.8)*35,0,0,Math.PI*2);ctx.stroke();ctx.restore();
      });
      // Foreground embers: depth-dependent size, speed, brightness and parallax.
      ctx.save();ctx.globalCompositeOperation='screen';
      particles.forEach(p=>{
        const y=H+40-((p.y+t*p.speed)%(H+120));
        const x=p.x+Math.sin(t*.55+p.phase)*24+px*p.z*23;
        const flicker=.6+.4*Math.sin(t*2.1+p.phase)**2;
        const bottom=.28+.72*smooth(260,950,y);
        ctx.globalAlpha=(.12+.7*reveal)*p.z*flicker*bottom;
        const size=p.size*(3+p.z*5);ctx.drawImage(ember,x-size/2,y-size/2,size,size*(1.1+p.z*.4));
      });ctx.restore();
      // Climax: radial light beams and expanding energy rings, then a settled glow.
      if(t>17.9) {
        const expansion=easeOut((t-17.95)/1.7), burst=(1-smooth(18.6,21.4,t))*smooth(17.9,18.25,t);
        ctx.save();ctx.globalCompositeOperation='screen';ctx.translate(960,490);
        rays.forEach(r=>{
          const a=r.angle+(gentle?0:t*.012), length=1500*r.length*expansion;
          ctx.save();ctx.rotate(a);ctx.globalAlpha=(burst*.34+afterglow*.025)*(gentle?.3:1);
          const g=ctx.createLinearGradient(50,0,length,0);g.addColorStop(0,'rgba(255,224,164,.8)');g.addColorStop(.4,'rgba(255,178,86,.25)');g.addColorStop(1,'rgba(255,117,40,0)');
          ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(40,0);ctx.lineTo(length,-length*r.width);ctx.lineTo(length,length*r.width);ctx.closePath();ctx.fill();ctx.restore();
        });
        for(let i=0;i<3;i++){
          const radius=80+expansion*(700+i*190);ctx.globalAlpha=burst*(.2-i*.045)*(gentle?.25:1);
          ctx.strokeStyle='#ffd69b';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(0,0,radius,radius*.57,0,0,Math.PI*2);ctx.stroke();
        }ctx.restore();
        radial(960,480,900,[[0,`rgba(255,224,167,${afterglow*.13+burst*.18})`],[.35,'rgba(255,158,63,.055)'],[1,'rgba(255,100,20,0)']]);
      }
      metalTitle(t,smooth(3.2,5.6,t));subtitle(t,smooth(4.5,6.6,t));
      names(t,smooth(8,10.2,t));lowerTitles(t,smooth(10,12,t),smooth(12,14.2,t));
      // Optical finish: vignette, fine grain and one controlled exposure bloom.
      const vignette=ctx.createRadialGradient(960,520,350,960,540,1120);
      vignette.addColorStop(0,'rgba(0,0,0,0)');vignette.addColorStop(.7,'rgba(0,0,0,.12)');vignette.addColorStop(1,'rgba(0,0,0,.72)');
      ctx.fillStyle=vignette;ctx.fillRect(0,0,W,H);
      if(flash>.005){ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=flash*(gentle?.085:.62);ctx.fillStyle=lightning>impact?'#dcecff':'#ffe4ba';ctx.fillRect(0,0,W,H);ctx.restore();}
      if(t<1.5){ctx.fillStyle=`rgba(0,0,0,${.78*(1-smooth(.2,1.5,t))})`;ctx.fillRect(0,0,W,H);}
      ctx.restore();
    }
    return { render, duration:DURATION, width:W, height:H };
  }
  return { createRenderer, DURATION, chapters };
});
