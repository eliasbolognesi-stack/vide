"use strict";
/* =========================================================================
   Brasil 2026 — Vídeo da Copa com IA (site local, offline)
   Renderização em offscreen + grade cinematográfico (bloom, grão de filme,
   vinheta, barras, luz volumétrica, motion blur). Narração Web Speech/MP3.
   Música por Web Audio (livre de direitos) ou MP3.
   ========================================================================= */

const W = 1920, H = 1080;
const TRANS = 0.55;
const BAR = 70; // barras cinematográficas (letterbox)
const COLORS = { verde:"#009C3B", amarelo:"#FFDF00", azul:"#002776", branco:"#FFFFFF", gold:"#FFD700", dark:"#0B1A12" };

const canvas = document.getElementById("video");
const screen = canvas.getContext("2d");

/* offscreen onde as cenas são desenhadas (depois é "gradeado" p/ tela) */
const scn = document.createElement("canvas"); scn.width=W; scn.height=H;
let ctx = scn.getContext("2d");            // <- as cenas desenham aqui

/* canvas pequeno para bloom (brilho) */
const BW=480, BH=270;
const bloomC = document.createElement("canvas"); bloomC.width=BW; bloomC.height=BH;
const bctx = bloomC.getContext("2d");

/* textura de grão de filme */
const noiseC = document.createElement("canvas"); noiseC.width=256; noiseC.height=256;
(function(){ const nc=noiseC.getContext("2d"); const img=nc.createImageData(256,256);
  for(let i=0;i<img.data.length;i+=4){ const v=128+(Math.random()-0.5)*80; img.data[i]=img.data[i+1]=img.data[i+2]=v; img.data[i+3]=255; }
  nc.putImageData(img,0,0);
})();
const grainPattern = screen.createPattern(noiseC,"repeat");

/* ---------- utilidades ---------- */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const easeInOut=t=>t<0.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
function makeRand(seed){ let s=seed>>>0; return ()=>{ s=(s*1664525+1013904223)>>>0; return s/4294967296; }; }

function text(str,x,y,size,color,align="center",weight="800",family="Montserrat",shadow=true,alpha=1){
  ctx.save(); ctx.globalAlpha*=alpha;
  ctx.font=`${weight} ${size}px ${family}, Arial, sans-serif`;
  ctx.textAlign=align; ctx.textBaseline="middle";
  if(shadow){ ctx.shadowColor="rgba(0,0,0,.65)"; ctx.shadowBlur=size*0.3; ctx.shadowOffsetY=size*0.06; }
  ctx.fillStyle=color; ctx.fillText(str,x,y); ctx.restore();
}
function vgrad(c1,c2){ const g=ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,c1); g.addColorStop(1,c2); return g; }
function textAlpha(localT,dur){ return clamp(Math.min(localT/0.5,(dur-localT)/0.5,1),0,1); }

/* radial glow helper */
function glow(x,y,r,color,a){ const g=ctx.createRadialGradient(x,y,1,x,y,r); g.addColorStop(0,color); g.addColorStop(1,"rgba(0,0,0,0)");
  ctx.save(); ctx.globalAlpha=a; ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); ctx.restore(); }

/* ====================== IMAGENS DO USUÁRIO ====================== */
const bgImages={};
function drawUserImage(idx,p){
  const img=bgImages[idx]; if(!img) return false;
  const scale=lerp(1.06,1.18,easeInOut(p));
  const r=Math.max(W/img.width,H/img.height)*scale;
  const dw=img.width*r, dh=img.height*r;
  const dx=(W-dw)/2+Math.sin(p*Math.PI)*25, dy=(H-dh)/2-Math.cos(p*Math.PI)*12;
  ctx.drawImage(img,dx,dy,dw,dh);
  const ov=ctx.createLinearGradient(0,H*0.4,0,H); ov.addColorStop(0,"rgba(0,0,0,0)"); ov.addColorStop(1,"rgba(0,0,0,.62)");
  ctx.fillStyle=ov; ctx.fillRect(0,0,W,H);
  return true;
}

/* ====================== DADOS PRÉ-CALCULADOS ====================== */
const R=makeRand(20260613);
const stands=Array.from({length:1500},()=>({x:R(), d:R(), c:R(), fl:R()}));       // arquibancada (bokeh)
const bokeh=Array.from({length:42},()=>({x:R(), y:R(), c:R(), s:R()}));            // luzes desfocadas
const fans =Array.from({length:380},()=>({x:R(), row:Math.floor(R()*6), c:R(), ph:R()*6.28}));

function drawCrowd(t, yTop, yBot){
  for(const s of stands){
    const x=s.x*W;
    const y=lerp(yTop,yBot, Math.pow(s.d,1.3));
    const size=lerp(2.0,5.5,s.d);
    const warm=[ "#caa26a","#b98a5a","#d8b27a","#9a7a52" ];
    const cool=[ "#6a86b8","#90a0c0","#7a90b0" ];
    ctx.globalAlpha=lerp(0.35,0.85,s.d);
    ctx.fillStyle=(s.c<0.5?warm:cool)[Math.floor(s.c*4)%(s.c<0.5?4:3)];
    ctx.fillRect(x,y,size,size*1.2);
    if(s.fl>0.992){ const tw=Math.abs(Math.sin(t*8+s.c*40)); ctx.globalAlpha=tw; ctx.fillStyle="#fff"; ctx.fillRect(x-1,y-1,size+2,size+2); }
  }
  ctx.globalAlpha=1;
  // bokeh suave (luzes desfocadas) com brilho
  for(const b of bokeh){ const x=b.x*W, y=lerp(yTop,yBot*0.7,b.y); const r=lerp(8,26,b.s)*(0.8+0.2*Math.sin(t*2+b.c*10));
    glow(x,y,r,(b.c<0.4?"rgba(255,225,140,0.5)":b.c<0.7?"rgba(150,190,255,0.45)":"rgba(255,255,255,0.5)"),1); }
}

