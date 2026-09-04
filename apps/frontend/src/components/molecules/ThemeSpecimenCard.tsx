import type { CSSProperties, FC, ReactNode } from 'react';
import { ListMusic, Play } from 'lucide-react';
import type { ThemeConfig } from '@/services/themeService';

interface ThemeSpecimenCardProps {
  theme: ThemeConfig;
  selected?: boolean;
  compact?: boolean;
  className?: string;
  actions?: ReactNode;
  onClick?: () => void;
}

const BAR_HEIGHTS = [27, 56, 92, 48, 87, 35, 75, 52, 30, 89, 44, 70, 39, 84, 58, 33, 76, 46];

export const ThemeSpecimenCard: FC<ThemeSpecimenCardProps> = ({
  theme,
  selected = false,
  compact = false,
  className = '',
  actions,
  onClick,
}) => {
  const vars = theme.vars ?? {};
  const backgroundImage = (
    theme as ThemeConfig & { images?: { background?: { asset?: { previewUrl?: string } } } }
  ).images?.background?.asset?.previewUrl;
  const style = {
    '--spec-p': theme.primary,
    '--spec-s': theme.secondary,
    '--spec-bg': theme.bgCanvas,
    '--spec-card': theme.bgCard,
    '--spec-surface': theme.bgSurface,
    '--spec-border': theme.borderColor,
    '--spec-fg': theme.textPrimary,
    '--spec-fg3': theme.textMuted,
    '--spec-radius': vars['--r'] ?? '3px',
    '--spec-control-radius': vars['--r-sm'] ?? '3px',
    '--spec-display': vars['--f-d'] ?? "'Big Shoulders Display', sans-serif",
    '--spec-texture': vars['--tex'] ?? 'none',
    '--spec-texture-size': vars['--tex-size'] ?? 'auto',
    '--spec-texture-opacity': vars['--tex-op'] ?? '0',
    '--spec-bar': vars['--bar-bg'] ?? theme.visualizerPrimary,
    '--spec-bar-width': vars['--bar-w'] ?? '4px',
    '--spec-bar-gap': vars['--bar-gap'] ?? '4px',
    '--spec-bar-radius': vars['--bar-r'] ?? '0px',
    '--spec-cap':
      vars['--bar-cap'] && vars['--bar-cap'] !== 'transparent'
        ? vars['--bar-cap']
        : theme.secondary,
    '--spec-cap-height': vars['--bar-cap-h'] === '0px' ? '2px' : (vars['--bar-cap-h'] ?? '2px'),
    '--spec-cover': backgroundImage ? `url("${backgroundImage}")` : theme.bgCanvas,
    '--spec-glow': vars['--viz-glow'] ?? 'none',
  } as CSSProperties;

  return (
    <article
      style={style}
      className={`theme-specimen ${compact ? 'theme-specimen--compact' : ''} ${selected ? 'theme-specimen--selected' : ''} ${onClick ? 'theme-specimen--interactive' : ''} ${className}`}
    >
      {onClick && (
        <button
          type="button"
          className="theme-specimen__select"
          onClick={onClick}
          aria-pressed={selected}
          aria-label={`${theme.name} ${theme.description}`}
        />
      )}
      <div className="theme-specimen__texture" aria-hidden="true" />

      <header className="theme-specimen__header">
        <h3 className="theme-specimen__title">{theme.name}</h3>
        {actions && <div className="theme-specimen__actions">{actions}</div>}
      </header>

      <div className="theme-specimen__stage">
        <div className="theme-specimen__art" aria-hidden="true" />
        <div className="theme-specimen__transport" aria-hidden="true">
          <span className="theme-specimen__play">
            <Play size={12} fill="currentColor" />
          </span>
          <span className="theme-specimen__queue">
            <ListMusic size={13} />
          </span>
        </div>
        <div className="theme-specimen__visualizer" aria-label="Theme visualizer sample">
          {BAR_HEIGHTS.map((height, index) => (
            <i key={index} style={{ height: `${height}%` }} />
          ))}
        </div>
      </div>
    </article>
  );
};
