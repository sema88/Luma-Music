(function(root){
  'use strict';
  function parseLrc(input){
    const lines=[];const offset=Number(String(input).match(/\[offset:\s*([+-]?\d+)\]/i)?.[1]||0);
    for(const raw of String(input).replace(/^\uFEFF/,'').split(/\r?\n/)){
      const stamps=[...raw.matchAll(/\[(\d{1,3}):([0-5]\d)(?:[.:](\d{1,3}))?\]/g)];
      if(!stamps.length)continue;
      const text=raw.replace(/\[[^\]]*\]/g,'').replace(/<\d+:\d+(?:\.\d+)?>/g,'').trim();
      for(const s of stamps)lines.push({time:Math.max(0,Number(s[1])*60000+Number(s[2])*1000+Number((s[3]||'').padEnd(3,'0'))+offset),text});
    }
    return lines.sort((a,b)=>a.time-b.time);
  }
  function activeLine(lines,position){let lo=0,hi=lines.length-1,result=-1;while(lo<=hi){const mid=(lo+hi)>>1;if(lines[mid].time<=position){result=mid;lo=mid+1;}else hi=mid-1;}return result;}
  function outputVolume(value){return .6*Math.pow(Math.max(0,Math.min(100,Number(value)||0))/100,2.2);}
  function preferences(raw={}){
    const {eq,eqEnabled,eqVersion,...saved}=raw;
    return {...saved,theme:['dark','light','system'].includes(raw.theme)?raw.theme:'dark',language:raw.language==='en'?'en':'ru',reducedMotion:!!raw.reducedMotion,solidGlass:!!raw.solidGlass,compact:!!raw.compact,autoSync:!!raw.autoSync,lyricsAuto:raw.lyricsAuto!==false,lyricsOffset:Math.max(-10000,Math.min(10000,Number(raw.lyricsOffset)||0)),volume:Math.max(0,Math.min(100,Number.isFinite(raw.volume)?raw.volume:65))};
  }
  function lyricsKey(track){return [track.name||'',track.artists||'',Math.round((track.duration||0)/1000)].join('|').toLocaleLowerCase();}
  class LyricsService{
    constructor({lrclib,genius}){Object.assign(this,{lrclib,genius});}
    async resolve(track,signal){
      const check=()=>{if(signal?.aborted)throw new DOMException('Aborted','AbortError');};check();let first;
      try{first=await this.lrclib(track,signal);}catch(e){check();if(e.name==='AbortError')throw e;}
      const hasText=value=>typeof value==='string'&&value.trim();check();if(first?.instrumental||hasText(first?.plainLyrics)||hasText(first?.syncedLyrics))return {...first,source:'lrclib'};
      const second=await this.genius(track,signal);check();return {...second,source:'genius',syncedLyrics:'',instrumental:false};
    }
  }
  root.LumaFeaturesCore={parseLrc,activeLine,preferences,lyricsKey,LyricsService,outputVolume};
  if(typeof module!=='undefined')module.exports=root.LumaFeaturesCore;
})(globalThis);
