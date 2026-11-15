# Contributing to Glyph Garden

Thanks for helping. Bug reports, ideas, new animals and tuning presets are all welcome.

## Getting started

```bash
npm install
npm run dev        # Chrome with live reload
```

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the code fits together.

## Before you open a pull request

- Run `npm run check` (type check + formatting). CI runs the same thing plus all builds.
- Run `npm run format` if the formatting check fails.
- Keep each pull request to one change, and describe what it does and how you tested it.
- For anything visual, include a screenshot or short screen recording.

## Code style

- **TypeScript, strict mode.** No `any` unless there is no other way, and then say why in a comment.
- **Formatting** is Prettier with the settings in `.prettierrc.json`. Don't format by hand.
- **Names** say what something is: `sprintSpeed`, not `s2`. Short names are fine for loop indices and
  well-known maths (`dx`, `dy`, `t`).
- **Units**: positions in grid cells, time in seconds, angles in radians (see ARCHITECTURE.md).

## Comments

The code is meant to be read by people learning from it, so:

- **Every file starts with a comment** saying what it is for.
- **Every exported function, class and method has a `/** ... */` comment** saying what it does,
  in one or two sentences.
- **Explain why, not what.** `// A fish can't turn on the spot, so ...` is useful;
  `// add 1 to i` is not.
- **Explain the maths.** If you use a formula, say what it models.
- **Section comments** (`// ---- Turning ----`) split long functions into readable parts.

## Performance

A new tab must open instantly. In code that runs every frame (`step`, `draw`):

- Don't allocate: no new objects, arrays, closures or strings. Use typed arrays and reuse scratch values.
- Draw through `renderer.push()` only.
- Check Tune > Performance before and after your change.

## Adding parameters

Everything tunable belongs in `src/params/schema.ts` with a clear label and sensible min, max and
default. Don't hard-code numbers someone might want to tune.

## Secrets

Never commit credentials. Store-publishing keys go in a local `.env` file (copy `.env.example`),
which git ignores, or in GitHub repository secrets for CI. If you commit a secret by accident,
treat it as leaked: revoke it, then remove it from history.

## Commit messages

Write the first line as a short summary in the imperative (`Add crab scene`, `Fix tail flicker`),
under about 70 characters. Add detail below a blank line if needed.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
