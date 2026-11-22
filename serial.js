/* Project BOT StudioLink USB transport. A port is only touched after a user gesture.
   No automatic serial selection, no account operations, no fake hardware replies. */
export class StudioSerial extends EventTarget {
  constructor(){super();this.port=null;this.reader=null;this.writer=null;this.buffer='';this.connected=false;this.compatible=false;this.queue=Promise.resolve();this.readTask=null;this.timer=null;this.disconnecting=false}
  emit(kind,data){this.dispatchEvent(new CustomEvent(kind,{detail:data}))}
  async connect(){
    if(!navigator.serial)throw Error('Web Serial не поддерживается. Используй Chrome/Edge на localhost или HTTPS.');
    if(this.connected)return;
    const port=await navigator.serial.requestPort();
    await port.open({baudRate:115200,bufferSize:4096});
    this.port=port;this.connected=true;this.disconnecting=false;this.compatible=false;
    this.writer=port.writable.getWriter();this.reader=port.readable.getReader();
    this.emit('connection',{connected:true});
    this.readTask=this.readLoop();
    await this.send('PB_INFO');
    this.timer=setInterval(()=>{if(this.connected && this.compatible)this.send('PB_STATUS').catch(e=>this.emit('error',e.message))},1200);
  }
  async readLoop(){
    const decoder=new TextDecoder();
    try{
      while(this.reader && this.connected){
        const {value,done}=await this.reader.read();if(done)break;if(!value)continue;
        this.buffer+=decoder.decode(value,{stream:true});
        if(this.buffer.length>25000){this.buffer=this.buffer.slice(-8000)}
        let pos;
        while((pos=this.buffer.indexOf('\n'))>=0){const line=this.buffer.slice(0,pos).replace(/\r/g,'').trim();this.buffer=this.buffer.slice(pos+1);if(line)this.onLine(line)}
      }
    }catch(e){if(!this.disconnecting)this.emit('error',e.message||'Ошибка USB-чтения')}
    finally{if(!this.disconnecting)await this.disconnect()}
  }
  onLine(line){
    if(line.startsWith('PB_INFO ')){this.compatible=line.includes('STUDIOLINK=1');this.emit('info',{raw:line,compatible:this.compatible});return}
    if(line.startsWith('PB_ACK ')){this.emit('ack',line.substring(7));return}
    if(line.startsWith('PB_ERR ')){this.emit('error',line.substring(7));return}
    if(line.startsWith('PB_PONG')){this.emit('pong',true);return}
    if(line.startsWith('PB_DATA ')){
      const data={};for(const kv of line.substring(8).split(/\s+/)){let i=kv.indexOf('=');if(i>0)data[kv.substring(0,i)]=kv.substring(i+1)}
      this.emit('telemetry',data);return;
    }
    if(line.startsWith('PB_'))this.emit('protocol',line);
  }
  async send(line){
    if(!this.writer||!this.connected)throw Error('USB не подключён.');
    if(!/^PB_[A-Z_]+(?: [A-Za-z0-9_+\-.]+)*$/.test(line)||line.length>63)throw Error('Некорректная команда USB');
    const bytes=new TextEncoder().encode(line+'\n');
    this.queue=this.queue.catch(()=>{}).then(()=>this.writer.write(bytes));return this.queue;
  }
  async disconnect(){
    if(this.disconnecting)return;
    this.disconnecting=true;this.connected=false;this.compatible=false;
    if(this.timer){clearInterval(this.timer);this.timer=null}
    const reader=this.reader;this.reader=null;
    if(reader){try{await reader.cancel()}catch{}try{reader.releaseLock()}catch{}}
    const writer=this.writer;this.writer=null;
    if(writer){try{writer.releaseLock()}catch{}}
    const port=this.port;this.port=null;
    if(port){try{await port.close()}catch{}}
    this.emit('connection',{connected:false});this.disconnecting=false;
  }
}
