import * as WebBrowser from "expo-web-browser";
import { useEffect } from "react";
import { View } from "react-native";

WebBrowser.maybeCompleteAuthSession();

export default function SSOCallback() {
  useEffect(() => {
    WebBrowser.maybeCompleteAuthSession();
  }, []);

  return <View />;
}
