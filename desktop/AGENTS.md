# desktop

Frontline on the desktop: an Electron shell around erxes web, in the T3 Code
style. It draws no screens of its own beyond `static/setup.html`, the erxes
address form. Every feature is a web feature first.

- One window loads `<server>/frontline`, where the member signs in to erxes as
  in a browser. Closing it hides it to the tray, so the web softphone, which
  runs from core's floating widget, keeps the SIP line all day.
- `src/preload.ts` gives the page `window.erxesDesktop` (`src/bridge.ts`). The
  web code checks for it: `ui/src/modules/calls/softphone/DesktopLink.tsx`
  sends the phone's state and runs the app's commands. Main parses what the
  page sends with `PhoneState`, and only from erxes's origin in the app's window.
  A new desktop feature is a field or command there, and its handling in ui.
- `src/window.ts` fences the page: media and notifications for erxes's origin
  only, other sites in the browser, `tel:` links dial. `src/phone.ts` takes the
  phone's state, `src/tray.ts` draws the tray menu, `src/text.ts` holds the app's
  words in English and Mongolian.
- `src/card.ts` is the call card: a small window over every other app, at the top
  right of the screen, while a call rings or is on and the app's window isn't in
  front. Its page, `static/call.html`, has no phone: it draws `PhoneState`, rings,
  and sends its buttons back as `CardCommand`. The app's window stays where it is.
- `pnpm --filter @frontline/desktop start` downloads Electron's binary once,
  builds (`build.ts`) and runs it; `dist` packages it with electron-builder for
  the system it runs on (`electron-builder.yml`). On Linux without a working
  SUID sandbox, pass `--no-sandbox` to try it locally.
- `.github/workflows/desktop.yml` packages it on macOS, Windows and Linux for a
  pull request that changes `desktop/`. To release, bump `version` in
  `package.json` and push the tag `desktop-v<version>`: the installers go up
  as a GitHub release. They aren't signed yet.
