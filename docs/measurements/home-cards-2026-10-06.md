# Home page cards: the runs behind them, 2026-10-06

Every sentence on the home page cards, and the two quotes behind its "what it will not call" line, sent to
production `POST https://repid-engine-production.up.railway.app/api/v1/classify` five times each.
One call every 20 seconds, the sentences taken in turn (run 1 of each, then run 2 of each, and so on), so
no sentence had its five calls back to back. The request body was exactly
`{"text": "<sentence>", "labels": ["pass", "veto", "not-checked"]}`, with no key and no account: the same call
the home page makes.

First call 2026-10-06T14:44:00.146Z, last call 2026-10-06T14:52:17.966Z.

| sentence | calls | answers | decided by |
|---|---|---|---|
| Before you pay (card) | 5 | Caught 5 | groq + cerebras |
| Before you cite it (card) | 5 | Checks out 5 | groq + cerebras |
| Before you run it (card) | 5 | Caught 5 | groq + cerebras |
| Einstein quote (will not call) | 5 | Not checked 5 | groq + cerebras |
| Darwin quote (will not call) | 5 | Not checked 5 | groq + cerebras |

## The sentences

- **Before you pay (card)**: Marking a $100 item up 50% and then down 50% brings it back to $100.
- **Before you cite it (card)**: Attention Is All You Need, the paper that introduced the Transformer, was published in 2017 by researchers at Google.
- **Before you run it (card)**: Running git reset --hard keeps the changes you have not committed yet.
- **Einstein quote (will not call)**: Albert Einstein said that insanity is doing the same thing over and over and expecting different results.
- **Darwin quote (will not call)**: Charles Darwin wrote in On the Origin of Species that it is not the strongest of the species that survives, but the one most responsive to change.

## What this does and does not show

- It shows what production answered for these exact sentences on this date. It is not an accuracy figure:
  five sentences picked for a demo are not a sample of anything.
- "Checks out" means two checkers from two model families both said true. It is not proof, and nothing on the
  page calls it the truth.
- The quotes came back Not checked because who said a line is a fact the checkers cannot look up. That is the
  stamp declining to guess, not a failure.
- Production changes. A later run can come back differently, and the page shows this record next to the live
  answer so a reader sees both.

## Run it again

The cards: `npm run test:home-samples -- --runs 5` (or the `home-samples` workflow). One sentence, by hand:

```bash
curl -s -X POST https://repid-engine-production.up.railway.app/api/v1/classify \
  -H 'content-type: application/json' \
  -d '{"text":"Running git reset --hard keeps the changes you have not committed yet.","labels":["pass","veto","not-checked"]}'
```

## Every call, as it came back