/* gramado em perspectiva com listras */
function drawPitch(topY,botY,topHW,botHW,cx,shade){
  const n=11;
  for(let k=0;k<n;k++){
    const eA=Math.pow(k/n,1.7), eB=Math.pow((k+1)/n,1.7);
    const yA=lerp(topY,botY,eA), yB=lerp(topY,botY,eB);
    const wA=lerp(topHW,botHW,eA), wB=lerp(topHW,botHW,eB);
    ctx.fillStyle = k%2? `rgb(${10+shade},${118+shade},${48})` : `rgb(${8+shade},${100+shade},${40})`;
    ctx.beginPath(); ctx.moveTo(cx-wA,yA); ctx.lineTo(cx+wA,yA); ctx.lineTo(cx+wB,yB); ctx.lineTo(cx-wB,yB); ctx.closePath(); ctx.fill();
  }
  // linhas
  ctx.strokeStyle="rgba(255,255,255,.5)"; ctx.lineWidth=4;
  const mY=lerp(topY,botY,0.55), mHW=lerp(topHW,botHW,0.55);
  ctx.beginPath(); ctx.ellipse(cx,mY,mHW*0.22,mHW*0.09,0,0,Math.PI*2); ctx.stroke(); // círculo central
  ctx.beginPath(); ctx.moveTo(cx-mHW,mY); ctx.lineTo(cx+mHW,mY); ctx.stroke();        // linha do meio
}

