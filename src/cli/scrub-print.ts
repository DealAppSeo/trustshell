/** Drop GROQ_API_KEY from text the CLI is about to print. */
export function scrubPrinted(text: string, env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.GROQ_API_KEY;
  if (!secret || secret.length < 8 || !text.includes(secret)) return text;
  return text.split(secret).join('');
}
