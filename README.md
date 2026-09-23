# Lumen

A private document workspace with real OpenAI embeddings, exact cosine retrieval, and cited answers.

## Pipeline

1. Add PDF, DOCX, TXT, Markdown, or CSV files. PDF.js and Mammoth extract text in the browser. Pages with fewer than 400 selectable characters automatically receive English OCR using Tesseract.js, including hybrid PDFs with selectable headers over scanned bodies. OCR runs on the user's device with bundled workers and language data. The original file and extracted pages are then sent to the authenticated server.
2. Split text into passages of up to 1,600 characters with about 240 characters of overlap. PDF page numbers are preserved.
3. Embed passages with `text-embedding-3-small`, 512 dimensions, in batches of 32.
4. Save original files in R2 and document metadata, passages, and vectors in D1. Duplicate files are detected by SHA-256. Re-uploading the same file with improved extracted text refreshes its index.
5. Embed each question with the same model and dimensions. Calculate cosine similarity against the user's collection in bounded batches. Select up to three passages with scores at or above the chosen threshold (default 0.30).
6. Send those passages and the question to the OpenAI Responses API (`gpt-4.1-mini`, configurable with `OPENAI_MODEL`). The prompt treats source text as untrusted data and requests numbered citations. If no passages qualify, no generation request is made.
7. Show the answer, source scores, and clickable original passages. Users can delete a file and its vectors.

The app uses React, Vinext, TypeScript, Cloudflare Workers, D1, and R2. Sites provides private access and authenticated user headers. Each server operation scopes document access to the authenticated user. API keys stay on the server.

## Development

Node 24 is recommended. Install with `npm ci`. PDF.js workers, image decoders, fonts, CMaps, and Tesseract English OCR assets are bundled under `public/`; when upgrading those libraries, refresh their matching public assets too. The image decoders are essential for scanned PDFs with JBIG2 or JPEG2000 images.

The development process reads the existing `OPENAI_API_KEY` environment variable into the local Worker at runtime. It is excluded from production build configuration. Hosted secrets are configured separately through Sites. No API key is included in this source package.

```sh
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_elite_franklin_storm.sql
npm run dev
```

Apply the initial migration once to a new local database. Use the URL printed by the server and visit `/signin-with-chatgpt?return_to=/` to enter its development-only test identity. Hosted authentication uses real Sites identity; the mock is not included in production.

For new schema changes, use `npm run db:generate`. In restricted Windows environments where the OS account lookup fails, use `node scripts/windows-drizzle.cjs generate`. Keep applied migrations immutable.

## Checks

```sh
node node_modules/typescript/bin/tsc --noEmit
node --experimental-strip-types scripts/check-rag.ts
node scripts/check-integration.mjs
```

The integration check expects a local development server at `localhost:5173`, a migrated database, and the existing API key. It makes billable OpenAI requests, creates four uniquely named test documents, verifies a cited answer, then removes its own documents. It verifies authentication, upload persistence, deduplication, top-three retrieval, threshold behavior, input validation, origin validation, and deletion.

Browser verification with the supplied hybrid PDF recovered 3,990 words into 26 passages. The original boiler-pressure question retrieved the relevant definitions on PDF page 4 with cosine similarity 0.562 at a 0.50 threshold. The source inspector showed both the low-pressure maximum and high-pressure boundary. The short question “What is a burner?” retrieved its page 5 definition at 0.311, which is retained by the default threshold of 0.30. The manual itself is not included in this source package.

## Deliberate limits

- 15 MB per file, 300 PDF pages, 600,000 extracted characters, 500 passages per upload, and 3,000 passages per user's collection.
- English OCR for sparse-text PDF pages. Poor scans can produce recognition errors; encrypted or malformed documents may not be readable. PDFs with dense selectable text plus additional text inside images may require preprocessing.
- Retrieval is exact linear cosine search. A dedicated vector index is the next step for larger collections.
- Citations identify retrieved text; users should inspect sources when accuracy matters.
- Questions and answers are transient; uploaded collections persist. Separate named collections and chat history are not implemented.
- Optional `ask_documents` WebMCP tool uses the same UI action when the browser supports it.

## API documentation

- [OpenAI embeddings](https://developers.openai.com/api/docs/guides/embeddings)
- [OpenAI text generation / Responses API](https://developers.openai.com/api/docs/guides/text)
