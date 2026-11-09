# Adding a language

1. Copy `it.ts` to `<code>.ts` (the two-letter language code, e.g. `fr.ts`, `de.ts`, `es.ts`).
2. Change `name` to the language's own name and translate the right-hand side of each line.
   Keep `{placeholders}` exactly as they are. Lines you don't translate stay in English.
3. That's it: the file is picked up automatically and appears in Profile → Language.

The keys are the English texts that appear in the code. After a new feature, `grep -rn 't("' src` shows every text.
