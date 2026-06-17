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

export function EmptyNoItemsIllustration({ size = 160 }: { size?: number }) {
  return (
    <Svg width={size} height={size * 0.85} viewBox="0 0 160 136" fill="none">
      <Defs>
        <LinearGradient id="niReceipt" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" />
          <Stop offset="1" stopColor="#F3F4F6" />
        </LinearGradient>
        <LinearGradient id="niPlus" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#10B981" />
          <Stop offset="1" stopColor="#3B82F6" />
        </LinearGradient>
      </Defs>

      <Ellipse cx="80" cy="122" rx="58" ry="9" fill="#10B981" opacity="0.10" />

      <Rect x="46" y="28" width="52" height="80" rx="6" fill="url(#niReceipt)" stroke="#E5E7EB" strokeWidth="1.5" />
      <Path d="M46 108 L51 103 L57 108 L63 103 L69 108 L75 103 L80 108 L85 103 L91 108 L95 103 L98 108 Z" fill="url(#niReceipt)" stroke="#E5E7EB" strokeWidth="1" />

      <Rect x="54" y="40" width="36" height="3" rx="1.5" fill="#E5E7EB" />
      <Rect x="54" y="50" width="26" height="2.5" rx="1.25" fill="#E5E7EB" />
      <Rect x="54" y="58" width="30" height="2.5" rx="1.25" fill="#E5E7EB" />
      <Rect x="54" y="66" width="22" height="2.5" rx="1.25" fill="#E5E7EB" />
      <Rect x="54" y="74" width="28" height="2.5" rx="1.25" fill="#E5E7EB" />

      <Circle cx="98" cy="56" r="20" fill="url(#niPlus)" opacity="0.9" />
      <Rect x="90" y="54.5" width="16" height="3" rx="1.5" fill="#fff" />
      <Rect x="96.5" y="48" width="3" height="16" rx="1.5" fill="#fff" />

      <Rect x="54" y="87" width="36" height="3" rx="1.5" fill="#FB7185" opacity="0.5" />
    </Svg>
  );
}
