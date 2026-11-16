(function(root){
  'use strict';
  const providers=new Set(['spotify','soundcloud']);
  function parseLink(value){
    let u;try{u=new URL(String(value).trim());}catch{return null;}
    if(u.protocol!=='https:'||u.username||u.password||u.port)return null;
    if(u.hostname==='open.spotify.com'){
      const match=u.pathname.match(/^\/(?:intl-[a-z]{2}\/)?track\/([a-zA-Z0-9]{22})\/?$/);
      return match?{source:'spotify',id:match[1],key:'spotify:'+match[1],url:'https://open.spotify.com/track/'+match[1]}:null;
    }
    if(!['soundcloud.com','www.soundcloud.com'].includes(u.hostname))return null;
    const parts=u.pathname.split('/').filter(Boolean);
    if(parts.length!==2||parts.some(x=>!/^[-a-zA-Z0-9_]+$/.test(x))||['search','discover','you','settings','stream','stations','tags','pages'].includes(parts[0])||['sets','likes','tracks','albums','reposts','popular-tracks'].includes(parts[1]))return null;
    const path=parts.join('/');return {source:'soundcloud',id:path,key:'soundcloud:'+path,url:'https://soundcloud.com/'+path};
  }
  function safeImage(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}}
  function manualTrack(parsed,metadata={},fields={}){
    if(!parsed||!parseLink(parsed.url))throw new Error('Нужна полная ссылка на отдельный трек Spotify или SoundCloud.');
    const artists=String(fields.artists||metadata.author_name||(parsed.source==='soundcloud'?parsed.id.split('/')[0].replace(/-/g,' '):'')).trim().slice(0,300);
    const genres=String(fields.genres||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean).slice(0,8);
    return {id:parsed.id,key:parsed.key,source:parsed.source,url:parsed.url,uri:parsed.source==='spotify'?'spotify:track:'+parsed.id:'',
      name:String(fields.name||metadata.title||decodeURIComponent(parsed.url.split('/').pop()).replace(/-/g,' ')).trim().slice(0,500),artists,artistNames:artists?[artists]:[],
      customName:!!String(fields.name||'').trim(),customArtist:!!String(fields.artists||'').trim(),image:safeImage(metadata.thumbnail_url),duration:Math.max(0,Number(metadata.duration)||0),playCount:Number.isFinite(metadata.playback_count)&&metadata.playback_count>=0?metadata.playback_count:null,playable:true,explicit:false,album:'',genres,genreHints:genres,addedAt:new Date().toISOString()};
  }
  function normalizeTrack(value){
    if(!value||!providers.has(value.source))return null;const p=parseLink(value.url);if(!p||p.source!==value.source)return null;
    return {...value,id:p.id,key:p.key,source:p.source,url:p.url,uri:p.source==='spotify'?'spotify:track:'+p.id:'',name:String(value.name||p.id).slice(0,500),artists:String(value.artists||'').slice(0,300),image:safeImage(value.image),duration:Math.max(0,Number(value.duration)||0),genres:Array.isArray(value.genres)?value.genres.slice(0,8).map(String):[]};
  }
  function empty(){return {version:1,tracks:{},liked:[],hiddenLiked:{},playlists:[],blocked:{spotify:[],soundcloud:[]}};}
  function normalize(value){
    const result=empty();for(const raw of Object.values(value?.tracks||{})){const t=normalizeTrack(raw);if(t)result.tracks[t.key]=t;}
    result.liked=[...new Set((value?.liked||[]).filter(k=>result.tracks[k]))];
    for(const [account,keys] of Object.entries(value?.hiddenLiked||{}))if(account&&Array.isArray(keys))Object.defineProperty(result.hiddenLiked,account,{value:[...new Set(keys.filter(k=>typeof k==='string'&&/^spotify:[a-zA-Z0-9]{22}$/.test(k)))],enumerable:true,writable:true,configurable:true});
    result.playlists=(value?.playlists||[]).filter(p=>p&&/^[a-zA-Z0-9-]{1,80}$/.test(p.id||'')).map(p=>({id:p.id,name:String(p.name||'Luma playlist').slice(0,100),tracks:[...new Set((p.tracks||[]).filter(k=>result.tracks[k]))]}));
    for(const source of providers)result.blocked[source]=(value?.blocked?.[source]||[]).filter(k=>result.tracks[k]?.source===source);
    return result;
  }
  function addTrack(library,track){const t=normalizeTrack(track);if(!t)throw new Error('Некорректная ссылка на трек.');const next=normalize(library);next.tracks[t.key]={...next.tracks[t.key],...t};return next;}
  function mergeSpotifyLinks(library,cache){
    if(!cache?.ownerId)return {library:cache,changed:false};const next=JSON.parse(JSON.stringify(cache));next.tracks||={};next.manual||=[];let changed=false;
    for(const track of Object.values(library.tracks)){if(track.source!=='spotify')continue;if(!next.tracks[track.id]){next.tracks[track.id]={...track};changed=true;}if(!next.manual.includes(track.id)){next.manual.push(track.id);changed=true;}}
    return {library:next,changed};
  }
  function favorites(library,spotifyLibrary=null,query=''){
    const items=new Map(),hiddenKeys=library.hiddenLiked?.[spotifyLibrary?.ownerId],hidden=new Set(Array.isArray(hiddenKeys)?hiddenKeys:[]);
    for(const key of library.liked){const track=library.tracks[key];if(track)items.set(key,track);}
    for(const id of spotifyLibrary?.liked||[]){const raw=spotifyLibrary.tracks?.[id];if(!raw)continue;const track=normalizeTrack({...raw,source:'spotify',url:'https://open.spotify.com/track/'+id});if(track&&!hidden.has(track.key)&&!items.has(track.key))items.set(track.key,track);}
    const text=String(query).trim().toLocaleLowerCase();return [...items.values()].filter(t=>!text||(t.name+' '+t.artists+' '+(t.genres||[]).join(' ')).toLocaleLowerCase().includes(text));
  }
  function setFavorite(library,track,liked,spotifyLibrary=null){
    const t=normalizeTrack(track);if(!t)throw new Error('Некорректный трек.');let next=normalize(library);
    if(liked){next=addTrack(next,t);next.liked=[t.key,...next.liked.filter(k=>k!==t.key)];}else next.liked=next.liked.filter(k=>k!==t.key);
    const account=spotifyLibrary?.ownerId;if(account&&t.source==='spotify'){const keys=Array.isArray(next.hiddenLiked[account])?next.hiddenLiked[account]:[];Object.defineProperty(next.hiddenLiked,account,{value:liked?keys.filter(k=>k!==t.key):[...new Set([...keys,t.key])],enumerable:true,writable:true,configurable:true});}
    return next;
  }
  function addToPlaylist(library,id,tracks){let next=normalize(library);const list=next.playlists.find(p=>p.id===id);if(!list)throw new Error('Плейлист не найден.');for(const track of tracks){const t=normalizeTrack(track);if(!t)throw new Error('Некорректный трек.');next.tracks[t.key]={...next.tracks[t.key],...t};if(!list.tracks.includes(t.key))list.tracks.push(t.key);}return next;}
  function filter(library,source,query='',likedOnly=false){const text=String(query).trim().toLocaleLowerCase();const liked=new Set(library.liked);return Object.values(library.tracks).filter(t=>t.source===source&&(!likedOnly||liked.has(t.key))&&(!text||(t.name+' '+t.artists+' '+(t.genres||[]).join(' ')).toLocaleLowerCase().includes(text))).sort((a,b)=>String(b.addedAt).localeCompare(String(a.addedAt)));}
  function wave(library,source,character=55,random=Math.random){
    if(!providers.has(source))throw new Error('Выберите сервис.');
    const tracks=filter(library,source).filter(t=>!library.blocked[source].includes(t.key));
    const liked=tracks.filter(t=>library.liked.includes(t.key));const seeds=liked.length?liked:tracks;
    const cache={};for(const t of seeds)for(const name of t.artistNames||[t.artists]){const key=root.LumaDiscoveryCore.normal(name);const prev=cache[key]?.genres||[];cache[key]={genres:[...new Set([...prev,...(t.genres||[])])]};}
    return root.LumaDiscoveryCore.createWave(tracks.map(t=>({...t,id:t.key,genreHints:t.genres||[]})),seeds.map(t=>({...t,id:t.key})),{limit:30,discovery:character,allowExplicit:true,blocked:library.blocked[source]},cache,random).tracks.map(t=>({...t,id:library.tracks[t.key].id}));
  }
  class CatalogSearch{
    constructor({spotifyApi,publicSearch,connected=()=>true}){Object.assign(this,{spotifyApi,publicSearch,connected});}
    async search(source,query,offset=0){
      const text=String(query||'').trim().slice(0,160);if(!text)return {items:[],nextOffset:null};
      if(source==='spotify'){
        if(!this.connected()){const error=new Error('Для поиска треков Spotify один раз подключите Spotify. Импортировать библиотеку не обязательно.');error.needsConnection=true;throw error;}
        const result=await new root.LumaDiscoveryCore.CatalogService(this.spotifyApi).search(text,offset);
        return {...result,items:result.items.map(t=>normalizeTrack({...t,source:'spotify'})).filter(Boolean)};
      }
      if(source!=='soundcloud')throw new Error('Выберите сервис.');
      const result=await this.publicSearch(text);
      return {items:(result?.items||[]).map(item=>{const parsed=parseLink(item.url);return parsed?.source==='soundcloud'?manualTrack(parsed,item):null;}).filter(Boolean),nextOffset:null};
    }
  }
  function nextQueueIndex(length,index,{ended=false,repeat='off',shuffle=false,direction=1,random=Math.random}={}){if(!length)return null;if(ended&&repeat==='track')return index;if(ended&&repeat==='off'&&index>=length-1)return null;if(shuffle&&length>1)return (index+1+Math.floor(random()*(length-1)))%length;return (index+direction+length)%length;}
  class SpotifyEndDetector{
    reset(id){this.id=id;this.previous=null;this.done=false;}
    update(state,now=Date.now()){
      if(!this.id||!state)return false;const id=state.track_window?.current_track?.id,position=Number(state.position)||0,duration=Number(state.duration)||0,previous=this.previous;
      if(id===this.id&&!state.paused){if(position<1000)this.done=false;this.previous={position,duration,at:now};return false;}
      if(this.done||!previous)return false;const expected=previous.position+Math.max(0,now-previous.at),nearEnd=previous.duration>0&&expected>=previous.duration-2000;
      const resetAtEnd=id===this.id&&state.paused&&(duration>0&&position>=duration||position===0&&nearEnd);
      const advancedAtEnd=id!==this.id&&nearEnd&&state.track_window?.previous_tracks?.some(t=>t.id===this.id);
      if(resetAtEnd||advancedAtEnd){this.done=true;return true;}if(state.paused)this.previous=null;return false;
    }
  }
  const api={parseLink,manualTrack,normalizeTrack,normalize,empty,addTrack,addToPlaylist,favorites,setFavorite,mergeSpotifyLinks,filter,wave,CatalogSearch,nextQueueIndex,SpotifyEndDetector};root.LumaServicesCore=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
