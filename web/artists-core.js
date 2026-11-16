(function(root){
  'use strict';
  const C=root.LumaCore||(typeof require==='function'?require('./core.js'):null),S=root.LumaServicesCore||(typeof require==='function'?require('./services-core.js'):null);
  const spotifyId=value=>/^[a-zA-Z0-9]{22}$/.test(value||''),slug=value=>/^[a-zA-Z0-9_-]{1,100}$/.test(value||'')&&!['search','discover','you','settings','stream','stations','tags','pages'].includes(value.toLowerCase());
  const normal=value=>String(value||'').normalize('NFKC').toLocaleLowerCase().trim();
  function image(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}}
  function artists(track){
    if(!track||track.source==='local')return [];
    if(track.source==='soundcloud'){const parsed=S.parseLink(track.url);const id=parsed?.source==='soundcloud'?parsed.id.split('/')[0]:'';return slug(id)?[{source:'soundcloud',id,name:track.artists||id,trackId:track.id,index:0}]:[];}
    const names=track.artistNames?.length?track.artistNames:String(track.artists||'').split(', ').filter(Boolean);return names.map((name,index)=>({source:'spotify',id:spotifyId(track.artistIds?.[index])?track.artistIds[index]:'',name:String(name).slice(0,300),trackId:spotifyId(track.id)?track.id:'',index}));
  }
  function spotifyTrack(raw,album){const t=C.track(raw,null,album);return t&&spotifyId(t.id)?S.normalizeTrack({...t,source:'spotify'}):null;}
  function album(raw){return raw&&spotifyId(raw.id)?{id:raw.id,name:String(raw.name||''),image:image(raw.images?.[0]?.url),releaseDate:String(raw.release_date||''),type:raw.album_type||'album',url:'https://open.spotify.com/album/'+raw.id}:null;}
  function rankTracks(items){return [...items].sort((a,b)=>{const count=t=>Number.isFinite(t.playCount)?t.playCount:-1;if(a.source==='soundcloud')return count(b)-count(a);if(Number.isFinite(a.topRank)||Number.isFinite(b.topRank))return (a.topRank??Infinity)-(b.topRank??Infinity);return (b.popularity??-1)-(a.popularity??-1);});}
  class ArtistService{
    constructor({spotifyApi,publicArtist,trackMetadata,connected=()=>true}){Object.assign(this,{api:spotifyApi,publicArtist,trackMetadata,connected});this.artworkCache=new Map();}
    check(signal){if(signal?.aborted)throw new DOMException('Aborted','AbortError');}
    async fillArtwork(tracks,onArtwork,signal){
      if(!this.trackMetadata)return;const pending=tracks.filter(t=>t.source==='soundcloud'&&(!t.image||t.playCount==null)&&S.parseLink(t.url)?.source==='soundcloud');let index=0;
      const worker=async()=>{while(index<pending.length){this.check(signal);const track=pending[index++];try{let metadata=this.artworkCache.get(track.url);if(!metadata){metadata=await this.trackMetadata(track.url);if(image(metadata?.thumbnail_url)||Number.isFinite(metadata?.playback_count)){this.artworkCache.set(track.url,metadata);if(this.artworkCache.size>256)this.artworkCache.delete(this.artworkCache.keys().next().value);}}this.check(signal);let changed=false;const artwork=image(metadata?.thumbnail_url);if(artwork){track.image=artwork;changed=true;}if(Number.isFinite(metadata?.playback_count)&&metadata.playback_count>=0){track.playCount=metadata.playback_count;changed=true;}if(Number.isFinite(metadata?.duration)&&metadata.duration>0)track.duration=metadata.duration;if(changed)onArtwork(track);}catch(e){if(signal?.aborted)throw e;}}};
      await Promise.all(Array.from({length:Math.min(3,pending.length)},worker));
    }
    async load(ref,signal){
      this.check(signal);
      if(ref.source==='soundcloud'){
        if(!slug(ref.id))throw new Error('Некорректный профиль SoundCloud.');const raw=await this.publicArtist(ref.id);this.check(signal);
        if(raw?.source!=='soundcloud'||raw.id!==ref.id)throw new Error('SoundCloud не вернул этот профиль.');
        return {...raw,source:'soundcloud',name:String(raw.name||ref.name||ref.id),image:image(raw.image),url:'https://soundcloud.com/'+ref.id,albums:[],tracks:(raw.tracks||[]).map(item=>{const parsed=S.parseLink(item.url);return parsed?.source==='soundcloud'&&parsed.id.split('/')[0].toLowerCase()===ref.id.toLowerCase()?S.manualTrack(parsed,item):null;}).filter(Boolean),tracksNext:null,albumsNext:null};
      }
      if(ref.source!=='spotify')throw new Error('Выберите музыкальный сервис.');if(!this.connected()){const e=new Error('Подключите Spotify Premium, чтобы открыть профиль артиста.');e.needsConnection=true;throw e;}
      let id=spotifyId(ref.id)?ref.id:'';
      if(!id&&spotifyId(ref.trackId)){const track=await this.api.request('/tracks/'+ref.trackId,{signal});const artist=track.artists?.[ref.index||0];if(spotifyId(artist?.id))id=artist.id;}
      if(!id){const result=await this.api.request('/search?'+new URLSearchParams({q:ref.name||'',type:'artist',limit:'10'}),{signal});id=result.artists?.items?.find(a=>normal(a.name)===normal(ref.name)&&spotifyId(a.id))?.id||'';}
      if(!id)throw new Error('Spotify не нашёл точный профиль этого исполнителя.');
      const raw=await this.api.request('/artists/'+id,{signal});if(raw?.id!==id)throw new Error('Spotify не вернул этот профиль.');
      const profile={source:'spotify',id,name:String(raw.name||ref.name),image:image(raw.images?.[0]?.url),url:'https://open.spotify.com/artist/'+id,bio:'',followers:Number.isFinite(raw.followers?.total)?raw.followers.total:null,genres:Array.isArray(raw.genres)?raw.genres.slice(0,8):[],tracks:[],albums:[],tracksNext:null,albumsNext:null,warnings:[]};
      const pages=await Promise.allSettled([this.topTracks(profile,signal),this.albums(id,0,signal)]);this.check(signal);
      if(pages[0].status==='fulfilled'){profile.tracks=rankTracks(pages[0].value.items);profile.tracksNext=pages[0].value.nextOffset;}else profile.warnings.push('Не удалось загрузить треки Spotify.');
      profile.warnings.push('Spotify не предоставляет точное число прослушиваний. Порядок — по доступному топу или рейтингу сервиса.');
      if(pages[1].status==='fulfilled'){profile.albums=pages[1].value.items;profile.albumsNext=pages[1].value.nextOffset;}else profile.warnings.push('Не удалось загрузить релизы Spotify.');return profile;
    }
    async tracks(profile,offset=0,signal){
      if(!spotifyId(profile.id))throw new Error('Некорректный артист Spotify.');const start=Math.max(0,Math.min(990,Math.floor(Number(offset)||0)));
      const raw=await this.api.request('/search?'+new URLSearchParams({q:'artist:"'+profile.name.replace(/["\\]/g,' ')+'"',type:'track',limit:'10',offset:String(start)}),{signal});this.check(signal);
      if(!Array.isArray(raw?.tracks?.items))throw new Error('Spotify не вернул треки.');return {items:raw.tracks.items.map(t=>spotifyTrack(t)).filter(t=>t?.artistIds?.includes(profile.id)),nextOffset:raw.tracks.next&&start<990?start+10:null};
    }
    async topTracks(profile,signal){
      try{const raw=await this.api.request('/artists/'+profile.id+'/top-tracks',{signal});this.check(signal);if(!Array.isArray(raw?.tracks))throw new Error('No artist top');return {items:raw.tracks.map((t,index)=>{const item=spotifyTrack(t);return item&&item.artistIds.includes(profile.id)?{...item,topRank:index}:null;}).filter(Boolean),nextOffset:0};}
      catch(e){this.check(signal);return this.tracks(profile,0,signal);}
    }
    async albums(id,offset=0,signal){
      if(!spotifyId(id))throw new Error('Некорректный артист Spotify.');const raw=await this.api.request('/artists/'+id+'/albums?'+new URLSearchParams({include_groups:'album,single',limit:'10',offset:String(Math.max(0,Number(offset)||0))}),{signal});this.check(signal);
      if(!Array.isArray(raw?.items))throw new Error('Spotify не вернул релизы.');return {items:raw.items.map(album).filter(Boolean),nextOffset:raw.next?(Number(offset)||0)+10:null};
    }
    async albumTracks(release,offset=0,signal){
      if(!spotifyId(release.id))throw new Error('Некорректный альбом Spotify.');const raw=await this.api.request('/albums/'+release.id+'/tracks?'+new URLSearchParams({limit:'10',offset:String(Math.max(0,Number(offset)||0))}),{signal});this.check(signal);
      if(!Array.isArray(raw?.items))throw new Error('Spotify не вернул треки альбома.');const meta={id:release.id,name:release.name,images:release.image?[{url:release.image}]:[],release_date:release.releaseDate};return {items:raw.items.map(t=>spotifyTrack(t,meta)).filter(Boolean),nextOffset:raw.next?(Number(offset)||0)+10:null};
    }
  }
  const api={artists,ArtistService,image,spotifyId,slug,rankTracks};root.LumaArtistsCore=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
