(function(root){
  'use strict';
  const C=root.LumaCore||(typeof require==='function'?require('./core.js'):null);
  const idPattern=/^[A-Za-z0-9]{22}$/;
  const normal=value=>String(value||'').normalize('NFKC').toLocaleLowerCase().trim();
  const names=track=>track.artistNames?.length?track.artistNames:(track.artists||'').split(', ').filter(Boolean);
  function validTrack(track){return !!track&&idPattern.test(track.id||'')&&track.uri==='spotify:track:'+track.id;}
  class CatalogService{
    constructor(api){this.api=api;}
    async search(query,offset=0,signal){
      const q=String(query).trim().slice(0,250);if(!q)return {items:[],total:0,nextOffset:null};
      const start=Math.max(0,Math.min(990,Math.floor(Number(offset)||0)));
      const result=await this.api.request('/search?'+new URLSearchParams({q,type:'track',limit:'10',offset:String(start)}),{signal});
      const page=result?.tracks;if(!Array.isArray(page?.items))throw new Error('Spotify не вернул результаты поиска.');
      return {items:page.items.map(raw=>C.track(raw)).filter(validTrack),total:page.total||0,nextOffset:page.next&&start<990?start+10:null};
    }
    async setLiked(track,liked){
      if(!validTrack(track))throw new Error('Некорректный трек Spotify.');
      await this.api.request('/me/library?'+new URLSearchParams({uris:track.uri}),{method:liked?'PUT':'DELETE',responseType:'none'});
    }
    async editablePlaylists(userId){
      const items=await this.api.pages('/me/playlists?limit=50');
      return items.filter(p=>p&&idPattern.test(p.id||'')&&(p.owner?.id===userId||p.collaborative));
    }
    async addToPlaylist(playlistId,tracks){
      if(!idPattern.test(playlistId||''))throw new Error('Некорректный плейлист Spotify.');
      const uris=[...new Set(tracks.filter(validTrack).map(t=>t.uri))];
      if(!uris.length||uris.length>100)throw new Error('В одном действии можно добавить от 1 до 100 треков.');
      try{await this.api.request('/playlists/'+playlistId+'/items',{method:'POST',body:JSON.stringify({uris}),responseType:'none'});}
      catch(e){if(e.status===0){const unknown=new Error('Нет подтверждения Spotify. Проверьте плейлист перед повторным добавлением: команда могла выполниться.');unknown.outcomeUnknown=true;throw unknown;}throw e;}
    }
    async createPlaylist(name){
      const title=String(name).trim().slice(0,100);if(!title)throw new Error('Введите название плейлиста.');
      let playlist;
      try{playlist=await this.api.request('/me/playlists',{method:'POST',body:JSON.stringify({name:title,public:false,description:'Created in Luma Music'}),responseType:'json'});}
      catch(e){if(e.status===0||e.status===502){e.outcomeUnknown=true;e.message='Нет подтверждения создания. Проверьте свои плейлисты Spotify перед повтором.';}throw e;}
      if(!idPattern.test(playlist?.id||'')){const e=new Error('Spotify не вернул новый плейлист. Проверьте свой аккаунт перед повторным созданием.');e.outcomeUnknown=true;throw e;}
      return playlist;
    }
    async artistByName(artist,signal){
      const quote=String(artist.name).replace(/["\\]/g,' ');
      const raw=artist.id?await this.api.request('/artists/'+encodeURIComponent(artist.id),{signal}):null;
      if(raw)return {id:raw.id,name:raw.name,genres:Array.isArray(raw.genres)?raw.genres:[]};
      const result=await this.api.request('/search?'+new URLSearchParams({q:'artist:"'+quote+'"',type:'artist',limit:'1'}),{signal});
      const match=result?.artists?.items?.find(item=>normal(item.name)===normal(artist.name));
      return {id:match?.id||'',name:artist.name,genres:Array.isArray(match?.genres)?match.genres:[]};
    }
  }
  function tasteProfile(liked,artistCache={},now=Date.now()){
    const artists=new Map(),genres=new Map(),lengths=[];
    for(const track of liked){
      if(!track)continue;if(track.duration>0)lengths.push(track.duration);
      const age=Math.max(0,(now-new Date(track.addedAt||now).getTime())/86400000);const weight=1+1/(1+(Number.isFinite(age)?age:0)/120);
      names(track).forEach((name,i)=>{const key=normal(name),previous=artists.get(key)||{name,id:track.artistIds?.[i]||'',weight:0};previous.id=previous.id||track.artistIds?.[i]||'';previous.weight+=weight;artists.set(key,previous);});
    }
    const ranked=[...artists.values()].sort((a,b)=>b.weight-a.weight);
    for(const artist of ranked){const details=artistCache[normal(artist.name)]||artistCache[artist.id];for(const genre of details?.genres||[]){const key=normal(genre);genres.set(key,(genres.get(key)||0)+artist.weight);}}
    lengths.sort((a,b)=>a-b);
    return {artists:ranked,genres:[...genres].map(([name,weight])=>({name,weight})).sort((a,b)=>b.weight-a.weight),medianDuration:lengths.length?lengths[Math.floor(lengths.length/2)]:0};
  }
  function createWave(candidates,liked,options={},artistCache={},random=Math.random){
    const profile=tasteProfile(liked,artistCache,options.now||Date.now()),likedIds=new Set(liked.map(t=>t.id));
    const artistWeights=new Map(profile.artists.map(a=>[normal(a.name),a.weight]));const maxArtist=Math.max(1,...artistWeights.values());
    const selectedGenres=(options.genres?.length?options.genres:profile.genres.slice(0,4).map(g=>g.name)).map(normal);
    const history=new Set(options.history||[]),blocked=new Set(options.blocked||[]),unique=new Map();const year=options.year||new Date().getFullYear();
    for(const t of candidates){
      if(!t||!t.id||t.playable===false||blocked.has(t.id)||(!options.allowExplicit&&t.explicit))continue;
      const released=Number(String(t.releaseDate||'').slice(0,4));
      if(options.era==='recent'&&(!released||released<year-4))continue;
      if(options.era==='classics'&&(!released||released>=2010))continue;
      const existing=unique.get(t.id);unique.set(t.id,existing?{...existing,...t,genreHints:[...new Set([...(existing.genreHints||[]),...(t.genreHints||[])])]}:t);
    }
    const scored=[...unique.values()].map(track=>{
      const artistFit=Math.max(0,...names(track).map(name=>(artistWeights.get(normal(name))||0)/maxArtist));
      const trackGenres=new Set([...(track.genreHints||[]),...names(track).flatMap(name=>(artistCache[normal(name)]?.genres||[]))].map(normal));
      const genreFit=selectedGenres.length?selectedGenres.filter(g=>trackGenres.has(g)).length/selectedGenres.length:0;
      const durationFit=profile.medianDuration&&track.duration?Math.exp(-Math.abs(track.duration-profile.medianDuration)/90000):0;
      const weight=(1+artistFit*6+genreFit*4+durationFit*.35)*(history.has(track.id)?.12:1);
      return {track,weight,artistFit,genreFit,known:likedIds.has(track.id)};
    });
    const limit=Math.max(1,Math.min(60,options.limit||30)),discovery=Math.max(0,Math.min(1,(options.discovery??55)/100));
    const result=[],usedSongs=new Set();let newCount=0,lastArtist='';
    while(result.length<limit&&scored.length){
      const wantNew=newCount<Math.ceil((result.length+1)*discovery);
      let pool=scored.filter(x=>x.known!==wantNew&&!usedSongs.has(normal(x.track.name)+'|'+normal(names(x.track)[0])));
      if(!pool.length)pool=scored.filter(x=>!usedSongs.has(normal(x.track.name)+'|'+normal(names(x.track)[0])));
      if(!pool.length)break;
      const diverse=pool.filter(x=>normal(names(x.track)[0])!==lastArtist);
      if(diverse.length)pool=diverse;else{const alternative=scored.filter(x=>normal(names(x.track)[0])!==lastArtist&&!usedSongs.has(normal(x.track.name)+'|'+normal(names(x.track)[0])));if(alternative.length)pool=alternative;}
      let needle=Math.max(0,Math.min(.999999,Number(random())||0))*pool.reduce((sum,x)=>sum+x.weight,0),chosen=pool[pool.length-1];
      for(const candidate of pool){needle-=candidate.weight;if(needle<0){chosen=candidate;break;}}
      const reason=chosen.known?'liked':chosen.artistFit>0?'artist':chosen.genreFit>0?'genre':'discovery';
      result.push({...chosen.track,waveReason:reason});if(!chosen.known)newCount++;lastArtist=normal(names(chosen.track)[0]);usedSongs.add(normal(chosen.track.name)+'|'+lastArtist);scored.splice(scored.indexOf(chosen),1);
    }
    return {tracks:result,profile,newCount,likedCount:result.length-newCount};
  }
  root.LumaDiscoveryCore={CatalogService,tasteProfile,createWave,normal,validTrack};if(typeof module!=='undefined')module.exports=root.LumaDiscoveryCore;
})(globalThis);
