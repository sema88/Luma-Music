const {test}=require('node:test');const assert=require('node:assert/strict');
const F=require('../web/features-core.js');
test('LRC parses one, two and three digit fractions and repeated timestamps',()=>{
  assert.deepEqual(F.parseLrc('[00:01.2]First\n[00:02.34][01:03.456]Again'),[{time:1200,text:'First'},{time:2340,text:'Again'},{time:63456,text:'Again'}]);
});
test('offset is applied before sorting, including negative timing',()=>{
  assert.deepEqual(F.parseLrc('[offset:-1500]\n[00:04.00]Late\n[00:00.20]First'),[{time:0,text:'First'},{time:2500,text:'Late'}]);
});
test('metadata and invalid seconds never become lyric lines',()=>{
  assert.deepEqual(F.parseLrc('[ar:Someone]\n[00:91.00]Wrong\n[00:12.00]Good'),[{time:12000,text:'Good'}]);
});
test('enhanced word tags are stripped while line timings stay intact',()=>{
  assert.deepEqual(F.parseLrc('[00:10.00]<00:10.00>One <00:10.50>two'),[{time:10000,text:'One two'}]);
});
test('active line changes on exact timestamps and supports backwards seeking',()=>{
  const lines=F.parseLrc('[00:01]One\n[00:05]Two\n[00:09]Three');
  assert.equal(F.activeLine(lines,999),-1);assert.equal(F.activeLine(lines,5000),1);assert.equal(F.activeLine(lines,99999),2);assert.equal(F.activeLine(lines,1500),0);assert.equal(F.activeLine([],100),-1);
});
test('corrupt persisted settings are clamped to safe audio and timing ranges',()=>{
  const p=F.preferences({theme:'broken',language:'xx',volume:1000,lyricsOffset:-999999,eq:[100,-100,'NaN']});
  assert.equal(p.theme,'dark');assert.equal(p.language,'ru');assert.equal(p.volume,100);assert.equal(p.lyricsOffset,-10000);assert.equal('eq' in p,false);assert.equal('eqEnabled' in p,false);
});
test('a saved light theme and English UI survive normalization',()=>{
  const p=F.preferences({theme:'light',language:'en',volume:0,lyricsAuto:false,clientId:'public-id'});
  assert.equal(p.theme,'light');assert.equal(p.language,'en');assert.equal(p.volume,0);assert.equal(p.lyricsAuto,false);assert.equal(p.clientId,'public-id');
});
test('lyrics cache separates different artists and recording durations',()=>{
  const a={name:'Song',artists:'One',duration:120000};
  assert.notEqual(F.lyricsKey(a),F.lyricsKey({...a,artists:'Two'}));assert.notEqual(F.lyricsKey(a),F.lyricsKey({...a,duration:135000}));
});
test('lyrics keep LRCLIB timestamps and do not contact Genius when a text is available',async()=>{
  let calls=0;const service=new F.LyricsService({lrclib:async()=>({syncedLyrics:'[00:01]Original fixture'}),genius:async()=>{calls++;}});const result=await service.resolve({});assert.equal(result.source,'lrclib');assert.match(result.syncedLyrics,/00:01/);assert.equal(calls,0);
});
test('missing and empty LRCLIB results fall back to Genius as plain lyrics',async()=>{
  for(const first of [null,{}, {plainLyrics:' ',syncedLyrics:''},{plainLyrics:123,syncedLyrics:{}}]){const order=[];const service=new F.LyricsService({lrclib:async()=>{order.push('lrclib');return first;},genius:async()=>{order.push('genius');return {plainLyrics:'Original fixture',syncedLyrics:'made-up timestamps',sourceUrl:'https://genius.com/Fixture-lyrics'};}});const result=await service.resolve({});assert.deepEqual(order,['lrclib','genius']);assert.equal(result.source,'genius');assert.equal(result.syncedLyrics,'');assert.equal(result.plainLyrics,'Original fixture');}
});
test('instrumental LRCLIB recordings do not get unrelated Genius lyrics',async()=>{
  const service=new F.LyricsService({lrclib:async()=>({instrumental:true}),genius:async()=>{throw Error('must not search');}});assert.equal((await service.resolve({})).instrumental,true);
});
test('LRCLIB outages try Genius, whose unavailable result is preserved honestly',async()=>{
  const service=new F.LyricsService({lrclib:async()=>{throw Error('network');},genius:async()=>({unavailable:true,searchUrl:'https://genius.com/search?q=Fixture'})});const result=await service.resolve({});assert.equal(result.unavailable,true);assert.ok(result.searchUrl);assert.equal(result.source,'genius');
});
test('cancelled lyric requests cannot start a fallback or overwrite another track',async()=>{
  const controller=new AbortController();let calls=0;const service=new F.LyricsService({lrclib:async()=>{controller.abort();return null;},genius:async()=>{calls++;}});await assert.rejects(service.resolve({},controller.signal),e=>e.name==='AbortError');assert.equal(calls,0);
});
