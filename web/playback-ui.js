(()=>{
  'use strict';
  const A=window.Luma,E=window.LumaExtras,I=window.LumaI18n;
  const selector='[data-play],[data-catalog-play],[data-manual-play],[data-artist-play],[data-local-play]';
  function key(button){const d=button.dataset;return d.manualPlay||d.artistPlay||(d.localPlay?'local:'+d.localPlay:'spotify:'+(d.play||d.catalogPlay));}
  function current(){const state=E.mediaState,t=state.track;return {key:t?(t.key||(t.source||'spotify')+':'+t.id):'',paused:state.paused};}
  let scheduled=false;
  function update(){scheduled=false;const state=current();for(const button of document.querySelectorAll(selector)){
    const active=key(button)===state.key,playing=active&&!state.paused,row=button.closest('.track-row,.catalog-track,.local-track-row');
    if(row){row.classList.toggle('current',active);row.classList.toggle('is-playing',playing);if(active)row.setAttribute('aria-current','true');else row.removeAttribute('aria-current');}
    const stamp=playing?'pause':'play';if(button.dataset.playbackVisual!==stamp){button.dataset.playbackVisual=stamp;button.innerHTML=A.icon(stamp);}
    button.setAttribute('aria-label',I.tr(playing?'Пауза':'Воспроизвести',playing?'Pause':'Play'));button.setAttribute('aria-pressed',String(playing));
  }}
  function schedule(){if(!scheduled){scheduled=true;queueMicrotask(update);}}
  document.addEventListener('click',event=>{const button=event.target.closest?.(selector);if(!button||key(button)!==current().key)return;event.preventDefault();event.stopImmediatePropagation();E.mediaControl(current().paused?'play':'pause').catch(error=>A.toast(error.message));},true);
  for(const name of ['luma:playback','luma:render','luma:tracks','luma:language'])window.addEventListener(name,schedule);
  new MutationObserver(schedule).observe(document.getElementById('main'),{childList:true,subtree:true});schedule();window.LumaPlaybackUI={update};
})();
