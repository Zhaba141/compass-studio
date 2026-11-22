import {CompassBotFace} from './compass-face.js';
import {StudioSerial} from './serial.js';
import {CompassSounds,compassSounds} from './compass-sounds.js';

const names=['Нейтральный','Радостный','Восторг','Любопытный','Фокус','Сонный','Спит','Удивление','Озадачен','Подозрение','Злой','Раздражён','Грустит','Смущён','Нежность','Скучает','Испуг','Гордость','Озорство','Думает'];
const emoji=['◡','⌣','✦','◉','⌁','☾','–','✧','¿','◔','⌢','⌢','⌣','◡','♡','–','!','✦','✶','◇'];
const keys=CompassBotFace.emotions;
const desc=['Спокойное состояние Compass','Радость от внимания','Сильный восторг','Внимательно исследует мир','Полная концентрация','Пора отдыхать','Режим сна','Что-то неожиданное','Попытка разобраться','Кажется, что-то не так','Очень недоволен','Немного раздражён','Грустное настроение','Слегка стесняется','Нежность и привязанность','Нужны новые впечатления','Испуг и тревога','Гордится собой','Озорное настроение','Обдумывает ситуацию'];
const traitDefs=[['curiosity','Любопытство','Интерес к новым вещам и желание исследовать.','CURIOSITY'],['playfulness','Игривость','Как часто Compass стремится играть и веселиться.','PLAYFULNESS'],['calmness','Спокойствие','Склонность сохранять спокойную реакцию.','CALMNESS'],['sociability','Общительность','Насколько активно ищет общения.','SOCIABILITY'],['courage','Смелость','Реакция на неожиданности и незнакомое.','COURAGE']];
const defaults={color:'#9af3cf',blinkMs:3500,sensitivity:100,brightness:60,traits:{curiosity:75,playfulness:70,calmness:65,sociability:60,courage:55}};
const $=id=>document.getElementById(id);
const fmt=n=>Number.isFinite(Number(n))?Number(n).toFixed(1):'—';
// StudioLink can report accumulated Euler angles beyond +/-360 degrees.
// Normalize for display; keep the physical attitude preview away from edge-on
// orientations so the screen remains visible even at extreme readings.
const wrapDegrees=n=>Number.isFinite(n)?((n+180)%360+360)%360-180:NaN;
const poseDegrees=n=>Number.isFinite(n)?Math.sin(wrapDegrees(n)*Math.PI/180)*32:0;

const safeStore={get(k){try{return localStorage.getItem(k)}catch{return null}},set(k,v){try{localStorage.setItem(k,v)}catch{}}};
const merged=(()=>{try{const x=JSON.parse(safeStore.get('compass-studio-settings')||'{}');return {...defaults,...x,traits:{...defaults.traits,...(x.traits||{})}}}catch{return structuredClone(defaults)}})();
let settings=merged;let page='dashboard',emo='neutral',demo=true,real=null,compatible=false,events=0,lastTouch=0,lastEvent=0,pendingAI=false,toastTimer=null,renderCount=0;
let gazeSync=false;let lastPointer={x:0,y:0};let gazeTimer=null;
let history=(()=>{try{const x=JSON.parse(safeStore.get('compass-studio-history')||'[]');return Array.isArray(x)?x.slice(-200):[]}catch{return []}})();
const usb=new StudioSerial();
const sounds=new CompassSounds();
let soundCapable=false;
let lastSfxEmotion=-1;
const soundForEmotion={1:1,2:2,3:3,5:5,6:5,7:4,10:7,11:7,12:6,15:6,16:4};
const sfxCfg=(()=>{try {return {...{vol:22,auto:false,robot:true,browser:false},...JSON.parse(safeStore.get('compass-sfx-settings')||'{}')}}catch{return {vol:22,auto:false,robot:true,browser:false}}})();
/* One-time safety migration: older 2.1 versions enabled autoplay by default. */
if(safeStore.get('compass-sfx-loopfix-421')!=='1'){
  sfxCfg.auto=false;
  safeStore.set('compass-sfx-loopfix-421','1');
  safeStore.set('compass-sfx-settings',JSON.stringify(sfxCfg));
}
function persistSfx(){safeStore.set('compass-sfx-settings',JSON.stringify(sfxCfg));}
function sfxStatus(text){const el=$('sfx-status');if(el)el.textContent=text;}
function playBrowserSfx(id){sounds.setVolume(sfxCfg.vol);sounds.setEnabled(true);return sounds.play(id,{force:true}).catch(()=>false)}
async function sendSfx(command){if(!compatible||!soundCapable){sfxStatus('На роботе требуется StudioLink V4.2 (SOUND=1). Сайт играет локально.');return false;}
  try{await usb.send(command);return true;}catch(e){sfxStatus('USB: '+e.message);return false;}}
