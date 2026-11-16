const {test}=require('node:test'),assert=require('node:assert/strict');
const {CatalogService,tasteProfile,createWave}=require('../web/discovery-core.js');
const id=n=>String(n).padStart(22,'0');const track=(n,artist='Artist',extra={})=>({id:id(n),uri:'spotify:track:'+id(n),name:'Song '+n,artists:artist,artistNames:[artist],duration:200000,playable:true,releaseDate:'2025-01-01',...extra});
const raw=n=>({id:id(n),uri:'spotify:track:'+id(n),name:'Track '+n,type:'track',artists:[{id:id(90),name:'Artist'}],album:{id:id(80),name:'Album',release_date:'2025-02-02'},duration_ms:100000});
test('search encodes Unicode and filters, uses the current ten-result limit and preserves metadata',async()=>{
  let url;const s=new CatalogService({request:async path=>{url=new URL('https://api.spotify.com/v1'+path);return {tracks:{items:[raw(1),null,{...raw(2),is_local:true}],total:21,next:'next'}};}});
  const result=await s.search('исполнитель & track:test',10);assert.equal(url.searchParams.get('q'),'исполнитель & track:test');assert.equal(url.searchParams.get('limit'),'10');assert.equal(url.searchParams.get('offset'),'10');assert.equal(result.items.length,1);assert.equal(result.items[0].releaseDate,'2025-02-02');assert.deepEqual(result.items[0].artistIds,[id(90)]);assert.equal(result.nextOffset,20);
});
test('empty search performs no network request and pagination stops at the supported offset',async()=>{
  let calls=0;const s=new CatalogService({request:async()=>{calls++;return {tracks:{items:[],total:0,next:'yes'}};}});await s.search('  ');assert.equal(calls,0);assert.equal((await s.search('a',5000)).nextOffset,null);
});
test('liked songs use the new library URI endpoint for save and remove',async()=>{
  const seen=[];const s=new CatalogService({request:async(path,opts)=>seen.push({path,opts})});await s.setLiked(track(1),true);await s.setLiked(track(1),false);
  assert.equal(new URL('https://api.spotify.com/v1'+seen[0].path).searchParams.get('uris'),'spotify:track:'+id(1));assert.equal(seen[0].opts.method,'PUT');assert.equal(seen[1].opts.method,'DELETE');assert.ok(seen.every(x=>x.path.startsWith('/me/library?')));
});
test('invalid track IDs are rejected before a library write',async()=>{
  const s=new CatalogService({request:async()=>assert.fail('network called')});await assert.rejects(s.setLiked({...track(1),uri:'spotify:album:'+id(1)},true));
});
test('playlist picker includes owned and collaborative playlists but excludes followed foreign playlists',async()=>{
  const s=new CatalogService({pages:async()=>[{id:id(1),owner:{id:'me'}},{id:id(2),owner:{id:'other'},collaborative:true},{id:id(3),owner:{id:'other'}},null]});assert.deepEqual((await s.editablePlaylists('me')).map(p=>p.id),[id(1),id(2)]);
});
test('playlist insertion uses items, deduplicates URIs and does not parse an acknowledgement',async()=>{
  let request;const s=new CatalogService({request:async(path,opts)=>{request={path,opts};}});await s.addToPlaylist(id(9),[track(1),track(1),track(2)]);assert.equal(request.path,'/playlists/'+id(9)+'/items');assert.deepEqual(JSON.parse(request.opts.body),{uris:['spotify:track:'+id(1),'spotify:track:'+id(2)]});assert.equal(request.opts.responseType,'none');assert.equal(request.opts.method,'POST');
});
test('playlist writes reject empty or oversized selections',async()=>{
  const s=new CatalogService({request:async()=>assert.fail('network called')});await assert.rejects(s.addToPlaylist(id(1),[]));await assert.rejects(s.addToPlaylist(id(1),Array.from({length:101},(_,i)=>track(i+1))));
});
test('uncertain playlist insertion is surfaced without an automatic duplicate retry',async()=>{
  let count=0;const s=new CatalogService({request:async()=>{count++;const e=new Error('Disconnected');e.status=0;throw e;}});await assert.rejects(s.addToPlaylist(id(9),[track(1)]),e=>e.outcomeUnknown===true);assert.equal(count,1);
});
test('new playlists are private and request a JSON identity',async()=>{
  let req;const s=new CatalogService({request:async(path,opts)=>{req={path,opts};return {id:id(5),name:'Mine'};}});await s.createPlaylist('  Mine  ');assert.equal(req.path,'/me/playlists');assert.equal(JSON.parse(req.opts.body).public,false);assert.equal(JSON.parse(req.opts.body).name,'Mine');assert.equal(req.opts.responseType,'json');
});
test('a missing create-playlist identity is treated as an unknown outcome',async()=>{
  const s=new CatalogService({request:async()=>({})});await assert.rejects(s.createPlaylist('Mine'),e=>e.outcomeUnknown===true);
});
test('artist genres are optional and not invented when missing',()=>{
  const liked=[track(1,'A'),track(2,'A'),track(3,'B')];const p=tasteProfile(liked);assert.equal(p.artists[0].name,'A');assert.deepEqual(p.genres,[]);assert.equal(p.medianDuration,200000);
});
test('genre preferences come only from favorite artists with provided metadata',()=>{
  const p=tasteProfile([track(1,'A')],{a:{genres:['Indie Pop']},other:{genres:['Metal']}});assert.deepEqual(p.genres.map(g=>g.name),['indie pop']);
});
test('wave excludes blocked, unavailable, explicit and duplicate recordings',()=>{
  const candidates=[track(1,'A'),track(1,'A'),track(2,'B',{explicit:true}),track(3,'C',{playable:false}),track(4,'D'),track(5,'A',{name:'Song 1'})];const r=createWave(candidates,[],{blocked:[id(4)],allowExplicit:false}, {},()=>0);assert.deepEqual(r.tracks.map(t=>t.id),[id(1)]);
});
test('wave enforces the selected era and does not guess missing release dates',()=>{
  const data=[track(1,'A',{releaseDate:'2004-01-01'}),track(2,'B',{releaseDate:'2025-01-01'}),track(3,'C',{releaseDate:''})];assert.deepEqual(createWave(data,[],{era:'recent',year:2026,allowExplicit:true}).tracks.map(t=>t.id),[id(2)]);assert.deepEqual(createWave(data,[],{era:'classics',year:2026,allowExplicit:true}).tracks.map(t=>t.id),[id(1)]);
});
test('a wave with enough candidates balances discovery ratio and avoids consecutive artists',()=>{
  const liked=Array.from({length:30},(_,i)=>track(i+1,'Artist '+i%5)),newTracks=Array.from({length:50},(_,i)=>track(i+100,'Artist '+i%7));const r=createWave([...liked,...newTracks],liked,{discovery:60,allowExplicit:true,limit:30},{},()=>.25);assert.equal(r.tracks.length,30);assert.equal(r.newCount,18);for(let i=1;i<r.tracks.length;i++)assert.notEqual(r.tracks[i].artists,r.tracks[i-1].artists);assert.equal(new Set(r.tracks.map(t=>t.id)).size,30);
});
test('discovery can prefer entirely new songs or familiar favorites',()=>{
  const liked=[track(1,'A'),track(2,'B')],fresh=[track(3,'C'),track(4,'D')];assert.equal(createWave([...liked,...fresh],liked,{discovery:100,limit:2,allowExplicit:true}).newCount,2);assert.equal(createWave([...liked,...fresh],liked,{discovery:0,limit:2,allowExplicit:true}).newCount,0);
});
test('weighted selection favors familiar artists without requiring recommendation endpoints',()=>{
  const liked=[track(10,'Favorite'),track(11,'Favorite')],candidates=[track(1,'Favorite'),track(2,'Unknown')];let favorite=0;for(let i=0;i<1000;i++){const r=createWave(candidates,liked,{discovery:100,limit:1,allowExplicit:true},{},()=>i/1000);if(r.tracks[0].artists==='Favorite')favorite++;}assert.ok(favorite>800);
});
test('empty candidate pools return a clear empty selection',()=>{assert.deepEqual(createWave([],[],{limit:30}).tracks,[]);});
