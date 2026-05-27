const STOP_WORDS = new Set([
  "и","в","на","с","а","но","за","из","по","от","до","как","что","это","был","была",
  "или","он","она","они","мы","вы","ты","не","же","бы","ни","у","к","о","об","без",
  "при","над","под","для","то","так","уже","если","чтобы","только","всё","все","будет",
  "есть","нет","да","можно","надо","может","нужно","быть","когда","там","где","здесь",
  "очень","много","мало","такой","этот","такая","эта","этих","этим","его","её","их",
  "которые","который","которая","которого","которой","которую","которым","которых",
  "во","со","между","через","после","перед","также","потому","поэтому","однако",
  "себя","своих","своим","своей","своего","свою","свой","своя","своё",
  "the","a","an","and","or","but","in","on","at","to","for","of","with","by","from",
  "is","are","was","were","be","been","have","has","had","do","does","did","will",
  "would","could","should","may","might","this","that","these","those","it","its",
  "not","no","so","as","if","then",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\wа-яёА-ЯЁ\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

export function extractKeywords(text: string): string[] {
  const tokens = tokenize(text).filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
  return [...new Set(tokens)];
}

const K1 = 1.5;
const B = 0.75;

export interface BM25Chunk {
  id: number;
  documentId: number;
  documentName: string;
  chunkIndex: number;
  text: string;
  bm25Score: number;
}

export function bm25Search(
  store: Array<{ id: number; documentId: number; documentName: string; chunkIndex: number; text: string }>,
  keywords: string[],
  k = 5
): BM25Chunk[] {
  if (store.length === 0 || keywords.length === 0) return [];

  const tokenized = store.map((c) => tokenize(c.text));
  const avgdl = tokenized.reduce((s, t) => s + t.length, 0) / tokenized.length;
  const N = store.length;

  const idf: Record<string, number> = {};
  for (const kw of keywords) {
    const df = tokenized.filter((t) => t.some((tok) => tok === kw || tok.startsWith(kw))).length;
    idf[kw] = Math.log((N - df + 0.5) / (df + 0.5) + 1);
  }

  const scored = store.map((chunk, i) => {
    const tokens = tokenized[i];
    const dl = tokens.length;
    let score = 0;

    for (const kw of keywords) {
      const tf = tokens.filter((t) => t === kw || t.startsWith(kw)).length;
      if (tf === 0) continue;
      score += idf[kw] * (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * (dl / avgdl)));
    }

    return { ...chunk, bm25Score: score };
  });

  return scored
    .filter((r) => r.bm25Score > 0)
    .sort((a, b) => b.bm25Score - a.bm25Score)
    .slice(0, k);
}