function initSfx(){
  $('sfx-volume').value=sfxCfg.vol;
  $('sfx-volume-out').textContent=sfxCfg.vol+'%';
  $('sfx-browser').checked=sfxCfg.browser;
  $('sfx-robot-enabled').checked=sfxCfg.robot;
  $('sfx-auto').checked=sfxCfg.auto;
  sounds.setEnabled(sfxCfg.browser);sounds.setVolume(sfxCfg.vol);
  for(let i=0;i<compassSounds.length;i++){
    const [name,detail]=compassSounds[i];const row=document.createElement('div');row.className='sfx-item';
    const desc=document.createElement('div');const title=document.createElement('strong');title.textContent=name;
    const sub=document.createElement('small');sub.textContent=detail;desc.append(title,sub);
    const webBtn=document.createElement('button');webBtn.className='btn btn-outline';webBtn.type='button';webBtn.textContent='▶ Сайт';
    webBtn.addEventListener('click',()=>playBrowserSfx(i));
    const devBtn=document.createElement('button');devBtn.className='btn btn-outline';devBtn.type='button';devBtn.textContent='♫ Робот';
    devBtn.addEventListener('click',async()=>{if(await sendSfx('PB_SOUND '+i))sfxStatus('Звук «'+name+'» отправлен на Compass.');});
    row.append(desc,webBtn,devBtn);$('sfx-buttons').append(row);
  }
  $('sfx-volume').addEventListener('input',e=>{sfxCfg.vol=+e.target.value;$('sfx-volume-out').textContent=sfxCfg.vol+'%';sounds.setVolume(sfxCfg.vol);persistSfx();});
  for(const [id,key] of [['sfx-browser','browser'],['sfx-robot-enabled','robot'],['sfx-auto','auto']]){
    $(id).addEventListener('change',e=>{sfxCfg[key]=e.target.checked;if(key==='browser')sounds.setEnabled(sfxCfg.browser);persistSfx();});}
  $('sfx-test').addEventListener('click',()=>playBrowserSfx(0));
  $('sfx-stop').addEventListener('click',async()=>{
    sfxCfg.auto=false;sfxCfg.robot=false;sfxCfg.browser=false;persistSfx();
    $('sfx-auto').checked=false;$('sfx-robot-enabled').checked=false;$('sfx-browser').checked=false;
    sounds.setEnabled(false);sounds.stop();
    if(compatible&&soundCapable){
      /* STOP is understood by V4.2.1; V4.2 understands the following
         fallback controls, so the same button is useful before upgrading. */
      try{await usb.send('PB_SOUND_STOP');}catch{}
      try{await usb.send('PB_SOUND_ON 0');await usb.send('PB_SOUND_AUTO 0');
        sfxStatus('СТОП отправлен. Динамик робота и автоматические звуки выключены.');}
      catch(e){sfxStatus('Звук сайта остановлен; USB: '+e.message);}
    }else{sfxStatus('Звук сайта остановлен. Для остановки робота подключи его по USB.');}
  });
  $('sfx-send-settings').addEventListener('click',async()=>{
    if(!await sendSfx('PB_VOLUME '+sfxCfg.vol))return;
    await sendSfx('PB_SOUND_ON '+(sfxCfg.robot?1:0));
    await sendSfx('PB_SOUND_AUTO '+(sfxCfg.auto?1:0));
    sfxStatus('Настройки переданы. Физический динамик работает только при статусе «ДИНАМИК ГОТОВ».');
  });
}

