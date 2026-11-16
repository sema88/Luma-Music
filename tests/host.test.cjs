const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.LUMA_TEST_ROOT ? path.resolve(process.env.LUMA_TEST_ROOT) : path.resolve(__dirname,'../../luma-test-data');
const instance = JSON.parse(fs.readFileSync(path.join(root,'instance.json'),'utf8'));
const base = 'http://127.0.0.1:'+instance.port;
const headers = {Authorization:'Bearer '+instance.key,'Content-Type':'application/json'};
test('embedded resources work and local API requires the launch session',async()=>{
  const root=await fetch(base);assert.equal(root.status,200);assert.match(await root.text(),/Luma Music/);assert.match(root.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);
  for(const resource of ['/app.js','/core.js','/style.css','/glass.css','/features.css','/features-core.js','/features.js','/discovery.css','/discovery-core.js','/discovery.js','/services.css','/services-core.js','/services.js','/artists-core.js','/artists.js','/artists.css','/media-session.js','/playback-ui.js','/playback-core.js','/modal-ui.js','/i18n.js','/icon.svg','/callback']) assert.equal((await fetch(base+resource)).status,200);
  assert.equal((await fetch(base+'/api/token')).status,401);
  assert.equal((await fetch(base+'/api/token',{headers:{...headers,Origin:'https://attacker.invalid'}})).status,403);
});
test('tokens round-trip through Windows encryption without appearing as plaintext on disk',async()=>{
  const token={access_token:'TOKEN_SENTINEL_938591',refresh_token:'REFRESH_SENTINEL_938591',expires_at:0};
  assert.equal((await fetch(base+'/api/token',{method:'PUT',headers,body:JSON.stringify(token)})).status,200);
  assert.deepEqual(await (await fetch(base+'/api/token',{headers})).json(),token);
  assert.equal(fs.readFileSync(path.join(root,'account.dat')).includes(Buffer.from(token.access_token)),false);
  await fetch(base+'/api/token',{method:'DELETE',headers});assert.equal(await (await fetch(base+'/api/token',{headers})).json(),null);
});
test('rejected JSON posts return readable 401 responses without resetting or mutating the library',async()=>{
  for(let i=0;i<12;i++){const response=await fetch(base+'/api/library?account=rejected-post',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'x'.repeat(4096),attempt:i})});assert.equal(response.status,401);assert.match((await response.json()).error,/Session/);}
  assert.equal(await(await fetch(base+'/api/library?account=rejected-post',{headers})).json(),null);
});
test('Unicode libraries persist independently for each Spotify account',async()=>{
  for(const account of ['one','two']){
    const data={ownerId:account,tracks:{a:{name:'Музыка 🎵 '+account}}};
    assert.equal((await fetch(base+'/api/library?account='+account,{method:'PUT',headers,body:JSON.stringify(data)})).status,200);
    assert.deepEqual(await (await fetch(base+'/api/library?account='+account,{headers})).json(),data);
  }
  assert.equal(await (await fetch(base+'/api/library?account=missing',{headers})).json(),null);
});
test('invalid JSON cannot replace the last saved settings',async()=>{
  const value={clientId:'0123456789abcdef0123456789abcdef'};
  await fetch(base+'/api/settings',{method:'PUT',headers,body:JSON.stringify(value)});
  assert.equal((await fetch(base+'/api/settings',{method:'PUT',headers,body:'{broken'})).status,500);
  assert.deepEqual(await (await fetch(base+'/api/settings',{headers})).json(),value);
});
test('local audio bytes round-trip and traversal identifiers are rejected',async()=>{
  const bytes=Buffer.from('Synthetic local audio fixture');
  const uploaded=await fetch(base+'/api/media-upload?extension=.wav',{method:'PUT',headers:{Authorization:headers.Authorization},body:bytes});
  assert.equal(uploaded.status,200);const item=await uploaded.json();assert.match(item.id,/^[a-f0-9]{32}$/);
  const downloaded=await fetch(base+'/api/media-file?id='+item.id,{headers});assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()),bytes);
  assert.equal((await fetch(base+'/api/media-file?id=../../settings.json',{headers})).status,400);
  assert.equal((await fetch(base+'/api/media-upload?extension=.exe',{method:'PUT',headers,body:bytes})).status,400);
});
test('mixed manual libraries persist Unicode and both provider identities without changing Spotify libraries',async()=>{
  const value={version:1,tracks:{'spotify:123':{source:'spotify',name:'Мой Spotify'},'soundcloud:artist/song':{source:'soundcloud',name:'Мой SoundCloud'}},playlists:[{id:'both',name:'Оба сервиса',tracks:['spotify:123','soundcloud:artist/song']}]};
  assert.equal((await fetch(base+'/api/manual-library',{method:'PUT',headers,body:JSON.stringify(value)})).status,200);
  assert.deepEqual(await (await fetch(base+'/api/manual-library',{headers})).json(),value);
  assert.equal((await (await fetch(base+'/api/library?account=one',{headers})).json()).ownerId,'one');
});
test('public metadata endpoint rejects arbitrary hosts, credentials, insecure links and invalid track IDs before networking',async()=>{
  for(const url of ['https://attacker.invalid/a/b','http://soundcloud.com/artist/song','https://user:pass@soundcloud.com/artist/song','https://open.spotify.com/track/nope','https://open.spotify.com/album/1234567890123456789012']){
    const response=await fetch(base+'/api/link-metadata',{method:'POST',headers,body:JSON.stringify({url})});assert.equal(response.status,500);assert.match((await response.json()).error,/ссылк/);
  }
  assert.equal((await fetch(base+'/api/link-metadata',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:'https://soundcloud.com/artist/song'})})).status,401);
});
test('Genius fallback requires a local session and rejects invalid metadata before networking',async()=>{
  assert.equal((await fetch(base+'/api/genius-lyrics',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:'Song',artist:'Artist'})})).status,401);
  for(const title of ['', 'x'.repeat(161)]){const response=await fetch(base+'/api/genius-lyrics',{method:'POST',headers,body:JSON.stringify({title,artist:'Artist'})});assert.equal(response.status,500);assert.match((await response.json()).error,/название/);}
});
test('SoundCloud artist lookup accepts profile handles only and requires a local session',async()=>{assert.equal((await fetch(base+'/api/public-artist',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"slug":"forss"}'})).status,401);for(const slug of ['../settings','https://attacker.invalid','search']){const response=await fetch(base+'/api/public-artist',{method:'POST',headers,body:JSON.stringify({slug})});assert.equal(response.status,500);assert.match((await response.json()).error,/профиль/);}});
