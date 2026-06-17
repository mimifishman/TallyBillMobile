import React from "react";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from "react-native-svg";

export function EmptyNoPeopleIllustration({ size = 160 }: { size?: number }) {
  const s = size / 160;
  return (
    <Svg width={size} height={size * 0.85} viewBox="0 0 160 136" fill="none">
      <Defs>
        <LinearGradient id="npGrad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#A7F3D0" />
          <Stop offset="1" stopColor="#6EE7B7" />
        </LinearGradient>
        <LinearGradient id="npCircle" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#D1FAE5" />
          <Stop offset="1" stopColor="#A7F3D0" />
        </LinearGradient>
      </Defs>

      <Ellipse cx="80" cy="120" rx="60" ry="10" fill="#10B981" opacity="0.12" />

      <Circle cx="80" cy="48" r="26" fill="url(#npCircle)" stroke="#6EE7B7" strokeWidth="2" />
      <Circle cx="80" cy="42" r="12" fill="url(#npGrad)" />
      <Path
        d="M58 84 Q58 68 80 68 Q102 68 102 84"
        stroke="#6EE7B7"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M56 70 Q50 64 48 56"
        stroke="#A7F3D0"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <Path
        d="M104 70 Q110 64 112 56"
        stroke="#A7F3D0"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />

      <Circle cx="44" cy="52" r="16" fill="#D1FAE5" stroke="#A7F3D0" strokeWidth="1.5" opacity="0.8" />
      <Circle cx="44" cy="47" r="7" fill="#A7F3D0" opacity="0.9" />
      <Path
        d="M32 72 Q32 62 44 62 Q56 62 56 72"
        stroke="#A7F3D0"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        opacity="0.8"
      />

      <Circle cx="116" cy="52" r="16" fill="#D1FAE5" stroke="#A7F3D0" strokeWidth="1.5" opacity="0.8" />
      <Circle cx="116" cy="47" r="7" fill="#A7F3D0" opacity="0.9" />
      <Path
        d="M104 72 Q104 62 116 62 Q128 62 128 72"
        stroke="#A7F3D0"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
        opacity="0.8"
      />

      <Circle cx="80" cy="48" r="4" fill="#10B981" opacity="0.3" />
      <Rect x="73" y="96" width="14" height="2.5" rx="1.25" fill="#10B981" opacity="0.25" />
      <Rect x="68" y="102" width="24" height="2.5" rx="1.25" fill="#10B981" opacity="0.18" />
    </Svg>
  );
}
