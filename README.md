# Access Proposal Builder

A static web form (GitHub Pages) that assembles Princeton Research Computing
access requests for the large clusters (Della, Stellar, Tiger), following the
Access Request guidelines.

**Live site:** https://pu-shd.github.io/access-proposal/

Two request types, matching the two ways access is granted:

| Mode | Who sends it | Output |
|---|---|---|
| **New project proposal** | Faculty member, via the online proposal form | LaTeX-style PDF (≤ 3 pages) and Markdown |
| **Sponsor additional users** | Faculty member, by email to `cses@princeton.edu` | Email draft (copy or open in mail app) |

## Typical workflow

1. Choose the system(s) and enter the sponsoring faculty member and researchers (name + NetID;
   tick **Non-Princeton** for anyone who needs an RCU account).
2. Open **Questionnaire to send the researcher**, copy it, and email it to the researcher.
3. Paste their whole reply into **Paste the researcher's reply** and click **Fill form from reply**.
   Quoted history and sign-offs are ignored.
4. Review the preview. Values are normalized automatically:
   - `none` → `None.`
   - `256GB` → `256 GB`, `2/4 * A100` → `2–4 × A100`
   - library and language names are canonicalized (`Pytorch, jax` → `PyTorch, JAX`)
   - references written `Title -- CS Brito, ICML 2025` → `C. S. Brito. “Title.” ICML, 2025.`
     (authors first, initials expanded, title in title case; lines without ` -- ` are kept as written)
   - empty optional fields are omitted, never shown as placeholders
   - optional extras: **System details** (shown in parentheses after the system, e.g. *GPU partition,
     NVIDIA A100*), **Software notes** (a paragraph under the programming table, e.g. environments or
     commercial licenses), shared storage, requested duration, and a resource justification
5. Click **Save as PDF**. In the print dialog choose *Save as PDF*, paper size *Letter*, and turn off
   *Headers and footers*. Keep an eye on the page estimate (limit 3).
6. Use **Export form (.json)** to keep a copy for future renewals; **Import form…** restores it.

Everything runs in the browser. The current draft is kept in your browser's local storage
and nothing is sent anywhere.

## Development

Requires Node.js 22+.

```sh
npm ci
npm run serve        # http://localhost:8000
npm run check        # eslint + tsc (JSDoc types) + tests
```

Containerized:

```sh
docker-compose run --rm test      # lint, typecheck, tests
docker-compose up site            # http://localhost:8000
```

### Layout

| Path | Purpose |
|---|---|
| `site/proposal.js` | Pure logic: reply parser, normalizers, validation, document model, Markdown, emails |
| `site/render.js` | Renders the document model to DOM (text only, never `innerHTML`) |
| `site/app.js` | Form wiring, persistence, import/export, printing |
| `site/paper.css` | LaTeX article look (Latin Modern, booktabs-style tables) and print rules |
| `test/` | `node:test` unit tests and jsdom integration tests |

CI (`.github/workflows/ci.yml`) runs lint, type checks, and tests natively and in Docker.
`pages.yml` re-runs the checks and deploys `site/` to GitHub Pages on every push to `main`.
