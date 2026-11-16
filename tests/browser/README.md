# Browser regressions

Start with Node 18+: `node tests/browser/fixture.cjs` from the project directory.
Open http://127.0.0.1:43906/ in a separate test browser/profile with autoplay
permitted. Change the port with LUMA_UI_TEST_PORT if needed. Use a fresh profile
for every run: settings and counters are test state. The page executes checks
automatically; inspect `document.body.dataset.qaResult` for PASS or FAIL.
At 900x700 open /?settings-only=1 to cycle all settings tabs, themes and languages.

For headless Chromium use --headless --mute-audio
--autoplay-policy=no-user-gesture-required --disable-features=HardwareMediaKeyHandling
--window-size=1440,1050 --virtual-time-budget=45000 --dump-dom
and an isolated --user-data-dir. Assertions are in checks.js. An optional
--screenshot path captures the final settings view. Close the test browser and
server after the result is written; neither needs a visible desktop window.

The fixture only binds to loopback and redirects catalog/token/Spotify requests
to in-memory test endpoints. Fake SDK and SoundCloud widget callbacks exercise
delayed play acknowledgements and stale events. Local audio is a four-second
silent WAV generated in memory. No real service account is used or changed.
Public CDN cover images may be requested by image elements; no account headers
are attached. These images are not required for playback coordination assertions.
This verifies application logic, not actual Spotify DRM or SoundCloud streaming.
