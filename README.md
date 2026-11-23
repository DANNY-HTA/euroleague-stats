# EuroLeague stats

A EuroLeague stats website. All numbers are calculated from the official
EuroLeague box scores, and every game is checked for errors before the site updates.

## How it works

1. **Every night**, GitHub downloads the box score of every finished game from the
   EuroLeague's live data feed (`scripts/fetch.mjs`).
2. **Every game is checked**: the score matches the official result, players add up
   to team totals, minutes add up to 200, and more (`lib/validate.mjs`).
   If anything is wrong, the update stops and GitHub emails you. The site keeps the
   last correct numbers.
3. **The stats are calculated** (`lib/stats.mjs`) and the pages are built into `site/`
   (`scripts/build.mjs`).
4. **GitHub Pages publishes the site** for free.

No packages to install. It only needs Node.js 20 or newer.

## One-time setup on GitHub

1. Open your repository on github.com and go to **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Go to the **Actions** tab, click **Update site**, then **Run workflow**.
4. After 2–5 minutes your site is live at
   `https://<your-username>.github.io/euroleague-stats/`.

After that it updates itself every night.

## Changing things

| What | Where |
|---|---|
| Season, site name, leaderboard minimums | `config.json` |
| Colours and layout | `static/style.css` |
| Page content | `scripts/build.mjs` |
| Formulas | `lib/stats.mjs` (and the "How we calculate" page in `scripts/build.mjs`) |

When the 2027–28 season starts, change `"seasonCode"` in `config.json` to `"E2027"`.

## Running it on your own computer (optional)

```
npm test          # checks the formulas against hand-calculated answers
npm run demo      # builds a preview with invented sample data
npm run update    # downloads the real data and builds the site
```

Then open `site/index.html` in your browser.

## Data source

The EuroLeague's public live feed (`live.euroleague.net`). It's the feed behind
euroleaguebasketball.net, but it has no official documentation and could change
without notice. If the feed changes, the accuracy checks fail and the site stops
updating instead of showing wrong numbers.
