import React from "react";
import { Image } from "react-native";

export function EmptyBillsIllustration({ size = 200 }: { size?: number }) {
  return (
    <Image
      source={require("@/assets/images/empty-bills.png")}
      style={{ width: size, height: size, resizeMode: "contain" }}
    />
  );
}
