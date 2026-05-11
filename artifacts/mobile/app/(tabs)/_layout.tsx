import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, View, useColorScheme } from "react-native";
import { useColors } from "@/hooks/useColors";

function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="bills">
        <Icon sf={{ default: "doc.text", selected: "doc.text.fill" }} />
        <Label>Bills</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="join">
        <Icon sf={{ default: "person.badge.plus", selected: "person.badge.plus" }} />
        <Label>Join</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <Icon sf={{ default: "gearshape", selected: "gearshape.fill" }} />
        <Label>Settings</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ActiveDot({ color }: { color: string }) {
  return (
    <View style={styles.dotWrap} pointerEvents="none">
      <View style={[styles.dot, { backgroundColor: color }]} />
    </View>
  );
}

function ClassicTabLayout() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: true,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : colors.background,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={80}
              tint={isDark ? "dark" : "light"}
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View
              style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}
            />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="bills"
        options={{
          title: "My Bills",
          tabBarIcon: ({ color, focused }) => (
            <View style={styles.iconWrap}>
              {isIOS ? (
                <SymbolView
                  name={focused ? "doc.text.fill" : "doc.text"}
                  tintColor={color}
                  size={22}
                />
              ) : (
                <Ionicons
                  name={focused ? "document-text" : "document-text-outline"}
                  size={22}
                  color={color}
                />
              )}
              {focused ? <ActiveDot color={colors.primary} /> : null}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="join"
        options={{
          title: "Join",
          tabBarIcon: ({ color, focused }) => (
            <View style={styles.iconWrap}>
              {isIOS ? (
                <SymbolView
                  name="person.badge.plus"
                  tintColor={color}
                  size={22}
                />
              ) : (
                <Ionicons
                  name={focused ? "person-add" : "person-add-outline"}
                  size={22}
                  color={color}
                />
              )}
              {focused ? <ActiveDot color={colors.primary} /> : null}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, focused }) => (
            <View style={styles.iconWrap}>
              {isIOS ? (
                <SymbolView
                  name={focused ? "gearshape.fill" : "gearshape"}
                  tintColor={color}
                  size={22}
                />
              ) : (
                <Ionicons
                  name={focused ? "settings" : "settings-outline"}
                  size={22}
                  color={color}
                />
              )}
              {focused ? <ActiveDot color={colors.primary} /> : null}
            </View>
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  dotWrap: {
    position: "absolute",
    bottom: -8,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});

export default function TabLayout() {
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
