const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SpotifyApi, SpotifyError, emptyLibrary, syncLibrary, track, parseSpotifyLink, filterTracks, nextRepeatMode } = require('../web/core.js');
const response = (status, value, headers={}) => ({ status, ok:status>=200&&status<300, json:async()=>value, headers:{get:name=>headers[name]} });
const raw = (id='a',name='Song') => ({ id, type:'track', uri:'spotify:track:'+id, name, artists:[{name:'Artist'}], duration_ms:123000, album:{name:'Album',id:'album1',images:[{url:'https://i.scdn.co/test'}]} });

test('shuffle and repeat commands accept empty, opaque and malformed-JSON success acknowledgements',async()=>{
  for(const endpoint of ['/me/player/shuffle?state=true','/me/player/repeat?state=context']){
    for(const body of ['', '1, command accepted', '1fR9cAckOpaqueId']){
      let calls=0;
      const api=new SpotifyApi({getToken:async()=>'test',refreshToken:async()=>assert.fail('Unexpected refresh'),fetcher:async()=>{calls++;return new Response(body,{status:200});}});
      assert.equal(await api.request(endpoint,{method:'PUT'}),null);assert.equal(calls,1);
    }
  }
});
test('204 playback commands do not parse a body',async()=>{
  const api=new SpotifyApi({getToken:async()=>'test',refreshToken:async()=>{},fetcher:async()=>new Response(null,{status:204})});
  assert.equal(await api.request('/me/player/repeat?state=context',{method:'PUT',responseType:'none'}),null);
});
test('catalog reads still parse JSON and invalid data produces a readable Spotify error',async()=>{
  const api=new SpotifyApi({getToken:async()=>'test',refreshToken:async()=>{},fetcher:async()=>new Response('unexpected text',{status:200})});
  await assert.rejects(api.request('/me/tracks'),e=>e instanceof SpotifyError&&e.status===502&&!e.message.includes('Unexpected token'));
});
test('playback errors are preserved rather than treated as successful acknowledgements',async()=>{
  const api=new SpotifyApi({getToken:async()=>'test',refreshToken:async()=>{},fetcher:async()=>new Response(JSON.stringify({error:{message:'Premium required'}}),{status:403})});
  await assert.rejects(api.request('/me/player/shuffle?state=true',{method:'PUT'}),e=>e.status===403&&e.message.includes('Premium required'));
});
test('repeat cycles through playlist, track and off',()=>{
  assert.equal(nextRepeatMode('off'),'context');assert.equal(nextRepeatMode('context'),'track');assert.equal(nextRepeatMode('track'),'off');
});
test('expired Spotify token is refreshed once, then the original request is retried',async()=>{
  let token='expired', refreshes=0; const seen=[];
  const api=new SpotifyApi({getToken:async()=>token,refreshToken:async()=>{refreshes++;token='fresh';},fetcher:async(url,opts)=>{seen.push(opts.headers.Authorization);return response(token==='expired'?401:200,{id:'ok'});}});
  assert.deepEqual(await api.request('/me'),{id:'ok'});assert.equal(refreshes,1);assert.deepEqual(seen,['Bearer expired','Bearer fresh']);
});
test('401 after refresh stops retrying instead of looping',async()=>{
  let count=0;const api=new SpotifyApi({getToken:async()=>'',refreshToken:async()=>{count++;},fetcher:async()=>response(401,{error:{message:'Denied'}})});
  await assert.rejects(api.request('/me'),e=>e.status===401);assert.equal(count,1);
});
test('rate limiting respects the Retry-After delay',async()=>{
  const waits=[];let n=0;
  const api=new SpotifyApi({getToken:async()=>'',refreshToken:async()=>{},sleep:async ms=>waits.push(ms),fetcher:async()=>++n===1?response(429,{}, {'Retry-After':'3'}):response(200,{items:[]})});
  await api.request('/me/tracks');assert.deepEqual(waits,[3000]);
});
test('untrusted pagination URLs cannot receive the user token',async()=>{
  let calls=0;const api=new SpotifyApi({getToken:async()=>'private',refreshToken:async()=>{},fetcher:async()=>{calls++;return response(200,{items:[],next:'https://attacker.invalid/token'});}});
  await assert.rejects(api.pages('/me/tracks'),/Недопустимый/);assert.equal(calls,1);
});
test('all pages of saved tracks are read and 2026 playlist item field is supported',async()=>{
  const data={
    '/me/tracks?limit=50':{items:[{track:raw('a')}],next:'https://api.spotify.com/v1/me/tracks?offset=1'},
    'https://api.spotify.com/v1/me/tracks?offset=1':{items:[{track:raw('b')}],next:null},
    '/me/albums?limit=50':{items:[],next:null},'/me/playlists?limit=50':{items:[{id:'p',name:'Mix',uri:'spotify:playlist:p'}],next:null},
    '/playlists/p/items?limit=50':{items:[{item:raw('a')},{item:null},{item:{type:'episode',id:'e'}}],next:null}
  };
  const api={pages:SpotifyApi.prototype.pages,request:async path=>data[path]};
  const result=await syncLibrary(api,emptyLibrary('u'),{id:'u'});
  assert.deepEqual(result.liked,['a','b']);assert.deepEqual(result.playlists[0].tracks,['a']);assert.equal(Object.keys(result.tracks).length,2);
});
test('failure on a later page leaves the previously imported library intact',async()=>{
  const previous=emptyLibrary('u');previous.tracks.old=track(raw('old'));previous.liked=['old'];const copy=JSON.stringify(previous);
  const api={pages:async()=>{throw new SpotifyError(503,'down');}};
  await assert.rejects(syncLibrary(api,previous,{id:'u'}),/down/);assert.equal(JSON.stringify(previous),copy);
});
test('restricted playlist retains cached contents and exposes a warning',async()=>{
  const previous=emptyLibrary('u');previous.tracks.old=track(raw('old'));previous.playlists=[{id:'p',tracks:['old']}];
  const api={pages:async path=>{
    if(path==='/me/tracks?limit=50'||path==='/me/albums?limit=50')return [];
    if(path==='/me/playlists?limit=50')return [{id:'p',name:'Restricted'}];
    throw new SpotifyError(403,'Forbidden');
  }};
  const result=await syncLibrary(api,previous,{id:'u'});assert.deepEqual(result.playlists[0].tracks,['old']);assert.equal(result.playlists[0].unavailable,true);assert.ok(result.tracks.old);assert.equal(result.warnings.length,1);
});
test('manually added collections and tracks survive the next Spotify import',async()=>{
  const previous=emptyLibrary('u');previous.tracks.a=track(raw('a'));previous.manual=['a'];previous.albums=[{id:'manual',manual:true,tracks:['a']}];
  const result=await syncLibrary({pages:async()=>[]},previous,{id:'u'});
  assert.equal(result.albums[0].id,'manual');assert.ok(result.tracks.a);
});
test('switching accounts cannot inherit another users cached library',async()=>{
  const previous=emptyLibrary('other');previous.tracks.a=track(raw('a'));previous.manual=['a'];
  const result=await syncLibrary({pages:async()=>[]},previous,{id:'new'});assert.equal(result.ownerId,'new');assert.deepEqual(result.tracks,{});
});
test('local files and podcasts are excluded from the music importer',()=>{
  assert.equal(track({...raw(),is_local:true}),null);assert.equal(track({...raw(),type:'episode'}),null);
});
test('link validation accepts official localized links and rejects lookalikes',()=>{
  const id='0123456789ABCDEFGHIJKL';assert.equal(id.length,22);
  assert.deepEqual(parseSpotifyLink('https://open.spotify.com/intl-ru/track/'+id+'?si=foo'),{type:'track',id});
  assert.deepEqual(parseSpotifyLink('spotify:album:'+id),{type:'album',id});
  assert.equal(parseSpotifyLink('https://open.spotify.com.attacker.invalid/track/'+id),null);assert.equal(parseSpotifyLink('javascript:alert(1)'),null);
});
test('search includes artists and albums without mutating playlist order',()=>{
  const lib=emptyLibrary();lib.tracks={a:track(raw('a','Zulu')),b:track(raw('b','Alpha'))};const ids=['a','b'];
  assert.deepEqual(filterTracks(lib,ids,'artist','title').map(t=>t.id),['b','a']);assert.deepEqual(ids,['a','b']);
});
