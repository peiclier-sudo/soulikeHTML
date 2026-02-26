Built a 3D action game with third-person camera, stamina combat, and dodge rolling, entirely in the browser with Three.js.

## Run locally

```bash
cd NEWGAME
python -m http.server 8080
# Open http://localhost:8080
```

## Deploy on Vercel

- This project is a static site (no build step required).
- Import the GitHub repository in Vercel and deploy.
- Root directory should point to the project files (where `index.html` and `vercel.json` live).

`vercel.json` is configured to:
- serve `index.html` as the app entry
- rewrite unknown routes back to `index.html`
- add cache headers for static assets in `js`, `css`, and `models`
