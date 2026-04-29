import { Stack } from "expo-router";

export default function BillLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="scan" options={{ presentation: "modal" }} />
      <Stack.Screen name="totals" />
      <Stack.Screen name="share" />
    </Stack>
  );
}
