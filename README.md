# File Upload Testing Framework

A one-page Express upload app and the Playwright suite that tests it.

## What it tests

The server accepts `.pdf`, `.doc`, `.docx` and `.xlsx` files up to 2 MB (2,097,152 bytes). It checks the extension and the file signature, and for `.docx` and `.xlsx` the contents of the archive.

| Rule | Message |
| --- | --- |
| Wrong extension or signature, or a `.docx` without `word/` or `.xlsx` without `xl/` (so a `.docx` renamed `.xlsx`, and the reverse, is rejected) | Only PDF, Word (.doc, .docx) and Excel (.xlsx) files are allowed |
| Over 2 MB | File is too large (max 2 MB) |
| Zero bytes | File is empty |
| No file sent | Please choose a file |

- `tests/upload.api.spec.js` checks every rule, status code and message against `POST /upload`.
- `tests/upload.ui.spec.js` checks the main flows in Chromium through the page object in `tests/pages/upload.page.js`.
- `tests/support/files.js` generates all test files in memory, so no binary fixtures are committed.

## How to run

Requires Node 22 or later.

```sh
npm ci
npx playwright install chromium
npm test            # starts the app automatically on port 3210
npm run report      # opens the HTML report
npm start           # runs the app on its own at http://127.0.0.1:3210
```

Set `PORT` to use a different port. `npm test` fails at startup if the port is already in use, so stop `npm start` first.

## How it was built

Built with Claude Code from a one-phase specification. The only dependencies are Express and `@playwright/test`.

- Multipart bodies are read with `express.raw` and parsed by Node's built-in `Response.formData()`, so no upload library is needed.
- Uploads are validated in memory and never saved.
- Checks run in this order: extension, empty, size, signature.
- `.docx` and `.xlsx` must have the ZIP header and an entry under `word/` or `xl/` in the ZIP directory, so a plain ZIP archive with either extension is rejected. Entries are not decompressed.
- `.doc` is checked by its OLE signature only, so any other OLE file renamed `.doc`, such as a legacy `.xls`, is accepted.
