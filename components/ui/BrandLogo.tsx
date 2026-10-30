import React, { useId } from 'react';

export interface BrandLogoProps {
  /** Size preset or explicit pixel number */
  size?: 'sm' | 'md' | 'lg' | 'xl' | number;
  /** Whether to render the brand title and subtitle text */
  showText?: boolean;
  /** Optional custom subtitle (e.g. 'Source-to-Summary Audit Engine') */
  subtitle?: string;
  /** Additional CSS class names for the container */
  className?: string;
  /** Display variant: 'full' (mark + text) or 'mark' (icon only) */
  variant?: 'full' | 'mark';
  /** Whether to render the mark inside the dark squircle badge container */
  withBadge?: boolean;
  /** Custom title override (defaults to 'Provenance Lab') */
  title?: string;
  /** Explicit theme override for standalone text contrast outside dark/light CSS */
  theme?: 'auto' | 'dark' | 'light';
  /** Optional click handler */
  onClick?: () => void;
}

const SIZE_MAP: Record<'sm' | 'md' | 'lg' | 'xl', {
  pixelSize: number;
  gap: string;
  titleClass: string;
  subtitleClass: string;
}> = {
  sm: {
    pixelSize: 26,
    gap: 'gap-2',
    titleClass: 'text-sm font-bold',
    subtitleClass: 'text-[10px]',
  },
  md: {
    pixelSize: 36,
    gap: 'gap-2.5',
    titleClass: 'text-base font-extrabold',
    subtitleClass: 'text-xs',
  },
  lg: {
    pixelSize: 48,
    gap: 'gap-3',
    titleClass: 'text-xl font-extrabold',
    subtitleClass: 'text-xs',
  },
  xl: {
    pixelSize: 68,
    gap: 'gap-4',
    titleClass: 'text-2xl font-extrabold',
    subtitleClass: 'text-sm',
  },
};

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'md',
  showText,
  subtitle,
  className = '',
  variant = 'full',
  withBadge = false,
  title = 'Provenance Lab',
  theme = 'auto',
  onClick,
}) => {
  // Generate stable, collision-free IDs for SVG defs
  const rawId = useId();
  const uid = rawId.replace(/[:]/g, '');

  const resolvedShowText = showText !== undefined ? showText : variant === 'full';

  // Compute dimensions
  let pixelSize: number;
  let gapClass = 'gap-2.5';
  let titleClass = 'text-base font-extrabold';
  let subtitleClass = 'text-xs';

  if (typeof size === 'number') {
    pixelSize = size;
    if (size <= 28) {
      gapClass = 'gap-2';
      titleClass = 'text-sm font-bold';
      subtitleClass = 'text-[10px]';
    } else if (size <= 40) {
      gapClass = 'gap-2.5';
      titleClass = 'text-base font-extrabold';
      subtitleClass = 'text-xs';
    } else if (size <= 56) {
      gapClass = 'gap-3';
      titleClass = 'text-xl font-extrabold';
      subtitleClass = 'text-xs';
    } else {
      gapClass = 'gap-4';
      titleClass = 'text-2xl font-extrabold';
      subtitleClass = 'text-sm';
    }
  } else {
    const preset = SIZE_MAP[size] || SIZE_MAP.md;
    pixelSize = preset.pixelSize;
    gapClass = preset.gap;
    titleClass = preset.titleClass;
    subtitleClass = preset.subtitleClass;
  }

  // Split title into prefix and last highlighted word (e.g. 'Provenance' + 'Lab')
  const titleParts = title.trim().split(' ');
  const lastWord = titleParts.length > 1 ? titleParts.pop() : '';
  const firstPart = titleParts.join(' ');

  // Theme text colors
  const titleTextColor =
    theme === 'dark'
      ? 'text-white'
      : theme === 'light'
      ? 'text-slate-900'
      : 'text-slate-900 dark:text-white';

  const subtitleTextColor =
    theme === 'dark'
      ? 'text-slate-400'
      : theme === 'light'
      ? 'text-slate-500'
      : 'text-slate-500 dark:text-slate-400';

  const svgContent = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={pixelSize}
      height={pixelSize}
      fill="none"
      role="img"
      aria-label={`${title} Brand Mark`}
      className="flex-shrink-0 transition-transform duration-300 hover:scale-105"
      style={{ overflow: 'visible' }}
    >
      <defs>
        {/* Background Gradients (for Badged Variant) */}
        <linearGradient id={`${uid}-bg`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0a0f1d" />
          <stop offset="50%" stopColor="#080c16" />
          <stop offset="100%" stopColor="#05070e" />
        </linearGradient>
        <linearGradient id={`${uid}-border`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.45" />
          <stop offset="40%" stopColor="#0ea5e9" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.1" />
        </linearGradient>
        <radialGradient id={`${uid}-ambient`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.25" />
          <stop offset="45%" stopColor="#0ea5e9" stopOpacity="0.1" />
          <stop offset="100%" stopColor="#080c16" stopOpacity="0" />
        </radialGradient>

        {/* Filters */}
        <filter id={`${uid}-glow`} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={`${uid}-glow-intense`} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="10" result="blur1" />
          <feGaussianBlur stdDeviation="3" result="blur2" />
          <feMerge>
            <feMergeNode in="blur1" />
            <feMergeNode in="blur2" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Inflowing Voice Stream Gradients */}
        <linearGradient id={`${uid}-stream-amber`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f59e0b" />
          <stop offset="50%" stopColor="#f43f5e" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
        <linearGradient id={`${uid}-stream-emerald`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="55%" stopColor="#14b8a6" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
        <linearGradient id={`${uid}-stream-indigo`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#818cf8" />
          <stop offset="50%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#4f46e5" />
        </linearGradient>
        <linearGradient id={`${uid}-stream-cyan`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="50%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#4f46e5" />
        </linearGradient>

        {/* Voice Node Gradients */}
        <radialGradient id={`${uid}-node-amber`} cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#fef3c7" />
          <stop offset="35%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#d97706" />
        </radialGradient>
        <radialGradient id={`${uid}-node-emerald`} cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#d1fae5" />
          <stop offset="35%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#059669" />
        </radialGradient>
        <radialGradient id={`${uid}-node-indigo`} cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#e0e7ff" />
          <stop offset="35%" stopColor="#818cf8" />
          <stop offset="100%" stopColor="#4338ca" />
        </radialGradient>
        <radialGradient id={`${uid}-node-cyan`} cx="35%" cy="35%" r="65%">
          <stop offset="0%" stopColor="#e0f2fe" />
          <stop offset="35%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#0284c7" />
        </radialGradient>

        {/* Analytical Crystal Lens Facet Gradients */}
        <linearGradient id={`${uid}-facet-nw`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" stopOpacity="0.95" />
          <stop offset="60%" stopColor="#4f46e5" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.75" />
        </linearGradient>
        <linearGradient id={`${uid}-facet-ne`} x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.85" />
          <stop offset="45%" stopColor="#38bdf8" stopOpacity="0.9" />
          <stop offset="85%" stopColor="#e0f2fe" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="1" />
        </linearGradient>
        <linearGradient id={`${uid}-facet-e`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.9" />
          <stop offset="50%" stopColor="#4f46e5" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#312e81" stopOpacity="0.95" />
        </linearGradient>
        <linearGradient id={`${uid}-facet-se`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.85" />
          <stop offset="60%" stopColor="#3730a3" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.8" />
        </linearGradient>
        <linearGradient id={`${uid}-facet-sw`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4338ca" stopOpacity="0.9" />
          <stop offset="60%" stopColor="#312e81" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.45" />
        </linearGradient>
        <linearGradient id={`${uid}-facet-w`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1e1b4b" stopOpacity="0.95" />
          <stop offset="60%" stopColor="#4338ca" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#6366f1" stopOpacity="0.85" />
        </linearGradient>

        {/* Central Verification Crucible */}
        <radialGradient id={`${uid}-crucible`} cx="40%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="25%" stopColor="#a5f3fc" />
          <stop offset="65%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#312e81" />
        </radialGradient>

        {/* Synthesis Emergence Beams */}
        <linearGradient id={`${uid}-beam-laser`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="25%" stopColor="#38bdf8" />
          <stop offset="70%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
        <linearGradient id={`${uid}-beam-flare`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.8" />
          <stop offset="30%" stopColor="#38bdf8" stopOpacity="0.45" />
          <stop offset="70%" stopColor="#6366f1" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.05" />
        </linearGradient>
        <linearGradient id={`${uid}-out-emerald`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#0ea5e9" />
          <stop offset="50%" stopColor="#14b8a6" />
          <stop offset="100%" stopColor="#10b981" />
        </linearGradient>
        <linearGradient id={`${uid}-out-amber`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="50%" stopColor="#ec4899" />
          <stop offset="100%" stopColor="#f59e0b" />
        </linearGradient>
      </defs>

      {/* Optional Dark Squircle Base */}
      {withBadge && (
        <g id={`${uid}-badge-bg`}>
          <rect width="512" height="512" rx="112" fill={`url(#${uid}-bg)`} />
          <rect
            width="510"
            height="510"
            x="1"
            y="1"
            rx="111"
            fill="none"
            stroke={`url(#${uid}-border)`}
            strokeWidth="2"
          />
          <circle cx="256" cy="256" r="200" fill={`url(#${uid}-ambient)`} />
        </g>
      )}

      {/* Analytical Reticle Rings & Geometric Topology */}
      <g opacity={withBadge ? 0.85 : 0.75}>
        <circle
          cx="256"
          cy="256"
          r="198"
          fill="none"
          stroke="#6366f1"
          strokeWidth="1.5"
          strokeDasharray="3 9"
          opacity="0.32"
        />
        <circle
          cx="256"
          cy="256"
          r="144"
          fill="none"
          stroke="#06b6d4"
          strokeWidth="1"
          strokeDasharray="4 6"
          opacity="0.35"
        />
        <circle
          cx="256"
          cy="256"
          r="94"
          fill="none"
          stroke="#818cf8"
          strokeWidth="1"
          strokeDasharray="2 4"
          opacity="0.42"
        />

        {/* Precision Axis Calibration Ticks */}
        <line
          x1="256"
          y1="44"
          x2="256"
          y2="58"
          stroke="#818cf8"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.75"
        />
        <line
          x1="256"
          y1="454"
          x2="256"
          y2="468"
          stroke="#818cf8"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.75"
        />
        <line
          x1="44"
          y1="256"
          x2="58"
          y2="256"
          stroke="#818cf8"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.75"
        />
        <line
          x1="454"
          y1="256"
          x2="468"
          y2="256"
          stroke="#818cf8"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.75"
        />

        {/* Diagonal Reticle Markers */}
        <circle cx="396" cy="116" r="2" fill="#38bdf8" opacity="0.65" />
        <circle cx="396" cy="396" r="2" fill="#818cf8" opacity="0.65" />
        <circle cx="116" cy="396" r="2" fill="#34d399" opacity="0.65" />
        <circle cx="116" cy="116" r="2" fill="#fbbf24" opacity="0.65" />
      </g>

      {/* Auxiliary Satellite Context Node */}
      <line
        x1="142"
        y1="82"
        x2="108"
        y2="136"
        stroke="#c084fc"
        strokeWidth="1.2"
        strokeDasharray="2 4"
        opacity="0.5"
      />
      <circle cx="142" cy="82" r="4.5" fill="#c084fc" opacity="0.9" />
      <circle cx="142" cy="82" r="1.5" fill="#ffffff" />

      {/* Provenance Arcs (Diverse Voice Streams Flowing into Synthesis Lens) */}
      {/* Amber Tension Arc */}
      <path
        d="M 108 136 C 165 136, 195 180, 228 214"
        fill="none"
        stroke={`url(#${uid}-stream-amber)`}
        strokeWidth="7"
        opacity="0.3"
        filter={`url(#${uid}-glow)`}
      />
      <path
        d="M 108 136 C 165 136, 195 180, 228 214"
        fill="none"
        stroke={`url(#${uid}-stream-amber)`}
        strokeWidth="3.5"
        strokeLinecap="round"
      />

      {/* Emerald Represented Voice Arc */}
      <path
        d="M 76 214 C 120 236, 165 218, 210 244"
        fill="none"
        stroke="#34d399"
        strokeWidth="1.5"
        strokeDasharray="3 4"
        opacity="0.55"
      />
      <path
        d="M 76 214 C 132 214, 172 232, 210 244"
        fill="none"
        stroke={`url(#${uid}-stream-emerald)`}
        strokeWidth="8"
        opacity="0.3"
        filter={`url(#${uid}-glow)`}
      />
      <path
        d="M 76 214 C 132 214, 172 232, 210 244"
        fill="none"
        stroke={`url(#${uid}-stream-emerald)`}
        strokeWidth="4"
        strokeLinecap="round"
      />

      {/* Electric Indigo Core Substrate Arc */}
      <path
        d="M 64 298 C 115 315, 175 295, 212 270"
        fill="none"
        stroke="#818cf8"
        strokeWidth="2"
        opacity="0.6"
      />
      <path
        d="M 64 298 C 125 298, 170 282, 212 270"
        fill="none"
        stroke={`url(#${uid}-stream-indigo)`}
        strokeWidth="10"
        opacity="0.32"
        filter={`url(#${uid}-glow)`}
      />
      <path
        d="M 64 298 C 125 298, 170 282, 212 270"
        fill="none"
        stroke={`url(#${uid}-stream-indigo)`}
        strokeWidth="5"
        strokeLinecap="round"
      />

      {/* Cyan Evidence Arc */}
      <path
        d="M 98 376 C 155 376, 190 332, 226 296"
        fill="none"
        stroke={`url(#${uid}-stream-cyan)`}
        strokeWidth="7"
        opacity="0.28"
        filter={`url(#${uid}-glow)`}
      />
      <path
        d="M 98 376 C 155 376, 190 332, 226 296"
        fill="none"
        stroke={`url(#${uid}-stream-cyan)`}
        strokeWidth="3.5"
        strokeLinecap="round"
      />

      {/* Stream Data Transit Particles */}
      <rect
        x="165"
        y="159"
        width="6"
        height="6"
        rx="1.5"
        transform="rotate(45 168 162)"
        fill="#fbbf24"
        filter={`url(#${uid}-glow)`}
      />
      <circle cx="148" cy="224" r="3.5" fill="#34d399" filter={`url(#${uid}-glow)`} />
      <circle cx="138" cy="290" r="4" fill="#818cf8" filter={`url(#${uid}-glow)`} />
      <rect
        x="159"
        y="345"
        width="6"
        height="6"
        rx="1.5"
        transform="rotate(45 162 348)"
        fill="#38bdf8"
        filter={`url(#${uid}-glow)`}
      />

      {/* Multi-Stakeholder Input Voice Nodes (Left Periphery) */}
      {/* Amber Tension Node */}
      <g>
        <circle cx="108" cy="136" r="16" fill={`url(#${uid}-stream-amber)`} opacity="0.18" />
        <circle
          cx="108"
          cy="136"
          r="12"
          fill="none"
          stroke="#fbbf24"
          strokeWidth="1"
          strokeDasharray="2 3"
          opacity="0.65"
        />
        <circle cx="108" cy="136" r="7" fill={`url(#${uid}-node-amber)`} filter={`url(#${uid}-glow)`} />
        <circle cx="106" cy="134" r="2.5" fill="#ffffff" opacity="0.9" />
      </g>

      {/* Emerald Represented Node */}
      <g>
        <circle cx="76" cy="214" r="18" fill={`url(#${uid}-stream-emerald)`} opacity="0.2" />
        <circle cx="76" cy="214" r="13" fill="none" stroke="#34d399" strokeWidth="1" opacity="0.6" />
        <circle cx="76" cy="214" r="8" fill={`url(#${uid}-node-emerald)`} filter={`url(#${uid}-glow)`} />
        <circle cx="74" cy="212" r="2.8" fill="#ffffff" opacity="0.9" />
      </g>

      {/* Electric Indigo Core Node */}
      <g>
        <circle cx="64" cy="298" r="20" fill={`url(#${uid}-stream-indigo)`} opacity="0.22" />
        <circle
          cx="64"
          cy="298"
          r="14"
          fill="none"
          stroke="#818cf8"
          strokeWidth="1.2"
          strokeDasharray="3 3"
          opacity="0.75"
        />
        <circle cx="64" cy="298" r="9" fill={`url(#${uid}-node-indigo)`} filter={`url(#${uid}-glow)`} />
        <circle cx="61.5" cy="295.5" r="3.2" fill="#ffffff" opacity="0.9" />
      </g>

      {/* Cyan Evidence Node */}
      <g>
        <circle cx="98" cy="376" r="17" fill={`url(#${uid}-stream-cyan)`} opacity="0.2" />
        <circle cx="98" cy="376" r="12" fill="none" stroke="#38bdf8" strokeWidth="1" opacity="0.6" />
        <circle cx="98" cy="376" r="7.5" fill={`url(#${uid}-node-cyan)`} filter={`url(#${uid}-glow)`} />
        <circle cx="96" cy="374" r="2.5" fill="#ffffff" opacity="0.9" />
      </g>

      {/* THE CENTRAL ANALYTICAL CRYSTAL LENS (Synthesis Prism) */}
      <g id={`${uid}-synthesis-lens`} filter={`url(#${uid}-glow)`}>
        {/* Facet 1: North-West (Inflow Facet) */}
        <polygon
          points="170,206 256,156 256,212 212,256"
          fill={`url(#${uid}-facet-nw)`}
          stroke="#818cf8"
          strokeWidth="1"
          strokeOpacity="0.75"
        />

        {/* Facet 2: North-East (Specular Transmission / Synthesis Facet) */}
        <polygon
          points="256,156 342,206 300,256 256,212"
          fill={`url(#${uid}-facet-ne)`}
          stroke="#e0f2fe"
          strokeWidth="1.2"
          strokeOpacity="0.85"
        />

        {/* Facet 3: East (Output Aperture) */}
        <polygon
          points="342,206 342,306 300,256"
          fill={`url(#${uid}-facet-e)`}
          stroke="#6366f1"
          strokeWidth="1"
          strokeOpacity="0.65"
        />

        {/* Facet 4: South-East (Grounding / Metric Facet) */}
        <polygon
          points="300,256 342,306 256,356 256,300"
          fill={`url(#${uid}-facet-se)`}
          stroke="#4f46e5"
          strokeWidth="1"
          strokeOpacity="0.75"
        />

        {/* Facet 5: South-West (Tension & Dissipation Facet) */}
        <polygon
          points="212,256 256,300 256,356 170,306"
          fill={`url(#${uid}-facet-sw)`}
          stroke="#4338ca"
          strokeWidth="1"
          strokeOpacity="0.75"
        />

        {/* Facet 6: West (Voice Reception Facet) */}
        <polygon
          points="170,206 212,256 170,306"
          fill={`url(#${uid}-facet-w)`}
          stroke="#6366f1"
          strokeWidth="1"
          strokeOpacity="0.65"
        />

        {/* Specular Highlight Ridge on Top Edge of Lens */}
        <line
          x1="256"
          y1="156"
          x2="342"
          y2="206"
          stroke="#ffffff"
          strokeWidth="2.2"
          strokeLinecap="round"
          opacity="0.95"
        />
        <line
          x1="256"
          y1="156"
          x2="170"
          y2="206"
          stroke="#c7d2fe"
          strokeWidth="1.6"
          strokeLinecap="round"
          opacity="0.8"
        />

        {/* Central Verification Crucible / Diamond Aperture */}
        <polygon
          points="256,212 300,256 256,300 212,256"
          fill={`url(#${uid}-crucible)`}
          stroke="#ffffff"
          strokeWidth="1.5"
          strokeOpacity="0.9"
          filter={`url(#${uid}-glow)`}
        />

        {/* Optical Alignment Reticle Crosshairs inside Crucible */}
        <line
          x1="236"
          y1="256"
          x2="276"
          y2="256"
          stroke="#ffffff"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.95"
        />
        <line
          x1="256"
          y1="236"
          x2="256"
          y2="276"
          stroke="#ffffff"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.95"
        />

        {/* Focal Singularity Core */}
        <circle cx="256" cy="256" r="9" fill={`url(#${uid}-node-cyan)`} filter={`url(#${uid}-glow-intense)`} />
        <circle cx="256" cy="256" r="4" fill="#ffffff" />
      </g>

      {/* Synthesis Flare & Laser Emergence (Exiting to Right) */}
      <polygon
        points="342,244 444,250 444,262 342,268"
        fill={`url(#${uid}-beam-flare)`}
      />
      <line
        x1="342"
        y1="256"
        x2="444"
        y2="256"
        stroke={`url(#${uid}-beam-laser)`}
        strokeWidth="5"
        strokeLinecap="round"
        filter={`url(#${uid}-glow)`}
      />
      <line
        x1="342"
        y1="256"
        x2="444"
        y2="256"
        stroke="#ffffff"
        strokeWidth="1.8"
        strokeLinecap="round"
      />

      {/* Upper Topic Representation Thread (Emerald/Sky Consensus) */}
      <path
        d="M 342 210 C 378 205, 398 182, 430 180"
        fill="none"
        stroke="#38bdf8"
        strokeWidth="1"
        strokeDasharray="2 3"
        opacity="0.6"
      />
      <path
        d="M 342 220 C 375 220, 395 195, 430 180"
        fill="none"
        stroke={`url(#${uid}-out-emerald)`}
        strokeWidth="3"
        strokeLinecap="round"
        filter={`url(#${uid}-glow)`}
      />

      {/* Lower Tension / Divergence Verification Thread (Amber/Violet) */}
      <path
        d="M 342 302 C 378 308, 398 330, 430 332"
        fill="none"
        stroke="#fbbf24"
        strokeWidth="1"
        strokeDasharray="2 3"
        opacity="0.6"
      />
      <path
        d="M 342 292 C 375 292, 395 318, 430 332"
        fill="none"
        stroke={`url(#${uid}-out-amber)`}
        strokeWidth="3"
        strokeLinecap="round"
        filter={`url(#${uid}-glow)`}
      />

      {/* Output Nodes (Audited Synthesized Representation) */}
      {/* Upper Consensus Topic Node */}
      <g>
        <circle cx="430" cy="180" r="11" fill={`url(#${uid}-stream-emerald)`} opacity="0.2" />
        <circle cx="430" cy="180" r="6" fill={`url(#${uid}-node-emerald)`} filter={`url(#${uid}-glow)`} />
        <circle cx="428.5" cy="178.5" r="2" fill="#ffffff" opacity="0.9" />
      </g>

      {/* Lower Tension Topic Node */}
      <g>
        <circle cx="430" cy="332" r="11" fill={`url(#${uid}-stream-amber)`} opacity="0.2" />
        <circle cx="430" cy="332" r="6" fill={`url(#${uid}-node-amber)`} filter={`url(#${uid}-glow)`} />
        <circle cx="428.5" cy="330.5" r="2" fill="#ffffff" opacity="0.9" />
      </g>

      {/* Master Synthesis Summary Anchor Node (Center Right) */}
      <g>
        <polygon
          points="444,238 462,256 444,274 426,256"
          fill="none"
          stroke="#38bdf8"
          strokeWidth="1.5"
          strokeDasharray="3 3"
          opacity="0.8"
        />
        <circle
          cx="444"
          cy="256"
          r="16"
          fill={`url(#${uid}-stream-cyan)`}
          opacity="0.25"
          filter={`url(#${uid}-glow)`}
        />
        <circle cx="444" cy="256" r="8" fill={`url(#${uid}-node-cyan)`} filter={`url(#${uid}-glow)`} />
        <circle cx="444" cy="256" r="3.5" fill="#ffffff" />
      </g>

      {/* Subtle Topology Inspection Markers (Verification Threads) */}
      <circle cx="384" cy="235" r="2.5" fill="#34d399" opacity="0.85" />
      <circle cx="392" cy="278" r="2.5" fill="#38bdf8" opacity="0.85" />
      <circle cx="188" cy="178" r="2.5" fill="#fbbf24" opacity="0.85" />
      <circle cx="176" cy="336" r="2.5" fill="#06b6d4" opacity="0.85" />
    </svg>
  );

  if (!resolvedShowText) {
    return (
      <div
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
        className={`inline-flex items-center justify-center ${onClick ? 'cursor-pointer hover:opacity-90' : ''} ${className}`}
      >
        {svgContent}
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
      className={`inline-flex items-center ${gapClass} ${onClick ? 'cursor-pointer group' : ''} ${className}`}
    >
      {svgContent}
      <div className="flex flex-col select-none">
        <div className={`tracking-tight flex items-baseline leading-none ${titleClass}`}>
          {firstPart && <span className={`${titleTextColor} transition-colors duration-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400`}>{firstPart}</span>}
          {lastWord && (
            <span
              className={`bg-gradient-to-r from-indigo-500 via-indigo-600 to-cyan-500 bg-clip-text text-transparent font-black ${
                firstPart ? 'ml-1.5' : ''
              }`}
            >
              {lastWord}
            </span>
          )}
        </div>
        {subtitle && (
          <span className={`${subtitleTextColor} tracking-normal mt-1 leading-tight transition-colors duration-200 ${subtitleClass}`}>
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
};

export default BrandLogo;
