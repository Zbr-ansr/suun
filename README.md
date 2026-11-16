# Suun

Suun is a voice note-sorting app for Chrome on Android. You speak once, and it splits what you said into notes and files each one under the right heading.
It installs on the home screen like an app and works offline after the first launch.
Your notes never leave the phone: they are stored in the browser on the device, and nothing is uploaded.

## First-time Git identity

Git needs to know who you are before it can save a commit. Run these once on this PC:

```bash
git config --global user.name "<your name>"
git config --global user.email "<your email>"
```

## Publish

1. On github.com, create a new **public** repository named `suun`. Leave "Add a README", licence and .gitignore all unticked.
2. In this folder, run:

```bash
git remote add origin https://github.com/<username>/suun.git
git push -u origin main
```

3. On the repository page open Settings, then Pages. Set Source to "Deploy from a branch", Branch to `main`, folder to `/ (root)`, and press Save.
4. After a minute or two the site is live at `https://<username>.github.io/suun/`.

## Install on the phone

1. Open the site URL in Chrome on Android.
2. Open the Chrome menu and choose "Add to Home screen" or "Install app".
3. Allow the microphone when asked.
4. Stay online on the first launch: the sorter model downloads once, then is kept on the phone.

## Updating

After changing files, raise the `VERSION` constant at the top of `sw.js` (for example `v1` to `v2`), commit and push. The phone picks up the new version on the second launch.

## Backup

Open Settings and choose Export backup. Clearing Chrome's site data or uninstalling the app deletes the notes, so export before doing either.

## Run locally

```bash
python -m http.server 8080
```

Then open `http://localhost:8080/`.
