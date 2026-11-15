# Store listing: Glyph Garden 0.3.0

Text and answers for the Chrome Web Store and Firefox Add-ons (AMO) forms. Copy from here, so both
stores say the same thing. The images are in this folder (`screenshots/`, `promo-*.png`,
`marquee-*.png`) and are redone with `npm run store:assets`.

## Name

Glyph Garden

## Short description

Used as the Chrome "summary" (taken from the manifest, 132 characters at most) and the AMO summary.
It is 100 characters.

> A calm new tab of animals drawn with keyboard characters. Feed the koi, or hold still for fireflies.

## Full description

> Glyph Garden turns your new tab into a quiet little habitat, drawn entirely with keyboard characters.
>
> **The Pond.** Koi drift and school across the page. Click to drop food: nearby fish startle away from
> the splash, then race back to eat and grow a little.
>
> **The Meadow.** Fireflies flash in the dark above swaying grass. Each one keeps its own rhythm, and
> neighbours nudge each other, so over a minute or so the meadow slips into waves and groups of light.
> Press and hold to light a soft ring that the fireflies gather around. Tap to make the nearby ones
> flash.
>
> Click the scene name in the bottom left, or press the left and right arrow keys, to switch scene.
> Your choice is remembered.
>
> **Also on the page:** a clock, a short calm greeting (add your name if you like), and a search box
> that uses the search engine you already chose in your browser.
>
> **Tune it.** The sliders button in the bottom right opens a panel where every number in the
> simulation is a live slider: how many koi, how fast the fireflies flash, how bright the glow is, how
> tall the grass grows. Settings save automatically, and you can copy and paste them as presets.
>
> **Light and private.** Everything is drawn in one WebGL2 pass, and the page stops completely while
> the tab is hidden. Glyph Garden collects nothing, sends nothing, has no analytics and makes no network
> requests. It needs only two permissions: `storage` (to save your settings) and `search` (to send what
> you type to your default search engine).
>
> Free and open source (MIT): https://github.com/cosmo030/glyph-garden

## Category

- **Chrome Web Store:** _Just for Fun_ (alternative: _Entertainment_). These are two of the 18
  extension categories listed on the
  [Chrome Web Store best-practices page](https://developer.chrome.com/docs/webstore/best-practices);
  the dashboard dropdown is the final list. Chosen under Store listing > Product details.
- **Firefox Add-ons:** _Appearance_ (a second category, if the form allows one: _Games & Entertainment_).
  These come from the public
  [category list](https://addons.mozilla.org/en-US/firefox/extensions/categories/) on AMO; I did not
  see the submission form, so check the names there.

## Single purpose (Chrome Privacy tab)

> Replaces the new tab page with a calm, animated scene of animals drawn from keyboard characters, with
> a clock, a greeting and a search box.

## Permission justifications (Chrome Privacy tab; reuse for AMO if asked)

- **storage**: Saves the user's own settings (Tune slider values, chosen scene, optional name for the
  greeting) in the extension's local storage on their device, so the page looks the same on the next new
  tab. Nothing is sent anywhere.
- **search**: The search box on the new tab page calls the browser's search API (`search.query`, current
  tab) so the query goes to the user's default search engine. The extension does not choose a search
  provider, does not change the browser's search settings, and does not see the results.

The new-tab override (`chrome_url_overrides.newtab`) is declared in the manifest and needs no permission.

## Privacy answers

- **Does the extension collect user data?** No. In the Chrome "Data usage" section leave every data
  type unticked, then tick the certifications (nothing is sold, used or transferred for unrelated
  purposes, or used for lending). Nothing is collected, so all of them hold.
- **Remote code:** No, I am not using remote code. All code is bundled in the package; there are no
  remotely hosted scripts, no `eval`, and no network requests.
- **Firefox data collection:** the Firefox manifest declares
  `browser_specific_settings.gecko.data_collection_permissions.required = ["none"]` (nothing is
  collected or transmitted). Nothing to tick on the form beyond that.
- **Privacy policy URL (both stores):**
  `https://github.com/cosmo030/glyph-garden/blob/main/PRIVACY.md` (the file is [PRIVACY.md](../PRIVACY.md)
  at the repository root; it works once this change is merged).

## Images

| File                                  | Size     | Goes in                                                                       |
| ------------------------------------- | -------- | ----------------------------------------------------------------------------- |
| `../public/icon/128.png` (in the zip) | 128x128  | Chrome: store icon (also read from the zip). AMO: icon comes from the add-on. |
| `screenshots/01-pond.png`             | 1280x800 | Screenshot 1 in both stores: the Pond                                         |
| `screenshots/02-pond-feeding.png`     | 1280x800 | Screenshot 2: feeding the koi                                                 |
| `screenshots/03-meadow-flashing.png`  | 1280x800 | Screenshot 3: the Meadow flashing                                             |
| `screenshots/04-meadow-holding.png`   | 1280x800 | Screenshot 4: the Meadow while holding                                        |
| `screenshots/05-tune-panel.png`       | 1280x800 | Screenshot 5: the Tune panel (the Chrome limit is 5 screenshots)              |
| `promo-440x280.png`                   | 440x280  | Chrome: small promo tile                                                      |
| `marquee-1400x560.png`                | 1400x560 | Chrome: marquee promo tile (optional)                                         |

Suggested screenshot captions (AMO allows one per image): "The Pond: koi drift across the page",
"Click to feed them", "The Meadow: fireflies flash and fall into step", "Press and hold: they gather
around the light", "Every number is a slider".

## Version notes (what's new)

> Adds the Night meadow (fireflies, grass and stars), scenes you can switch between, a clock and calm
> greetings, a new icon, and a Tune panel with sliders for everything.
