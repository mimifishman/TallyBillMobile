import { Alert } from "react-native";

export function confirmDeleteBill(onConfirm: () => void): void {
  Alert.alert(
    "Delete this bill?",
    "This cannot be undone.",
    [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: onConfirm },
    ],
  );
}