/* ====================== CENAS ====================== */
function sceneAbertura(p,t){
  ctx.fillStyle=vgrad("#05100a",COLORS.dark); ctx.fillRect(0,0,W,H);
  glow(W/2,H*0.42,950,`rgba(255,223,0,${0.16+0.05*Math.sin(t*2)})`,1);
  ctx.save(); ctx.translate(W/2,H*0.42); ctx.rotate(t*0.12); ctx.globalAlpha=0.06;
  for(let i=0;i<14;i++){ ctx.rotate(Math.PI*2/14); ctx.fillStyle=COLORS.amarelo; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(1500,-70); ctx.lineTo(1500,70); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  const a=textAlpha(p*5,5), pop=easeInOut(clamp(p*2.2,0,1));
  ctx.save(); ctx.translate(W/2,H*0.40); ctx.scale(lerp(0.9,1,pop),lerp(0.9,1,pop));
  text("BRASIL 2026",0,0,180,COLORS.amarelo,"center","400","Anton",true,a); ctx.restore();
  text("A Emoção que Une o Mundo",W/2,H*0.40+150,62,COLORS.branco,"center","700","Montserrat",true,a);
  text("VÍDEO COPA DO MUNDO • FEITO COM IA",W/2,H*0.84,28,"rgba(255,255,255,.8)","center","700","Montserrat",true,a);
}

function sceneEstadio(p,t){
  if(drawUserImage(1,p)) return;
  const z=lerp(1.04,1.14,easeInOut(p));
  ctx.save(); ctx.translate(W/2,H*0.5); ctx.scale(z,z); ctx.translate(-W/2,-H*0.5);
  // céu noturno + neblina
  ctx.fillStyle=vgrad("#0a1230","#16284e"); ctx.fillRect(0,0,W,H*0.55);
  glow(W/2,H*0.55,W*0.7,"rgba(120,150,210,0.25)",1);
  // estrutura escura da arquibancada superior
  ctx.fillStyle="#0a1326"; ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(W,0); ctx.lineTo(W,H*0.2);
  ctx.quadraticCurveTo(W/2,H*0.05,0,H*0.2); ctx.closePath(); ctx.fill();
  // multidão
  drawCrowd(t,H*0.16,H*0.52);
  // gramado
  drawPitch(H*0.52,H*1.06,W*0.20,W*0.98,W/2,0);
  // refletores com cone volumétrico + flare
  for(const fx of [0.13,0.4,0.6,0.87]){
    const lx=W*fx, ly=H*0.05;
    glow(lx,ly,300,"rgba(255,255,235,.85)",1);
    ctx.save(); ctx.globalAlpha=0.10; const cg=ctx.createLinearGradient(lx,ly,lx,H*0.6);
    cg.addColorStop(0,"rgba(255,255,235,.6)"); cg.addColorStop(1,"rgba(255,255,235,0)");
    ctx.fillStyle=cg; ctx.beginPath(); ctx.moveTo(lx,ly); ctx.lineTo(lx-220,H*0.6); ctx.lineTo(lx+220,H*0.6); ctx.closePath(); ctx.fill(); ctx.restore();
  }
  // neblina rasteira
  ctx.save(); ctx.globalAlpha=0.12; ctx.fillStyle="#dfe8ff"; ctx.fillRect(0,H*0.5,W,H*0.08); ctx.restore();
  ctx.restore();
  const a=textAlpha(p*7,7);
  text("Onde o mundo se encontra",W*0.06,H*0.84,60,COLORS.branco,"left","800","Montserrat",true,a);
}

function sceneTorcedores(p,t){
  if(drawUserImage(2,p)) return;
  ctx.fillStyle=vgrad("#2a1600","#5a2e00"); ctx.fillRect(0,0,W,H);
  drawCrowd(t,H*0.05,H*0.32);
  const pan=lerp(-70,70,p);
  ctx.save(); ctx.translate(pan,0);
  const flags=[["#009C3B","#FFDF00"],["#002776","#fff"],["#c8102e","#fff"],["#21468B","#fff"],["#046A38","#fff"],["#0055A4","#EF4135"]];
  for(const f of fans){
    const x=f.x*(W+220)-110, y=H*0.46+f.row*72+Math.sin(t*3+f.ph)*7;
    ctx.fillStyle=["#e0a07a","#c89","#b87"][Math.floor(f.c*3)%3];
    ctx.beginPath(); ctx.arc(x,y,15,0,Math.PI*2); ctx.fill();
    const sg=ctx.createLinearGradient(x-18,y,x+18,y); const base=[COLORS.amarelo,COLORS.verde,COLORS.azul,"#fff"][Math.floor(f.c*4)%4];
    sg.addColorStop(0,base); sg.addColorStop(1,"rgba(0,0,0,.25)");
    ctx.fillStyle=sg; ctx.fillRect(x-18,y+13,36,52);
    if(f.c>0.62){ const fc=flags[Math.floor(f.c*flags.length)%flags.length], wav=Math.sin(t*4+f.ph)*7;
      ctx.fillStyle=fc[0]; ctx.fillRect(x+20,y-34+wav,46,30);
      ctx.fillStyle=fc[1]; ctx.fillRect(x+20,y-34+wav+15,46,15);
      ctx.strokeStyle="#6b4"; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(x+20,y-34+wav); ctx.lineTo(x+20,y+12); ctx.stroke(); }
  }
  ctx.restore();
  const a=textAlpha(p*7,7);
  text("Nações, culturas e uma só paixão",W/2,H*0.86,58,COLORS.branco,"center","800","Montserrat",true,a);
}

function scenePlayers(p,t){
  if(drawUserImage(3,p)) return;
  ctx.fillStyle=vgrad("#0a1326","#08210f"); ctx.fillRect(0,0,W,H);
  drawCrowd(t,H*0.08,H*0.42);
  drawPitch(H*0.42,H*1.05,W*0.22,W*0.98,W/2,0);
  glow(W/2,H*0.55,650,"rgba(255,255,235,.18)",1);
  const enter=easeInOut(clamp(p*1.25,0,1));
  const kits=[COLORS.amarelo,COLORS.branco,COLORS.amarelo,COLORS.azul,COLORS.amarelo];
  for(let i=0;i<5;i++){
    const tx=lerp(-300,W*0.16+i*W*0.165,enter), y=H*0.6+(i%2)*36, bob=Math.sin(t*5+i)*7;
    drawPlayer(tx,y+bob,kits[i],t*6+i);
  }
  const a=textAlpha(p*7,7);
  text("Aqui nascem os heróis",W*0.94,H*0.16,62,COLORS.amarelo,"right","800","Montserrat",true,a);
}
function drawPlayer(x,y,kit,ph){
  ctx.save(); ctx.translate(x,y);
  ctx.fillStyle="rgba(0,0,0,.28)"; ctx.beginPath(); ctx.ellipse(0,165,70,16,0,0,Math.PI*2); ctx.fill();
  // pernas com passada
  const sw=Math.sin(ph)*16; ctx.strokeStyle="#e6b58c"; ctx.lineWidth=18; ctx.lineCap="round";
  ctx.beginPath(); ctx.moveTo(-12,40); ctx.lineTo(-12+sw,150); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(12,40); ctx.lineTo(12-sw,150); ctx.stroke();
  // shorts
  ctx.fillStyle=kit==="#FFFFFF"?"#1b1b1b":"#0e2a5a"; ctx.fillRect(-30,12,60,42);
  // camisa com sombreado
  const g=ctx.createLinearGradient(-42,-80,42,40); g.addColorStop(0,kit); g.addColorStop(1,"rgba(0,0,0,.3)");
  ctx.fillStyle=g; ctx.beginPath(); ctx.moveTo(-42,-78); ctx.lineTo(42,-78); ctx.lineTo(36,28); ctx.lineTo(-36,28); ctx.closePath(); ctx.fill();
  // cabeça
  ctx.fillStyle="#e6b58c"; ctx.beginPath(); ctx.arc(0,-108,28,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="rgba(0,0,0,.25)"; ctx.beginPath(); ctx.arc(6,-112,28,-0.4,1.2); ctx.fill();
  ctx.restore();
}

function sceneGol(p,t){
  if(bgImages[4]){ drawUserImage(4,p); }
  else{
    ctx.fillStyle=vgrad("#0a1326","#06210f"); ctx.fillRect(0,0,W,H);
    // multidão desfocada ao fundo
    drawCrowd(t,H*0.05,H*0.3);
    drawPitch(H*0.30,H*1.05,W*0.25,W*0.98,W/2,0);
    // rede em perspectiva
    const gx=W*0.30, gy=H*0.16, gw=W*0.40, gh=H*0.40;
    ctx.strokeStyle="#fff"; ctx.lineWidth=12; ctx.strokeRect(gx,gy,gw,gh);
    ctx.lineWidth=1.5; ctx.strokeStyle="rgba(255,255,255,.4)";
    for(let v=gx;v<=gx+gw;v+=22){ ctx.beginPath(); ctx.moveTo(v,gy); ctx.lineTo(lerp(v,W/2,0.12),gy+gh); ctx.stroke(); }
    for(let hh=gy;hh<=gy+gh;hh+=22){ ctx.beginPath(); ctx.moveTo(gx,hh); ctx.lineTo(gx+gw,hh); ctx.stroke(); }
    // bola com rastro (slow-mo)
    const bp=easeInOut(clamp(p/0.62,0,1));
    const path=k=>({x:lerp(W*0.10,W*0.5,k), y:lerp(H*0.82,H*0.42,k)-Math.sin(k*Math.PI)*150});
    for(let k=8;k>=1;k--){ const kk=clamp(bp-k*0.03,0,1), pt=path(kk); ctx.globalAlpha=0.07*(9-k); drawBall(pt.x,pt.y,30+k); }
    ctx.globalAlpha=1; const b=path(bp); drawBall(b.x,b.y,34);
  }
  if(p>0.58){ const gp=easeInOut(clamp((p-0.58)/0.25,0,1));
    ctx.save(); ctx.translate(W/2,H*0.5); ctx.scale(lerp(0.4,1.1,gp),lerp(0.4,1.1,gp));
    text("GOOOL!",0,0,220,COLORS.amarelo,"center","400","Anton",true,clamp(gp*1.5,0,1)); ctx.restore(); }
}
function drawBall(x,y,r){ ctx.save(); ctx.translate(x,y);
  const g=ctx.createRadialGradient(-r*0.3,-r*0.3,2,0,0,r); g.addColorStop(0,"#fff"); g.addColorStop(1,"#cfcfcf");
  ctx.fillStyle=g; ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.fill();
  ctx.fillStyle="#111"; for(let i=0;i<5;i++){ const a=i/5*Math.PI*2; ctx.beginPath(); ctx.arc(Math.cos(a)*r*0.45,Math.sin(a)*r*0.45,r*0.16,0,Math.PI*2); ctx.fill(); }
  ctx.restore(); }

let flagCanvas=null;
function buildFlag(){ flagCanvas=document.createElement("canvas"); flagCanvas.width=600; flagCanvas.height=420;
  const c=flagCanvas.getContext("2d");
  c.fillStyle=COLORS.verde; c.fillRect(0,0,600,420);
  c.fillStyle=COLORS.amarelo; c.beginPath(); c.moveTo(300,40); c.lineTo(560,210); c.lineTo(300,380); c.lineTo(40,210); c.closePath(); c.fill();
  c.fillStyle=COLORS.azul; c.beginPath(); c.arc(300,210,95,0,Math.PI*2); c.fill();
  c.strokeStyle="#fff"; c.lineWidth=10; c.beginPath(); c.arc(300,250,150,Math.PI*1.15,Math.PI*1.85); c.stroke();
}
function sceneComemoracao(p,t){
  if(drawUserImage(6,p)) return;
  ctx.fillStyle=vgrad("#063e1b","#0a6b2c"); ctx.fillRect(0,0,W,H);
  drawCrowd(t,H*0.04,H*0.32);
  if(!flagCanvas) buildFlag();
  const fx=W*0.5-300, fy=H*0.16;
  for(let sx=0;sx<600;sx+=10){ const off=Math.sin(t*3+sx*0.02)*24; ctx.drawImage(flagCanvas,sx,0,10,420,fx+sx,fy+off,10,420); }
  // silhuetas com braços
  ctx.fillStyle="rgba(0,0,0,.6)";
  for(let i=0;i<42;i++){ const x=i*(W/40)-20, y=H*0.93+Math.sin(t*4+i)*5;
    ctx.beginPath(); ctx.arc(x,y-42,20,0,Math.PI*2); ctx.fill(); ctx.fillRect(x-22,y-24,44,130);
    ctx.strokeStyle="rgba(0,0,0,.6)"; ctx.lineWidth=12;
    ctx.beginPath(); ctx.moveTo(x-18,y-12); ctx.lineTo(x-46,y-74-Math.sin(t*4+i)*10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x+18,y-12); ctx.lineTo(x+46,y-74-Math.cos(t*4+i)*10); ctx.stroke(); }
  const a=textAlpha(p*7,7);
  text("A emoção que todos compartilham",W/2,H*0.8,56,COLORS.branco,"center","800","Montserrat",true,a);
}

function sceneTaca(p,t){
  if(drawUserImage(5,p)) return;
  ctx.fillStyle=vgrad("#171005","#05110c"); ctx.fillRect(0,0,W,H);
  drawCrowd(t,H*0.05,H*0.28);
  glow(W/2,H*0.46,850,`rgba(255,210,0,${0.28+0.07*Math.sin(t*2)})`,1);
  const z=lerp(0.9,1.06,easeInOut(p));
  ctx.save(); ctx.translate(W/2,H*0.46); ctx.scale(z,z); drawTrophy(t); ctx.restore();
  const sr=makeRand(7);
  for(let i=0;i<30;i++){ const sx=W/2+(sr()-0.5)*760, sy=H*0.46+(sr()-0.5)*540, tw=Math.abs(Math.sin(t*3+i)); drawSparkle(sx,sy,6+tw*9,tw); }
  const a=textAlpha(p*7,7);
  text("O sonho tem nome: a Taça",W/2,H*0.88,58,COLORS.amarelo,"center","800","Montserrat",true,a);
}
function drawTrophy(t){
  ctx.save();
  const grad=ctx.createLinearGradient(-160,-260,160,260);
  grad.addColorStop(0,"#fff6c0"); grad.addColorStop(0.35,COLORS.gold); grad.addColorStop(0.55,"#fff0a0"); grad.addColorStop(0.8,"#caa106"); grad.addColorStop(1,"#8a6a00");
  ctx.strokeStyle="#6e5300"; ctx.lineWidth=5;
  ctx.fillStyle=grad;
  ctx.beginPath(); ctx.moveTo(-150,-250); ctx.quadraticCurveTo(-185,-30,0,45); ctx.quadraticCurveTo(185,-30,150,-250); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.lineWidth=24; ctx.strokeStyle=grad;
  ctx.beginPath(); ctx.arc(-150,-150,72,Math.PI*0.5,Math.PI*1.5,true); ctx.stroke();
  ctx.beginPath(); ctx.arc(150,-150,72,Math.PI*0.5,Math.PI*1.5,false); ctx.stroke();
  ctx.fillStyle=grad; ctx.fillRect(-26,45,52,150);
  ctx.beginPath(); ctx.moveTo(-125,255); ctx.lineTo(125,255); ctx.lineTo(82,195); ctx.lineTo(-82,195); ctx.closePath(); ctx.fill(); ctx.stroke();
  // faixas de reflexo metálico
  ctx.globalAlpha=0.5; ctx.fillStyle="rgba(255,255,255,.8)"; ctx.beginPath(); ctx.ellipse(-55,-150,16,95,0.2,0,Math.PI*2); ctx.fill();
  ctx.globalAlpha=0.25; ctx.beginPath(); ctx.ellipse(50,-140,9,80,-0.15,0,Math.PI*2); ctx.fill();
  // reflexo móvel (specular)
  ctx.globalAlpha=0.6; const sx=Math.sin(t)*60; ctx.fillStyle="rgba(255,255,255,.9)"; ctx.fillRect(sx-6,-240,12,260);
  ctx.restore();
}
function drawSparkle(x,y,s,a){ ctx.save(); ctx.globalAlpha=clamp(a,0,1); ctx.fillStyle="#fff"; ctx.translate(x,y);
  ctx.beginPath(); ctx.moveTo(0,-s); ctx.lineTo(s*0.2,-s*0.2); ctx.lineTo(s,0); ctx.lineTo(s*0.2,s*0.2); ctx.lineTo(0,s); ctx.lineTo(-s*0.2,s*0.2); ctx.lineTo(-s,0); ctx.lineTo(-s*0.2,-s*0.2); ctx.closePath(); ctx.fill(); ctx.restore(); }

function sceneMensagem(p,t){
  const g=ctx.createLinearGradient(0,0,W,H); const sh=0.5+0.5*Math.sin(t*0.6);
  g.addColorStop(0,COLORS.verde); g.addColorStop(clamp(sh,0.2,0.8),"#0f8a3a"); g.addColorStop(1,COLORS.amarelo);
  ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
  ctx.save(); ctx.globalAlpha=0.08; for(let i=0;i<6;i++){ ctx.fillStyle="#fff"; const yy=((t*120+i*200)%(H+200))-100; ctx.fillRect(0,yy,W,3);} ctx.restore();
  const a=textAlpha(p*7,7), pop=easeInOut(clamp(p*1.6,0,1));
  ctx.save(); ctx.shadowColor=COLORS.azul; ctx.shadowBlur=22;
  text("O futebol une o mundo.",W/2,H*0.42,84,COLORS.branco,"center","800","Montserrat",true,a); ctx.restore();
  ctx.save(); ctx.translate(W/2,H*0.58); ctx.scale(lerp(0.85,1,pop),lerp(0.85,1,pop));
  text("VAI, BRASIL!",0,0,150,COLORS.branco,"center","400","Anton",true,a); ctx.restore();
}

function sceneCreditos(p,t){
  ctx.fillStyle=vgrad("#06120d",COLORS.dark); ctx.fillRect(0,0,W,H);
  glow(W/2,H/2,900,"rgba(255,223,0,.10)",1);
  const a=clamp(p/0.5,0,1); const x=W*0.16; let y=H*0.22;
  const line=(label,val,big)=>{ text(label,x,y,30,COLORS.amarelo,"left","800","Montserrat",true,a); y+=46;
    text(val,x,y,big?64:40,COLORS.branco,"left","700","Montserrat",true,a); y+=big?96:78; };
  line("PROJETO",credits.projeto,true);
  line("INTEGRANTES",[credits.n1,credits.n2,credits.n3].filter(Boolean).join("  ·  "),false);
  line("FERRAMENTAS",credits.tools,false);
  text("Junho / 2026",x,y,30,"rgba(255,255,255,.7)","left","700","Montserrat",true,a);
}

const SCENES=[
  { name:"Abertura",    dur:5, draw:sceneAbertura,    narr:"" },
  { name:"Estádio",     dur:7, draw:sceneEstadio,     narr:"A Copa do Mundo é muito mais que um campeonato." },
  { name:"Torcedores",  dur:7, draw:sceneTorcedores,  narr:"É um evento que reúne nações, culturas e paixões." },
  { name:"Jogadores",   dur:7, draw:scenePlayers,     narr:"Dentro de campo surgem heróis." },
  { name:"Gol",         dur:8, draw:sceneGol,         narr:"Fora dele, milhões de pessoas compartilham a mesma emoção." },
  { name:"Taça",        dur:7, draw:sceneTaca,        narr:"O futebol une o mundo." },
  { name:"Comemoração", dur:7, draw:sceneComemoracao, narr:"" },
  { name:"Mensagem",    dur:7, draw:sceneMensagem,    narr:"Dois mil e vinte e seis chegou. E o Brasil está pronto para fazer história!" },
  { name:"Créditos",    dur:5, draw:sceneCreditos,    narr:"" },
];
const STARTS=[]; let TOTAL=0; for(const s of SCENES){ STARTS.push(TOTAL); TOTAL+=s.dur; }

/* ====================== CONFETE ====================== */
const confetti=[]; let confettiAcc=0;
const CONF_COLORS=[COLORS.verde,COLORS.amarelo,COLORS.azul,"#fff",COLORS.gold];
function spawnConfetti(n){ for(let i=0;i<n;i++) confetti.push({ x:Math.random()*W,y:-20,vx:(Math.random()-0.5)*60,vy:120+Math.random()*180,size:8+Math.random()*10,rot:Math.random()*6.28,vrot:(Math.random()-0.5)*8,color:CONF_COLORS[Math.floor(Math.random()*CONF_COLORS.length)] }); }
function updateConfetti(dt,intensity){
  confettiAcc+=intensity*dt*60; while(confettiAcc>=1){ spawnConfetti(1); confettiAcc-=1; }
  for(let i=confetti.length-1;i>=0;i--){ const c=confetti[i]; c.vy+=180*dt; c.x+=c.vx*dt; c.y+=c.vy*dt; c.rot+=c.vrot*dt;
    if(c.y>H+30){ confetti.splice(i,1); continue; }
    ctx.save(); ctx.translate(c.x,c.y); ctx.rotate(c.rot); ctx.fillStyle=c.color; ctx.fillRect(-c.size/2,-c.size/2,c.size,c.size*0.6); ctx.restore(); }
}
function confettiIntensity(idx,p){ if(idx===0) return p<0.6?1.0:0.2; if(idx===4) return p>0.6?3.2:0; if(idx===5) return 1.4; if(idx===6) return 3.2; if(idx===7) return 0.6; return 0; }

/* ====================== ÁUDIO ====================== */
let audioCtx=null,recordDest=null,musicDuck=null,musicMaster=null;
let musicSchedTimer=null,musicNodes=[],nextBeatTime=0,beatCount=0,useMp3Music=false,useMp3Narr=false;
const PROG=[[261.63,329.63,392.00],[196.00,246.94,392.00],[220.00,261.63,329.63],[174.61,220.00,261.63]];
const narrAudio=document.getElementById("narrAudio");
const musicAudio=document.getElementById("musicAudio");
function ensureAudio(){ if(audioCtx) return;
  audioCtx=new (window.AudioContext||window.webkitAudioContext)();
  recordDest=audioCtx.createMediaStreamDestination();
  musicMaster=audioCtx.createGain(); musicMaster.gain.value=0.16;
  musicDuck=audioCtx.createGain(); musicDuck.gain.value=1.0;
  musicMaster.connect(musicDuck); musicDuck.connect(audioCtx.destination); musicDuck.connect(recordDest);
  try{ audioCtx.createMediaElementSource(musicAudio).connect(musicDuck); }catch(e){}
  try{ const ns=audioCtx.createMediaElementSource(narrAudio), ng=audioCtx.createGain(); ng.gain.value=1.0; ns.connect(ng); ng.connect(audioCtx.destination); ng.connect(recordDest); }catch(e){}
}
function setDuck(on){ if(musicDuck&&audioCtx) musicDuck.gain.setTargetAtTime(on?0.35:1.0,audioCtx.currentTime,0.12); }
function startMusic(){ if(musicMuted) return; ensureAudio();
  if(useMp3Music){ musicAudio.currentTime=0; musicAudio.play().catch(()=>{}); return; }
  beatCount=0; nextBeatTime=audioCtx.currentTime+0.08; musicSchedTimer=setInterval(scheduleMusic,25); }
function scheduleMusic(){ if(!audioCtx) return; const beat=0.5;
  while(nextBeatTime<audioCtx.currentTime+0.15){ const bar=Math.floor(beatCount/4)%PROG.length;
    if(beatCount%4===0){ scheduleChord(nextBeatTime,PROG[bar],beat*4); scheduleBass(nextBeatTime,PROG[bar][0]/2,beat*4); }
    scheduleKick(nextBeatTime,beatCount%2===0); beatCount++; nextBeatTime+=beat; } }
function scheduleChord(time,freqs,dur){ for(const f of freqs){ const o=audioCtx.createOscillator(),g=audioCtx.createGain(),lp=audioCtx.createBiquadFilter();
  o.type="sawtooth"; o.frequency.value=f; lp.type="lowpass"; lp.frequency.value=1300;
  g.gain.setValueAtTime(0,time); g.gain.linearRampToValueAtTime(0.10,time+0.08); g.gain.linearRampToValueAtTime(0.0,time+dur);
  o.connect(lp); lp.connect(g); g.connect(musicMaster); o.start(time); o.stop(time+dur+0.05); musicNodes.push(o); } }
function scheduleBass(time,f,dur){ const o=audioCtx.createOscillator(),g=audioCtx.createGain(); o.type="triangle"; o.frequency.value=f;
  g.gain.setValueAtTime(0,time); g.gain.linearRampToValueAtTime(0.22,time+0.05); g.gain.linearRampToValueAtTime(0.0,time+dur);
  o.connect(g); g.connect(musicMaster); o.start(time); o.stop(time+dur+0.05); musicNodes.push(o); }
function scheduleKick(time,strong){ const o=audioCtx.createOscillator(),g=audioCtx.createGain(); o.type="sine";
  o.frequency.setValueAtTime(125,time); o.frequency.exponentialRampToValueAtTime(45,time+0.12);
  g.gain.setValueAtTime(strong?0.9:0.5,time); g.gain.exponentialRampToValueAtTime(0.001,time+0.18);
  o.connect(g); g.connect(musicMaster); o.start(time); o.stop(time+0.2); musicNodes.push(o); }
function stopMusic(){ if(musicSchedTimer){ clearInterval(musicSchedTimer); musicSchedTimer=null; }
  musicNodes.forEach(n=>{try{n.stop();}catch(e){}}); musicNodes=[]; try{musicAudio.pause();}catch(e){} }
let ptVoice=null;
function pickVoice(){ const vs=speechSynthesis.getVoices(); ptVoice=vs.find(v=>/pt[-_]?BR/i.test(v.lang))||vs.find(v=>/^pt/i.test(v.lang))||null; }
if("speechSynthesis" in window){ pickVoice(); speechSynthesis.onvoiceschanged=pickVoice; }
function speak(line){ if(!narrChk.checked||!("speechSynthesis" in window)||!line) return;
  const u=new SpeechSynthesisUtterance(line); u.lang="pt-BR"; if(ptVoice) u.voice=ptVoice; u.rate=1.0; u.pitch=1.0;
  u.onstart=()=>setDuck(true); u.onend=()=>setDuck(false); speechSynthesis.speak(u); }

/* ====================== LOOP + GRADE CINEMATOGRÁFICO ====================== */
let playing=false,startWall=0,elapsed=0,lastFrame=0,lastSceneIdx=-1,finished=false;
const playBtn=document.getElementById("playBtn"), bigStatus=document.getElementById("bigStatus");
const bar=document.getElementById("bar"), sceneLabel=document.getElementById("sceneLabel"), clock=document.getElementById("clock"), narrChk=document.getElementById("narrChk");
function sceneAt(e){ let i=SCENES.length-1; for(let k=0;k<SCENES.length;k++){ if(e>=STARTS[k]) i=k; } return i; }

function grade(){
  // bloom (brilho) via canvas reduzido
  bctx.clearRect(0,0,BW,BH); bctx.drawImage(scn,0,0,BW,BH);
  screen.clearRect(0,0,W,H);
  screen.drawImage(scn,0,0);
  screen.save(); screen.globalCompositeOperation="lighter"; screen.globalAlpha=0.32; screen.filter="blur(7px)";
  screen.drawImage(bloomC,0,0,W,H); screen.restore();
  // grão de filme animado
  screen.save(); screen.globalCompositeOperation="overlay"; screen.globalAlpha=0.07;
  const rx=-(Math.random()*220), ry=-(Math.random()*220); screen.translate(rx,ry); screen.fillStyle=grainPattern; screen.fillRect(-rx,-ry,W,H); screen.restore();
  // vinheta
  const vg=screen.createRadialGradient(W/2,H/2,H*0.35,W/2,H/2,W*0.75); vg.addColorStop(0,"rgba(0,0,0,0)"); vg.addColorStop(1,"rgba(0,0,0,.5)");
  screen.fillStyle=vg; screen.fillRect(0,0,W,H);
  // barras cinematográficas
  screen.fillStyle="#000"; screen.fillRect(0,0,W,BAR); screen.fillRect(0,H-BAR,W,BAR);
}

function render(now){
  requestAnimationFrame(render);
  const dt=lastFrame?Math.min((now-lastFrame)/1000,0.05):0; lastFrame=now;
  if(playing){ elapsed=(now-startWall)/1000; if(elapsed>=TOTAL){ elapsed=TOTAL; finish(); } }
  const idx=sceneAt(elapsed), localT=elapsed-STARTS[idx], s=SCENES[idx], p=clamp(localT/s.dur,0,1);
  if(playing && idx!==lastSceneIdx){ lastSceneIdx=idx; if(!useMp3Narr){ if(s.narr) speak(s.narr); else setDuck(false); } }

  ctx.clearRect(0,0,W,H);
  s.draw(p,elapsed);
  if(idx<SCENES.length-1 && localT>s.dur-TRANS){ const blend=(localT-(s.dur-TRANS))/TRANS;
    ctx.save(); ctx.globalAlpha=easeInOut(blend); SCENES[idx+1].draw(clamp(blend*TRANS/SCENES[idx+1].dur,0,1),elapsed); ctx.restore(); }
  updateConfetti(dt, playing?confettiIntensity(idx,p):0);
  const fd=Math.abs(elapsed-STARTS[5]); if(fd<0.22){ ctx.fillStyle=`rgba(255,255,255,${(1-fd/0.22)*0.85})`; ctx.fillRect(0,0,W,H); }
  if(elapsed<0.5){ ctx.fillStyle=`rgba(0,0,0,${1-elapsed/0.5})`; ctx.fillRect(0,0,W,H); }
  if(elapsed>TOTAL-0.7){ ctx.fillStyle=`rgba(0,0,0,${clamp((elapsed-(TOTAL-0.7))/0.7,0,1)})`; ctx.fillRect(0,0,W,H); }

  grade();

  bar.style.width=(elapsed/TOTAL*100)+"%";
  sceneLabel.textContent="Cena "+(idx+1)+"/"+SCENES.length+" · "+s.name;
  clock.textContent=elapsed.toFixed(1)+"s / "+TOTAL.toFixed(1)+"s";
}

function play(){ if(finished) reset(); ensureAudio(); if(audioCtx.state==="suspended") audioCtx.resume();
  playing=true; finished=false; lastSceneIdx=-1; startWall=performance.now()-elapsed*1000;
  bigStatus.style.opacity=0; playBtn.textContent="⏸ Pausar"; startMusic();
  if(useMp3Narr){ narrAudio.currentTime=Math.min(elapsed,narrAudio.duration||elapsed); narrAudio.play().catch(()=>{}); } }
function pause(){ playing=false; playBtn.textContent="▶ Reproduzir"; bigStatus.textContent="⏸ Pausado"; bigStatus.style.opacity=1;
  stopMusic(); if("speechSynthesis" in window) speechSynthesis.cancel(); try{narrAudio.pause();}catch(e){} }
function reset(){ playing=false; finished=false; elapsed=0; lastSceneIdx=-1; confetti.length=0;
  playBtn.textContent="▶ Reproduzir"; bigStatus.textContent="▶ Clique em Reproduzir"; bigStatus.style.opacity=1;
  stopMusic(); if("speechSynthesis" in window) speechSynthesis.cancel(); try{narrAudio.pause(); narrAudio.currentTime=0;}catch(e){} }
function finish(){ playing=false; finished=true; playBtn.textContent="↺ Reproduzir";
  bigStatus.textContent="✅ Fim — exporte ou reproduza de novo"; bigStatus.style.opacity=1; stopMusic();
  if(mediaRecorder&&mediaRecorder.state==="recording"){ setTimeout(()=>{try{mediaRecorder.stop();}catch(e){}},400); } }

/* ====================== EXPORTAÇÃO ====================== */
let mediaRecorder=null,chunks=[],exporting=false;
const exportBtn=document.getElementById("exportBtn"), exportNote=document.getElementById("exportNote");
function pickMime(){ const opts=["video/mp4;codecs=avc1.42E01E,mp4a.40.2","video/mp4","video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus","video/webm"];
  for(const m of opts){ if(window.MediaRecorder&&MediaRecorder.isTypeSupported(m)) return m; } return ""; }
function exportVideo(){ if(exporting) return; ensureAudio(); if(audioCtx.state==="suspended") audioCtx.resume(); reset();
  const mime=pickMime();
  let vstream;
  try{ vstream=canvas.captureStream(30); }
  catch(err){ exportNote.textContent="❌ Não dá para exportar com imagens abertas via arquivo. Use o INICIAR_VIDEO.bat (servidor local)."; exporting=false; exportBtn.disabled=false; playBtn.disabled=false; return; }
  const stream=new MediaStream([...vstream.getVideoTracks(),...recordDest.stream.getAudioTracks()]);
  try{ mediaRecorder=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream); }
  catch(e){ exportNote.textContent="❌ Seu navegador não suporta gravação. Use Chrome/Edge atualizado."; return; }
  chunks=[]; mediaRecorder.ondataavailable=e=>{ if(e.data.size>0) chunks.push(e.data); };
  mediaRecorder.onstop=()=>{ const type=(mime||"video/webm").split(";")[0]; const blob=new Blob(chunks,{type});
    const ext=type.includes("mp4")?"mp4":"webm"; const url=URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url; a.download="Copa_Mundo_2026_IA."+ext; a.click(); setTimeout(()=>URL.revokeObjectURL(url),4000);
    exporting=false; exportBtn.disabled=false; playBtn.disabled=false;
    exportNote.textContent=ext==="mp4"?"✅ Vídeo salvo em MP4!":"✅ Vídeo salvo em WebM. Converta em cloudconvert.com ou pelo VLC para MP4."; };
  exporting=true; exportBtn.disabled=true; playBtn.disabled=true;
  exportNote.textContent="⏺️ Gravando 60s em tempo real... não troque de aba. O download começa sozinho."; mediaRecorder.start(200); play(); }

/* ====================== CRÉDITOS + INPUTS ====================== */
const credits={ projeto:"Vídeo Copa do Mundo 2026 com IA", n1:"Elias", n2:"", n3:"", tools:"Leonardo.ai · Site Local (IA)" };
const bind=(id,key)=>{ const el=document.getElementById(id); el.addEventListener("input",()=>credits[key]=el.value); };
bind("cProjeto","projeto"); bind("cN1","n1"); bind("cN2","n2"); bind("cN3","n3"); bind("cTools","tools");
document.querySelectorAll(".imgInput").forEach(inp=>{ inp.addEventListener("change",e=>{ const f=e.target.files[0]; if(!f) return; const idx=+inp.dataset.scene;
  const img=new Image(); img.onload=()=>{ bgImages[idx]=img; }; img.src=URL.createObjectURL(f); }); });

/* AUTO-CARREGAR imagens salvas em ../04_Imagens (funciona pelo INICIAR_VIDEO.bat / localhost).
   Basta salvar os arquivos com estes nomes. Tenta jpg, jpeg, png e webp. */
const AUTO_NAMES={1:"estadio",2:"torcedores",3:"jogadores",4:"gol",5:"taca",6:"comemoracao"};
const AUTO_EXT=["jpg","jpeg","png","webp"];
let autoLoaded=0;
function autoLoad(idx,base,ei){ if(ei>=AUTO_EXT.length) return;
  const img=new Image();
  img.onload=()=>{ bgImages[idx]=img; autoLoaded++; const n=document.getElementById("exportNote");
    if(n && !exporting) n.textContent="🖼️ "+autoLoaded+" imagem(ns) de IA carregada(s) automaticamente de 04_Imagens."; };
  img.onerror=()=>autoLoad(idx,base,ei+1);
  img.src="../04_Imagens/"+base+"."+AUTO_EXT[ei];
}
Object.entries(AUTO_NAMES).forEach(([idx,base])=>autoLoad(+idx,base,0));
document.getElementById("narrFile").addEventListener("change",e=>{ const f=e.target.files[0]; if(!f) return; ensureAudio();
  narrAudio.src=URL.createObjectURL(f); useMp3Narr=true; narrChk.checked=false; narrChk.disabled=true; });
document.getElementById("musicFile").addEventListener("change",e=>{ const f=e.target.files[0]; if(!f) return; ensureAudio();
  musicAudio.src=URL.createObjectURL(f); useMp3Music=true; });

let musicMuted=false;
playBtn.addEventListener("click",()=>{ playing?pause():play(); });
document.getElementById("restartBtn").addEventListener("click",reset);
document.getElementById("muteBtn").addEventListener("click",()=>{ musicMuted=!musicMuted;
  document.getElementById("muteBtn").textContent="🎵 Música: "+(musicMuted?"OFF":"ON"); if(musicMuted) stopMusic(); else if(playing) startMusic(); });
exportBtn.addEventListener("click",exportVideo);
bigStatus.addEventListener("click",()=>{ playing?pause():play(); });
canvas.addEventListener("click",()=>{ if(!exporting){ playing?pause():play(); } });

requestAnimationFrame(render);
