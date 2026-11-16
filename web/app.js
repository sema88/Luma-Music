'use strict';
(() => {
  const C = LumaCore, P=window.LumaPlayback;
  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const paths = {
    home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
    library:'<path d="M4 4v16M9 4v16M14 5l5-1 3 15-5 1z"/>',
    heart:'<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0l-1 1-1-1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8z"/>',
    disc:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="M6 12a6 6 0 0 1 6-6m0 12a6 6 0 0 0 6-6"/>',
    settings:'<path d="m10 3-.6 2.4-2 .9L5 5.7 3 9l1.8 1.8v2.4L3 15l2 3.3 2.4-.6 2 .9L10 21h4l.6-2.4 2-.9 2.4.6 2-3.3-1.8-1.8v-2.4L21 9l-2-3.3-2.4.6-2-.9L14 3z"/><circle cx="12" cy="12" r="3"/>',
    sync:'<path d="M20 8A8 8 0 0 0 6 5L3 8m0-5v5h5m-4 8a8 8 0 0 0 14 3l3-3m0 5v-5h-5"/>',
    search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    note:'<path d="M9 17V5l11-2v12M9 8l11-2"/><ellipse cx="5.5" cy="18" rx="3.5" ry="3"/><ellipse cx="16.5" cy="16" rx="3.5" ry="3"/>',
    play:'<path d="m9 5 11 7-11 7z" fill="currentColor" stroke="none"/>',
    pause:'<path d="M7 5h4v14H7zm7 0h4v14h-4z" fill="currentColor" stroke="none"/>',
    previous:'<path d="m17 5-10 7 10 7z" fill="currentColor" stroke="none"/><path d="M5 5v14"/>',
    next:'<path d="m7 5 10 7-10 7z" fill="currentColor" stroke="none"/><path d="M19 5v14"/>',
    shuffle:'<path d="M3 6h3l12 12h3m-4-4 4 4-4 4M3 18h3l4-4m4-4 4-4h3m-4-4 4 4-4 4"/>',
    repeat:'<path d="M3 10V8a3 3 0 0 1 3-3h14m-4-4 4 4-4 4m5 5v2a3 3 0 0 1-3 3H4m4-4-4 4 4 4"/>',
    volume:'<path d="M3 9v6h4l5 4V5L7 9zm13-2a7 7 0 0 1 0 10m3-13a11 11 0 0 1 0 16"/>',
    wave:'<path d="M3 10v4m4-7v10m5-14v18m5-15v12m4-8v4"/>',
    spotify:'<circle cx="12" cy="12" r="10" fill="currentColor" stroke="none"/><path d="M5.8 9a18 18 0 0 1 12.5.8M6.7 12.2a14 14 0 0 1 10.5.7m-9.7 2.4a11 11 0 0 1 8.6.6" stroke="var(--spotify-lines,#17240d)" stroke-width="1.6"/>'
  };
  const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.note}</svg>`;
  document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });
  const image = (url, className, alt = '') => /^https:\/\//.test(url || '') ? `<img class="${className}" src="${esc(url)}" alt="${esc(alt)}" loading="lazy" referrerpolicy="no-referrer">` : '';
  const time = ms => { const s = Math.floor(Math.max(0, ms) / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const fragment = new URLSearchParams(location.hash.slice(1));
  if (fragment.has('key')) { sessionStorage.setItem('luma-key', fragment.get('key')); history.replaceState({}, '', location.pathname + location.search); }
  const sessionKey = sessionStorage.getItem('luma-key') || '';
  const redirect = location.origin + '/callback';
  $('redirect-uri').textContent = redirect;
  let settings = {}, tokens = null, profile = null, library = C.emptyLibrary(), demo = false;
  let view = 'home', activeCollection = null, visibleTracks = [], rowLimit = 100, syncing = false, adding = false;
  let cancelSdkLoad=null;let sdkGeneration=0;let sdk = null, sdkLoading = null, deviceId = null, playerState = null, stateAt = 0;
  let externalTracks = {}, settingsSave = Promise.resolve(), bootReady = false;
  let managedPlayback=false;
  let refreshing = null, toastTimer = null, sdkPoll = 0, isShuffle = false, repeatMode = 'off', modesBusy = false;
  const demoDescriptions = [ ['Тихое утро','Саундтрек для нового дня','warm','SLOW\nMORNINGS'], ['Зелёный шум','Чуть ближе к спокойствию','moss','STAY\nPRESENT.'], ['После полуночи','Когда город становится тише','blue','AFTER\nHOURS'], ['В своём ритме','Никуда не спешить','lilac','IN YOUR\nOWN TIME'] ];

  async function native(path, method = 'GET', body) {
    const response = await fetch('/api/' + path, { method, headers: { Authorization: `Bearer ${sessionKey}`, 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (!response.ok) {
      const info = await response.json().catch(() => ({}));
      throw new Error(info.error || (response.status === 401 ? 'Откройте приложение через LumaMusic.exe.' : 'Не удалось сохранить данные на компьютере.'));
    }
    return response.json();
  }
  function toast(message, duration = 6500) {
    $('toast').textContent = message; $('toast').hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, duration);
  }
  function notice(title, message) { $('notice-title').textContent = title; $('notice-body').textContent = message; if (!$('notice-dialog').open) $('notice-dialog').showModal(); }
  function showConnection() { $('client-id').value = settings.clientId || ''; $('settings-error').textContent = ''; $('logout-button').hidden = !tokens; if(!$('settings-dialog').open)$('settings-dialog').showModal(); }
  function showSettings(){window.dispatchEvent(new Event('luma:open-settings'));}
  const api = new C.SpotifyApi({ getToken: getToken, refreshToken: refreshToken });
  async function persistTokens(value) { await native('token', 'PUT', value); tokens = value; }
  async function refreshToken() {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      if (!tokens?.refresh_token) throw new Error('Войдите в Spotify заново.');
      const response = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token, client_id: tokens.client_id }) });
      const result = await response.json();
      if (!response.ok) throw new Error('Сессия Spotify истекла. Откройте настройки и войдите заново.');
      await persistTokens({ ...tokens, ...result, expires_at: Date.now() + result.expires_in * 1000 });
      return tokens.access_token;
    })();
    try { return await refreshing; } finally { refreshing = null; }
  }
  async function getToken() {
    if (!tokens) throw new Error('Сначала подключите Spotify.');
    return Date.now() > tokens.expires_at - 60000 ? refreshToken() : tokens.access_token;
  }
  async function login() {
    const clientId = $('client-id').value.trim();
    if (!/^[a-fA-F0-9]{32}$/.test(clientId)) { $('settings-error').textContent = 'Client ID должен содержать 32 символа. Скопируйте его из Spotify Developer Dashboard.'; return; }
    $('login-button').disabled = true;
    try {
      settings.clientId = clientId; await native('settings', 'PUT', settings);
      const random = size => { const values = crypto.getRandomValues(new Uint8Array(size)); return btoa(String.fromCharCode(...values)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
      const verifier = random(48), state = random(24);
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
      const challenge = btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      sessionStorage.setItem('luma-oauth', JSON.stringify({ verifier, state, clientId, created: Date.now() }));
      const scope = 'user-library-read user-library-modify playlist-read-private playlist-read-collaborative playlist-modify-public playlist-modify-private streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state';
      const params = new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: redirect, state, code_challenge_method: 'S256', code_challenge: challenge, scope, show_dialog: 'true' });
      const authorizeUrl='https://accounts.spotify.com/authorize?' + params;
      if(window.chrome?.webview){window.chrome.webview.postMessage(JSON.stringify({type:'oauth',url:authorizeUrl}));$('login-button').disabled=false;}
      else location.assign(authorizeUrl);
    } catch (e) { $('settings-error').textContent = e.message; $('login-button').disabled = false; }
  }
  async function handleCallback() {
    if (location.pathname !== '/callback') return false;
    const params = new URLSearchParams(location.search);
    let pending; try { pending = JSON.parse(sessionStorage.getItem('luma-oauth')); } catch { }
    sessionStorage.removeItem('luma-oauth'); history.replaceState({}, '', '/');
    if (!pending || pending.state !== params.get('state') || Date.now() - pending.created > 15 * 60000) throw new Error('Вход не подтверждён: проверка сессии не пройдена. Начните вход из настроек приложения.');
    if (params.has('error')) throw new Error('Вы отменили доступ к Spotify. Подключиться можно в настройках.');
    if (!params.get('code')) throw new Error('Spotify не вернул код входа. Попробуйте снова.');
    const response = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: pending.clientId, grant_type: 'authorization_code', code: params.get('code'), redirect_uri: redirect, code_verifier: pending.verifier }) });
    const result = await response.json();
    if (!response.ok) throw new Error('Не удалось завершить вход: ' + (result.error_description || result.error || response.status));
    await persistTokens({ ...result, client_id: pending.clientId, expires_at: Date.now() + result.expires_in * 1000 });
    return true;
  }
  async function loadAccount(preparePlayer=true) {
    let current;
    try { current = await api.request('/me'); }
    catch (e) {
      const account = settings.lastAccount;
      if (account) {
        const cached = await native('library?account=' + encodeURIComponent(account));
        if (cached) { library = cached; profile = cached.profile; updateAccount(); render(); }
      }
      throw e;
    }
    if (!current?.id) throw new Error('Spotify не вернул профиль аккаунта.');
    profile = current;
    library = await native('library?account=' + encodeURIComponent(current.id)) || C.emptyLibrary(current.id);
    library.profile = profile; settings.lastAccount = current.id;
    await native('settings', 'PUT', settings);
    updateAccount(); render();
    if(preparePlayer)ensurePlayer().catch(e => {if(e.name!=='AbortError')toast(e.message,10000);});
  }
  function updateAccount() {
    const connected = !!tokens && !!profile && !demo;
    $('connection-status').classList.toggle('connected', connected);
    $('connection-status').innerHTML = '<i></i>' + (demo ? 'Деморежим' : connected ? 'Spotify подключён' : 'Не подключено');
    $('profile-button').textContent = (profile?.display_name || 'L').slice(0, 1).toUpperCase();
    $('profile-button').title = profile?.display_name || 'Настройки';
    $('sidebar-connect').hidden = connected || demo;
    $('demo-banner').hidden = !demo;
    $('logout-button').hidden = !tokens;
    $('hero').hidden = connected || demo || Object.keys(library.tracks).length > 0;
    $('stats').hidden = !connected && !demo;
  }
  async function sync() {
    if (syncing || adding) return;
    if (demo) { toast('Это пример библиотеки. Выйдите из демо и подключите свой Spotify.'); return; }
    if (!tokens) { showSettings(); return; }
    syncing = true; $('sync-button').disabled = true; $('sync-progress').hidden = false;
    try {
      if (!profile) await loadAccount();
      const result = await C.syncLibrary(api, library, profile, text => { $('sync-message').textContent = text; });
      await native('library?account=' + encodeURIComponent(profile.id), 'PUT', result);
      library = result; rowLimit = 100; render();
      if (result.warnings.length) notice('Импорт завершён с ограничениями', `Сохранено ${Object.keys(library.tracks).length} треков.\n\n` + result.warnings.join('\n\n'));
      else toast(`Готово! В библиотеке ${Object.keys(library.tracks).length} треков.`);
      window.dispatchEvent(new Event('luma:library'));
    } catch (e) { notice('Не удалось синхронизировать', e.message + '\n\nПредыдущая сохранённая библиотека осталась доступна.'); }
    finally { syncing = false; $('sync-button').disabled = false; $('sync-progress').hidden = true; }
  }
  function navigate(nextView, collection = null) {
    view = nextView; activeCollection = collection; rowLimit = 100; $('search').value = ''; $('sort').value = collection ? 'original' : 'recent'; render();
    $('main').scrollIntoView({ block: 'start' });
  }
  function allIds() { return Object.keys(library.tracks); }
  function idsForView() { return activeCollection ? activeCollection.tracks : view === 'liked' ? library.liked : allIds(); }
  function render() {
    updateAccount();
    const count = allIds().length;
    $('track-count').textContent = count;
    $('stats').innerHTML = [[count,'треков'],[library.playlists.length,'плейлистов'],[library.albums.length,'альбомов']].map(([n, text]) => `<div class="stat"><strong>${n}</strong><span>${text}</span></div>`).join('');
    let title = 'Ваша музыка.<br><span>В вашем ритме.</span>', subtitle = 'Любимые треки, альбомы и плейлисты — теперь вместе.', crumb = 'Обзор';
    if (view === 'tracks') { title = 'Все треки'; subtitle = `${count} треков в вашей библиотеке`; crumb = 'Все треки'; }
    if (view === 'liked') { title = 'Любимые треки'; subtitle = `${library.liked.length} треков, которые попали в сердце`; crumb = 'Любимые треки'; }
    if (view === 'albums') { title = 'Ваши альбомы'; subtitle = `${library.albums.length} альбомов для полного погружения`; crumb = 'Альбомы'; }
    if (view === 'playlists') { title = 'Ваши плейлисты'; subtitle = `${library.playlists.length} поводов нажать play`; crumb = 'Плейлисты'; }
    if (activeCollection) { title = esc(activeCollection.name); subtitle = `${activeCollection.tracks.length} треков · ${activeCollection.type === 'album' ? 'Альбом' : 'Плейлист'} Spotify`; crumb = activeCollection.name; }
    $('page-title').innerHTML = title; $('page-subtitle').textContent = subtitle; $('breadcrumb-current').textContent = crumb;
    $('hero').hidden = view !== 'home' || !!profile || demo;
    $('stats').hidden = view !== 'home' || (!profile && !demo);
    $('sync-button').title = library.syncedAt ? 'Последний импорт: ' + new Date(library.syncedAt).toLocaleString('ru-RU') : 'Импортировать музыку из Spotify';
    document.querySelectorAll('.nav-item[data-view]').forEach(el => el.classList.toggle('active', el.dataset.view === view && !activeCollection));
    $('sidebar-playlists').innerHTML = library.playlists.length ? library.playlists.map(c => `<button class="sidebar-playlist ${activeCollection?.id === c.id ? 'active' : ''}" data-collection="${esc(c.id)}" data-kind="playlist">${image(c.image, '', '') || `<span class="mini-cover">${icon('note')}</span>`}<span class="list-name">${esc(c.name)}</span></button>`).join('') : '<p class="muted small">Здесь будут ваши плейлисты</p>';
    const showCollections = !activeCollection && ['home','albums','playlists'].includes(view);
    $('collections-section').hidden = !showCollections;
    $('all-playlists').hidden = view !== 'home';
    $('collections-title').textContent = view === 'albums' ? 'Сохранённые альбомы' : view === 'playlists' ? 'Все плейлисты' : 'На вашей волне';
    $('collections-subtitle').textContent = view === 'albums' ? 'Слушать от первого до последнего трека.' : 'Плейлисты, к которым хочется возвращаться.';
    let collections = view === 'albums' ? library.albums : library.playlists;
    if (view === 'home') collections = collections.slice(0, 4);
    if (showCollections) renderCollections(collections);
    $('tracks-section').hidden = !activeCollection && ['albums','playlists'].includes(view);
    $('tracks-title').textContent = activeCollection ? 'Треки' : view === 'liked' ? 'Самое любимое' : view === 'tracks' ? 'Все треки' : 'Ваша библиотека';
    $('tracks-subtitle').textContent = activeCollection?.partial ? 'Показана часть плейлиста. Синхронизируйте библиотеку для полного списка.' : activeCollection?.unavailable ? 'Spotify ограничил импорт содержимого. Можно открыть коллекцию в Spotify.' : 'Здесь начинается следующий любимый трек.';
    renderTracks();
    window.dispatchEvent(new Event('luma:render'));
  }
  function renderCollections(items) {
    if (!items.length && !profile && !demo && view === 'home') {
      $('collections').innerHTML = demoDescriptions.map(([name,desc],i) => `<div class="card placeholder-card"><div class="card-art skeleton">${icon(['disc','wave','note','heart'][i])}</div><strong class="card-title">${name}</strong><span class="card-desc">${desc}</span></div>`).join(''); return;
    }
    if (!items.length) { $('collections').innerHTML = '<p class="muted small">Пока пусто. Синхронизируйте Spotify или добавьте ссылку.</p>'; return; }
    $('collections').innerHTML = items.map(c => `<button class="card" data-collection="${esc(c.id)}" data-kind="${esc(c.type)}"><div class="card-art">${image(c.image, '', c.name) || (demo ? `<div class="demo-cover ${esc(c.demoColor || 'moss')}">${esc(c.demoText || c.name)}</div>` : icon(c.type === 'album' ? 'disc' : 'note'))}<span class="card-play">${icon('play')}</span></div><strong class="card-title">${esc(c.name)}</strong><span class="card-desc">${c.unavailable ? 'Открыть в Spotify ↗' : `${c.tracks.length} треков · Spotify`}</span></button>`).join('');
  }
  function renderTracks() {
    visibleTracks = C.filterTracks(library, idsForView(), $('search').value, $('sort').value);
    const rows = visibleTracks.slice(0, rowLimit);
    let html = '<div class="table-header"><span>#</span><span>ТРЕК / ИСПОЛНИТЕЛЬ</span><span class="album-col">АЛЬБОМ</span><span class="length">ВРЕМЯ</span><span></span></div>';
    if (activeCollection?.unavailable) html += `<div class="collection-note">Содержимое этой коллекции ограничено Spotify. <a href="${esc(safeCollectionUrl(activeCollection))}" target="_blank" rel="noreferrer">Открыть в Spotify ↗</a></div>`;
    if (!rows.length) html += `<div class="empty-state"><span>${icon('note')}</span><strong>${$('search').value ? 'Ничего не найдено' : 'Скоро здесь будет ваша музыка'}</strong><p>${$('search').value ? 'Попробуйте другое название или имя исполнителя.' : 'Подключите Spotify и импортируйте любимые треки.'}</p>${!tokens && !demo ? '<button class="text-button" data-action="connect">Подключить Spotify ↗</button>' : ''}</div>`;
    html += rows.map((t,i) => `<div class="track-row ${playerState?.track_window?.current_track?.id === t.id ? 'current' : ''}" data-track-row="${esc(t.id)}"><button class="row-play" data-play="${esc(t.id)}" aria-label="Слушать ${esc(t.name)}" title="Воспроизвести">${i + 1}</button><div class="row-title">${image(t.image,'row-cover','') || `<span class="row-cover demo-row-cover">${demo ? String(i+1).padStart(2,'0') : icon('note')}</span>`}<div class="row-copy"><strong>${esc(t.name)}${t.explicit ? ' · E' : ''}</strong><small>${esc(t.artists)}</small></div></div><span class="row-album">${esc(t.album)}</span><span class="row-length">${time(t.duration)}</span><a class="row-open" href="${esc(safeTrackUrl(t))}" target="_blank" rel="noreferrer" title="Открыть в Spotify" aria-label="Открыть ${esc(t.name)} в Spotify">${icon('spotify')}</a></div>`).join('');
    $('track-table').innerHTML = html; $('load-more').hidden = visibleTracks.length <= rowLimit;
    window.dispatchEvent(new Event('luma:tracks'));
  }
  function safeTrackUrl(t) { return `https://open.spotify.com/track/${encodeURIComponent(t.id)}`; }
  function safeCollectionUrl(c) { return `https://open.spotify.com/${c.type === 'album' ? 'album' : 'playlist'}/${encodeURIComponent(c.id)}`; }
  function showAdd() {
    if (syncing) { toast('Дождитесь завершения синхронизации.'); return; }
    if (demo) { toast('Выйдите из демо, чтобы добавить свою музыку.'); return; }
    if (!tokens) { showSettings(); return; }
    $('spotify-link').value = ''; $('add-error').textContent = ''; $('add-dialog').showModal();
  }
  async function importLink() {
    if (adding || syncing) return;
    const parsed = C.parseSpotifyLink($('spotify-link').value);
    if (!parsed) { $('add-error').textContent = 'Нужна полная ссылка open.spotify.com на трек, альбом или плейлист.'; return; }
    adding = true; $('import-link').disabled = true; $('add-error').textContent = '';
    try {
      if (!profile) await loadAccount();
      const next = JSON.parse(JSON.stringify(library));
      const { type, id } = parsed, date = new Date().toISOString();
      if (type === 'track') {
        const t = C.track(await api.request('/tracks/' + id), date);
        if (!t) throw new Error('Этот трек недоступен для импорта.');
        next.tracks[t.id] = t; if (!next.manual.includes(t.id)) next.manual.unshift(t.id);
      } else {
        const raw = await api.request('/' + type + 's/' + id), c = C.collection(raw, type);
        const entries = await api.pages(type === 'album' ? `/albums/${id}/tracks?limit=50` : `/playlists/${id}/items?limit=50`);
        c.tracks = entries.map(x => {
          const t = C.track(type === 'album' ? x : x.item || x.track, date, type === 'album' ? raw : null);
          if (!t) return null; next.tracks[t.id] = t; return t.id;
        }).filter(Boolean);
        const group = type === 'album' ? next.albums : next.playlists, existing = group.findIndex(x => x.id === id);
        c.manual = true; if (existing >= 0) group[existing] = c; else group.unshift(c);
        // Keep manually added collection tracks when the Spotify library is refreshed.
        for (const tid of c.tracks) if (!next.manual.includes(tid)) next.manual.push(tid);
      }
      await native('library?account=' + encodeURIComponent(profile.id), 'PUT', next); library = next;
      $('add-dialog').close(); render(); toast('Добавлено в вашу библиотеку Luma.');
    } catch (e) { $('add-error').textContent = e.message; }
    finally { adding = false; $('import-link').disabled = false; }
  }
  function startDemo() {
    if (tokens || syncing) return;
    demo = true; library = C.emptyLibrary('demo');
    const examples = [ ['Тёплый свет','Luma Sessions','Тихое утро',224000], ['Медленный город','Paper Leaves','В своём ритме',198000], ['Всё на своих местах','North Window','Зелёный шум',243000], ['Когда все спят','Blue Hour Club','После полуночи',216000], ['Первая чашка','Luma Sessions','Тихое утро',185000], ['Не спеши','Paper Leaves','В своём ритме',232000], ['За окном','North Window','Зелёный шум',209000], ['Остаться здесь','Blue Hour Club','После полуночи',251000] ];
    examples.forEach(([name,artists,album,duration],i) => { const id = 'demo' + i; library.tracks[id] = {id,name,artists,album,duration,image:'',uri:'',addedAt:new Date(2026,10,14-i).toISOString()}; library.liked.push(id); });
    library.playlists = demoDescriptions.map(([name,description,color,text],i) => ({ id:'demo-list'+i, name,description,type:'playlist',image:'',tracks:allIds().filter((_,j)=>j%4===i),demoColor:color,demoText:text }));
    library.albums = library.playlists.map((p,i) => ({ ...p, id:'demo-album'+i, type:'album' }));
    profile = {display_name:'Демо'}; navigate('home');
  }
  async function exitDemo() { demo = false; profile = null; library = C.emptyLibrary(); if (tokens) await loadAccount(); navigate('home'); }
  async function ensurePlayer() {
    if (sdk && deviceId) return sdk;
    if (sdkLoading) return sdkLoading;
    if (!tokens || demo) throw new Error('Подключите Spotify для прослушивания.');
    const connection=++sdkGeneration;
    sdkLoading = new Promise((resolve, reject) => {
      let expired = false,instance=null;
      const timeout = setTimeout(() => { if(connection!==sdkGeneration){reject(Object.assign(new Error('Spotify connection superseded'),{name:'AbortError'}));return;}cancelSdkLoad=null;expired = true; sdkLoading = null; deviceId = null; if (sdk) { sdk.disconnect(); sdk = null; } reject(new Error('Spotify-плеер не подключился. Проверьте интернет, затем нажмите Play ещё раз.')); }, 20000);
      const failed = message => { if(connection!==sdkGeneration||expired)return;expired=true;cancelSdkLoad=null;clearTimeout(timeout); sdkLoading = null; deviceId = null; if (sdk) sdk.disconnect(); sdk = null; $('player-status').textContent = 'ПЛЕЕР НЕ ПОДКЛЮЧЁН'; reject(new Error(message)); };
      cancelSdkLoad=()=>{expired=true;clearTimeout(timeout);reject(Object.assign(new Error('Spotify connection superseded'),{name:'AbortError'}));};
      const init = () => {
        if (expired||connection!==sdkGeneration) return;
        if (sdk) { sdk.disconnect(); sdk = null; }
        sdk = instance = new Spotify.Player({ name:'Luma Music', volume: window.LumaFeaturesCore.outputVolume($('volume').value), getOAuthToken: callback => getToken().then(callback).catch(e=>toast(e.message)) });
        sdk.addListener('ready', ({ device_id }) => { if(connection!==sdkGeneration||expired||sdk!==instance)return;clearTimeout(timeout);cancelSdkLoad=null; deviceId = device_id; $('player-status').textContent = 'LUMA · ЭТОТ КОМПЬЮТЕР'; resolve(sdk); });
        sdk.addListener('not_ready', () => { if(connection!==sdkGeneration||sdk!==instance)return;deviceId = null; sdkLoading = null; $('player-status').textContent = 'ПЛЕЕР НЕ В СЕТИ'; });
        sdk.addListener('player_state_changed', state=>{if(connection===sdkGeneration&&sdk===instance)updatePlayer(state);});
        sdk.addListener('autoplay_failed', () => toast('Нажмите Play ещё раз, чтобы разрешить воспроизведение.'));
        sdk.addListener('initialization_error', () => failed('Браузер не поддерживает защищённое воспроизведение. Обновите Chrome или Edge.'));
        sdk.addListener('authentication_error', () => failed('Spotify-плеер не принял вход. Войдите заново в настройках.'));
        sdk.addListener('account_error', () => failed('Для встроенного Spotify-плеера нужен активный Premium.'));
        sdk.addListener('playback_error', ({message}) => toast('Spotify: ' + message));
        sdk.connect().then(ok => { if (!ok) failed('Не удалось подключить Spotify-плеер.'); }).catch(e => failed(e.message));
      };
      if (window.Spotify?.Player) init();
      else {
        window.onSpotifyWebPlaybackSDKReady = init;
        const existing = document.getElementById('spotify-sdk'); if (existing) existing.remove();
        const script = document.createElement('script'); script.id = 'spotify-sdk'; script.src = 'https://sdk.scdn.co/spotify-player.js'; script.onerror = () => failed('Не удалось загрузить Spotify-плеер. Проверьте доступ к Spotify.'); document.head.appendChild(script);
      }
    });
    return sdkLoading;
  }
  P.register('spotify',()=>{if(cancelSdkLoad&&!deviceId){cancelSdkLoad();cancelSdkLoad=null;sdkGeneration++;if(sdk)sdk.disconnect();sdk=null;sdkLoading=null;}});
  function updatePlayer(state) {
    if(!P.owns('spotify')){if(state&&!state.paused&&sdk)sdk.pause().catch(()=>{});return;}
    if(window.LumaServices?.active)return;
    playerState = state; stateAt = Date.now();
    window.dispatchEvent(new Event('luma:playback'));
    if(window.LumaExtras?.localActive && (!state || state.paused)) return;
    const t = state?.track_window?.current_track;
    if (!t) { $('play-pause').innerHTML = icon('play'); return; }
    $('now-spotify').hidden=false;$('now-spotify').innerHTML=icon('spotify');$('player-status').textContent='LUMA · ЭТОТ КОМПЬЮТЕР';
    $('now-title').textContent = t.name; if($('now-artist').textContent!==(t.artists||[]).map(a=>a.name).join(', '))$('now-artist').textContent=(t.artists||[]).map(a=>a.name).join(', ');
    $('now-cover').innerHTML = image(t.album?.images?.[0]?.url||(library.tracks[t.id]||externalTracks[t.id])?.image,'','') || icon('note');
    $('now-spotify').href = safeTrackUrl(t); $('duration').textContent = time(state.duration);
    $('play-pause').innerHTML = icon(state.paused ? 'play' : 'pause'); $('play-pause').setAttribute('aria-label',state.paused ? 'Воспроизвести' : 'Пауза');
    if(!modesBusy){
      if(typeof state.shuffle==='boolean') isShuffle=state.shuffle;
      if([0,1,2].includes(state.repeat_mode)) repeatMode=['off','context','track'][state.repeat_mode];
      renderPlaybackModes();
    }
    document.querySelectorAll('[data-track-row]').forEach(row=>row.classList.toggle('current',row.dataset.trackRow===t.id));
  }
  async function pauseSpotify(){
    if(!sdk)return;try{await sdk.pause();}catch(error){const state=await sdk.getCurrentState();if(state&&!state.paused)throw error;}if(playerState){playerState={...playerState,paused:true};stateAt=Date.now();}
  }
  async function setSpotifyPaused(paused){
    if(paused&&!sdk)return;const revision=P.revision,player=await ensurePlayer();if(!P.owns('spotify')||revision!==P.revision)return;
    if(paused)await player.pause();else{await player.activateElement();if(revision!==P.revision)return;await player.resume();}
    if(revision!==P.revision){if(!P.owns('spotify'))await pauseSpotify();return;}
    const state=await player.getCurrentState()||playerState;if(state)updatePlayer({...state,paused});
  }
  async function playTrack(id,queueOverride=null,managedQueue=false,request=null,queueState=null) {
    if(demo){toast('Деморежим показывает интерфейс. Для прослушивания подключите свою библиотеку Spotify.');return;}
    if(!tokens){showSettings();return;}const t=library.tracks[id]||externalTracks[id];if(!t)return;if(!t.playable){toast('Этот трек недоступен для воспроизведения в вашем Spotify.');return;}
    const tracks=queueOverride||(visibleTracks.length?visibleTracks:[t]);
    if(!managedQueue&&tracks.length>100&&window.LumaServices){const items=tracks.map(item=>window.LumaServicesCore.normalizeTrack({...item,source:'spotify'})).filter(Boolean);return window.LumaServices.play(items.find(item=>item.id===id),items,{repeat:repeatMode,shuffle:isShuffle});}
    request=request||P.claim('spotify');if(sdk)sdk.activateElement().catch(()=>{});
    return P.run(request,async()=>{
      window.LumaServices?.onSpotifyStart(queueState);window.LumaExtras?.stopLocal();
      try{
        const player=await ensurePlayer();if(!request.current())return;await player.activateElement();await player.setVolume(window.LumaFeaturesCore.outputVolume($('volume').value));if(!request.current())return;
        if(managedQueue&&(!managedPlayback||isShuffle||repeatMode!=='off')){await api.request('/me/player/repeat?state=off&device_id='+encodeURIComponent(deviceId),{method:'PUT',responseType:'none'});if(!request.current())return;await api.request('/me/player/shuffle?state=false&device_id='+encodeURIComponent(deviceId),{method:'PUT',responseType:'none'});isShuffle=false;repeatMode='off';}
        managedPlayback=managedQueue;if(!request.current())return;let position=Math.max(0,tracks.findIndex(x=>x.id===id));const start=Math.max(0,position-25),queue=tracks.slice(start,start+100).filter(x=>x.playable),offset=queue.findIndex(x=>x.id===id);if(offset<0)return;
        await api.request('/me/player/play?device_id='+encodeURIComponent(deviceId),{method:'PUT',body:JSON.stringify({uris:queue.map(x=>x.uri),offset:{position:offset}})});
        if(!request.current())return;const confirmed=await player.getCurrentState();if(confirmed&&request.current())updatePlayer(confirmed);
      }catch(error){if(request.current())notice('Не удалось начать воспроизведение',error.message);}
      finally{if(!request.current()&&!P.owns('spotify'))await pauseSpotify().catch(()=>{});}
    });
  }
  function renderPlaybackModes(){
    if(window.LumaServices?.queueActive){window.LumaServices.renderModes();return;}
    $('shuffle').setAttribute('aria-pressed',String(isShuffle));
    $('repeat').setAttribute('aria-pressed',String(repeatMode!=='off'));
    $('repeat').classList.toggle('repeat-one',repeatMode==='track');
    const label=repeatMode==='off'?'Повтор выключен':repeatMode==='context'?'Повтор плейлиста':'Повтор трека';
    $('repeat').title=label;$('repeat').setAttribute('aria-label',label);
  }
  async function changePlaybackMode(action,player){
    if(modesBusy)return;
    modesBusy=true;$('shuffle').disabled=true;$('repeat').disabled=true;
    const oldShuffle=isShuffle,oldRepeat=repeatMode;
    try{
      const nextShuffle=!isShuffle,nextRepeat=C.nextRepeatMode(repeatMode);
      const endpoint=action==='shuffle'?'/me/player/shuffle?state='+nextShuffle:'/me/player/repeat?state='+nextRepeat;
      await api.request(endpoint+'&device_id='+encodeURIComponent(deviceId),{method:'PUT',responseType:'none'});
      if(action==='shuffle')isShuffle=nextShuffle;else repeatMode=nextRepeat;
      renderPlaybackModes();
      // Reconcile from a fresh playback snapshot, avoiding the SDK's cached
      // state immediately after a command. Later SDK events keep it current.
      await new Promise(resolve=>setTimeout(resolve,250));
      try{
        const confirmed=await api.request('/me/player');
        if(confirmed?.device?.id===deviceId){
          if(typeof confirmed.shuffle_state==='boolean')isShuffle=confirmed.shuffle_state;
          if(['off','context','track'].includes(confirmed.repeat_state))repeatMode=confirmed.repeat_state;
        }
      }catch{/* A successful command must not be reported as a JSON/read error. */}
    }catch(e){isShuffle=oldShuffle;repeatMode=oldRepeat;throw e;}
    finally{modesBusy=false;$('shuffle').disabled=false;$('repeat').disabled=false;renderPlaybackModes();}
  }
  async function playerAction(action) {
    if(window.LumaServices?.active||(window.LumaServices?.queueActive&&['next','previous','repeat','shuffle'].includes(action))){await window.LumaServices.control(action);return;}
    if(window.LumaExtras?.localActive){await window.LumaExtras.control(action);return;}
    if (demo) { toast('В деморежиме музыка не воспроизводится.'); return; }
    if (!tokens) { showSettings(); return; }
    try {
      const player = await ensurePlayer();
      if (action==='toggle' && !playerState) { const first = visibleTracks[0]; if (first) return playTrack(first.id); toast('Сначала импортируйте музыку в библиотеку.'); return; }
      if (action==='toggle') { await setSpotifyPaused(playerState?.paused!==true);return; }
      if (action==='next') await player.nextTrack();
      if (action==='previous') await player.previousTrack();
      if (action==='shuffle'||action==='repeat') { await changePlaybackMode(action,player);return; }
      const confirmed=await player.getCurrentState(); if(confirmed) updatePlayer(confirmed);
    } catch(e) { toast(e.message); }
  }
  async function logout() {
    if (syncing || adding) { toast('Дождитесь завершения импорта.'); return; }
    if(P.owner==='spotify')P.claim('idle');if(cancelSdkLoad){cancelSdkLoad();cancelSdkLoad=null;}sdkGeneration++;await native('token','DELETE'); if(sdk) sdk.disconnect();
    sdk=null; sdkLoading=null; deviceId=null; tokens=null; profile=null; demo=false; library=C.emptyLibrary(); playerState=null; externalTracks={};
    $('settings-dialog').close(); $('now-title').textContent='Пусть зазвучит ваш день'; $('now-artist').textContent='Выберите трек в библиотеке'; $('now-cover').innerHTML=icon('note'); $('now-spotify').href='https://open.spotify.com';
    $('play-pause').innerHTML=icon('play'); $('elapsed').textContent='0:00'; $('duration').textContent='0:00'; $('seek').value=0; $('player-status').textContent='SPOTIFY PLAYER';
    navigate('home'); window.dispatchEvent(new Event('luma:account'));toast('Вы вышли из Spotify. Сохранённая библиотека доступна после повторного входа.');
  }
  document.addEventListener('click',e=>{
    const close=e.target.closest('[data-close]'); if(close) $(close.dataset.close).close();
    const nav=e.target.closest('[data-view]'); if(nav) navigate(nav.dataset.view);
    const card=e.target.closest('[data-collection]'); if(card) { const source=card.dataset.kind==='album'?library.albums:library.playlists; const c=source.find(x=>x.id===card.dataset.collection); if(c) navigate(c.type,c); }
    const play=e.target.closest('[data-play]'); if(play) playTrack(play.dataset.play);
    if(e.target.closest('[data-action="connect"]')) showSettings();
  });
  $('track-table').addEventListener('dblclick',e=>{ const row=e.target.closest('[data-track-row]'); if(row && !e.target.closest('a,button')) playTrack(row.dataset.trackRow); });
  for(const id of ['settings-button','profile-button']) $(id).addEventListener('click',showSettings);
  for(const id of ['hero-connect','sidebar-connect']) $(id).addEventListener('click',showConnection);
  for(const id of ['add-button','add-side']) $(id).addEventListener('click',showAdd);
  $('sync-button').addEventListener('click',sync); $('all-playlists').addEventListener('click',()=>navigate('playlists'));
  $('login-button').addEventListener('click',login); $('client-id').addEventListener('keydown',e=>{if(e.key==='Enter') login();});
  $('logout-button').addEventListener('click',()=>logout().catch(e=>toast(e.message)));
  $('demo-button').addEventListener('click',startDemo); $('exit-demo').addEventListener('click',()=>exitDemo().catch(e=>toast(e.message)));
  $('import-link').addEventListener('click',importLink); $('spotify-link').addEventListener('keydown',e=>{if(e.key==='Enter') importLink();});
  $('copy-redirect').addEventListener('click',()=>navigator.clipboard.writeText(redirect).then(()=>toast('Redirect URI скопирован.')).catch(()=>toast('Скопируйте адрес из поля вручную.')));
  $('search').addEventListener('input',()=>{rowLimit=100;renderTracks();}); $('sort').addEventListener('change',renderTracks);
  $('load-more').addEventListener('click',()=>{rowLimit+=100;renderTracks();});
  function toggleMainPlayback(){return window.LumaExtras&&(window.LumaExtras.mediaState.track||['spotify','soundcloud','local'].includes(P.owner))?window.LumaExtras.mediaControl('toggle'):playerAction('toggle');}
  $('play-pause').addEventListener('click',()=>toggleMainPlayback().catch(error=>toast(error.message))); $('next').addEventListener('click',()=>playerAction('next').catch(error=>toast(error.message))); $('previous').addEventListener('click',()=>playerAction('previous').catch(error=>toast(error.message)));
  $('shuffle').addEventListener('click',()=>playerAction('shuffle').catch(error=>toast(error.message))); $('repeat').addEventListener('click',()=>playerAction('repeat').catch(error=>toast(error.message)));
  $('volume').addEventListener('input',()=>{if(window.LumaServices?.active||window.LumaExtras?.localActive)return;if(sdk) sdk.setVolume(window.LumaFeaturesCore.outputVolume($('volume').value)).catch(e=>toast(e.message));});
  $('seek').addEventListener('change',()=>{if(window.LumaServices?.active||window.LumaExtras?.localActive)return;if(sdk && playerState) sdk.seek(Math.round(Number($('seek').value)/1000*playerState.duration)).catch(e=>toast(e.message));});
  function canUsePlaybackShortcut(target=document.activeElement){return !document.querySelector('dialog[open]')&&!target?.closest('textarea,select,[role="textbox"],[contenteditable]:not([contenteditable="false"]),input:not([type="range"]):not([type="button"]):not([type="submit"]):not([type="reset"])');}
  function togglePlaybackFromShortcut(){if(!canUsePlaybackShortcut())return false;toggleMainPlayback().catch(e=>toast(e.message));return true;}
  document.addEventListener('keydown',e=>{if(e.code==='Space'&&!e.altKey&&!e.ctrlKey&&!e.metaKey&&canUsePlaybackShortcut(e.target)){e.preventDefault();e.stopImmediatePropagation();if(!e.repeat)togglePlaybackFromShortcut();}},true);
  window.addEventListener('offline',()=>toast('Нет соединения. Сохранённая библиотека остаётся доступна.'));
  setInterval(()=>{
    if(playerState && !window.LumaExtras?.localActive && !window.LumaServices?.active){const position=Math.min(playerState.duration,playerState.position+(playerState.paused?0:Date.now()-stateAt));$('elapsed').textContent=time(position);if(document.activeElement!==$('seek')) $('seek').value=playerState.duration?position/playerState.duration*1000:0;}
    if(sdk && ++sdkPoll%5===0) sdk.getCurrentState().then(s=>{if(s)updatePlayer(s);}).catch(()=>{});
  },1000);
  setInterval(()=>native('heartbeat','POST',{}).catch(()=>{}),15000);
  async function boot(){
    render();
    try {
      if(!sessionKey) throw new Error('Для запуска откройте LumaMusic.exe.');
      await native('heartbeat','POST',{}); settings=await native('settings')||{}; window.dispatchEvent(new Event('luma:settings')); tokens=await native('token');
      const catalogLogin=sessionStorage.getItem('luma-catalog-login')==='1';
      const fresh=await handleCallback();if(fresh&&catalogLogin)sessionStorage.removeItem('luma-catalog-login');
      if(tokens){if(!settings.servicesSelection||(settings.servicesSelection.provider==='spotify'&&settings.servicesSelection.mode==='connected')||fresh){await loadAccount(!catalogLogin);if(!catalogLogin&&(fresh || !library.syncedAt || settings.autoSync)) await sync();}else if(settings.lastAccount){library=await native('library?account='+encodeURIComponent(settings.lastAccount))||C.emptyLibrary(settings.lastAccount);profile=library.profile;render();}}
      else render();
    }catch(e){render();notice('Подключение Spotify',e.message);}
    finally{bootReady=true;window.dispatchEvent(new Event('luma:ready'));}
  }
  window.Luma={lookupTrack(id){return library.tracks[id]||externalTracks[id]||null;},togglePlaybackFromShortcut,native,toast,notice,icon,esc,time,render,navigate,showConnection,sync,api,get ready(){return bootReady;},async connectLibrary(){if(tokens){await loadAccount();if(!library.syncedAt)await sync();}else showConnection();},get settings(){return settings;},get library(){return library;},get profile(){return profile;},get connected(){return !!tokens;},get demo(){return demo;},get busyLibrary(){return syncing||adding;},get state(){return playerState;},get position(){return playerState?Math.min(playerState.duration,playerState.position+(playerState.paused?0:Date.now()-stateAt)):0;},hasScopes(scopes){const granted=new Set((tokens?.scope||'').split(/\s+/));return scopes.every(scope=>granted.has(scope));},setSettings(value){Object.assign(settings,value);delete settings.eq;delete settings.eqEnabled;delete settings.eqVersion;const snapshot=JSON.parse(JSON.stringify(settings));settingsSave=settingsSave.catch(()=>{}).then(()=>native('settings','PUT',snapshot));return settingsSave;},async saveLibrary(value){if(!profile?.id||value.ownerId!==profile.id)throw new Error('Аккаунт изменился. Повторите действие.');library=value;await native('library?account='+encodeURIComponent(profile.id),'PUT',value);window.dispatchEvent(new Event('luma:library'));},playExternal(track,queue,options={}){externalTracks=Object.fromEntries((queue||[track]).map(t=>[t.id,t]));externalTracks[track.id]=track;return playTrack(track.id,queue||[track],!!options.managedQueue,options.request||null,options.queueState||null);},setPlaybackPaused:setSpotifyPaused,pauseSpotify,async seek(ms){if(window.LumaServices?.active)return window.LumaServices.seek(ms);if(sdk)await sdk.seek(ms);},pause(){return window.LumaExtras?.mediaControl('pause')||pauseSpotify();}};
  boot();
})();
