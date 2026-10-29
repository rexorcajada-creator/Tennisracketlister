# Racket Listing Writer

A one-page web app for writing eBay listings for used tennis rackets.
Add photos and the model name, and it returns:

- **An eBay title** (80 characters max) in the same format every time:
  `Brand Model Version Tennis Racket 97 sq in 315g Grip 4 3/8 - B Very Good`
- **A condition grade** on a fixed scale (A+ / A / B / C / D), which you can change before copying
- **Item specifics**: head size, weight, balance, string pattern, grip size, and more
- **A formatted HTML description** with condition details, noted flaws, specs, the shop's grading scale, and shipping and returns text
- **A "Check before listing" box** for anything uncertain, such as a possible crack, specs that differ between versions, or missing photos

Claude (Anthropic's AI) looks at the photos and fills in a fixed form. The app then
builds the listing from a template, so every listing has the same layout.

## Setup (one time)

1. Get an API key at <https://console.anthropic.com> (Settings → API Keys) and add some credit.
2. Open the app and tap **Settings**. Paste the key, then set the shop name and the shipping and returns text.
   These settings are saved in that browser on that device only.

## Using it

1. Type the model, for example `Babolat Pure Drive 2021`.
2. Add photos: front, back, both sides of the head, the throat, and the grip and butt cap (this is where the grip size label is).
3. Optional: choose the grip size, enter a price, and add notes about anything the photos don't show.
4. Tap **Write listing**. It takes about 30–60 seconds.
5. Read the **Check before listing** box. Change the grade if needed.
6. Copy the title. Then tap **Copy description (HTML)**, switch eBay's description editor to HTML, and paste.

## Hosting

The app is plain static files, so there is no build step and no server.

- **GitHub Pages:** in the repo, go to Settings → Pages, choose "Deploy from a branch", then pick the branch and `/ (root)`.
  The app is then available at a link you can open on a phone. On a free GitHub plan, Pages works only for public repos.
  The API key is never stored in the repo. Each device keeps its own key.
- **Locally:** run `python3 -m http.server` in this folder and open <http://localhost:8000>.
  Opening `index.html` directly from disk won't work, because browsers block modules on `file://`.

## Customizing

All the wording is in `listing.js`:

- `GRADES`: names, definitions, and eBay condition for each grade
- `systemPrompt()`: the rules Claude follows when it grades
- `buildTitle()`: the title formula
- `buildDescriptionHtml()`: the description layout and colors

## Notes

- Model: `claude-opus-5-5` with structured JSON output, so the response always matches the form.
  Server-side refusal fallback is turned on, so if a request is ever declined by a safety check, the API retries it on a fallback model.
- Photos are shrunk on the device before upload (max 1568 px), and up to 12 are used.
- Cost depends on the number of photos. Expect a few cents per listing.
- Your API key goes straight from the browser to Anthropic. Only use the app on devices you trust.
