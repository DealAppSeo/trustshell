/** A command breaks only at spaces and after "/", and a flag never splits at its own hyphens, so a
 * wrapped URL stays readable and "--claims-file" never becomes "--claims-" + "file". Pair it with
 * `whitespace-pre-wrap [overflow-wrap:normal]` on the line. */
export function Cmd({ text }: { text: string }) {
  return (
    <>
      {text.split(' ').map((word, i) => (
        <span key={i}>
          {i > 0 && ' '}
          {word.startsWith('-') ? (
            <span className="whitespace-nowrap">{word}</span>
          ) : (
            word.split('/').map((part, j, all) => (
              <span key={j}>
                {part}
                {j < all.length - 1 &&
                  (all[j + 1] === '' ? (
                    '/'
                  ) : (
                    <>
                      /<wbr />
                    </>
                  ))}
              </span>
            ))
          )}
        </span>
      ))}
    </>
  );
}
