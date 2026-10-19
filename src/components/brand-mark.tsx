import { useId } from "react";

export function BrandMark() {
  const patternId = `cheetah-print-${useId().replace(/:/g, "")}`;

  return (
    <div className="brand-mark" aria-hidden="true">
      <svg viewBox="0 0 40 40" fill="none">
        <defs>
          <pattern
            id={patternId}
            width="10"
            height="10"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(-12)"
          >
            <rect
              width="10"
              height="10"
              style={{ fill: "var(--cheetah-gold)" }}
            />
            <g fill="currentColor">
              <ellipse cx="2.2" cy="2.4" rx="1.4" ry="1.1" />
              <ellipse cx="7.3" cy="3.6" rx="1.1" ry="1.3" />
              <ellipse cx="4.6" cy="7.4" rx="1.3" ry="1" />
              <circle cx="9.3" cy="8.6" r=".8" />
              <circle cx="0.6" cy="6.2" r=".6" />
            </g>
          </pattern>
        </defs>
        {/* Speed lines trailing behind the cheetah. */}
        <g
          className="brand-speed-lines"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        >
          <line x1="1.5" y1="15" x2="10" y2="15" />
          <line x1="0.5" y1="20.5" x2="8" y2="20.5" opacity=".75" />
          <line x1="2.5" y1="26" x2="8.5" y2="26" opacity=".5" />
        </g>
        <g
          transform="translate(5 1) scale(.88)"
          fill={`url(#${patternId})`}
          stroke="currentColor"
          strokeWidth=".6"
        >
          <path d="M6 25.8c2.3-8.5 8.4-14.2 17.2-14.2 5 0 8.8 1.7 11.2 4.6-4.8-.4-8.7 1.2-11.3 4.2-2.8 3.1-6.8 5-12.1 5.5L6 25.8Z" />
          <path
            d="M10.7 28.1c6.7 1.1 12.7-.6 17.7-5.2-1.8 7.3-7.7 11.6-15.9 10.5l-1.8-5.3Z"
            opacity=".8"
          />
          <circle cx="27" cy="16" r="1.2" fill="#fff" strokeWidth=".4" />
        </g>
      </svg>
    </div>
  );
}
