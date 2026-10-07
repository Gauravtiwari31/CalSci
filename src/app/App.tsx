import { useEffect } from 'react';
import { syncStatusBar } from '../platform';
import { useStore } from '../store';
import { Keypad, LayerSwitcher } from '../ui/keypad/Keypad';
import { MathInput } from '../ui/mathfield/MathInput';
import { FinanceSheet } from '../ui/sheets/FinanceSheet';
import { SettingsSheet } from '../ui/sheets/SettingsSheet';
import { MatrixSizeSheet, PinSheet, VariablesSheet } from '../ui/sheets/SmallSheets';
import { DistributionSheet, StatsDataSheet } from '../ui/sheets/StatsSheets';
import { Header, ModeBar } from '../ui/Header';
import { Tape } from '../ui/tape/Tape';
import { VariableChips } from '../ui/VariableChips';

function useTheme() {
  const theme = useStore((s) => s.settings.theme);
  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      if (theme === 'system') root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', theme);
      const dark = theme === 'dark' || (theme === 'system' && mq.matches);
      void syncStatusBar(dark);
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}

function ActiveSheet() {
  const sheet = useStore((s) => s.sheet);
  if (!sheet) return null;
  switch (sheet.kind) {
    case 'settings':
      return <SettingsSheet />;
    case 'matrix-size':
      return <MatrixSizeSheet />;
    case 'stats-data':
      return <StatsDataSheet />;
    case 'distributions':
      return <DistributionSheet />;
    case 'finance':
      return <FinanceSheet form={sheet.form} />;
    case 'pin':
      return <PinSheet entryId={sheet.entryId} />;
    case 'variables':
      return <VariablesSheet />;
  }
}

export function App() {
  useTheme();
  return (
    <div className="app">
      <div className="top">
        <Header />
        <ModeBar />
      </div>
      <Tape />
      <main className="work" aria-label="Calculator">
        <VariableChips />
        <MathInput />
        <LayerSwitcher />
        <Keypad />
      </main>
      <ActiveSheet />
    </div>
  );
}
