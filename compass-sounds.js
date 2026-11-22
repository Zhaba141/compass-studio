/* Project BOT / original procedural chirps. Never downloads or plays recordings. */
export const compassSounds=[
  ['Привет','Мягкое приветствие'],
  ['Радость','Два восходящих звука'],
  ['Восторг','Тройной восторженный сигнал'],
  ['Любопытство','Вопросительная интонация'],
  ['Удивление','Высокий восходящий сигнал'],
  ['Сон','Два затухающих звука'],
  ['Грусть','Мягкие нисходящие тоны'],
  ['Недовольство','Низкий короткий сигнал'],
  ['Касание','Короткий щебет'],
  ['Пробуждение','Плавный старт'],
];
const patterns=[
  [[480,660,95,22],[630,900,125,0]],
  [[540,770,85,16],[790,1110,110,0]],
  [[620,1050,80,11],[850,1350,95,10],[1040,1510,115,0]],
  [[560,710,115,15],[660,740,85,0]],
  [[310,1040,170,0]],
  [[550,410,200,15],[430,245,230,0]],
  [[510,405,155,12],[395,285,180,0]],
  [[380,310,125,28],[365,295,150,0]],
  [[690,910,82,0]],
  [[370,600,110,15],[520,870,130,0]],
];
export class CompassSounds{
  constructor(){this.context=null;this.level=0.18;this.enabled=false;this.lastPlay=0;this.voices=new Set();}
  setVolume(percent){this.level=Math.max(0,Math.min(60,Number(percent)||0))/100*.85;}
  setEnabled(value){this.enabled=Boolean(value);if(!this.enabled){this.stop();if(this.context)this.context.suspend().catch(()=>{});}}
  stop(){for(const osc of this.voices){try{osc.stop()}catch{}try{osc.disconnect()}catch{}}this.voices.clear();}
  async play(id,{force=false}={}){
    if(!force&&!this.enabled)return false;
    if(!Number.isInteger(id)||id<0||id>=patterns.length)return false;
    const Audio=window.AudioContext||window.webkitAudioContext;
    if(!Audio)return false;
    if(!this.context)this.context=new Audio();
    if(this.context.state==='suspended')await this.context.resume();
    let t=this.context.currentTime+0.008;
    for(const [from,to,ms,gap] of patterns[id]){
      const d=ms/1000;
      const osc=this.context.createOscillator();
      const gain=this.context.createGain();
      osc.type='sine';
      osc.frequency.setValueAtTime(from,t);
      osc.frequency.linearRampToValueAtTime(to,t+d);
      gain.gain.setValueAtTime(0,t);
      gain.gain.linearRampToValueAtTime(this.level,t+d*.13);
      gain.gain.setValueAtTime(this.level,t+d*.68);
      gain.gain.linearRampToValueAtTime(0.00001,t+d);
      osc.connect(gain).connect(this.context.destination);
      this.voices.add(osc);
      osc.start(t);osc.stop(t+d+0.015);
      osc.onended=()=>{this.voices.delete(osc);osc.disconnect();gain.disconnect();};
      t+=d+gap/1000;
    }
    return true;
  }
}
