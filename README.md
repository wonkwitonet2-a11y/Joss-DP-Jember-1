<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/aaaea66b-c1ca-4f74-b7cc-ff92407d3683

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Menjalankan untuk pemakaian sehari-hari (bukan development)

**PENTING:** `npm run dev` menjalankan mode development Vite (tanpa minify, dengan HMR) —
ini yang membuat app terasa berat/lemot di HP entry-level. Untuk dipakai sehari-hari oleh
Admin/YL, selalu build dulu lalu start versi production:

```
npm run build
npm start
```

`npm start` sekarang otomatis memakai hasil build (folder `dist/`) yang jauh lebih ringan,
selama langkah `npm run build` sudah pernah dijalankan.
