# How to Deploy a React/Vite App to GitHub Pages

## What you need
- Node.js installed (nodejs.org)
- GitHub account (github.com)
- GitHub Desktop installed (optional but easier)

---

## Step 1 — Configure Git
Open Command Prompt and run:
```
git config --global user.name "YourGitHubUsername"
git config --global user.email "your@email.com"
```

---

## Step 2 — Prepare the app

**Switch to HashRouter** in `src/App.tsx`:
```tsx
import { HashRouter as BrowserRouter, Routes, Route } from "react-router-dom";
```

**Install gh-pages:**
```
npm install --save-dev gh-pages
```

**Add to `package.json`:**
```json
"homepage": "https://YourUsername.github.io/your-repo-name",
"scripts": {
  "predeploy": "npm run build",
  "deploy": "gh-pages -d dist",
  ...
}
```

---

## Step 3 — Create GitHub repository

1. Go to github.com → click **"+"** → **New repository**
2. Name it (e.g. `finance-app`)
3. Set to **Public**
4. Leave everything else empty → **Create repository**

---

## Step 4 — Push code to GitHub
```
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YourUsername/your-repo-name.git
git push --force origin main
```

---

## Step 5 — Deploy
```
npm run deploy
```

---

## Step 6 — Enable GitHub Pages

1. Go to your repo on GitHub
2. **Settings → Pages**
3. Under Branch select **gh-pages** → **Save**

---

## Done
Your app is live at:
```
https://YourUsername.github.io/your-repo-name
```
Wait 1-2 minutes for it to appear.

---

## Updating the live site in the future
Every time you make changes, run:
```
git add .
git commit -m "describe what changed"
git push
npm run deploy
```
The link stays the same, content updates automatically.

---

## Important notes
- `git push` → saves source code to GitHub
- `npm run deploy` → updates the live website
- Data (transactions etc.) is stored in the **browser** — not on GitHub
- The `release/` folder (Electron builds) must be in `.gitignore` — large files break the push
