import { useFonts } from "expo-font";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { LogBox, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";

import { AuthProvider, useAuth } from "@/src/auth";
import { AlarmWatcher } from "@/src/components/AlarmWatcher";
import { KeepAlive } from "@/src/components/KeepAlive";
import { PermissionsGate } from "@/src/components/PermissionsGate";
import { LoginScreen } from "@/src/components/LoginScreen";
import { ErrorBoundary } from "@/src/components/error-boundary";
import { SensorCollector } from "@/src/components/SensorCollector";
import { ToastProvider } from "@/src/components/Toast";
import { LanguageGate } from "@/src/components/LanguageGate";
import { queryClient } from "@/src/query-client";
import { loadAppearance } from "@/src/appearance";
import { loadLanguage } from "@/src/i18n";
import { loadTimeFormat } from "@/src/timeFormat";
import { useTheme } from "@/src/theme";
import { StatusBar } from "expo-status-bar";

loadAppearance();
loadLanguage();
loadTimeFormat();

// Disable logbox errors etc so that users can see the app
// and agent works as expected.
LogBox.ignoreAllLogs(true)

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceGrotesk: require("../assets/fonts/SpaceGrotesk.ttf"),
    PlusJakartaSans: require("../assets/fonts/PlusJakartaSans.ttf"),
  });
  if (!loaded && !error) return null;

  // One app level ErrorBoundary; a render crash shows a reload screen
  // instead of a blank app. GestureHandlerRootView must wrap the whole tree
  // or any gesture/swipe/drawer screen crashes in Expo Go.
  return (
    <GestureHandlerRootView style={styles.root}>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <KeyboardProvider>
            <ToastProvider>
              <LanguageGate>
                <AuthProvider>
                  <AuthGate />
                </AuthProvider>
              </LanguageGate>
            </ToastProvider>
          </KeyboardProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </GestureHandlerRootView>
  );
}

function AuthGate() {
  const { ready, signedIn } = useAuth();
  const { scheme, colors } = useTheme();
  const bar = <StatusBar style={scheme === "dark" ? "light" : "dark"} />;
  if (!ready) return null;
  if (!signedIn) return <>{bar}<LoginScreen /></>;
  return (
    <>
      {bar}
      <SensorCollector />
      <AlarmWatcher />
      <KeepAlive />
      <PermissionsGate />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }} />
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
