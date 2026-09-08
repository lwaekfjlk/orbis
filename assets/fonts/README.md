# Map lettering fonts

These original, unmodified TrueType fonts are bundled from the official [google/fonts repository](https://github.com/google/fonts):

- **Bilbo Swash Caps Regular**, by TypeSETit: [ofl/bilboswashcaps/BilboSwashCaps-Regular.ttf](https://github.com/google/fonts/blob/main/ofl/bilboswashcaps/BilboSwashCaps-Regular.ttf), stored as `BilboSwashCaps-Regular.ttf`. The [official metadata](https://github.com/google/fonts/blob/main/ofl/bilboswashcaps/METADATA.pb) identifies it as a handwriting face, normal style and weight 400. Its SIL Open Font License 1.1 is included in [BilboSwashCaps-OFL.txt](BilboSwashCaps-OFL.txt).
- **IM FELL English Italic**, by Igino Marini: [ofl/imfellenglish/IMFeENit28P.ttf](https://github.com/google/fonts/blob/main/ofl/imfellenglish/IMFeENit28P.ttf), stored as `IMFellEnglish-Italic.ttf`. Its SIL Open Font License 1.1 is included in [IMFellEnglish-OFL.txt](IMFellEnglish-OFL.txt).

The development page loads these local files. The build embeds their bytes as `data:font/ttf;base64` URLs in the standalone HTML, so map lettering works offline without a font service.

Country names (both full and compact forms) and town names now share **IM FELL English Italic**, at its original italic style and weight 400. Map lettering uses the supplied italic outlines without synthetic slanting or bolding. Town names remain small and wrap in full; interface controls keep their existing fonts. Bilbo remains bundled for compatibility with the existing font package.

Dark ink and a tight 1px pale halo preserve the fine italic strokes against terrain and water. Avoid broad, overlapping white shadows around these small names: they obscure the inclined stems. The font size, spacing and measured label boxes remain unchanged.
