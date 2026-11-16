# Luma 1.14 review and regression results

Reviewed the three playback engines, UI controls and queue handoffs; settings,
local library and lyrics; discovery/search/artist data; loopback host and stored
credentials; native shell and Windows media publication. This is a regression
review, not a guarantee that every possible defect has been found.

## Fixed

- Footer, row, expanded-player, keyboard and Windows media controls now share
  explicit pause/resume actions. Acknowledged state takes precedence over a
  stale SDK snapshot. SoundCloud callbacks check the current widget and pause
  intent, and query its actual paused state.
- A playback coordinator serializes starts and controls. Every new selection
  invalidates old work and immediately stops other available engines. An obsolete
  Spotify play acknowledgement is followed by a compensating pause before the
  next engine starts. Old SoundCloud callbacks and local download completions
  cannot revive their tracks. Cancelled cold SDK connections are disconnected.
- Mixed and >100-track Spotify queues keep their complete queue through these
  transitions. Delegation happens outside the coordinator to avoid nested waits.
- Local audio play promises no longer block queued pause commands while loading;
  completion checks ownership and expected pause AbortErrors are ignored.
- Removed equalizer UI, filters, presets and audio graph. Legacy EQ preference
  fields are discarded while unrelated preferences and libraries are preserved.
- Settings have a centered SVG close icon and hidden scrollbars. Their content
  remains scrollable; wheel input at its boundaries or outside the dialog cannot
  scroll the background. Header and footer fit the available viewport.
- Current rows display one centered play/pause icon. The generic pressed-button
  background and former hidden Spotify row control no longer interfere with it.
- Added timeouts/retry for loading the SoundCloud widget script, stale SDK event
  guards and error handling for playback buttons.
- Small rejected JSON requests are drained within a bounded budget before the
  native host closes their connection. This fixes intermittent connection resets
  instead of readable 401/403 responses; authentication checks remain intact.

## Executed validation

- Production EXE built with .NET Framework compiler; JavaScript syntax checks.
- **106/106 Node checks passed**, including six playback-coordinator regressions,
  protected loopback API, encrypted token storage and rejected-post responses.
- Browser fixture: footer pause/resume, cold SDK cancellation, delayed Spotify
  acknowledgements, stale SoundCloud READY/PLAY/PAUSE callbacks, 20 rapid provider
  changes, mixed queues and a 121-track queue. No overlapping provider output was
  observed in these scenarios. Spotify/Widget playback and catalog are synthetic.
- Actual HTMLAudio playback of a silent WAV: local pause/resume, provider changes
  and cancellation of a delayed local-file response.
- Dialog wheel lock, centered close, single row icon; all five settings tabs at
  900x700 in RU/EN and light/dark themes, with scrollable content and no scrollbar.
- C# checks: 9 DesktopLinks, 9 Genius, 7 public-artist and 5 public-search checks;
  recorded public metadata refinements for covers, counts and query variants.
- Native media harness loaded the actual 1.14 release EXE without showing its
  window. A Windows consumer read ready artwork bytes, title and artist and
  verified that a track without artwork clears the previous image.

No desktop control, real account writes or real Spotify listening were performed.
Live Spotify OAuth/DRM and real SoundCloud Widget audio in WebView2 still require
end-to-end confirmation. Lively's own wallpaper UI was not controlled. Native
window mode code is unchanged from the previously tested release.

Browser fixture instructions are in `tests/browser/README.md`.