const labels={dashboard:'Панель управления',emotions:'Эмоции',sensors:'Датчики',personality:'Характер',chat:'Чат и голос',history:'История',sfx:'Звуки',appearance:'Внешность',firmware:'Прошивка'};
function toast(message,error=false){const box=$('toast');box.textContent=message;box.className='toast show'+(error?' error':'');clearTimeout(toastTimer);toastTimer=setTimeout(()=>box.className='toast',4200)}
function save(){safeStore.set('compass-studio-settings',JSON.stringify(settings))}
function log(type,text){history.push({type,text,at:new Date().toISOString(),live:!demo&&compatible});if(history.length>200)history.shift();safeStore.set('compass-studio-history',JSON.stringify(history));if(page==='history')paintHistory();paintRecent();$('dash-events').textContent=events}
function mode(){return compatible?'live':demo?'demo':'offline'}
function markMode(){
 const m=mode();$('mode-pill').textContent=m==='live'?'● USB · STUDIOLINK':m==='demo'?'● ДЕМО-РЕЖИМ':usb.connected?'● USB · НЕТ ПРОТОКОЛА':'● НЕ ПОДКЛЮЧЁН';$('mode-pill').classList.toggle('demo',m!=='live');
 $('side-led').classList.toggle('online',m==='live');$('side-state').textContent=m==='live'?'USB / живые данные':m==='demo'?'Демонстрационный режим':'Не подключён';$('face-mode').textContent=m==='live'?'USB · АКТИВЕН':m==='demo'?'ПРЕДПРОСМОТР':'ЛОКАЛЬНО';
 $('status-mode').textContent=m==='live'?'LIVE':m==='demo'?'ДЕМО':'ОФЛАЙН';$('sensor-badge').textContent=m==='live'?'РЕАЛЬНЫЕ ДАННЫЕ':m==='demo'?'ДЕМО':'ОФЛАЙН';
 $('dash-status').textContent=m==='live'?'На связи':m==='demo'?'Демо-режим':usb.connected?'Нет StudioLink':'Не подключён';$('dash-status-info').textContent=m==='live'?'USB · ESP32-S3':m==='demo'?'Пример данных. Не с робота':'Подключи USB-кабель';
 $('health-usb').textContent=m==='live'?'Подключено':m==='demo'?'Демо':usb.connected?'Порт открыт':'Нет соединения';$('bar-usb').style.width=m==='live'?'100%':m==='demo'?'27%':'0%';
 $('demo-btn').textContent=demo?'Выключить демо':'Включить демо';$('connect-btn').classList.toggle('hidden',usb.connected);$('disconnect-btn').classList.toggle('hidden',!usb.connected);
 $('dash-emotion-note').textContent=m==='live'?'Команда/устройство':m==='demo'?'Демонстрация':'Предпросмотр';$('footer-reality').textContent=m==='live'?'Реальные данные USB. Учётная запись сайта не подключена.':'Локальный интерфейс. Не связан с базой действующего сайта.';
 if(m==='offline')setNoTelemetry();
}
function setNoTelemetry(){for(const id of ['stat-tilt','stat-roll','stat-pitch','stat-touch','telemetry-gyro','telemetry-cal','telemetry-fps','telemetry-emo','telemetry-mind','telemetry-uptime','axis-roll','axis-pitch'])$(id).textContent='—';for(const id of ['bar-imu','bar-touch','bar-fps'])$(id).style.width='0%';$('gyro-object').style.transform='rotateX(12deg) rotateY(10deg)';$('health-imu').textContent='Ожидание';$('health-touch').textContent='Ожидание';$('health-fps').textContent='— FPS'}
function navigate(next){if(!labels[next])return;page=next;for(const el of document.querySelectorAll('.page'))el.classList.toggle('active',el.dataset.section===next);for(const el of document.querySelectorAll('[data-page]'))el.classList.toggle('active',el.dataset.page===next);$('page-name').textContent=labels[next];if(next==='history')paintHistory();window.scrollTo({top:0,behavior:'smooth'});}
function makeNav(){const mob=$('mobile-nav');for(const item of document.querySelectorAll('#nav .nav-item')){const b=document.createElement('button');b.dataset.page=item.dataset.page;b.textContent=item.textContent.trim();b.addEventListener('click',()=>navigate(item.dataset.page));mob.append(b);item.addEventListener('click',()=>navigate(item.dataset.page))}document.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.go)))}
function setEmotion(k,{send=true,record=true}={}){
 if(!keys.includes(k))return;emo=k;
 for(const id of ['bot-face','emotion-face'])$(id).setEmotion(k);
 $('selected-emotion').textContent=names[keys.indexOf(k)];$('emotion-message').textContent=desc[keys.indexOf(k)];$('dash-emotion').textContent=names[keys.indexOf(k)];
 document.querySelectorAll('[data-emotion]').forEach(b=>b.classList.toggle('selected',b.dataset.emotion===k));
 if(record){events++;log('emotion',`Выбрана эмоция: ${names[keys.indexOf(k)]}`)}
 if(send && sfxCfg.browser && soundForEmotion[keys.indexOf(k)]!==undefined &&
    (lastSfxEmotion!==keys.indexOf(k))){lastSfxEmotion=keys.indexOf(k);playBrowserSfx(soundForEmotion[lastSfxEmotion]);}
 if(send&&compatible){usb.send(`PB_EMO ${keys.indexOf(k)}`).then(()=>$('emotion-sync').textContent='Команда отправлена по USB. Ожидается подтверждение.').catch(e=>toast(e.message,true))}
 else $('emotion-sync').textContent=demo?'Демо: показывается на сайте, но не отправляется роботу':'Нет соединения с StudioLink: только предпросмотр';
}
function makeEmotions(){for(const k of keys){let i=keys.indexOf(k);for(const target of ['quick-emotions','all-emotions']){if(target==='quick-emotions'&&![0,1,3,7,10,14].includes(i))continue;let b=document.createElement('button');b.type='button';b.dataset.emotion=k;b.className=target==='quick-emotions'?'quick-emotion':'emotion-choice';if(target==='all-emotions'){const symbol=document.createElement('span');symbol.textContent=emoji[i];b.append(symbol,document.createTextNode(names[i]))}else b.textContent=names[i];b.addEventListener('click',()=>setEmotion(k));$(target).append(b)}}setEmotion('neutral',{send:false,record:false})}
function makeTraits(){const list=$('traits-list');for(const [id,title,info] of traitDefs){let box=document.createElement('div');box.className='trait-line';const lab=document.createElement('label');lab.htmlFor='trait-'+id;lab.textContent=title;let out=document.createElement('output');out.id='trait-out-'+id;out.textContent=settings.traits[id]+'%';lab.append(out);const text=document.createElement('p');text.textContent=info;const rng=document.createElement('input');rng.type='range';rng.min='0';rng.max='100';rng.step='1';rng.value=String(settings.traits[id]);rng.id='trait-'+id;rng.addEventListener('input',()=>{settings.traits[id]=+rng.value;out.textContent=rng.value+'%';save()});box.append(lab,text,rng);list.append(box)}}
let usbColorCapable=false;
let colorUpdateTimer=0;
let lastColorConfirmed=null;
function colorStatus(message){const el=$('color-sync-status');if(el)el.textContent=message;}
function sendEyeColor(){
  clearTimeout(colorUpdateTimer);
  if(!compatible){colorStatus('Цвет изменён на сайте. Подключи Compass по USB.');return Promise.resolve(false);}
  if(!usbColorCapable){colorStatus('На роботе StudioLink V4.0. Для смены цвета нужна прошивка V4.1.');return Promise.resolve(false);}
  const hex=settings.color.slice(1).toUpperCase();
  colorStatus('Отправляем #'+hex+' на Compass…');
  return usb.send('PB_COLOR '+hex).then(()=>true).catch(e=>{colorStatus('Ошибка отправки: '+e.message);return false});
}
function scheduleEyeColor(){
  clearTimeout(colorUpdateTimer);
  if(compatible && usbColorCapable)colorUpdateTimer=setTimeout(sendEyeColor,170);
  else colorStatus(compatible?'Требуется прошивка StudioLink V4.1.':'Цвет изменён только на сайте. Для робота нужен USB.');
}
function setTheme(){for(const id of ['bot-face','emotion-face','appearance-face'])$(id).setConfig({color:settings.color,blinkMs:settings.blinkMs,sensitivity:settings.sensitivity/100});$('eye-color').value=settings.color;$('eye-color-label').textContent=settings.color;$('eye-blink').value=settings.blinkMs;$('eye-blink-out').textContent=(settings.blinkMs/1000).toFixed(1).replace('.',',')+' с';$('eye-follow').value=settings.sensitivity;$('eye-follow-out').textContent=settings.sensitivity+'%';$('eye-bright').value=settings.brightness;$('eye-bright-out').textContent=settings.brightness+'%';save()}
function makeAppearance(){for(const c of ['#9af3cf','#a8b7ff','#f0b9d7','#f6cf91','#b2fa9d','#ffffff']){const b=document.createElement('button');b.className='swatch';b.type='button';b.title=c;b.style.background=c;b.addEventListener('click',()=>{settings.color=c;setTheme();scheduleEyeColor()});$('swatches').append(b)}for(const [input,key] of [['eye-color','color'],['eye-blink','blinkMs'],['eye-follow','sensitivity'],['eye-bright','brightness']]){$(input).addEventListener('input',e=>{settings[key]=key==='color'?e.target.value:+e.target.value;setTheme();if(key==='color')scheduleEyeColor()})}setTheme()}
function paintHistory(){const box=$('history-list');box.replaceChildren();$('history-count').textContent=history.length+' записей';if(!history.length){const d=document.createElement('div');d.className='caption-message';d.textContent='Пока нет событий. История начнёт заполняться после действий.';box.append(d);return;}for(const item of [...history].reverse().slice(0,160)){const row=document.createElement('div');row.className='history-entry';const sym=document.createElement('span');sym.textContent=item.type==='usb'?'⌘':item.type==='emotion'?'◈':item.type==='touch'?'☝':'◷';const body=document.createElement('div');const title=document.createElement('strong');title.textContent=item.text;const stamp=document.createElement('small');stamp.textContent=`${new Date(item.at).toLocaleString('ru-RU')} · ${item.live?'USB':'Локально'}`;body.append(title,stamp);row.append(sym,body);box.append(row)}}
function paintRecent(){const el=$('recent-events');el.replaceChildren();let items=history.slice(-3).reverse();if(!items.length){el.textContent='Событий пока нет';el.style.color='#6c967e';el.style.fontSize='12px';return}for(const item of items){const row=document.createElement('div');row.className='event';const sym=document.createElement('div');sym.className='event-symbol';sym.textContent=item.type==='touch'?'☝':'✦';const b=document.createElement('div');b.className='event-body';const strong=document.createElement('strong');strong.textContent=item.text;const small=document.createElement('small');small.textContent=new Date(item.at).toLocaleTimeString('ru-RU')+(item.live?' · USB':' · локально');b.append(strong,small);row.append(sym,b);el.append(row)}}
function dataView(data,synthetic=false){
 const n=k=>Number(data[k]);const v=(k,s='')=>Number.isFinite(n(k))?fmt(data[k])+s:'—';
 $('stat-tilt').textContent=data.tilt==='NA'?'NA':v('tilt','°');$('stat-roll').textContent=Number.isFinite(n('roll'))?fmt(wrapDegrees(n('roll')))+'°':'—';$('stat-pitch').textContent=Number.isFinite(n('pitch'))?fmt(wrapDegrees(n('pitch')))+'°':'—';$('stat-touch').textContent=Number.isFinite(n('touch'))?data.touch:'—';
 $('telemetry-gyro').textContent=v('gyro',' °/с');$('telemetry-cal').textContent=data.cal==='1'?'Калиброван':data.cal==='0'?'Не калиброван':'—';$('telemetry-fps').textContent=v('fps',' FPS');$('telemetry-emo').textContent=Number.isInteger(n('emo'))?names[n('emo')]||'—':'—';$('telemetry-mind').textContent=data.mind||'—';$('telemetry-uptime').textContent=Number.isFinite(n('up'))?Math.floor(n('up')/60)+' мин '+Math.floor(n('up')%60)+' сек':'—';
 $('axis-roll').textContent=Number.isFinite(n('roll'))?fmt(wrapDegrees(n('roll')))+'°':'—';$('axis-pitch').textContent=Number.isFinite(n('pitch'))?fmt(wrapDegrees(n('pitch')))+'°':'—';$('gyro-object').style.transform=`rotateX(${poseDegrees(n('pitch')).toFixed(2)}deg) rotateY(${poseDegrees(n('roll')).toFixed(2)}deg)`;
 $('health-imu').textContent=data.cal==='1'?'Готов':data.cal==='0'?'Не готов':'—';$('health-touch').textContent=Number.isFinite(n('touch'))?data.touch+' касаний':'—';$('health-fps').textContent=v('fps',' FPS');$('bar-imu').style.width=data.cal==='1'?'100%':'9%';$('bar-touch').style.width=Number.isFinite(n('touch'))?'100%':'0%';$('bar-fps').style.width=Number.isFinite(n('fps'))?Math.min(100,n('fps')/60*100)+'%':'0%';
 if(Number.isInteger(n('emo'))&&keys[n('emo')]){$('dash-emotion').textContent=names[n('emo')];if(!synthetic){$('dash-emotion-note').textContent='Получено от устройства'; if(emo!==keys[n('emo')])setEmotion(keys[n('emo')],{send:false,record:false})}}
 if(!synthetic && soundCapable && data.sfx!==undefined){const ready=String(data.sfx)==='1';$('sfx-capability').textContent=ready?'ДИНАМИК ГОТОВ':'ES8311 НЕ ЗАПУСТИЛСЯ';if(!ready)sfxStatus('Прошивка на связи, но ES8311 не запустился. Проверь журнал ESP-IDF.');}
 if(!synthetic){if(Number.isFinite(n('touch'))&&n('touch')>lastTouch){const diff=n('touch')-lastTouch;if(diff<50){events+=diff;log('touch',`Касания Compass: +${diff}`)}lastTouch=n('touch')}if(Number.isFinite(n('ev'))&&n('ev')>lastEvent){events+=Math.min(30,n('ev')-lastEvent);lastEvent=n('ev')}}
}
function demoPulse(){if(mode()!=='demo')return;const t=performance.now()/1000,roll=12*Math.sin(t*.49),pitch=14*Math.cos(t*.33);dataView({tilt:Math.abs(roll+pitch)*.65,roll,pitch,gyro:Math.abs(Math.sin(t))*1.7,cal:'1',fps:59.3,touch:Math.floor(t/22)%12,emo:keys.indexOf(emo),mind:'idle (демо)',up:Math.floor(t%3600)},true)}
let demoFrame=setInterval(demoPulse,1100);
function download(name,data,type='application/json'){const blob=new Blob([data],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function writeUSB(command){if(!compatible){toast('Команда применена только на сайте. Для робота нужен StudioLink по USB.',true);return Promise.resolve(false)}return usb.send(command).then(()=>true).catch(e=>{toast(e.message,true);return false})}
function wireButtons(){
 $('connect-btn').addEventListener('click',async()=>{try{await usb.connect();demo=false;markMode();toast('USB-порт открыт. Проверяем протокол StudioLink…')}catch(e){toast('USB: '+e.message,true)}});
 $('disconnect-btn').addEventListener('click',()=>usb.disconnect());
 $('demo-btn').addEventListener('click',()=>{demo=!demo;real=null;markMode();toast(demo?'Включён демонстрационный режим.':'Демонстрация выключена.')});
 $('auto-emotion').addEventListener('click',async()=>{const ok=await writeUSB('PB_AUTO');if(ok)toast('Compass вернулся к автоматическим эмоциям');setEmotion('neutral',{send:false})});
 $('reset-traits').addEventListener('click',()=>{settings.traits={...defaults.traits};save();for(const [id] of traitDefs){$('trait-'+id).value=settings.traits[id];$('trait-out-'+id).textContent=settings.traits[id]+'%'}toast('Локальный профиль восстановлен')});
 $('apply-traits').addEventListener('click',async()=>{if(!compatible){toast('Подключи робота с StudioLink для передачи характера.',true);return}for(const [id,,,cmd] of traitDefs){await usb.send(`PB_TRAIT ${cmd} ${settings.traits[id]}`)}$('traits-status').textContent='Настройки отправлены по USB';log('config','Параметры характера переданы роботу')});
 $('apply-color').addEventListener('click',()=>sendEyeColor());
 $('apply-bright').addEventListener('click',async()=>{if(await writeUSB(`PB_BRIGHT ${settings.brightness}`)){log('config',`Яркость AMOLED: ${settings.brightness}%`)}});
 $('auto-bright').addEventListener('click',()=>writeUSB('PB_AUTO_BRIGHT'));
 $('sync-gaze').addEventListener('change',async e=>{
   gazeSync=e.target.checked;
   if(gazeSync && !compatible){gazeSync=false;e.target.checked=false;toast('Для синхронизации взгляда подключи настоящий Compass.',true);return}
   if(!gazeSync)await writeUSB('PB_AUTO_GAZE');
   toast(gazeSync?'Передача направления взгляда активна.':'Робот снова управляет взглядом автоматически.');
 });
 $('reset-appearance').addEventListener('click',()=>{for(const k of ['color','blinkMs','sensitivity','brightness'])settings[k]=defaults[k];setTheme();scheduleEyeColor();toast('Стандартная палитра восстановлена')});
 $('export-theme').addEventListener('click',()=>download('compass-theme.json',JSON.stringify({color:settings.color,blinkMs:settings.blinkMs,sensitivity:settings.sensitivity,brightness:settings.brightness},null,2)));
 $('export-history').addEventListener('click',()=>download('compass-history.json',JSON.stringify({version:2,items:history},null,2)));
 $('clear-history').addEventListener('click',()=>{if(!confirm('Удалить локальную историю Compass Studio?'))return;history=[];events=0;safeStore.set('compass-studio-history','[]');paintHistory();paintRecent();$('dash-events').textContent='0'});
 $('speak-replies').addEventListener('change',()=>{safeStore.set('compass-speak',String($('speak-replies').checked))});$('speak-replies').checked=safeStore.get('compass-speak')==='true';
}
usb.addEventListener('connection',e=>{if(!e.detail.connected){compatible=false;usbColorCapable=false;soundCapable=false;clearTimeout(colorUpdateTimer);colorStatus('Цвет изменён только на сайте. USB отключён.');real=null;gazeSync=false;$('sync-gaze').checked=false;markMode();log('usb','USB отключён')}else log('usb','COM-порт открыт для проверки StudioLink')});
usb.addEventListener('info',e=>{compatible=e.detail.compatible;usbColorCapable=compatible&&e.detail.raw.includes('COLOR=1');soundCapable=compatible&&e.detail.raw.includes('SOUND=1');demo=false;markMode();if(compatible){$('sfx-capability').textContent=soundCapable?'ES8311 / USB':'НУЖНА V4.2';sfxStatus(soundCapable?'Протокол звуков доступен. Выбери звук для проверки динамика.':'Нужен StudioLink V4.2 для звука робота.');$('dash-fw').textContent=soundCapable?'StudioLink V4.2':usbColorCapable?'StudioLink V4.1':'StudioLink V4.0';log('usb','Протокол StudioLink подтверждён');toast('Compass подключён: StudioLink доступен');usb.send('PB_STATUS').catch(()=>{});if(usbColorCapable)sendEyeColor();else colorStatus('Эмоции и яркость работают. Для изменения цвета прошей StudioLink V4.1.');}else toast('USB-порт открыт, но прошивка не поддерживает StudioLink. Установи патч для ESP32.',true)});
usb.addEventListener('error',e=>toast('Устройство: '+e.detail,true));
usb.addEventListener('ack',e=>{if(e.detail.startsWith('COLOR ')){const color='#'+e.detail.substring(6).trim().toLowerCase();lastColorConfirmed=color;colorStatus('Цвет '+color+' применён на физическом Compass.');}if(e.detail.startsWith('EMO'))$('emotion-sync').textContent='Команда эмоции подтверждена устройством.'});
usb.addEventListener('telemetry',e=>{if(!compatible)return;real=e.detail;dataView(real,false)});
function voiceSetup(){const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;$('voice-state').textContent=Recognition?'Доступно в браузере':'Не поддерживается';$('voice-btn').disabled=!Recognition;if(Recognition){$('voice-btn').addEventListener('click',()=>{try{const r=new Recognition();r.lang='ru-RU';r.interimResults=false;r.onresult=e=>{$('chat-input').value=e.results[0][0].transcript};r.onerror=e=>toast('Микрофон: '+e.error,true);r.start();toast('Говори. Распознавание выполняет браузер.')}catch(e){toast(e.message,true)}})}}
function speak(text){if(!$('speak-replies').checked||!window.speechSynthesis)return;window.speechSynthesis.cancel();let u=new SpeechSynthesisUtterance(text);u.lang='ru-RU';u.rate=1.03;window.speechSynthesis.speak(u)}
function chatMessage(from,text){const row=document.createElement('div');row.className='msg '+from;row.append(document.createTextNode(text));const time=document.createElement('span');time.className='msg-time';time.textContent=new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});row.append(time);$('chat-messages').append(row);$('chat-messages').scrollTop=$('chat-messages').scrollHeight}
const russianEmos={'радост':1,'счаст':1,'весел':1,'восторг':2,'любопыт':3,'интерес':3,'фокус':4,'сонн':5,'спи':6,'удив':7,'злой':10,'злость':10,'груст':12,'нежн':14,'испуг':16,'горд':17,'озор':18,'думай':19,'нейтрал':0,'спокойн':0};
function chatLocal(text){let q=text.toLowerCase();if(/^(привет|здравствуй)/.test(q))return 'Привет! Я локальный помощник Compass Studio. Могу переключать эмоции. Для свободного общения подключи сервер ИИ.';
 if(/статус|подключ/.test(q))return compatible?'Compass подключён по USB. StudioLink активен.':'Сейчас нет подтверждённого StudioLink-соединения. Подключи Compass по USB.';
 if(/эмоц|покажи|будь|улыбни|выражени/.test(q)){for(const [term,id] of Object.entries(russianEmos))if(q.includes(term)){setEmotion(keys[id]);return `Переключаю выражение на «${names[id]}». ${compatible?'Команда отправлена роботу.':'Сейчас это только веб-предпросмотр.'}`};return 'Могу показать: радость, любопытство, удивление, грусть, сонный взгляд и другие эмоции. Напиши «покажи радость».'}
 return 'В локальном режиме я понимаю команды управления, но не веду свободный диалог. Для настоящего ИИ запусти сервер с OPENAI_API_KEY.'}
