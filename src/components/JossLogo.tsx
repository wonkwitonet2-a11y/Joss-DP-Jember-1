import React from "react";

interface JossLogoProps {
  size?: number;
  compact?: boolean;
  className?: string;
  animated?: boolean;
  inverted?: boolean;
}

export default function JossLogo({ size = 40, compact = false, className = "", animated = false, inverted = false }: JossLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 200 200"
      role="img"
      aria-label="Logo Jember Operation Sales System"
      className={`shrink-0 ${className}`}
    >
      {animated && (
        <style>{`
          @keyframes jossWhiteWave {
            0%, 100% {
              transform: translateY(0px) scale(1);
            }
            30% {
              transform: translateY(-5px) scale(1.02);
            }
            70% {
              transform: translateY(2px) scale(0.99);
            }
          }
          @keyframes jossRedWave {
            0%, 100% {
              transform: translateY(0px) scale(1);
            }
            35% {
              transform: translateY(4px) scale(0.99);
            }
            75% {
              transform: translateY(-3px) scale(1.02);
            }
          }
          @keyframes jossRingPulse {
            0%, 100% {
              transform: scale(1);
              opacity: 0.9;
            }
            50% {
              transform: scale(1.1);
              opacity: 1;
              filter: drop-shadow(0 0 8px #00D2FF);
            }
          }
          .joss-anim-white {
            transform-origin: 100px 96px;
            animation: jossWhiteWave 2.4s ease-in-out infinite;
          }
          .joss-anim-red {
            transform-origin: 100px 132px;
            animation: jossRedWave 2.4s ease-in-out infinite;
          }
          .joss-anim-ring {
            transform-origin: 100px 48px;
            animation: jossRingPulse 2.4s ease-in-out infinite;
          }
        `}</style>
      )}
      <rect width="200" height="200" rx="44" fill={inverted ? "#FFFFFF" : "#0F172A"} />
      {/* Top Cyan Ring */}
      <circle
        cx="100"
        cy="48"
        r="15"
        fill="none"
        stroke="#00D2FF"
        strokeWidth="10"
        className={animated ? "joss-anim-ring" : ""}
      />
      {/* Upper White Wave Ribbon */}
      <path
        d="M 54 110 C 54 84, 84 80, 100 96 C 116 112, 134 114, 146 84"
        fill="none"
        stroke={inverted ? "#0F172A" : "#FFFFFF"}
        strokeWidth="22"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={animated ? "joss-anim-white" : ""}
      />
      {/* Lower Red Wave Ribbon */}
      <path
        d="M 58 146 C 60 120, 84 116, 100 132 C 116 148, 134 148, 150 118"
        fill="none"
        stroke="#EE2737"
        strokeWidth="22"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={animated ? "joss-anim-red" : ""}
      />
    </svg>
  );
}

export { JossLogo };
