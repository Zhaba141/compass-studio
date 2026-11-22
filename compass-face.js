/**
 * Project BOT · Compass Face for the web
 * Geometry sourced from V3.29's face/compass_v3/compass_data.inc.
 * Standalone browser custom element. No dependencies, no network, no auth or USB modifications.
 * Rendering is a visual Canvas 2D analogue, NOT bitwise-identical to ESP32 RGB565 rasterization.
 */
const EMOTION_KEYS = ['neutral','happy','excited','curious','focused','sleepy','sleeping','surprised','confused','suspicious','angry','annoyed','sad','shy','affectionate','bored','scared','proud','mischievous','thinking'];
const POSES = [[[78.0,112.0,28.0,0.0,0.0,0.0,149.0,222.0],[78.0,112.0,28.0,0.0,0.0,0.0,317.0,222.0]],[[92.0,52.0,25.0,0.0,17.0,22.0,149.0,212.0],[92.0,52.0,25.0,0.0,17.0,22.0,317.0,212.0]],[[85.0,136.0,29.0,-5.0,0.0,0.0,149.0,209.0],[85.0,136.0,29.0,5.0,0.0,0.0,317.0,209.0]],[[66.0,89.0,24.0,-8.0,0.0,2.0,163.0,215.0],[92.0,126.0,32.0,-8.0,0.0,-4.0,331.0,203.0]],[[96.0,41.0,13.0,8.0,-8.0,0.0,149.0,225.0],[96.0,41.0,13.0,-8.0,-8.0,0.0,317.0,225.0]],[[92.0,38.0,18.0,3.0,-12.0,-8.0,149.0,244.0],[88.0,31.0,14.0,-3.0,-11.0,-7.0,317.0,244.0]],[[89.0,12.0,6.0,0.0,-15.0,-15.0,149.0,252.0],[89.0,12.0,6.0,0.0,-15.0,-15.0,317.0,252.0]],[[82.0,142.0,41.0,0.0,0.0,0.0,149.0,203.0],[82.0,142.0,41.0,0.0,0.0,0.0,317.0,203.0]],[[91.0,41.0,16.0,-15.0,3.0,-5.0,142.0,231.0],[70.0,105.0,25.0,14.0,-6.0,3.0,310.0,209.0]],[[103.0,44.0,17.0,3.0,-12.0,-4.0,172.0,227.0],[68.0,58.0,23.0,6.0,-10.0,-3.0,340.0,233.0]],[[103.0,59.0,11.0,20.0,-15.0,2.0,149.0,228.0],[103.0,59.0,11.0,-20.0,-15.0,2.0,317.0,228.0]],[[102.0,39.0,11.0,-7.0,-17.0,0.0,129.0,220.0],[87.0,49.0,12.0,-7.0,-12.0,0.0,297.0,226.0]],[[83.0,69.0,24.0,-15.0,-14.0,-8.0,149.0,245.0],[83.0,69.0,24.0,15.0,-14.0,-8.0,317.0,245.0]],[[63.0,59.0,25.0,-6.0,5.0,13.0,126.0,238.0],[57.0,42.0,21.0,-6.0,4.0,12.0,294.0,245.0]],[[90.0,69.0,30.0,6.0,8.0,21.0,149.0,218.0],[90.0,69.0,30.0,-6.0,8.0,21.0,317.0,218.0]],[[104.0,26.0,11.0,0.0,0.0,0.0,164.0,239.0],[104.0,26.0,11.0,0.0,0.0,0.0,332.0,239.0]],[[58.0,132.0,27.0,-9.0,-1.0,4.0,149.0,210.0],[58.0,132.0,27.0,9.0,-1.0,4.0,317.0,210.0]],[[89.0,52.0,19.0,-9.0,1.0,8.0,149.0,198.0],[89.0,52.0,19.0,9.0,1.0,8.0,317.0,198.0]],[[104.0,45.0,23.0,-8.0,13.0,19.0,161.0,214.0],[62.0,25.0,12.0,-12.0,9.0,13.0,329.0,223.0]],[[79.0,72.0,22.0,-4.0,-5.0,4.0,173.0,201.0],[71.0,88.0,21.0,5.0,-2.0,0.0,341.0,189.0]]];
const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const lerp=(a,b,t)=>a+(b-a)*t;
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t)};
const exposed=Object.freeze([...EMOTION_KEYS]);

