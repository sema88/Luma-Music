(function (root) {
  'use strict';
  const API = 'https://api.spotify.com/v1';
  class SpotifyError extends Error {
    constructor(status, message) { super(message); this.status = status; }
  }
  class SpotifyApi {
    constructor({ getToken, refreshToken, fetcher = (...args) => fetch(...args), sleep = ms => new Promise(r => setTimeout(r, ms)) }) {
      Object.assign(this, { getToken, refreshToken, fetcher, sleep });
    }
    async request(path, options = {}, attempt = 0) {
      const method = (options.method || 'GET').toUpperCase();
      const { responseType = method === 'GET' ? 'json' : 'none', ...fetchOptions } = options;
      const url = new URL(path.startsWith('https:') ? path : API + path);
      if (url.origin !== 'https://api.spotify.com' || !url.pathname.startsWith('/v1/')) throw new Error('Недопустимый адрес API');
      const token = await this.getToken();
      let response;
      try { response = await this.fetcher(url.href, { ...fetchOptions, headers: { 'Content-Type': 'application/json', ...fetchOptions.headers, Authorization: `Bearer ${token}` } }); }
      catch { throw new SpotifyError(0, 'Spotify недоступен. Проверьте интернет и доступ к Spotify.'); }
      if (response.status === 401 && attempt === 0) { await this.refreshToken(); return this.request(path, options, 1); }
      if (response.status === 429 && attempt < 3) {
        const seconds = Number(response.headers.get('Retry-After')) || 2;
        if (seconds > 30) throw new SpotifyError(429, `Spotify просит подождать ${seconds} с. Повторите синхронизацию позже.`);
        await this.sleep(Math.max(seconds, 1) * 1000);
        return this.request(path, options, attempt + 1);
      }
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const reason = body.error?.message || `Ошибка Spotify ${response.status}`;
        const help = response.status === 403 ? ' Проверьте Premium, разрешения приложения и доступ аккаунта в Developer Dashboard.' : '';
        throw new SpotifyError(response.status, reason + help);
      }
      // Spotify player commands can acknowledge success with an empty body or
      // an opaque text ID. Their response body is not a catalog JSON document.
      if (response.status === 204 || responseType === 'none') return null;
      try { return await response.json(); }
      catch { throw new SpotifyError(502, 'Spotify вернул непонятный ответ. Попробуйте ещё раз.'); }
    }
    async pages(path, onPage = () => {}) {
      const all = [], seen = new Set();
      for (let next = path; next;) {
        if (seen.has(next)) throw new Error('Spotify вернул повторяющуюся страницу');
        seen.add(next);
        const page = await this.request(next);
        if (!Array.isArray(page.items)) throw new Error('Spotify вернул неверный список');
        all.push(...page.items); onPage(all.length, page.total);
        next = page.next;
      }
      return all;
    }
  }
  function track(raw, addedAt = null, album = null) {
    if (!raw || raw.is_local || raw.type === 'episode' || !raw.id || !raw.uri?.startsWith('spotify:track:')) return null;
    const a = raw.album || album || {};
    return {
      id: raw.id, uri: raw.uri, name: raw.name || 'Без названия',
      artists: (raw.artists || []).map(x => x.name).filter(Boolean).join(', '),
      artistIds: (raw.artists || []).map(x => x.id).filter(Boolean),
      artistNames: (raw.artists || []).map(x => x.name).filter(Boolean),
      releaseDate: a.release_date || '',
      album: a.name || '', albumId: a.id || '', image: a.images?.[0]?.url || '',
      duration: raw.duration_ms || 0, explicit: !!raw.explicit, playable: raw.is_playable !== false,
      popularity:Number.isFinite(raw.popularity)?raw.popularity:null,playCount:null,
      url: raw.external_urls?.spotify || `https://open.spotify.com/track/${raw.id}`, addedAt
    };
  }
  function emptyLibrary(ownerId = '') { return { version: 1, ownerId, profile: null, tracks: {}, liked: [], albums: [], playlists: [], manual: [], syncedAt: null }; }
  function collection(raw, type) {
    return { id: raw.id, name: raw.name || 'Без названия', image: raw.images?.[0]?.url || '', uri: raw.uri || `spotify:${type}:${raw.id}`, url: raw.external_urls?.spotify || `https://open.spotify.com/${type}/${raw.id}`, ownerId:raw.owner?.id||'',collaborative:!!raw.collaborative,tracks: [], type, unavailable: false };
  }
  async function syncLibrary(api, previous, profile, progress = () => {}) {
    // Work on a copy. A failed page never erases the last complete import.
    const old = previous?.ownerId === profile.id ? previous : emptyLibrary(profile.id);
    const next = JSON.parse(JSON.stringify(old));
    next.profile = profile;
    const warnings = [];
    const insert = (raw, date, album) => { const item = track(raw, date, album); if (item) { next.tracks[item.id] = item; return item.id; } return null; };
    progress('Загружаем любимые треки…');
    const liked = await api.pages('/me/tracks?limit=50', (n, total) => progress(`Любимые треки: ${n} из ${total || n}`));
    next.liked = liked.map(x => insert(x.track || x.item, x.added_at)).filter(Boolean);
    let albums;
    try { albums = await api.pages('/me/albums?limit=50'); }
    catch (e) { if (e.status === 401) throw e; warnings.push('Альбомы: ' + e.message); }
    if (albums) {
      const imported = [];
      for (let i = 0; i < albums.length; i++) {
        const a = albums[i].album; if (!a) continue;
        progress(`Альбомы: ${i + 1} из ${albums.length}`);
        const c = collection(a, 'album');
        try {
          const items = await api.pages(`/albums/${encodeURIComponent(a.id)}/tracks?limit=50`);
          c.tracks = items.map(x => insert(x, albums[i].added_at, a)).filter(Boolean);
        } catch (e) {
          if (e.status === 401) throw e;
          c.tracks = old.albums.find(x => x.id === a.id)?.tracks || []; c.unavailable = true;
          warnings.push(`Альбом «${c.name}»: ${e.message}`);
        }
        imported.push(c);
      }
      next.albums = imported.concat(old.albums.filter(c => c.manual && !imported.some(x => x.id === c.id)));
    }
    let lists;
    try { lists = await api.pages('/me/playlists?limit=50'); }
    catch (e) { if (e.status === 401) throw e; warnings.push('Плейлисты: ' + e.message); }
    if (lists) {
      const imported = [];
      for (let i = 0; i < lists.length; i++) {
        const p = lists[i]; if (!p) continue;
        progress(`Плейлисты: ${i + 1} из ${lists.length}`);
        const c = collection(p, 'playlist');
        try {
          const items = await api.pages(`/playlists/${encodeURIComponent(p.id)}/items?limit=50`);
          c.tracks = items.map(x => insert(x.item || x.track, x.added_at)).filter(Boolean);
        } catch (e) {
          if (e.status === 401) throw e;
          c.tracks = old.playlists.find(x => x.id === p.id)?.tracks || []; c.unavailable = true;
          warnings.push(`Плейлист «${c.name}»: Spotify не предоставил содержимое (${e.status || 'нет сети'}).`);
        }
        imported.push(c);
      }
      next.playlists = imported.concat(old.playlists.filter(c => c.manual && !imported.some(x => x.id === c.id)));
    }
    const retained = new Set([...next.liked, ...next.manual, ...next.albums.flatMap(x => x.tracks), ...next.playlists.flatMap(x => x.tracks)]);
    next.tracks = Object.fromEntries(Object.entries(next.tracks).filter(([id]) => retained.has(id)));
    next.syncedAt = new Date().toISOString(); next.warnings = warnings;
    return next;
  }
  function parseSpotifyLink(input) {
    const value = input.trim();
    const uri = value.match(/^spotify:(track|album|playlist):([A-Za-z0-9]{22})$/);
    if (uri) return { type: uri[1], id: uri[2] };
    let url; try { url = new URL(value); } catch { return null; }
    if (url.protocol !== 'https:' || url.hostname !== 'open.spotify.com') return null;
    const match = url.pathname.match(/^\/(?:intl-[a-z-]+\/)?(track|album|playlist)\/([A-Za-z0-9]{22})\/?$/i);
    return match ? { type: match[1].toLowerCase(), id: match[2] } : null;
  }
  function filterTracks(library, ids, query = '', sort = 'recent') {
    const q = query.trim().toLocaleLowerCase();
    const items = ids.map(id => library.tracks[id]).filter(Boolean).filter(t => !q || `${t.name} ${t.artists} ${t.album}`.toLocaleLowerCase().includes(q));
    if (sort === 'title') items.sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'artist') items.sort((a, b) => a.artists.localeCompare(b.artists));
    if (sort === 'recent') items.sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''));
    return items;
  }
  function nextRepeatMode(mode) { return mode === 'off' ? 'context' : mode === 'context' ? 'track' : 'off'; }
  root.LumaCore = { SpotifyApi, SpotifyError, track, emptyLibrary, collection, syncLibrary, parseSpotifyLink, filterTracks, nextRepeatMode };
  if (typeof module !== 'undefined') module.exports = root.LumaCore;
})(globalThis);
