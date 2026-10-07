// A single place for the keypad, tape and sheets to drive the mathfield.
import type { MathfieldElement } from 'mathlive';

let el: MathfieldElement | null = null;

export const mathfield = {
  attach(m: MathfieldElement | null) {
    el = m;
  },
  get element() {
    return el;
  },
  value(): string {
    return el?.getValue('latex') ?? '';
  },
  set(latex: string) {
    if (!el) return;
    el.setValue(latex, { silenceNotifications: false });
    el.focus();
  },
  insert(latex: string, opts: { selectionMode?: 'placeholder' | 'after' | 'item' } = {}) {
    if (!el) return;
    el.insert(latex, {
      format: 'latex',
      selectionMode:
        opts.selectionMode ?? (latex.includes('#?') || latex.includes('#0') ? 'placeholder' : 'after'),
      focus: true,
      scrollIntoView: true,
    });
  },
  command(cmd: string | [string, ...unknown[]]) {
    if (!el) return;
    el.executeCommand(cmd as any);
    el.focus();
  },
  clear() {
    if (!el) return;
    el.setValue('');
    el.focus();
  },
  focus() {
    el?.focus();
  },
};