export class CompassBotFace extends HTMLElement {
  static get observedAttributes(){return ['emotion','follow-cursor','paused'];}
  static get emotions(){return exposed;}
  constructor(){
    super();
    const root=this.attachShadow({mode:'open'});
    root.innerHTML=`<style>
      :host { display:block; position:relative; width:100%; min-width:0; --face-mint:#9af3cf; }
      .frame { aspect-ratio:1; width:100%; position:relative; border-radius:50%; background:radial-gradient(circle at 45% 35%,#07130f 0,#010503 68%,#000 100%); padding:4.5%; box-sizing:border-box; box-shadow:0 18px 45px #0007,0 0 0 1px #6a9b813b,0 0 0 8px #1b302a,0 0 0 11px #56796a88,0 0 0 16px #10221b; }
      canvas { display:block; width:100%; height:100%; border-radius:50%; background:#000; }
      .frame:after { pointer-events:none;content:"";position:absolute;inset:4.5%;border-radius:50%;box-shadow:inset 0 1px 15px #567b593b; }
      @media (prefers-reduced-motion:reduce){ .frame{transition:none} }
    </style><div class="frame" part="housing"><canvas part="screen" width="466" height="466" aria-label="Интерактивные глаза робота Compass" role="img"></canvas></div>`;
    this.canvas=root.querySelector('canvas');
    this.ctx=this.canvas.getContext('2d',{alpha:false});
    this.eyes=POSES[0].map(arr=>[...arr]);
    this.vel=POSES[0].map(()=>Array(8).fill(0));
    this.gaze=[0,0];this.targetGaze=[0,0];
    this._emotion='neutral';this._frame=0;this._last=0;this._started=0;this._blinkAt=0;this._double=false;
    this._random=0x85f01;this._currentPointer=false;this._pointerTime=0;this._blinkMs=3500;this._sensitivity=1;this._faceColor='#9af3cf';
    this._onMove=e=>this.onPointer(e);
    this._onOut=e=>{if(!e.relatedTarget)this.resetGaze()};
    this._onBlur=()=>this.resetGaze();
    this._onTouch=()=>{this.setEmotion('happy');clearTimeout(this._touchTimeout);this._touchTimeout=setTimeout(()=>this.setEmotion('neutral'),1400)};
    this._onVisibility=()=>{if(!document.hidden){this._last=0;this.start()}else this.stop()};
  }
  connectedCallback(){
    if(!this.hasAttribute('emotion'))this.setAttribute('emotion','neutral');
    this._emotion=this.getAttribute('emotion')||'neutral';
    this._started=performance.now(); this._blinkAt=this._started+3000;
    window.addEventListener('pointermove',this._onMove,{passive:true});
    window.addEventListener('pointerout',this._onOut,{passive:true});
    window.addEventListener('blur',this._onBlur);
    document.addEventListener('visibilitychange',this._onVisibility);
    this.canvas.addEventListener('pointerdown',this._onTouch,{passive:true});
    this.start();
  }
  disconnectedCallback(){
    this.stop();clearTimeout(this._touchTimeout);
    window.removeEventListener('pointermove',this._onMove);
    window.removeEventListener('pointerout',this._onOut);
    window.removeEventListener('blur',this._onBlur);
    document.removeEventListener('visibilitychange',this._onVisibility);
    this.canvas.removeEventListener('pointerdown',this._onTouch);
  }
  attributeChangedCallback(name,oldValue,newValue){
    if(name==='emotion')this._emotion=EMOTION_KEYS.includes(newValue)?newValue:'neutral';
    if(name==='paused' && this.isConnected){newValue!==null?this.stop():this.start()}
  }
  get emotion(){return this._emotion;}
  set emotion(name){this.setEmotion(name);}
  setEmotion(name){if(EMOTION_KEYS.includes(name))this.setAttribute('emotion',name);}
  setConfig({color,blinkMs,sensitivity}={}){
    if(typeof color==='string' && /^#[0-9a-fA-F]{6}$/.test(color))this._faceColor=color;
    if(Number.isFinite(blinkMs))this._blinkMs=clamp(blinkMs,1600,7200);
    if(Number.isFinite(sensitivity))this._sensitivity=clamp(sensitivity,0,1.5);
  }
  get followCursor(){return this.getAttribute('follow-cursor')!=='false';}
  resetGaze(){this._currentPointer=false;this.targetGaze=[0,0];}
  onPointer(e){
    if(!this.followCursor)return;
    // Map the entire browser viewport to firmware gaze limits (±27, ±22 px).
    const x=(e.clientX/window.innerWidth-.5)*2;
    const y=(e.clientY/window.innerHeight-.5)*2;
    this.targetGaze=[clamp(x,-1,1)*27*this._sensitivity,clamp(y,-1,1)*22*this._sensitivity];
    this._currentPointer=true;
  }
  start(){if(!this._frame && !this.hasAttribute('paused') && !document.hidden)this._frame=requestAnimationFrame(t=>this.tick(t))}
  stop(){if(this._frame){cancelAnimationFrame(this._frame);this._frame=0}this._last=0}
  nextRandom(){let x=this._random;x^=x<<13;x^=x>>>17;x^=x<<5;this._random=x>>>0;return this._random}
  tick(t){
    this._frame=0;
    const dt=clamp(this._last?(t-this._last)/1000:1/60,.001,.05);
    this._last=t;
    const pose=POSES[EMOTION_KEYS.indexOf(this._emotion)];
    // Firmware-like damped spring, including cross-emotion velocity preservation.
    const inTimes=[270,330,240,430,250,650,900,170,420,350,220,310,630,520,480,560,170,430,350,420];
    const secs=clamp(inTimes[EMOTION_KEYS.indexOf(this._emotion)]/1000,.30,.85);
    const omega=4.75/secs;
    const decay=Math.exp(-omega*dt);
    for(let i=0;i<2;i++)for(let k=0;k<8;k++){
      const old=this.eyes[i][k], vel=this.vel[i][k], target=pose[i][k];
      const dx=old-target;
      this.eyes[i][k]=target+(dx+(vel+omega*dx)*dt)*decay;
      this.vel[i][k]=(vel-omega*(vel+omega*dx)*dt)*decay;
    }
    const g=1-Math.exp(-dt*1000/105);
    this.gaze[0]=lerp(this.gaze[0],this.targetGaze[0],g);
    this.gaze[1]=lerp(this.gaze[1],this.targetGaze[1],g);
    const elapsed=t-this._started;
    if(t>this._blinkAt){
      this._blinkAt=t+this._blinkMs*.8+(this.nextRandom()%Math.round(this._blinkMs*.4));
      this._blinkStart=t;this._double=(this.nextRandom()%100)<14;
    }
    let blink=0;
    if(this._blinkStart){
      const age=t-this._blinkStart;
      const fn=a=>a<0?0:a<90?smooth(a/90):a<220?1-smooth((a-90)/130):0;
      blink=Math.max(fn(age),this._double?fn(age-248):0);
      if(age>500)this._blinkStart=0;
    }
    this.draw(elapsed,blink);
    this.start();
  }
  draw(ms,blink){
    const c=this.ctx;
    c.fillStyle='#000';c.fillRect(0,0,466,466);
    // Tiny saccades are shared by both eyes, as in the firmware.
    const k=Math.floor(ms/1800);const phase=smooth((ms%1800)/330);
    const hash=n=>{let x=(n|0)>>>0;x=Math.imul(x^x>>>16,0x7feb352d);x=Math.imul(x^x>>>15,0x846ca68b);return (x^x>>>16)>>>0};
    const jitterX=lerp(hash(k)%7,hash(k+1)%7,phase)-3;
    const jitterY=lerp(hash(k+29)%5,hash(k+30)%5,phase)-2;
    for(let i=0;i<2;i++){
      const [w,h,r,angle,upper,lower,x,y]=this.eyes[i];
      this.drawEye(c,{w,h,r,angle,upper:upper*(1-blink),lower:lower*(1-blink),x:x+this.gaze[0]+jitterX,y:y+this.gaze[1]+jitterY+4*blink},blink);
    }
  }
  _tint(factor){const c=this._faceColor;let rgb=[1,3,5].map(i=>parseInt(c.slice(i,i+2),16));return `rgb(${rgb.map(x=>clamp(Math.round(x*factor),0,255)).join(',')})`;}
  drawEye(c,e,blink){
    const w=Math.max(4,e.w), h=Math.max(6,lerp(e.h,6,blink));
    const halfW=w/2, halfH=h/2;
    const r=clamp(e.r,1,Math.min(halfW,halfH));
    c.save();c.translate(e.x,e.y);c.rotate(e.angle*Math.PI/180);
    // Curved lid contour over the same rounded-rectangle basic geometry.
    const top=-halfH,bottom=halfH;
    const upper=clamp(e.upper,-h*.42,h*.42);
    const lower=clamp(e.lower,-h*.42,h*.42);
    c.beginPath();
    c.moveTo(-halfW,top+r);
    c.quadraticCurveTo(-halfW,top,-halfW+r,top);
    c.quadraticCurveTo(0,top+upper,halfW-r,top);
    c.quadraticCurveTo(halfW,top,halfW,top+r);
    c.lineTo(halfW,bottom-r);
    c.quadraticCurveTo(halfW,bottom,halfW-r,bottom);
    c.quadraticCurveTo(0,bottom+lower,-halfW+r,bottom);
    c.quadraticCurveTo(-halfW,bottom,-halfW,bottom-r);
    c.closePath();
    const gradient=c.createLinearGradient(0,-halfH,0,halfH);
    gradient.addColorStop(0,this._tint(1.06));gradient.addColorStop(.50,this._faceColor);gradient.addColorStop(1,this._tint(.74));
    c.fillStyle=gradient;c.shadowColor=this._faceColor;c.shadowBlur=6;c.fill();
    c.clip();c.shadowBlur=0;
    if(h>28){
      c.strokeStyle='rgba(226,255,242,.13)';c.lineWidth=1.8;
      c.beginPath();c.moveTo(-w*.37,-h*.22);c.lineTo(-w*.37,-h*.11);c.stroke();
    }
    c.restore();
  }
}
if(!customElements.get('compass-bot-face'))customElements.define('compass-bot-face',CompassBotFace);
