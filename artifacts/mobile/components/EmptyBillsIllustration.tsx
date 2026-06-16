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

export function EmptyBillsIllustration({ size = 200 }: { size?: number }) {
  return (
    <Svg width={size} height={size * 0.85} viewBox="0 0 240 200" fill="none">
      <Defs>
        <LinearGradient id="table" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FCD9B6" />
          <Stop offset="1" stopColor="#E5A877" />
        </LinearGradient>
        <LinearGradient id="plate" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#E5E7EB" />
        </LinearGradient>
        <LinearGradient id="receipt" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#F3F4F6" />
        </LinearGradient>
        <LinearGradient id="leaf" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#10B981" />
          <Stop offset="1" stopColor="#3B82F6" />
        </LinearGradient>
      </Defs>

      <Ellipse cx="120" cy="170" rx="110" ry="20" fill="url(#table)" />
      <Ellipse cx="120" cy="180" rx="100" ry="6" fill="#000" opacity="0.08" />

      <Ellipse cx="60" cy="155" rx="38" ry="10" fill="url(#plate)" stroke="#D1D5DB" strokeWidth="1" />
      <Ellipse cx="60" cy="153" rx="30" ry="7" fill="#F9FAFB" />

      <Ellipse cx="180" cy="155" rx="38" ry="10" fill="url(#plate)" stroke="#D1D5DB" strokeWidth="1" />
      <Ellipse cx="180" cy="153" rx="30" ry="7" fill="#F9FAFB" />

      <Rect x="100" y="60" width="40" height="80" rx="4" fill="url(#receipt)" stroke="#D1D5DB" strokeWidth="1" />
      <Path d="M100 140 L106 134 L114 140 L122 134 L130 140 L138 134 L140 140 Z" fill="url(#receipt)" stroke="#D1D5DB" strokeWidth="1" />
      <Rect x="106" y="70" width="28" height="3" rx="1.5" fill="#E5E7EB" />
      <Rect x="106" y="78" width="20" height="2.5" rx="1.25" fill="#E5E7EB" />
      <Rect x="106" y="85" width="24" height="2.5" rx="1.25" fill="#E5E7EB" />
      <Rect x="106" y="92" width="18" height="2.5" rx="1.25" fill="#E5E7EB" />
      <Rect x="106" y="105" width="28" height="3" rx="1.5" fill="#FB7185" />

      <Path
        d="M40 100 Q40 88 46 88 Q52 88 52 100 L52 145"
        stroke="#9CA3AF"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      <Path d="M40 100 L40 115 M46 88 L46 115 M52 100 L52 115" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" />

      <Circle cx="200" cy="98" r="10" fill="url(#leaf)" />
      <Path d="M195 95 Q200 88 205 95 Q200 102 195 95 Z" fill="#FFFFFF" opacity="0.5" />
    </Svg>
  );
}
