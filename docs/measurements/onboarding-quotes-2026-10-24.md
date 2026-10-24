# The lines the post-check conversation may show (checked 2026-10-24)

`lib/onboarding-talk.ts` `QUOTES` may bring back one line from a book the person picks from a short menu. Every line below was
checked against the plain-text edition at Project Gutenberg, fetched 2026-10-24 (`https://www.gutenberg.org/cache/epub/<id>/pg<id>.txt`,
HTTP 200), whitespace collapsed, exact-match search for the line. A line is on the list only if it was found exactly once or more.
`tests/onboarding-talk.test.ts` fails if a listed line has no `found` row here.

| id | Work | Line, exactly as the edition prints it | Result | Edition header |
|---|---|---|---|---|
| 1342 | Pride and Prejudice (Jane Austen), Chapter 1 | It is a truth universally acknowledged, that a single man in possession of a good fortune must be in want of a wife. | found | Release date June 1, 1998 |
| 11 | Alice's Adventures in Wonderland (Lewis Carroll), Chapter 2 | Curiouser and curiouser! | found | Release date June 27, 2008 |
| 1661 | The Adventures of Sherlock Holmes (Arthur Conan Doyle), A Scandal in Bohemia | You see, but you do not observe. | found | Release date March 1, 1999 |
| 84 | Frankenstein (Mary Shelley), Chapter 5 | It was on a dreary night of November that I beheld the accomplishment of my toils. | found | Release date October 1, 1993 |
| 2701 | Moby-Dick (Herman Melville), Chapter 1 | Call me Ishmael. | found | Release date July 1, 2001 |
| 98 | A Tale of Two Cities (Charles Dickens), Book 1, Chapter 1 | It was the best of times, it was the worst of times | found | Release date January 1, 1994 |

## What the check caught

My first draft of the Pride and Prejudice line had a comma after "good fortune". The Gutenberg edition (#1342) has none: `exact-match found=0`
on the draft, `found=1` on the edition's own wording. Editions of that sentence differ on that comma, so the list quotes the one it can name
and cites the edition. This is the failure the site exists to catch (a line stated in a confident voice and slightly wrong), found by checking
the source instead of trusting memory, in the feature that would have shown it to visitors.

The Tale of Two Cities line is a clause of a longer sentence ("... it was the age of wisdom ..."); it stops at the clause boundary and carries no closing period.

## Not on the list, on purpose

- **Films and television:** their lines are not ours to reproduce, and no checked public source exists for them. The conversation never offers a film.
- **Any book still in copyright:** same reason. Project Gutenberg's policy is that no permission is needed to quote its items; that is a statement about its public-domain items in the US, and other countries differ.
- **A free-text "favorite book":** not asked. A favorite book or film can reveal religious or political belief or sexual orientation (GDPR Art. 9 looks at what data reveal), so the question is a menu of the six classics above, and anything typed that is not on the menu is not stored.

*Sources opened: the six Gutenberg plain-text files above; Gutenberg's permission policy (https://www.gutenberg.org/policy/permission.html), read by the research thread on 2026-10-24.*
