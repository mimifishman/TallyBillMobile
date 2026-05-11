import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect } from "react";
import { ActivityIndicator, Alert, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useJoinBill, customFetch } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { appendGuestBill, registerJoinCode, listGuestBills } from "@/utils/guestBillStore";
import colors_data from "@/constants/colors";

const PEOPLE_COLORS = colors_data.light.people;

function pickColor(usedColors: string[] = []): string {
  const usedSet = new Set(usedColors.map((c) => c.toLowerCase()));
  const available = PEOPLE_COLORS.filter((c) => !usedSet.has(c.toLowerCase()));
  const pool = available.length > 0 ? available : PEOPLE_COLORS;
  return pool[Math.floor(Math.random() * pool.length)]!;
}

export default function JoinBillScreen() {
  const colors = useColors();
  const { code } = useLocalSearchParams<{ code: string }>();
  const { user, guestName } = useAuth();

  const displayName = user
    ? (user.firstName || user.displayName)
    : guestName || null;

  const joinMutation = useJoinBill({
    mutation: {
      onSuccess: async (bill) => {
        if (displayName && bill.id) {
          try {
            const detail = await customFetch(`/api/bills/${bill.id}`) as {
              users?: { name: string; color: string }[];
            };
            const existingUsers = detail.users ?? [];
            const usedNames = new Set(existingUsers.map((u) => u.name.toLowerCase()));
            if (!usedNames.has(displayName.toLowerCase())) {
              const usedColors = existingUsers.map((u) => u.color);
              await customFetch(`/api/bills/${bill.id}/users`, {
                method: "POST",
                body: JSON.stringify({ name: displayName, color: pickColor(usedColors) }),
                headers: { "Content-Type": "application/json" },
              });
            }
          } catch {
          }
        }
        router.replace(`/bill/${bill.id}`);
      },
      onError: (err: Error) => {
        Alert.alert("Error", err.message || "Could not join bill", [
          { text: "OK", onPress: () => router.back() },
        ]);
      },
    },
  });

  useEffect(() => {
    if (!code) return;

    if (user) {
      joinMutation.mutate({ data: { joinCode: code } });
      return;
    }

    (async () => {
      try {
        const existingBills = await listGuestBills();
        const alreadyJoined = existingBills.find((b) => b.joinCode === code.toUpperCase());
        if (alreadyJoined) {
          router.replace(`/bill/${alreadyJoined.id}`);
          return;
        }
        const data = await customFetch(`/api/bills/by-code/${code.toUpperCase()}`) as {
          bill: { id: number; joinCode: string; title: string; date: string };
          users?: { color: string }[];
        };
        const bill = data.bill;
        registerJoinCode(bill.id, bill.joinCode);
        await appendGuestBill({
          id: bill.id,
          joinCode: bill.joinCode,
          title: bill.title,
          date: bill.date,
        });
        if (displayName) {
          try {
            const usedColors = (data.users ?? []).map((u) => u.color);
            await customFetch(`/api/bills/${bill.id}/users`, {
              method: "POST",
              body: JSON.stringify({ name: displayName, color: pickColor(usedColors) }),
              headers: { "Content-Type": "application/json" },
            });
          } catch {
          }
        }
        router.replace(`/bill/${bill.id}`);
      } catch {
        Alert.alert("Error", "Could not find a bill with that code", [
          { text: "OK", onPress: () => router.back() },
        ]);
      }
    })();
  }, []);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
      <ActivityIndicator color={colors.primary} />
    </View>
  );
}