async function chatReply(text){
 if(pendingAI)return;
 pendingAI=true;
 try {
   try {
     const res=await fetch('/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:text,history:[...$('chat-messages').querySelectorAll('.msg')].slice(-12).map(el=>({role:el.classList.contains('user')?'user':'assistant',content:el.firstChild?.textContent||''}))})});
     if(res.ok){const obj=await res.json();if(obj.reply){chatMessage('bot',obj.reply);speak(obj.reply);return}}
   } catch {}
   const reply=chatLocal(text);chatMessage('bot',reply);speak(reply);
 } finally { pendingAI=false; }
}
async function chatHealth(){try{const r=await fetch('/api/health');if(!r.ok)return;const x=await r.json();if(x.ai){$('ai-state').textContent='Подключён';$('chat-mode').textContent='ИИ ЧЕРЕЗ СЕРВЕР';$('chat-subtitle').textContent='Ответы с подключённого сервера ИИ'}}catch{}}
function wireChat(){$('chat-form').addEventListener('submit',e=>{e.preventDefault();const field=$('chat-input');const value=field.value.trim();if(!value||pendingAI)return;field.value='';chatMessage('user',value);chatReply(value)});chatMessage('bot','Привет! Я Compass Studio. Можно выбрать эмоцию, посмотреть датчики или пообщаться со мной через сервер ИИ. Сейчас локальные команды работают без сети.');chatHealth();voiceSetup()}
async function loadOta(){const target=$('ota-container');const fallback=$('ota-placeholder');if(!window.isSecureContext)return;try{const r=await fetch('./firmware/manifest.json',{cache:'no-store'});if(!r.ok)return;const json=await r.json();if(!json.builds?.some(b=>b.chipFamily==='ESP32-S3'))return;const parts=json.builds[0].parts||[];if(!parts.length)return;const script=document.createElement('script');script.type='module';script.src='https://unpkg.com/esp-web-tools@10/dist/web/install-button.js?module';
    script.onload=()=>{if(customElements.get('esp-web-install-button')){fallback.classList.add('hidden');target.classList.remove('hidden')}else customElements.whenDefined('esp-web-install-button').then(()=>{fallback.classList.add('hidden');target.classList.remove('hidden')})};
    script.onerror=()=>{fallback.textContent='Установщик не загрузился. Проверь интернет и подключение ESP Web Tools.'};
    document.head.append(script);}catch{}}
window.addEventListener('pointermove',e=>{lastPointer={x:Math.round(Math.max(-27,Math.min(27,(e.clientX/window.innerWidth-.5)*54))),y:Math.round(Math.max(-22,Math.min(22,(e.clientY/window.innerHeight-.5)*44)))}});
/* Keep a manually enabled remote gaze alive while the cursor is stationary.
   Remote override expires in firmware after 10 s as a safety fallback. */
setInterval(()=>{if(gazeSync && compatible)usb.send(`PB_GAZE ${lastPointer.x} ${lastPointer.y}`).catch(()=>{})},1400);
window.addEventListener('blur',()=>{if(gazeSync && compatible)usb.send('PB_AUTO_GAZE').catch(()=>{});gazeSync=false;$('sync-gaze').checked=false});
makeNav();makeEmotions();makeTraits();makeAppearance();initSfx();wireButtons();wireChat();paintRecent();markMode();demoPulse();loadOta();
