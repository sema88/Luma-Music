(() => {
  'use strict';
  const A=window.Luma,F=window.LumaFeaturesCore,I=window.LumaI18n,$=id=>document.getElementById(id),tr=(ru,en)=>I.tr(ru,en),esc=A.esc;
  let prefs=F.preferences(),localTracks=[],cache={records:{}},saveTimer,saveQueue=Promise.resolve(),localView=false,localCurrent=null,localUrl='';
  let selected=null,currentLyrics=null,lyricsGeneration=0,lyricsController,lastLyricsRequest=0,rateLimitUntil=0,activeIndex=-2,userScrollUntil=0,sleepAt=0;
  const audio=new Audio();audio.preload='metadata';
  const root=document.createElement('div');root.id='luma-features';root.innerHTML=`
  <dialog id="preferences-dialog" class="modal preferences-dialog">
    <button class="modal-close icon-button" data-close="preferences-dialog" aria-label="Закрыть"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg></button>
    <div class="eyebrow">LUMA MUSIC 1.14</div><h2>Настройки</h2><p>Расширенные настройки</p>
    <div class="preferences-layout"><nav class="preferences-nav" aria-label="Настройки">
      <button class="pref-tab selected" data-pref-tab="appearance">◐ <span>Оформление</span></button>
      <button class="pref-tab" data-pref-tab="audio">≋ <span>Звук</span></button>
      <button class="pref-tab" data-pref-tab="library">♫ <span>Локальная музыка</span></button>
      <button class="pref-tab" data-pref-tab="lyrics">☷ <span>Тексты песен</span></button>
      <button class="pref-tab" data-pref-tab="account">↗ <span>Подключение</span></button>
    </nav><div class="preferences-content">
      <section data-pref-content="appearance"><h3>Оформление</h3><label class="field-label">Тема</label>
        <div class="theme-choices"><button class="theme-choice" data-theme-choice="light"><span class="theme-preview light-preview"></span><span>Светлая</span></button><button class="theme-choice" data-theme-choice="dark"><span class="theme-preview dark-preview"></span><span>Тёмная</span></button><button class="theme-choice" data-theme-choice="system"><span class="theme-preview system-preview"></span><span>Как в системе</span></button></div>
        <label class="preference-row"><span>Язык интерфейса</span><select id="preference-language"><option value="ru">Русский</option><option value="en">English</option></select></label>
        <label class="preference-row"><span>Меньше анимации</span><input id="preference-motion" class="switch" type="checkbox"></label>
        <label class="preference-row"><span>Меньше прозрачности</span><input id="preference-solid" class="switch" type="checkbox"></label>
        <label class="preference-row"><span>Компактный список</span><input id="preference-compact" class="switch" type="checkbox"></label>
      </section>
      <section data-pref-content="audio" hidden><h3>Звук</h3><p class="settings-description">${tr('Громкость регулируется в нижней панели плеера.','Adjust volume in the bottom player bar.')}</p><label class="preference-row"><span>Таймер сна</span><select id="sleep-timer"><option value="0">Выключен</option><option value="15">15 мин</option><option value="30">30 мин</option><option value="45">45 мин</option><option value="60">60 мин</option><option value="90">90 мин</option></select></label><p id="sleep-status" class="settings-description"></p>
      </section>
      <section data-pref-content="library" hidden><h3>Локальная музыка</h3><p class="settings-description">Ваши аудиофайлы остаются на компьютере.</p><button class="button primary" data-local-import>＋ <span>Добавить файлы</span></button>
        <div class="settings-info"><h4>Скачивание Spotify</h4><p>Spotify не предоставляет Luma скачивание аудио. Для офлайн-прослушивания используйте загрузки в официальном приложении Spotify.</p><a class="text-button" href="spotify:" target="_blank" rel="noreferrer">Открыть Spotify ↗</a></div>
        <div class="settings-info"><h4>Экспорт библиотеки</h4><button id="export-library" class="button secondary">Экспорт JSON</button></div>
      </section>
      <section data-pref-content="lyrics" hidden><h3>Тексты песен</h3><label class="preference-row"><span>Автоматически искать текст</span><input id="lyrics-auto" class="switch" type="checkbox"></label><p class="settings-description">Сначала ищем текст в LRCLIB, затем в Genius. Поиск передаёт название и исполнителя; у Genius текст может быть без временных меток.</p>
        <label class="preference-row"><span>Сдвиг текста, мс</span><input id="lyrics-offset" class="number-input" type="number" min="-10000" max="10000" step="100" value="0"></label><button id="open-lyrics-settings" class="button secondary">Открыть текст песни</button>
      </section>
      <section data-pref-content="account" hidden><h3>Подключение</h3><button id="open-spotify-settings" class="button primary">Открыть настройки Spotify</button><label class="preference-row"><span>Синхронизация при запуске</span><input id="auto-sync" class="switch" type="checkbox"></label><p class="settings-description">Данные хранятся на этом компьютере</p></section>
    </div></div><div class="preferences-footer"><span id="preferences-save-status">Настройки сохраняются автоматически.</span><button class="button secondary" data-close="preferences-dialog">Готово</button></div>
  </dialog>
  <section id="local-section" class="section" hidden><div class="section-heading"><div><h2>Локальная музыка</h2><p>Ваши аудиофайлы остаются на компьютере.</p></div><button class="button primary" data-local-import>＋ <span>Добавить файлы</span></button></div><p id="local-import-status" class="settings-description"></p><div id="local-rows"></div></section>
  <section id="expanded-player" class="expanded-player" hidden aria-label="Плеер">
    <header class="expanded-header"><div class="expanded-brand">luma<span>.</span><small>Сейчас играет</small></div><div class="expanded-header-actions"><button id="expanded-native-fullscreen" class="button secondary">⛶ <span>Во весь экран</span></button><button id="expanded-close" class="icon-button" aria-label="Свернуть плеер">⌄</button></div></header>
    <div class="expanded-body"><div class="expanded-track"><div id="expanded-cover" class="expanded-cover">${A.icon('note')}</div><div class="expanded-identity"><h2 id="expanded-title">Выберите трек</h2><p id="expanded-artist">Выберите трек в библиотеке</p></div><div class="expanded-seek"><span id="expanded-elapsed">0:00</span><input id="expanded-seek" type="range" min="0" max="1000" value="0" aria-label="Позиция воспроизведения"><span id="expanded-duration">0:00</span></div><div class="expanded-controls"><button class="icon-button" data-expanded-control="previous" aria-label="Предыдущий трек">${A.icon('previous')}</button><button id="expanded-play" class="play-button" data-expanded-control="toggle" aria-label="Воспроизвести">${A.icon('play')}</button><button class="icon-button" data-expanded-control="next" aria-label="Следующий трек">${A.icon('next')}</button></div><button id="expanded-lyrics-toggle" class="button secondary" aria-pressed="false">☷ <span>Текст</span></button></div>
    <aside id="lyrics-panel" class="lyrics-panel" aria-hidden="true" inert><div class="lyrics-header"><div><h3>Текст</h3><p id="lyrics-source">Синхронизация строк</p></div><div class="lyrics-actions"><button id="lyrics-retry" class="icon-button" aria-label="Найти снова">↻</button><button id="lyrics-import" class="button secondary compact">Загрузить LRC</button></div></div><div id="lyrics-lines" class="lyrics-lines"><p>Текст появится здесь</p></div><div class="lyrics-bottom"><span id="lyrics-status"></span><label><span>Сдвиг текста, мс</span><input id="panel-lyrics-offset" class="number-input" type="number" min="-10000" max="10000" step="100" value="0"></label></div></aside></div>
    <footer class="expanded-footer"><span id="expanded-source">LUMA MUSIC</span><span>YOUR MUSIC. YOUR SPACE.</span></footer>
  </section>
  <dialog id="local-metadata-dialog" class="modal small-modal"><button class="modal-close icon-button" data-close="local-metadata-dialog" aria-label="Закрыть">×</button><h2>Изменить данные</h2><label class="field-label" for="local-name">Название</label><input id="local-name" class="text-input" maxlength="200"><label class="field-label" for="local-artist">Исполнитель</label><input id="local-artist" class="text-input" maxlength="200"><button id="save-local-metadata" class="button primary">Сохранить</button></dialog>
  <input id="local-file-input" type="file" accept=".mp3,.wav,.ogg,.m4a,.flac,.aac,.opus,.webm,audio/*" multiple hidden><input id="lrc-file-input" type="file" accept=".lrc,.txt,text/plain" hidden>`;
  document.body.appendChild(root);
  document.addEventListener('keydown',event=>{
    if(!window.chrome?.webview||event.repeat)return;
    if(event.key==='F11'){
      event.preventDefault();event.stopImmediatePropagation();
      if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});
      else window.chrome.webview.postMessage(JSON.stringify({type:'window',action:'toggle-fullscreen'}));
    }else if(event.key==='Escape'&&!document.fullscreenElement&&!document.querySelector('dialog[open]')){window.chrome.webview.postMessage(JSON.stringify({type:'window',action:'exit-fullscreen'}));}
  },true);
  I.addTranslations({'Сначала ищем текст в LRCLIB, затем в Genius. Поиск передаёт название и исполнителя; у Genius текст может быть без временных меток.':'Search LRCLIB first, then Genius. Search sends the song title and artist; Genius lyrics may have no timestamps.'});
  // The local library belongs inside the main scroll area, not inside the dialogs.
  $('main').insertBefore($('local-section'),document.querySelector('.content-footer'));
  const localNav=document.createElement('button');localNav.className='nav-item';localNav.id='local-nav';localNav.innerHTML=`<span>${A.icon('note')}</span><span class="local-nav-label">Локальные файлы</span>`;document.querySelector('.sidebar nav').appendChild(localNav);
  const expandedButton=document.createElement('button');expandedButton.id='expand-player';expandedButton.className='icon-button';expandedButton.title='Развернуть плеер';expandedButton.setAttribute('aria-label','Развернуть плеер');expandedButton.textContent='⛶';
  const lyricsButton=document.createElement('button');lyricsButton.id='lyrics-toggle';lyricsButton.className='icon-button';lyricsButton.title='Открыть текст песни';lyricsButton.setAttribute('aria-label','Открыть текст песни');lyricsButton.textContent='☷';
  document.querySelector('.playback-controls').append(lyricsButton,expandedButton);
  let editingId=null;
  function applyPreferences(){
    const actual=prefs.theme==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):prefs.theme;
    document.documentElement.dataset.theme=actual;document.documentElement.classList.toggle('reduce-motion',prefs.reducedMotion);document.documentElement.classList.toggle('solid-glass',prefs.solidGlass);document.documentElement.classList.toggle('compact-list',prefs.compact);
    document.querySelector('meta[name="theme-color"]').content=actual==='dark'?'#111623':'#eaf0fc';
    I.setLanguage(prefs.language);$('volume').value=prefs.volume;audio.volume=F.outputVolume(prefs.volume);
    if(window.chrome?.webview){
      if(!document.querySelector('.desktop-backdrop')){const backdrop=document.createElement('div');backdrop.className='desktop-backdrop';backdrop.setAttribute('aria-hidden','true');document.body.prepend(backdrop);}
      const palette=getComputedStyle(document.documentElement);
      window.chrome.webview.postMessage(JSON.stringify({type:'appearance',theme:actual,language:prefs.language,backgroundStart:palette.getPropertyValue('--window-bg-start').trim(),backgroundEnd:palette.getPropertyValue('--window-bg-end').trim()}));
    }
    if(!currentTrack()){$('now-title').textContent=tr('Пусть зазвучит ваш день');$('now-artist').textContent=tr('Выберите трек в библиотеке');}
    $('preference-language').value=prefs.language;$('preference-motion').checked=prefs.reducedMotion;$('preference-solid').checked=prefs.solidGlass;$('preference-compact').checked=prefs.compact;$('lyrics-auto').checked=prefs.lyricsAuto;$('auto-sync').checked=prefs.autoSync;
    $('lyrics-offset').value=prefs.lyricsOffset;$('panel-lyrics-offset').value=prefs.lyricsOffset;
    document.querySelectorAll('[data-theme-choice]').forEach(button=>{const active=button.dataset.themeChoice===prefs.theme;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));});
    try{localStorage.setItem('luma-preferences',JSON.stringify(prefs));}catch{}
    updateExpanded();if(localView)renderLocal();
  }
  function savePreferences(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{const keys=['theme','language','reducedMotion','solidGlass','compact','autoSync','lyricsAuto','lyricsOffset','volume'];const snapshot=Object.fromEntries(keys.map(key=>[key,prefs[key]]));saveQueue=saveQueue.catch(()=>{}).then(()=>A.setSettings(snapshot)).catch(e=>A.toast(e.message));},300);}
  function changePreference(key,value){prefs=F.preferences({...prefs,[key]:value});applyPreferences();savePreferences();}
  async function initialize(){
    prefs=F.preferences({...prefs,...A.settings});applyPreferences();
    try{const data=await Promise.all([A.native('local-library'),A.native('lyrics-cache')]);localTracks=Array.isArray(data[0]?.tracks)?data[0].tracks:[];cache=data[1]?.records?data[1]:{records:{}};if(localView)renderLocal();}catch{/* Unauthenticated design previews still work. */}
  }
  try{prefs=F.preferences(JSON.parse(localStorage.getItem('luma-preferences')||'{}'));}catch{}
  applyPreferences();window.addEventListener('luma:settings',initialize);if(Object.keys(A.settings).length)initialize();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{if(prefs.theme==='system')applyPreferences();});
  function openPreferences(){if(!$('preferences-dialog').open)$('preferences-dialog').showModal();}
  window.addEventListener('luma:open-settings',openPreferences);
  document.addEventListener('click',event=>{
    const tab=event.target.closest('[data-pref-tab]');if(tab){document.querySelectorAll('[data-pref-tab]').forEach(b=>b.classList.toggle('selected',b===tab));document.querySelectorAll('[data-pref-content]').forEach(p=>{p.hidden=p.dataset.prefContent!==tab.dataset.prefTab;});}
    const theme=event.target.closest('[data-theme-choice]');if(theme)changePreference('theme',theme.dataset.themeChoice);
    if(event.target.closest('[data-local-import]'))$('local-file-input').click();
    const row=event.target.closest('[data-local-play]');if(row)playLocal(row.dataset.localPlay).catch(e=>A.notice(tr('Звук'),e.message));
    const download=event.target.closest('[data-local-download]');if(download)downloadLocal(download.dataset.localDownload).catch(e=>A.toast(e.message));
    const edit=event.target.closest('[data-local-edit]');if(edit){const track=localTracks.find(t=>t.id===edit.dataset.localEdit);if(track){editingId=track.id;$('local-name').value=track.name;$('local-artist').value=track.artists;$('local-metadata-dialog').showModal();}}
    const control=event.target.closest('[data-expanded-control]');if(control)controlPlayback(control.dataset.expandedControl).catch(e=>A.toast(e.message));
  });
  for(const [id,key]of [['preference-motion','reducedMotion'],['preference-solid','solidGlass'],['preference-compact','compact'],['lyrics-auto','lyricsAuto'],['auto-sync','autoSync']])$(id).addEventListener('change',event=>changePreference(key,event.target.checked));
  $('preference-language').addEventListener('change',event=>changePreference('language',event.target.value));
  for(const id of ['lyrics-offset','panel-lyrics-offset'])$(id).addEventListener('change',event=>changePreference('lyricsOffset',Number(event.target.value)));
  $('open-spotify-settings').addEventListener('click',()=>{$('preferences-dialog').close();A.showConnection();});
  $('open-lyrics-settings').addEventListener('click',()=>{$('preferences-dialog').close();openExpanded(true);});
  $('volume').addEventListener('input',()=>{prefs.volume=Number($('volume').value);audio.volume=F.outputVolume(prefs.volume);savePreferences();});
  function showLocal(){
    A.navigate('tracks');localView=true;$('local-section').hidden=false;for(const id of ['page-heading','hero','stats','collections-section','tracks-section'])$(id).hidden=true;
    $('breadcrumb-current').textContent=tr('Локальная музыка');document.querySelectorAll('.nav-item[data-view]').forEach(b=>b.classList.remove('active'));localNav.classList.add('active');renderLocal();
  }
  localNav.addEventListener('click',showLocal);
  window.addEventListener('luma:render',()=>{localView=false;$('local-section').hidden=true;$('page-heading').hidden=false;localNav.classList.remove('active');});
  function renderLocal(){
    $('local-rows').innerHTML=localTracks.length?localTracks.map(t=>`<div class="local-track-row"><button class="local-play icon-button" data-local-play="${esc(t.id)}" aria-label="${esc(tr('Слушать')+' '+t.name)}">${A.icon(localCurrent?.id===t.id&&!audio.paused?'pause':'play')}</button><div class="local-track-copy"><strong>${esc(t.name)}</strong><span>${esc(t.artists||tr('Неизвестный исполнитель'))}</span></div><span class="local-length">${A.time(t.duration||0)}</span><button class="icon-button" data-local-edit="${esc(t.id)}" title="${tr('Изменить данные')}">✎</button><button class="button secondary compact" data-local-download="${esc(t.id)}">${tr('Сохранить копию')}</button></div>`).join(''):`<div class="empty-state"><span>${A.icon('note')}</span><strong>${tr('Локальных файлов пока нет')}</strong><p>${tr('Добавьте MP3, WAV, OGG, M4A или FLAC. До 64 МБ на файл.')}</p></div>`;
  }
  async function saveLocalLibrary(){await A.native('local-library','PUT',{version:1,tracks:localTracks});}
  function guessedMetadata(filename){const base=filename.replace(/\.[^.]+$/,'');const pieces=base.split(' - ');return pieces.length>1?{artists:pieces.shift(),name:pieces.join(' - ')}:{artists:'',name:base};}
  function readDuration(file){return new Promise(resolve=>{const probe=new Audio(),url=URL.createObjectURL(file);const finish=()=>{const duration=Number.isFinite(probe.duration)?probe.duration*1000:0;URL.revokeObjectURL(url);probe.removeAttribute('src');resolve(duration);};probe.onloadedmetadata=finish;probe.onerror=finish;probe.src=url;setTimeout(finish,5000);});}
  $('local-file-input').addEventListener('change',async event=>{
    const files=[...event.target.files];event.target.value='';if(!files.length)return;
    $('preferences-dialog').close();showLocal();$('local-import-status').textContent=tr('Добавляем файлы…');
    const errors=[];
    for(const file of files){
      try{
        const extension='.'+file.name.split('.').pop().toLowerCase();if(!['.mp3','.wav','.ogg','.m4a','.flac','.aac','.opus','.webm'].includes(extension))throw new Error(tr('Невозможно прочитать аудиофайл'));
        if(file.size>64*1024*1024)throw new Error(tr('Файл больше 64 МБ','File exceeds 64 MB'));
        const response=await fetch('/api/media-upload?extension='+encodeURIComponent(extension),{method:'PUT',headers:{Authorization:'Bearer '+sessionStorage.getItem('luma-key')},body:file});
        if(!response.ok)throw new Error(tr('Не удалось сохранить файл','Could not save the file'));
        const saved=await response.json();const metadata=guessedMetadata(file.name),duration=await readDuration(file);
        localTracks.push({id:saved.id,...metadata,filename:file.name,extension,mime:file.type||'application/octet-stream',duration,source:'local',addedAt:new Date().toISOString()});
        await saveLocalLibrary();renderLocal();
      }catch(e){errors.push(file.name+': '+e.message);}
    }
    $('local-import-status').textContent=errors.length?errors.join('\n'):tr('Готово');
  });
  $('save-local-metadata').addEventListener('click',async()=>{const track=localTracks.find(t=>t.id===editingId);if(!track)return;track.name=$('local-name').value.trim()||track.filename;track.artists=$('local-artist').value.trim();try{await saveLocalLibrary();$('local-metadata-dialog').close();renderLocal();if(localCurrent?.id===track.id){selected={...track};updateExpanded();loadLyrics(true);}}catch(e){A.toast(e.message);}});
  async function mediaBlob(track){const response=await fetch('/api/media-file?id='+encodeURIComponent(track.id),{headers:{Authorization:'Bearer '+sessionStorage.getItem('luma-key')}});if(!response.ok)throw new Error(tr('Невозможно прочитать аудиофайл'));return new Blob([await response.arrayBuffer()],{type:track.mime||'audio/'+track.extension.slice(1)});}
  function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
  async function downloadLocal(id){const track=localTracks.find(t=>t.id===id);if(track)downloadBlob(await mediaBlob(track),track.filename);}
  $('export-library').addEventListener('click',()=>downloadBlob(new Blob([JSON.stringify({spotify:A.library,manual:window.LumaServices?.library,local:localTracks},null,2)],{type:'application/json'}),'Luma-library.json'));
  async function playLocal(id){
    const track=localTracks.find(t=>t.id===id);if(!track)return;
    const request=window.LumaPlayback.claim('local');
    return window.LumaPlayback.run(request,async()=>{
      window.LumaServices?.stop();await A.pauseSpotify();if(!request.current())return;
      if(localCurrent?.id===id){audio.play().catch(error=>{if(request.current()&&error.name!=='AbortError')A.toast(error.message);});return;}
      const blob=await mediaBlob(track);if(!request.current())return;audio.pause();if(localUrl)URL.revokeObjectURL(localUrl);localUrl=URL.createObjectURL(blob);localCurrent=track;selected={...track};audio.src=localUrl;audio.volume=F.outputVolume(prefs.volume);
      audio.play().then(()=>{if(!window.LumaPlayback.owns('local'))audio.pause();}).catch(error=>{if(request.current()&&error.name!=='AbortError')A.toast(error.message);});updateLocalPlayer();updateExpanded();if(prefs.lyricsAuto)loadLyrics();renderLocal();
    });
  }
  function updateLocalPlayer(){if(!localCurrent)return;$('now-title').textContent=localCurrent.name;$('now-artist').textContent=localCurrent.artists||tr('Локальный файл');$('now-cover').innerHTML=A.icon('note');$('now-spotify').hidden=true;$('player-status').textContent=tr('Локальный файл');$('play-pause').innerHTML=A.icon(audio.paused?'play':'pause');$('play-pause').setAttribute('aria-label',tr(audio.paused?'Воспроизвести':'Пауза'));$('duration').textContent=A.time((audio.duration||0)*1000);if(localView)renderLocal();updateExpanded();}
  async function localControl(action){
    if(!localCurrent)return;
    if(action==='toggle')return mediaControl('toggle');
    if(action==='next'||action==='previous'){let index=localTracks.findIndex(t=>t.id===localCurrent.id);index=(index+(action==='next'?1:-1)+localTracks.length)%localTracks.length;await playLocal(localTracks[index].id);}
    if(action==='repeat'){audio.loop=!audio.loop;$('repeat').setAttribute('aria-pressed',String(audio.loop));}
    if(action==='shuffle'){const random=localTracks[Math.floor(Math.random()*localTracks.length)];if(random)await playLocal(random.id);}
  }
  function stopLocal(){audio.pause();localCurrent=null;$('now-spotify').hidden=false;}
  window.LumaPlayback.register('local',stopLocal);
  for(const event of ['play','pause','loadedmetadata'])audio.addEventListener(event,()=>{if(event==='play'&&!window.LumaPlayback.owns('local')){audio.pause();return;}updateLocalPlayer();window.dispatchEvent(new Event('luma:playback'));});
  audio.addEventListener('ended',()=>{if(!audio.loop)localControl('next').catch(e=>A.toast(e.message));});
  audio.addEventListener('error',()=>A.toast(tr('Невозможно прочитать аудиофайл')));
  $('seek').addEventListener('change',()=>{if(localCurrent&&Number.isFinite(audio.duration))audio.currentTime=Number($('seek').value)/1000*audio.duration;});
  function currentTrack(){
    if(window.LumaServices?.active)return window.LumaServices.track;
    if(localCurrent)return {...localCurrent,duration:Number.isFinite(audio.duration)?audio.duration*1000:localCurrent.duration};
    const track=A.state?.track_window?.current_track;if(track)return {id:track.id,name:track.name,artists:(track.artists||[]).map(x=>x.name).join(', '),album:track.album?.name||'',image:track.album?.images?.[0]?.url||A.lookupTrack?.(track.id)?.image||'',duration:A.state.duration,source:'spotify'};
    return selected;
  }
  function position(){if(window.LumaServices?.active)return window.LumaServices.position;return localCurrent?audio.currentTime*1000:A.position;}
  function isPaused(){if(window.LumaServices?.active)return window.LumaServices.paused;return localCurrent?audio.paused:A.state?.paused!==false;}
  function updateExpanded(){
    const t=currentTrack();$('expanded-title').textContent=t?.name||tr('Выберите трек');if($('expanded-artist').textContent!==(t?.artists||tr('Выберите трек в библиотеке'))||t?.source==='local')$('expanded-artist').textContent=t?.artists||tr('Выберите трек в библиотеке');
    const cover=$('expanded-cover');if(cover.dataset.image!==(t?.image||'')){cover.dataset.image=t?.image||'';cover.innerHTML=t?.image&&/^https:\/\//.test(t.image)?`<img src="${esc(t.image)}" alt="" referrerpolicy="no-referrer">`:A.icon('note');}
    if(!cover.firstChild)cover.innerHTML=A.icon('note');$('expanded-play').innerHTML=A.icon(isPaused()?'play':'pause');$('expanded-play').setAttribute('aria-label',tr(isPaused()?'Воспроизвести':'Пауза'));$('expanded-source').textContent=t?.source==='local'?tr('Локальный файл'):t?.source==='soundcloud'?'Music from SoundCloud':'Music from Spotify';$('expanded-duration').textContent=A.time(t?.duration||0);
  }
  function setLyricsOpen(open){const player=$('expanded-player');player.classList.toggle('with-lyrics',open);$('lyrics-panel').inert=!open;$('lyrics-panel').setAttribute('aria-hidden',String(!open));$('expanded-lyrics-toggle').setAttribute('aria-pressed',String(open));if(open)loadLyrics();}
  function openExpanded(lyrics=false){$('expanded-player').hidden=false;document.body.classList.add('player-expanded');document.querySelectorAll('.sidebar,.shell,.player').forEach(el=>{el.inert=true;});updateExpanded();setLyricsOpen(lyrics);$('expanded-close').focus();}
  async function closeExpanded(){if(document.fullscreenElement=== $('expanded-player'))await document.exitFullscreen();$('expanded-player').classList.remove('edge-to-edge');$('expanded-player').hidden=true;document.body.classList.remove('player-expanded');document.querySelectorAll('.sidebar,.shell,.player').forEach(el=>{el.inert=false;});$('expand-player').focus();}
  $('expand-player').addEventListener('click',()=>openExpanded(false));$('lyrics-toggle').addEventListener('click',()=>openExpanded(true));$('expanded-close').addEventListener('click',()=>closeExpanded().catch(e=>A.toast(e.message)));
  $('expanded-lyrics-toggle').addEventListener('click',()=>setLyricsOpen(!$('expanded-player').classList.contains('with-lyrics')));
  $('expanded-native-fullscreen').addEventListener('click',async()=>{const player=$('expanded-player');try{if(window.LumaServices?.active&&window.LumaServices.track?.source==='spotify'){player.classList.toggle('edge-to-edge');return;}if(document.fullscreenElement)await document.exitFullscreen();else if(player.classList.contains('edge-to-edge')){player.classList.remove('edge-to-edge');$('expanded-native-fullscreen').innerHTML='⛶ <span>'+tr('Во весь экран')+'</span>';}else await player.requestFullscreen();}catch{player.classList.add('edge-to-edge');$('expanded-native-fullscreen').innerHTML='⛶ <span>'+tr('Вернуть поля','Restore window margins')+'</span>';A.toast(tr('Плеер развёрнут на всё окно. Браузер не разрешил системный полный экран.','The player fills the window. The browser did not allow system full screen.'));}});
  document.addEventListener('fullscreenchange',()=>{$('expanded-native-fullscreen').innerHTML='⛶ <span>'+(document.fullscreenElement?tr('Выйти из полного экрана'):tr('Во весь экран'))+'</span>';});
  async function controlPlayback(action){if(localCurrent)return localControl(action);const ids={toggle:'play-pause',next:'next',previous:'previous'};if(ids[action])$(ids[action]).click();}
  $('expanded-seek').addEventListener('change',async()=>{const t=currentTrack();if(t)await seek(Number($('expanded-seek').value)/1000*t.duration);});
  async function seek(ms){if(window.LumaServices?.active)return window.LumaServices.seek(ms);if(localCurrent){audio.currentTime=Math.max(0,Math.min(audio.duration,ms/1000));}else await A.seek(ms);}
  document.addEventListener('keydown',event=>{if($('expanded-player').hidden)return;if(event.key==='Escape'&&!document.fullscreenElement&&!document.querySelector('dialog[open]'))closeExpanded();},true);
  window.addEventListener('luma:playback',()=>{
    const state=A.state;if(localCurrent&&state&&!state.paused)stopLocal();
    const t=currentTrack();if(t&&(!selected||F.lyricsKey(t)!==F.lyricsKey(selected))){selected=t;currentLyrics=null;if(prefs.lyricsAuto||$('expanded-player').classList.contains('with-lyrics'))loadLyrics();}updateExpanded();
  });
  function lyricsMessage(message){$('lyrics-lines').innerHTML=`<div class="lyrics-empty"><span>☷</span><h3>${esc(message)}</h3><p>${esc(tr('Для этой версии песни текст не найден. Можно загрузить свой .lrc или .txt.'))}</p></div>`;activeIndex=-2;}
  async function saveLyricsCache(){const entries=Object.entries(cache.records).sort((a,b)=>(b[1].savedAt||0)-(a[1].savedAt||0)).slice(0,100);cache.records=Object.fromEntries(entries);await A.native('lyrics-cache','PUT',cache);}
  function renderLyrics(record){
    currentLyrics=record;activeIndex=-2;const parsed=record?.syncedLyrics?F.parseLrc(record.syncedLyrics):[];currentLyrics.lines=parsed;
    $('lyrics-source').textContent=record.manual?tr('Текст из файла'):record.source==='genius'?'Genius':tr('Источник: LRCLIB');if(record.source==='genius'&&(record.sourceUrl||record.searchUrl)){const link=document.createElement('a');link.href=record.sourceUrl||record.searchUrl;link.target='_blank';link.rel='noreferrer';link.className='text-button';link.textContent=' · '+tr('Открыть Genius','Open Genius');$('lyrics-source').appendChild(link);}
    $('lyrics-status').textContent=record.instrumental?tr('Инструментальная композиция'):parsed.length?tr('Синхронизация строк'):tr('Без временных меток');
    if(record.instrumental){$('lyrics-lines').innerHTML=`<div class="lyrics-empty"><h3>${tr('Инструментальная композиция')}</h3></div>`;return;}
    if(parsed.length)$('lyrics-lines').innerHTML=parsed.map((line,i)=>`<button class="lyric-line" data-lyric-line="${i}" aria-label="${esc(line.text||'…')}">${esc(line.text||'♪')}</button>`).join('');
    else if(record.plainLyrics)$('lyrics-lines').innerHTML=record.plainLyrics.split(/\r?\n/).map(line=>`<p class="lyric-line plain-line">${esc(line||'♪')}</p>`).join('');
    else lyricsMessage(record.unavailable?tr('Genius временно недоступен. Можно открыть поиск по ссылке выше.','Genius is temporarily unavailable. Use the search link above.'):tr('Текст не найден'));
  }
  async function loadLyrics(force=false){
    const track=currentTrack();if(!track){lyricsMessage(tr('Сначала включите песню или выберите её в библиотеке.'));return;}
    const key=F.lyricsKey(track);if(!force&&currentLyrics?.key===key)return;
    const generation=++lyricsGeneration;lyricsController?.abort();
    if(!force&&cache.records[key]){renderLyrics({...cache.records[key],key});return;}
    if(A.demo||track.id?.startsWith('demo')){lyricsMessage(tr('Демонстрационный текст'));return;}
    if(!track.artists){lyricsMessage(tr('Текст не найден'));return;}
    const wait=Math.max(0,lastLyricsRequest+400-Date.now(),rateLimitUntil-Date.now());
    if(wait>3000){lyricsMessage(tr('Повторите поиск позже','Try again later'));return;}
    $('lyrics-lines').innerHTML=`<div class="lyrics-empty"><h3>${tr('Ищем текст…')}</h3></div>`;
    if(wait)await new Promise(resolve=>setTimeout(resolve,wait));if(generation!==lyricsGeneration)return;
    lastLyricsRequest=Date.now();lyricsController=new AbortController();const controller=lyricsController;const timeout=setTimeout(()=>controller.abort(),35000);
    const params=new URLSearchParams({track_name:track.name,artist_name:track.artists.split(', ')[0]});if(track.album)params.set('album_name',track.album);if(track.duration>0&&track.duration<=3600000)params.set('duration',String(Math.round(track.duration/1000)));
    try{
      const service=new F.LyricsService({lrclib:async()=>{const response=await fetch('https://lrclib.net/api/get?'+params,{headers:{'X-User-Agent':'Luma Music v1.9'},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(10000)])});if(response.status===429){rateLimitUntil=Date.now()+(Number(response.headers.get('Retry-After'))||60)*1000;return null;}if(response.status===404)return null;if(!response.ok)throw new Error(tr('Не удалось получить текст'));return response.json();},genius:async()=>{if(generation===lyricsGeneration)$('lyrics-source').textContent=tr('Ищем в Genius…','Searching Genius…');return A.native('genius-lyrics','POST',{title:track.name.slice(0,160),artist:track.artists.split(', ')[0].slice(0,160)});}});
      const data=await service.resolve(track,controller.signal);const record={...data,key,syncedLyrics:typeof data?.syncedLyrics==='string'?data.syncedLyrics.slice(0,200000):'',plainLyrics:typeof data?.plainLyrics==='string'?data.plainLyrics.slice(0,200000):'',instrumental:!!data?.instrumental,manual:false,savedAt:Date.now()};
      if(generation!==lyricsGeneration)return;if(record.instrumental||record.syncedLyrics||record.plainLyrics)cache.records[key]=record;renderLyrics(record);saveLyricsCache().catch(e=>A.toast(e.message));
    }catch(e){if(generation!==lyricsGeneration)return;lyricsMessage(e.name==='AbortError'?tr('Не удалось получить текст'):e.message);}
    finally{clearTimeout(timeout);}
  }
  $('lyrics-retry').addEventListener('click',()=>loadLyrics(true));$('lyrics-import').addEventListener('click',()=>{$('lrc-file-input').click();});
  $('lrc-file-input').addEventListener('change',async event=>{
    const file=event.target.files[0];event.target.value='';const track=currentTrack();if(!file||!track)return;
    try{if(file.size>1024*1024)throw new Error(tr('Текст слишком большой','Lyrics file is too large'));const text=await file.text(),lines=F.parseLrc(text);const key=F.lyricsKey(track),record={key,syncedLyrics:lines.length?text:'',plainLyrics:lines.length?'':text,manual:true,savedAt:Date.now()};lyricsGeneration++;lyricsController?.abort();cache.records[key]=record;await saveLyricsCache();renderLyrics(record);A.toast(tr('Текст сохранён'));}catch(e){A.toast(e.message);}
  });
  $('lyrics-lines').addEventListener('click',event=>{const button=event.target.closest('[data-lyric-line]');if(button&&currentLyrics?.lines){const line=currentLyrics.lines[Number(button.dataset.lyricLine)];if(line)seek(Math.max(0,line.time-prefs.lyricsOffset)).catch(e=>A.toast(e.message));}});
  $('lyrics-lines').addEventListener('wheel',()=>{userScrollUntil=Date.now()+6000;},{passive:true});
  $('sleep-timer').addEventListener('change',event=>{const minutes=Number(event.target.value);sleepAt=minutes?Date.now()+minutes*60000:0;$('sleep-status').textContent=minutes?tr('Остановить через')+' '+minutes+' '+tr('мин','min'):tr('Таймер выключен');});
  setInterval(()=>{
    const track=currentTrack(),pos=position();
    const formatted=A.time(pos);
    if(localCurrent){if($('elapsed').textContent!==formatted)$('elapsed').textContent=formatted;if(document.activeElement!==$('seek'))$('seek').value=track.duration?pos/track.duration*1000:0;}
    if(!$('expanded-player').hidden){if($('expanded-elapsed').textContent!==formatted)$('expanded-elapsed').textContent=formatted;if(document.activeElement!==$('expanded-seek'))$('expanded-seek').value=track?.duration?pos/track.duration*1000:0;}
    if(currentLyrics?.lines?.length&&$('expanded-player').classList.contains('with-lyrics')&&!$('expanded-player').hidden){const index=F.activeLine(currentLyrics.lines,pos+prefs.lyricsOffset);if(index!==activeIndex){activeIndex=index;document.querySelectorAll('[data-lyric-line]').forEach((el,i)=>{el.classList.toggle('active',i===index);el.classList.toggle('past',i<index);});if(index>=0&&Date.now()>userScrollUntil)$('lyrics-lines').querySelector(`[data-lyric-line="${index}"]`)?.scrollIntoView({block:'center',behavior:prefs.reducedMotion?'auto':'smooth'});}}
    if(sleepAt&&Date.now()>=sleepAt){sleepAt=0;audio.pause();A.pause().catch(()=>{});$('sleep-timer').value='0';$('sleep-status').textContent=tr('Таймер выключен');A.toast(tr('Таймер остановил воспроизведение'));}
  },120);
  function mediaState(){const playing=localCurrent||window.LumaServices?.active||A.state?.track_window?.current_track;return {track:playing?currentTrack():null,paused:isPaused(),position:position()};}
  async function mediaControl(action,value){
    if(['play','pause','toggle'].includes(action))return window.LumaPlayback.control(async()=>{
      const state=mediaState();if(!state.track)return false;const pause=action==='pause'||action==='toggle'&&!state.paused;
      if(window.LumaServices?.active)await window.LumaServices.setPaused(pause);
      else if(localCurrent){if(pause)audio.pause();else{await A.pauseSpotify();if(localCurrent&&window.LumaPlayback.owns('local'))audio.play().catch(error=>{if(error.name!=='AbortError')A.toast(error.message);});}}
      else await A.setPlaybackPaused(pause);return true;
    });
    if(!mediaState().track)return false;if(action==='seek'){if(Number.isFinite(value))await seek(Math.max(0,value));}else if(action==='next'||action==='previous')await controlPlayback(action);return true;
  }
  window.LumaExtras={closeExpanded,get mediaState(){return mediaState();},mediaControl,get localActive(){return !!localCurrent;},control:localControl,stopLocal,selectTrack(track){selected=track;updateExpanded();if(prefs.lyricsAuto)loadLyrics();}};
})();
