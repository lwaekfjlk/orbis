# README city collages

Each README illustration is one PNG containing four real application screenshots in a 2 × 2 layout. `index.html` defines the layout, `panels/` preserves the original browser captures, and `manifest.json` records their order, captions and source hashes. The three capture reports contain the world, camera and narrator data.

To render the collages again, supply an existing Playwright installation and Chromium executable if they are not available by default:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROMIUM_PATH=/path/to/chromium node scripts/render-readme-grids.mjs
```

The renderer lays out the unchanged screenshots with HTML/CSS, verifies all four panels load in two rows and two columns, and captures each grid. It does not regenerate or retouch the city geometry. `verification.json` records the resulting PNG dimensions and hashes.
