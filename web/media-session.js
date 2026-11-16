(()=>{
  'use strict';
  const E=window.LumaExtras;let lastSnapshot='',lastMetadata='';
  function publish(){
    const state=E.mediaState,t=state.track;const snapshot={type:'media',title:t?.name||'',artist:t?.artists||'',album:t?.album||'',image:/^https:\/\//.test(t?.image||'')?t.image:'',duration:Math.max(0,Number(t?.duration)||0),position:Math.max(0,Math.floor((Number(state.position)||0)/1000)*1000),paused:!t||!!state.paused};
    if(snapshot.duration)snapshot.position=Math.min(snapshot.position,snapshot.duration);
    const serialized=JSON.stringify(snapshot);if(serialized!==lastSnapshot){lastSnapshot=serialized;window.chrome?.webview?.postMessage(serialized);}
    const metadata=JSON.stringify([snapshot.title,snapshot.artist,snapshot.album,snapshot.image]);
    if(metadata!==lastMetadata){lastMetadata=metadata;document.title=t?snapshot.title+(snapshot.artist?' — '+snapshot.artist:'')+' · Luma':'Luma Music';if('mediaSession' in navigator&&window.MediaMetadata)navigator.mediaSession.metadata=t?new MediaMetadata({title:snapshot.title,artist:snapshot.artist,album:snapshot.album,artwork:snapshot.image?[{src:snapshot.image}]:[]}):null;}
    if('mediaSession' in navigator){navigator.mediaSession.playbackState=!t?'none':snapshot.paused?'paused':'playing';try{if(snapshot.duration>0)navigator.mediaSession.setPositionState({duration:snapshot.duration/1000,position:snapshot.position/1000,playbackRate:1});else navigator.mediaSession.setPositionState();}catch{}}
  }
  if('mediaSession' in navigator){for(const action of ['play','pause','nexttrack','previoustrack','stop'])try{navigator.mediaSession.setActionHandler(action,()=>E.mediaControl(({nexttrack:'next',previoustrack:'previous',stop:'pause'})[action]||action));}catch{}try{navigator.mediaSession.setActionHandler('seekto',event=>E.mediaControl('seek',event.seekTime*1000));}catch{}}
  window.addEventListener('luma:playback',()=>queueMicrotask(publish));setInterval(publish,1000);publish();window.LumaMedia={publish};
})();
