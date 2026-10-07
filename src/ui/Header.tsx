import { useStore } from '../store';
import { Icon } from './Icon';

/** "Tue · 7 Oct" (shown uppercase by the label style). */
const today = () => {
  const d = new Date();
  const part = (o: Intl.DateTimeFormatOptions) => d.toLocaleDateString('en-GB', o);
  return `${part({ weekday: 'short' })} · ${d.getDate()} ${part({ month: 'short' })}`;
};

export function Header() {
  const openSheet = useStore((s) => s.openSheet);
  return (
    <header className="header">
      <div className="header__titles">
        <span className="label">{today()}</span>
        <h1 className="header__title">
          Cal<span className="serif">Sci.</span>
        </h1>
      </div>
      <button
        type="button"
        className="brutal press icon-btn"
        aria-label="Variables and functions"
        onClick={() => openSheet({ kind: 'variables' })}
      >
        <Icon name="vars" />
      </button>
      <button
        type="button"
        className="brutal press icon-btn"
        aria-label="Settings"
        onClick={() => openSheet({ kind: 'settings' })}
      >
        <Icon name="settings" />
      </button>
    </header>
  );
}

export function ModeBar() {
  const angle = useStore((s) => s.settings.angle);
  const domain = useStore((s) => s.settings.domain);
  const precision = useStore((s) => s.settings.precision);
  const cycleAngle = useStore((s) => s.cycleAngle);
  const setSetting = useStore((s) => s.setSetting);
  const openSheet = useStore((s) => s.openSheet);
  const casState = useStore((s) => s.casStatus.state);
  const keep = (e: React.PointerEvent) => e.preventDefault();

  return (
    <div className="modes" role="toolbar" aria-label="Calculation modes">
      <button
        type="button"
        className="pill mode-pill"
        onPointerDown={keep}
        onClick={cycleAngle}
        aria-label={`Angle mode: ${{ deg: 'degrees', rad: 'radians', grad: 'gradians' }[angle]}. Tap to change.`}
        data-testid="angle-mode"
      >
        <span className="label">Angle</span>
        {angle.toUpperCase()}
      </button>
      <button
        type="button"
        className="pill mode-pill"
        onPointerDown={keep}
        onClick={() => setSetting('domain', domain === 'real' ? 'complex' : 'real')}
        aria-label={`Number mode: ${domain}. Tap to change.`}
      >
        <span className="label">Mode</span>
        {domain === 'real' ? 'Real' : 'Complex'}
      </button>
      <button
        type="button"
        className="pill mode-pill"
        onPointerDown={keep}
        onClick={() => openSheet({ kind: 'settings' })}
        aria-label={`Precision: ${precision} digits. Open settings.`}
      >
        <span className="label">Digits</span>
        {precision}
      </button>
      {casState === 'ready' && (
        <span className="sticker sticker--mint" style={{ alignSelf: 'center' }}>
          SymPy ready
        </span>
      )}
      {casState === 'failed' && (
        <span className="sticker sticker--blush" style={{ alignSelf: 'center' }}>
          Symbolic offline
        </span>
      )}
    </div>
  );
}
