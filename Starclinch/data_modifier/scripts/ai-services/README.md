# ai-services — Provider contract

Each file in this folder exports a single async function:

```js
async function rewrite(abouts) {}
```

## Input

```js
[
  {
    id: 55934,          // number — artist id
    slug: "hardy-sandhu",
    category: "Singer",
    about: "Original about text..."
  },
  ...
]
```

## Output

```js
[
  {
    id: 55934,               // same id as input
    modified_about: "...",   // rewritten text (null if failed)
    error: "...",             // only present on failure
  },
  ...
]
```

Output array must be in the **same order** as input.
Every input id must appear in the output (even if error).

## Adding a new provider

1. Create a new file, e.g. `openai.js`
2. Export `{ rewrite }` matching the signature above
3. Set `AI_PROVIDER=openai` in `.env` or at runtime

## Current providers

| Provider | File | Status |
|----------|------|--------|
| Gemini    | `gemini.js`    | ✅ Working |
| OpenRouter | `openrouter.js` | ✅ Working |