```jsonl
{"at":"2026-10-06T14:44:00.146Z","run":1,"sentence":"price","status":200,"answer":{"label":"veto","latency_ms":1286,"by":"votes","voters":["groq","cerebras"],"deciders":["groq","cerebras"]}}
{"at":"2026-10-06T14:44:21.851Z","run":1,"sentence":"citation","status":200,"answer":{"label":"pass","latency_ms":395,"by":"votes","voters":["groq","cerebras"],"deciders":["groq","cerebras"]}}
{"at":"2026-10-06T14:44:42.474Z","run":1,"sentence":"command","status":200,"answer":{"label":"veto","latency_ms":328,"by":"votes","voters":["groq","cerebras"],"deciders":["groq","cerebras"]}}
{"at":"2026-10-06T14:45:03.080Z","run":1,"sentence":"quote-einstein","status":200,"answer":{"label":"not-checked","latency_ms":492,"by":"votes","voters":["groq","cerebras"],"deciders":["groq","cerebras"]}}
{"at":"2026-10-06T14:45:24.090Z","run":1,"sentence":"quote-darwin","status":200,"answer":{"label":"not-checked","latency_ms":601,"by":"votes","voters":["groq","cerebras"],"deciders":["groq","cerebras"]}}
{"at":"2026-10-06T14:45:44.851Z","run":2,"sentence":"price","status":200,"answer":{"label":"veto","latency_ms":580,"by":"votes","voters":["groq","cerebras"],"deciders":["groq","cerebras"]}}
{"at":"2026-10-06T14:46:05.631Z","run":2,"sentence":"citation","status":200,"answer":{"label":"pass","latency_ms":530,"by":"votes","voters":["groq","cerebras"],"deciders":["groq","cerebras"]}}
{"at":"2026-10-06T14:46:26.267Z","run":2,"sentence":"command","status":200,"answer":{"label":"veto","latency_ms":338,"by":"votes","voters":["groq","cerebras"],"deciders":["groq","cerebras"]}}
{"at":"2026-10-06T14:46:46.718Z","run":2,"sentence":"quote-einstein","status":200,"answer":{"label":"not-checked","latency_ms":205,"by":"votes","voters":["groq","cerebras"],"deciders":["groq","cerebras"]}}
{"at":"2026-10-06T14:47:07.121Z","run":2,"sentence":"quote-darwin","status":200,"answer":{"label":"not-checked","latency_ms":1425,"by":"votes","voters":["groq","cerebras"],"deciders":["groq","cerebras"]}}
{"at":"2026-10-06T14:47:28.693Z","run":3,"sentence":"price","status":200,"answer":{"label":"veto","latency_ms":376,"by":"votes","voters":["groq","cerebras"],"deciders":["groq","cerebras"]}}
{"at":"2026-10-06T14:47:49.310Z","run":3,"sentence":"citation","status":200,"answer":{"label":"pass","latency_ms":390,"by":"votes","voters":["groq","cerebras"],"deciders":["groq","cerebras"]}}
{"at":"2026-10-06T14:48:09.876Z","run":3,"sentence":"command","status":200,"answer":{"label":"veto","latency_ms":330,"by":"votes","voters":["groq","cerebras"],"deciders":["groq","cerebras"]}}
{"at":"2026-10-06T14:48:30.389Z","run":3,"sentence":"quote-einstein","status":200,"answer":{"label":"not-checked","latency_ms":375,"by":"votes","voters":["groq","cerebras"],"deciders":["groq","cerebras"]}}
{"at":"2026-10-06T14:48:50.968Z","run":3,"sentence":"quote-darwin","status":200,"answer":{"label":"not-checked","latency_ms":663,"by":"votes","voters":["groq","cerebras"],"deciders":["groq","cerebras"]}}
{"at":"2026-10-06T14:49:11.740Z","run":4,"sentence":"price","status":200,"answer":{"label":"veto","latency_ms":414,"by":"votes","voters":["groq","cerebras"],"deciders":["groq","cerebras"]}}
{"at":"2026-10-06T14:49:32.265Z","run":4,"sentence":"citation","status":200,"answer":{"label":"pass","latency_ms":830,"by":"votes","voters":["groq","cerebras"],"deciders":["groq","cerebras"]}}
{"at":"2026-10-06T14:49:53.296Z","run":4,"sentence":"command","status":200,"answer":{"label":"veto","latency_ms":326,"by":"votes","voters":["groq","cerebras"],"deciders":["groq","cerebras"]}}
{"at":"2026-10-06T14:50:14.468Z","run":4,"sentence":"quote-einstein","status":200,"answer":{"label":"not-checked","latency_ms":368,"by":"votes","voters":["groq","cerebras"],"deciders":["groq","cerebras"]}}
{"at":"2026-10-06T14:50:34.976Z","run":4,"sentence":"quote-darwin","status":200,"answer":{"label":"not-checked","latency_ms":614,"by":"votes","voters":["groq","cerebras"],"deciders":["groq","cerebras"]}}
{"at":"2026-10-06T14:50:55.739Z","run":5,"sentence":"price","status":200,"answer":{"label":"veto","latency_ms":357,"by":"votes","voters":["groq","cerebras"],"deciders":["groq","cerebras"]}}
{"at":"2026-10-06T14:51:16.228Z","run":5,"sentence":"citation","status":200,"answer":{"label":"pass","latency_ms":347,"by":"votes","voters":["groq","cerebras"],"deciders":["groq","cerebras"]}}
{"at":"2026-10-06T14:51:36.741Z","run":5,"sentence":"command","status":200,"answer":{"label":"veto","latency_ms":219,"by":"votes","voters":["groq","cerebras"],"deciders":["groq","cerebras"]}}
{"at":"2026-10-06T14:51:57.417Z","run":5,"sentence":"quote-einstein","status":200,"answer":{"label":"not-checked","latency_ms":378,"by":"votes","voters":["groq","cerebras"],"deciders":["groq","cerebras"]}}
{"at":"2026-10-06T14:52:17.966Z","run":5,"sentence":"quote-darwin","status":200,"answer":{"label":"not-checked","latency_ms":1223,"by":"votes","voters":["groq","cerebras"],"deciders":["groq","cerebras"]}}
```
