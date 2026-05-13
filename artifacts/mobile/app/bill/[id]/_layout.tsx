import { Stack } from "expo-router";
import { ScanProvider } from "@/context/ScanContext";

export default function BillLayout() {
  return (
    <ScanProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="scan" options={{ presentation: "modal" }} />
        <Stack.Screen name="totals" />
        <Stack.Screen name="share" />
      </Stack>
    </ScanProvider>
  );
}
