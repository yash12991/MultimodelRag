import React from 'react'

interface BrandLogoProps {
  size?: number
  withContainer?: boolean
  className?: string
  animated?: boolean
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 28,
  withContainer = false,
  className = '',
  animated = false,
}) => {
  return (
    <div
      className={`brand-logo-container ${withContainer ? 'has-badge' : ''} ${className}`}
      style={{
        width: size,
        height: size,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={animated ? 'brand-logo-svg animated' : 'brand-logo-svg'}
      >
        {withContainer && (
          <>
            {/* Outer Rounded Bezel with subtle border */}
            <rect
              x="1"
              y="1"
              width="38"
              height="38"
              rx="9"
              fill="#18181b"
              stroke="rgba(255, 255, 255, 0.12)"
              strokeWidth="1.2"
            />
            {/* Subtle inner plate */}
            <rect
              x="3.5"
              y="3.5"
              width="33"
              height="33"
              rx="7"
              fill="#09090b"
              stroke="rgba(255, 255, 255, 0.04)"
              strokeWidth="1"
            />
          </>
        )}

        {/* --- AISIA NEURAL APERTURE / QUANTUM NEXUS GLYPH --- */}
        {/* Isometric 3D Hex Core Facets */}
        <g transform="translate(2, 2)">
          {/* Top Left Facet: crisp silver */}
          <polygon
            points="18,4 7,10.5 7,23 18,17"
            fill="rgba(255, 255, 255, 0.08)"
            stroke="rgba(255, 255, 255, 0.45)"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />

          {/* Top Right Facet: electric cobalt */}
          <polygon
            points="18,4 29,10.5 29,23 18,17"
            fill="rgba(59, 130, 246, 0.16)"
            stroke="#3b82f6"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />

          {/* Bottom Nexus Facet: grounding delta base */}
          <polygon
            points="18,17 29,23 18,30 7,23"
            fill="rgba(37, 99, 235, 0.25)"
            stroke="#2563eb"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />

          {/* Futuristic 'A' Apex Chevron Monogram */}
          <path
            d="M12.5 22L18 10L23.5 22"
            stroke="#ffffff"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M14.5 18H21.5"
            stroke="#60a5fa"
            strokeWidth="1.8"
            strokeLinecap="round"
          />

          {/* Central Quantum Core Node */}
          <circle cx="18" cy="17" r="2.2" fill="#3b82f6" stroke="#ffffff" strokeWidth="1" />
        </g>
      </svg>
    </div>
  )
}

export default BrandLogo
