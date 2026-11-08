# AnimeRoll Web

React + Vite client for [AnimeRoll Server](https://github.com/KuroZetsubou/AnimeRoll-Server). In production it is built into the server's
Docker image and served on `/`, so there is nothing to deploy separately.

## Development

```bash
npm install
npm run dev      # http://localhost:5173, API calls are proxied to the server on http://localhost:8080
npm run build    # production bundle in dist/
```

Fonts (Outfit, Figtree) are bundled in `public/fonts`. Subtitles are rendered with JASSUB (libass compiled to
WebAssembly); dubs are played from an audio-only track extracted by the server and kept in sync with the video.

## License

© 2026 KuroZetsubou. Licensed under [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International](LICENSE)
(CC BY-NC-SA 4.0): you may share and adapt it for non-commercial purposes, with credit, and you must distribute your
changes under the same license. It is provided "as is", without warranty, and no patent rights are granted.
This is a source-available license, not an OSI-approved open source license.
