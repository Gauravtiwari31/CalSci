import { convertLatexToMarkup, convertLatexToSpeakableText } from 'mathlive';
import { memo, useMemo } from 'react';

/** Static math rendering through MathLive (KaTeX fonts). */
export const MathView = memo(function MathView({ latex, className }: { latex: string; className?: string }) {
  const html = useMemo(() => {
    try {
      return convertLatexToMarkup(latex);
    } catch {
      return latex.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
    }
  }, [latex]);
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />;
});

export function speakable(latex: string): string {
  try {
    return convertLatexToSpeakableText(latex);
  } catch {
    return latex;
  }
}
