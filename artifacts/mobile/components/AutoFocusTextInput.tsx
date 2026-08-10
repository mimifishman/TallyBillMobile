import React, { useEffect, useImperativeHandle, useRef } from "react";
import { Platform, TextInput, TextInputProps } from "react-native";

const FIRST_ATTEMPT_DELAY_MS = 100;
const RETRY_INTERVAL_MS = 100;
const MAX_ATTEMPTS = 10;

/**
 * Drop-in replacement for TextInput that makes `autoFocus` reliable on
 * Android, especially inside React Native `Modal`s.
 *
 * On Android, a focus request made while a Modal's window is still attaching
 * is silently dropped, so the software keyboard never appears. Instead of
 * relying on the bare `autoFocus` prop, this component retries `focus()` via
 * a ref shortly after mount until the input actually reports focus (or gives
 * up). iOS and web keep the native `autoFocus` behavior unchanged.
 */
export const AutoFocusTextInput = React.forwardRef<TextInput, TextInputProps>(
  function AutoFocusTextInput({ autoFocus, ...props }, forwardedRef) {
    const inputRef = useRef<TextInput>(null);
    useImperativeHandle(forwardedRef, () => inputRef.current as TextInput);

    const wantsAutoFocus = !!autoFocus;

    useEffect(() => {
      if (Platform.OS !== "android" || !wantsAutoFocus) return;

      let attempts = 0;
      let interval: ReturnType<typeof setInterval> | null = null;

      const tryFocus = () => {
        const input = inputRef.current;
        attempts += 1;
        if (input) {
          if (input.isFocused()) {
            if (interval) clearInterval(interval);
            return;
          }
          input.focus();
        }
        if (attempts >= MAX_ATTEMPTS && interval) clearInterval(interval);
      };

      // Give the Modal window a beat to attach before the first attempt,
      // then keep retrying briefly — focus requests made too early are
      // silently dropped on Android.
      const timer = setTimeout(() => {
        tryFocus();
        interval = setInterval(tryFocus, RETRY_INTERVAL_MS);
      }, FIRST_ATTEMPT_DELAY_MS);

      return () => {
        clearTimeout(timer);
        if (interval) clearInterval(interval);
      };
      // Run once on mount only — these inputs mount when their sheet/dialog opens.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
      <TextInput
        ref={inputRef}
        autoFocus={Platform.OS === "android" ? false : autoFocus}
        {...props}
      />
    );
  }
);
