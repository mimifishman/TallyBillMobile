import { useContext } from "react";
import { BottomTabBarHeightContext } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Bottom padding for scrollable content on tab screens so the last element
 * always clears the floating (absolutely positioned) tab bar.
 *
 * The classic tab bar floats over content, so the safe-area bottom inset
 * alone isn't enough — on Android that inset is usually 0 and content ends
 * up hidden behind the bar. The bottom-tabs height context reports the real
 * bar height (which already includes the bottom safe-area inset).
 *
 * When no classic tab bar is present (e.g. iOS native tabs, which handle
 * insets natively), falls back to the safe-area inset plus a margin.
 */
export function useTabContentBottomPadding(extra: number = 24): number {
  const insets = useSafeAreaInsets();
  const tabBarHeight = useContext(BottomTabBarHeightContext);
  if (typeof tabBarHeight === "number") {
    return tabBarHeight + extra;
  }
  return insets.bottom + 40;
}
