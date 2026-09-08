import { useEffect, useState } from "react";
import { Keyboard, Platform, type KeyboardEvent } from "react-native";

/**
 * How much of the screen the keyboard is currently covering, in points.
 *
 * KeyboardAvoidingView is the obvious alternative, but "padding" measures
 * against the window rather than the view, so inside a screen that already
 * has a header — or one presented as a sheet — it over- or under-shoots and
 * leaves content stranded under the keyboard. Knowing the height lets a
 * layout move the exact distance it needs to.
 *
 * iOS reports the size before the keyboard animates in, so a layout keyed on
 * this moves with it rather than after it. Android has no "will" events.
 */
export function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const show = Keyboard.addListener(showEvent, (e: KeyboardEvent) =>
      setHeight(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener(hideEvent, () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return height;
}
