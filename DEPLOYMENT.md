# Put ATELIER on your iPad

The current app is a static website. It needs no build command, backend, account system, or paid hosting. The existing appearance, real recordings and sheet viewer are preserved. Use **iPadOS 18 or later** for the bundled PDF.js legacy renderer.

## 1. Push this project to GitHub

1. Sign into GitHub and create an **empty public repository**, for example `Piano`. Do not initialize it with a README, license or gitignore; this project already includes those files where needed.
2. Open PowerShell in `D:\Project\Piano`. For this folder's first upload, run the following. Replace `USERNAME` and `REPOSITORY` with your actual GitHub name and repository name:

   ```powershell
   git init -b main
   git add .
   git commit -m "Prepare ATELIER piano for iPad and GitHub Pages"
   git remote add origin https://github.com/USERNAME/REPOSITORY.git
   git push -u origin main
   ```

3. Complete GitHub sign-in if Git asks. If you later use a folder that already has a Git repository and remote, skip `git init` and `git remote add`.
4. Confirm that `index.html`, `manifest.json`, `service-worker.js`, `.nojekyll`, `css/`, `js/`, and the **complete `assets/` folder** are visible in the repository. Keep the sample and PDF licenses. The existing `.gitignore` excludes test downloads, screenshots and development dependencies.

The piano recordings total approximately 122 MB, so the first push takes longer than an ordinary small website. Individual files are under GitHub's 100 MB limit; use normal Git, without Git LFS. Do not omit samples or the bundled PDF.js files.

## 2. Enable GitHub Pages

1. In your GitHub repository, open **Settings → Pages**.
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Select **main** and **/(root)**, then **Save**.
4. Wait for deployment to finish. GitHub displays your live address, typically:

   `https://USERNAME.github.io/REPOSITORY/`

5. Use that HTTPS address, including the repository name. All app, icon, sample, worker and PDF dependency paths are relative. The service worker is scoped to that repository. `.nojekyll` tells Pages to serve the static files directly.

See [GitHub's publishing instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## 3. Open on iPad Safari

1. Connect your iPad to Wi-Fi and open the GitHub Pages HTTPS address in **Safari**.
2. Rotate the iPad to landscape. Wait until the screen says **30 of 30 recordings ready**.
3. Tap **Tap to Start Piano**. Safari requires this direct user tap to enable audio.
4. Open **Settings** in the app. Keep it online until the message says **Piano and sheet music viewer are ready offline on this device**.
5. Tap **Open Sheet Music** to choose a PDF or JPG/PNG/WEBP from Files. The score is processed and remembered locally; it is never uploaded to GitHub or a server.

## 4. Add it to the Home Screen

1. In Safari, tap **Share**. Tap **View More** if needed, then **Add to Home Screen**.
2. Keep **Open as Web App** enabled if shown. Choose the name **Atelier**, then tap **Add**.
3. Launch Atelier using the new Home Screen icon. It opens in standalone mode, without Safari's normal toolbar.
4. For all notes with wider keys, select **Keyboard → 88 keys · 2 rows**. Rotate to landscape. Use **Expand sheet / Collapse sheet** to change the compact sheet preview. The other three keyboard modes remain available.
4. On the first Home Screen launch, remain online until loading and offline setup finish there too. Safari and installed apps may have separate storage. Tap to start audio again when requested, and reopen your score if needed.
5. Once the installed app reports that it is ready offline, close it, enable Airplane Mode, and reopen it to check your own device's offline setup.

See [Apple's Home Screen instructions](https://support.apple.com/guide/ipad/open-as-web-app-ipad8f1f7a29/ipados).

## Playing and updates

- iPad starts with **2 octaves · wide keys**. Use the Keyboard selector for 3 octaves or All 88 keys; use the arrow buttons to move lower/higher. Piano fingers and sheet gestures remain independent. Sustain, metronome, recording and playback use the original audio engine.
- Landscape height responds to Safari's bars, rotation and the onscreen keyboard. Safe-area padding protects the controls from the display edges.
- Page scrolling, selection, double-tap zoom and native gesture defaults are suppressed on the custom playing/reading surfaces. The score's own pinch and pan controls remain active. iPadOS system gestures, such as the Home gesture, remain under the operating system's control.
- Browser storage can be cleared or evicted. If offline data is removed, launch online to cache the app again. Your original music files remain untouched.
- After future edits, increment the shell version in `service-worker.js`, then commit and push. Keep the sample-cache version unchanged unless sample bytes change. Load once online to install the update, then reload. Updates never force a reload during a performance.

For later uploads:

```powershell
git add .
git commit -m "Update ATELIER"
git push
```

## Local subpath testing

The development server can emulate GitHub Pages:

```powershell
$env:BASE_PATH = '/Piano/'
$env:PORT = '5174'
node scripts/serve.js
```

Open `http://localhost:5174/Piano/` on the computer. A LAN HTTP URL can play the piano, but iPad installation/offline testing should use the deployed HTTPS address.
