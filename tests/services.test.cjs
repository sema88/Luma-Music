const {test}=require('node:test');
const assert=require('node:assert/strict');
global.LumaDiscoveryCore=require('../web/discovery-core.js');
const S=require('../web/services-core.js');
const spotify='https://open.spotify.com/track/1234567890123456789012';
const soundcloud='https://soundcloud.com/forss/flickermood';
const track=(url,name,artist,genres='')=>S.manualTrack(S.parseLink(url),{}, {name,artists:artist,genres});
test('full track links are canonicalized and service identities cannot collide',()=>{
  assert.equal(S.parseLink(spotify+'?si=tracking').url,spotify);
  assert.equal(S.parseLink(spotify.replace('/track/','/intl-ru/track/')).key,'spotify:1234567890123456789012');
  assert.equal(S.parseLink(soundcloud+'/?utm_source=x').url,soundcloud);
  assert.notEqual(S.parseLink(spotify).key,S.parseLink(soundcloud).key);
});
test('manual links reject foreign hosts, credentials, short links and non-track collections',()=>{
  for(const url of ['http://soundcloud.com/a/b','https://soundcloud.com.evil.test/a/b','https://a:b@soundcloud.com/a/b','https://on.soundcloud.com/abc','https://soundcloud.com/a','https://soundcloud.com/a/sets','https://soundcloud.com/a/sets/list','https://soundcloud.com/search/sounds','https://open.spotify.com/playlist/1234567890123456789012','https://open.spotify.com/track/bad','https://soundcloud.com:444/a/b'])assert.equal(S.parseLink(url),null,url);
});
test('metadata HTML is not consumed and images require HTTPS',()=>{
  const value=S.manualTrack(S.parseLink(soundcloud),{title:'Title',author_name:'Artist',thumbnail_url:'javascript:alert(1)',html:'<script>bad</script>'});
  assert.equal(value.name,'Title');assert.equal(value.artists,'Artist');assert.equal(value.image,'');assert.equal(value.html,undefined);
});
test('manual fields override metadata and normalize user-provided genres',()=>{
  const value=S.manualTrack(S.parseLink(soundcloud),{title:'Wrong',author_name:'Wrong'},{name:'Мой трек',artists:'Исполнитель',genres:' Ambient, Indie ,'});
  assert.equal(value.name,'Мой трек');assert.deepEqual(value.artistNames,['Исполнитель']);assert.deepEqual(value.genres,['ambient','indie']);
});
test('adding a link twice updates one item without modifying its input library',()=>{
  const first=S.empty(),t=track(spotify,'First','Artist');const second=S.addTrack(first,t),third=S.addTrack(second,{...t,name:'Updated'});
  assert.equal(Object.keys(first.tracks).length,0);assert.equal(Object.keys(third.tracks).length,1);assert.equal(third.tracks[t.key].name,'Updated');assert.equal(second.tracks[t.key].name,'First');
});
test('mixed playlists preserve both services, their order and unique track references',()=>{
  const a=track(spotify,'Spotify song','A'),b=track(soundcloud,'SC song','B'),initial=S.empty();initial.playlists=[{id:'mix-1',name:'Both',tracks:[]}];
  const next=S.addToPlaylist(initial,'mix-1',[a,b,a]);assert.deepEqual(next.playlists[0].tracks,[a.key,b.key]);assert.equal(next.tracks[b.key].source,'soundcloud');assert.deepEqual(initial.playlists[0].tracks,[]);
});
test('invalid playlist insertion cannot silently create a missing playlist',()=>{
  assert.throws(()=>S.addToPlaylist(S.empty(),'missing',[track(spotify,'Song','A')]),/не найден/);
});
test('persisted library cleanup rejects invalid links and dangling references',()=>{
  const t=track(spotify,'Song','A');const restored=S.normalize({tracks:{a:t,b:{...t,source:'soundcloud'},bad:{source:'evil',url:'https://evil.test'}},liked:[t.key,'missing',t.key],playlists:[{id:'mix',name:'Both',tracks:['missing',t.key,t.key]},{id:'../../path',tracks:[]}]});
  assert.deepEqual(Object.keys(restored.tracks),[t.key]);assert.deepEqual(restored.liked,[t.key]);assert.deepEqual(restored.playlists[0].tracks,[t.key]);assert.equal(restored.playlists.length,1);
});
test('library search and local favorites stay isolated by service',()=>{
  let l=S.empty();const a=track(spotify,'Same title','Artist'),b=track(soundcloud,'Same title','Artist');l=S.addTrack(S.addTrack(l,a),b);l.liked=[b.key];
  assert.deepEqual(S.filter(l,'spotify','same').map(t=>t.key),[a.key]);assert.equal(S.filter(l,'spotify','',true).length,0);assert.equal(S.filter(l,'soundcloud','artist',true).length,1);
});
test('each wave uses only its selected provider and honors local exclusions',()=>{
  let l=S.empty();for(let i=0;i<20;i++){const source=i%2?'soundcloud':'spotify';const url=source==='soundcloud'?'https://soundcloud.com/artist/song-'+i:'https://open.spotify.com/track/'+String(i).padStart(22,'0');l=S.addTrack(l,track(url,'Song '+i,'Artist '+i%4,'ambient'));}
  l.liked=Object.keys(l.tracks).slice(0,6);const blocked=Object.values(l.tracks).find(t=>t.source==='soundcloud').key;l.blocked.soundcloud=[blocked];
  const a=S.wave(l,'spotify',55,()=>.3),b=S.wave(l,'soundcloud',55,()=>.3);assert.ok(a.length>0&&b.length>0);assert.ok(a.every(t=>t.source==='spotify'&&t.id===l.tracks[t.key].id));assert.ok(b.every(t=>t.source==='soundcloud'&&t.key!==blocked));
});
test('waves work before local likes exist and return no invented catalog discoveries',()=>{
  const t=track(soundcloud,'Only saved track','Artist');const l=S.addTrack(S.empty(),t);assert.deepEqual(S.wave(l,'soundcloud').map(t=>t.key),[t.key]);assert.deepEqual(S.wave(S.empty(),'spotify'),[]);
});
test('manual Spotify search returns native track cards through the connected Spotify API without library synchronization',async()=>{
  const calls=[];const search=new S.CatalogSearch({connected:()=>true,publicSearch:()=>{throw Error('wrong source');},spotifyApi:{async request(path){calls.push(path);return {tracks:{items:[{id:'1234567890123456789012',uri:'spotify:track:1234567890123456789012',name:'Тестовый трек',artists:[{id:'artist',name:'Исполнитель'}],album:{name:'Альбом',images:[]},duration_ms:123456}],total:20,next:'next'}};}}});
  const result=await search.search('spotify','Тестовый трек');assert.equal(calls.length,1);assert.match(calls[0],/^\/search\?/);assert.equal(new URL('https://api.spotify.com'+calls[0]).searchParams.get('q'),'Тестовый трек');assert.equal(result.items[0].key,'spotify:1234567890123456789012');assert.equal(result.items[0].artists,'Исполнитель');assert.equal(result.items[0].duration,123456);assert.equal(result.nextOffset,10);
});
test('Spotify catalog without an account exposes a connection requirement instead of opening any website',async()=>{
  let calls=0;const search=new S.CatalogSearch({connected:()=>false,spotifyApi:{request(){calls++;}},publicSearch(){calls++;}});await assert.rejects(search.search('spotify','Song'),e=>e.needsConnection===true&&/подключите Spotify/.test(e.message));assert.equal(calls,0);
});
test('SoundCloud search keeps only valid SoundCloud tracks in native result cards',async()=>{
  let sent;const search=new S.CatalogSearch({publicSearch:async query=>{sent=query;return {items:[{url:soundcloud,title:'Flickermood',author_name:'Forss'},{url:spotify,title:'Wrong provider'},{url:'https://soundcloud.com/forss',title:'Profile'}]};}});const result=await search.search('soundcloud',' Forss ');assert.equal(sent,'Forss');assert.equal(result.items.length,1);assert.equal(result.items[0].name,'Flickermood');assert.equal(result.items[0].source,'soundcloud');
});
test('Spotify pagination uses the requested offset and never falls through to public SoundCloud search',async()=>{
  let endpoint;const search=new S.CatalogSearch({spotifyApi:{async request(path){endpoint=path;return {tracks:{items:[],total:21,next:null}};}},publicSearch(){throw Error('wrong provider');}});await search.search('spotify','Artist',20);assert.equal(new URL('https://api.spotify.com'+endpoint).searchParams.get('offset'),'20');
});
test('shared favorites include both services, deduplicate likes and keep matching titles as separate tracks',()=>{
  const a=track(spotify,'Same song','Artist'),b=track(soundcloud,'Same song','Artist');let l=S.setFavorite(S.empty(),a,true);l=S.setFavorite(l,b,true);l=S.setFavorite(l,a,true);
  assert.deepEqual(S.favorites(l).map(t=>t.key),[a.key,b.key]);assert.equal(S.favorites(l).length,2);assert.equal(S.favorites(l,'','artist').length,2);
  const next=S.setFavorite(l,a,false);assert.deepEqual(S.favorites(next).map(t=>t.key),[b.key]);assert.equal(S.favorites(l).length,2);assert.ok(next.tracks[a.key]);
});
test('shared favorites include existing Spotify account likes without copying or mutating its library',()=>{
  const a=track(spotify,'Spotify favorite','Artist'),b=track(soundcloud,'Cloud favorite','Other');const remote={ownerId:'one',tracks:{[a.id]:a},liked:[a.id]},snapshot=JSON.stringify(remote);const local=S.setFavorite(S.empty(),b,true);
  assert.deepEqual(S.favorites(local,remote).map(t=>t.key),[b.key,a.key]);assert.equal(JSON.stringify(remote),snapshot);assert.equal(Object.keys(local.tracks).length,1);
  assert.equal(S.favorites(S.setFavorite(local,a,true,remote),remote).length,2);
});
test('removing imported Spotify favorite stays removed after reload and can be restored locally',()=>{
  const a=track(spotify,'Song','Artist'),remote={ownerId:'one',tracks:{[a.id]:a},liked:[a.id]};const removed=S.setFavorite(S.empty(),a,false,remote),restored=S.normalize(JSON.parse(JSON.stringify(removed)));
  assert.equal(S.favorites(restored,remote).length,0);assert.deepEqual(remote.liked,[a.id]);assert.equal(S.favorites(S.setFavorite(restored,a,true,remote),remote).length,1);
});
test('hidden imported favorites are scoped to their Spotify account',()=>{
  const a=track(spotify,'Song','Artist'),one={ownerId:'one',tracks:{[a.id]:a},liked:[a.id]},two={...one,ownerId:'two'};const local=S.setFavorite(S.empty(),a,false,one);
  assert.equal(S.favorites(local,one).length,0);assert.equal(S.favorites(local,two).length,1);assert.equal(S.favorites(local,null).length,0);
});
test('one favorites queue can be saved as a mixed playlist while search and waves stay separated',()=>{
  const a=track(spotify,'Northern lights','Artist'),b=track(soundcloud,'Harbor','Other');let l=S.setFavorite(S.setFavorite(S.empty(),a,true),b,true);l.playlists=[{id:'saved-favorites',name:'Favorites',tracks:[]}];l=S.addToPlaylist(l,'saved-favorites',S.favorites(l));
  assert.deepEqual(l.playlists[0].tracks,[b.key,a.key]);assert.deepEqual(S.favorites(l,null,'northern').map(t=>t.key),[a.key]);assert.ok(S.wave(l,'spotify').every(t=>t.source==='spotify'));assert.ok(S.wave(l,'soundcloud').every(t=>t.source==='soundcloud'));
});
test('old Spotify links become local Premium-library entries without copying SoundCloud or changing cloud likes',()=>{
  const a=track(spotify,'Old saved song','Artist'),b=track(soundcloud,'SC song','Other');const links=S.addTrack(S.addTrack(S.empty(),a),b),cache={ownerId:'one',tracks:{},manual:[],liked:['existing']};const result=S.mergeSpotifyLinks(links,cache);
  assert.equal(result.changed,true);assert.equal(result.library.tracks[a.id].name,a.name);assert.deepEqual(result.library.manual,[a.id]);assert.deepEqual(result.library.liked,['existing']);assert.deepEqual(cache.tracks,{});assert.equal(S.mergeSpotifyLinks(links,result.library).changed,false);assert.equal(S.mergeSpotifyLinks(links,{tracks:{}}).changed,false);
});
test('playlist repeat wraps the whole queue while off stops and track-repeat stays on one item',()=>{assert.equal(S.nextQueueIndex(121,120,{ended:true,repeat:'context'}),0);assert.equal(S.nextQueueIndex(121,120,{ended:true,repeat:'off'}),null);assert.equal(S.nextQueueIndex(121,120,{ended:true,repeat:'track'}),120);assert.equal(S.nextQueueIndex(0,0,{ended:true,repeat:'context'}),null);assert.equal(S.nextQueueIndex(3,0,{direction:-1}),2);});
test('Spotify end detection advances once after the natural reset at the end',()=>{const detector=new S.SpotifyEndDetector();detector.reset('track');const state=(position,paused)=>({position,paused,duration:10000,track_window:{current_track:{id:'track'}}});assert.equal(detector.update(state(9500,false),1000),false);assert.equal(detector.update(state(0,true),1500),true);assert.equal(detector.update(state(0,true),2000),false);});
test('pausing and seeking do not falsely finish a Spotify playlist item',()=>{const detector=new S.SpotifyEndDetector();detector.reset('track');const state=(position,paused)=>({position,paused,duration:10000,track_window:{current_track:{id:'track'}}});detector.update(state(3000,false),1000);assert.equal(detector.update(state(3000,true),1100),false);assert.equal(detector.update(state(0,true),30000),false);detector.reset('track');detector.update(state(9900,false),1000);assert.equal(detector.update(state(9900,true),1001),false);});
