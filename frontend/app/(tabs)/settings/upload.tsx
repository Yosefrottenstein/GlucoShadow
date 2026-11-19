import { ActivityIndicator, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CategoryHeader } from "@/src/components/settings/CategoryHeader";
import { HealthCard } from "@/src/components/settings/HealthCard";
import { useSettingsStyles } from "@/src/components/settings/styles";
import { UploadsSection } from "@/src/components/settings/UploadsSection";
import { healthPlatform } from "@/src/health";
import { isAndroid } from "@/src/phoneSms";
import { FOLLOWER_SOURCES, isFollowerSource, useSettingsScreen } from "@/src/settingsStore";
import { spacing, useTheme } from "@/src/theme";
import { usesNativeTabs } from "@/src/navigation";

export default function UploadScreen() {
  const styles = useSettingsStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const { draft, set, secrets, setSecret, secretPh, status, nsUpload, tpUpload, dxUpload } = useSettingsScreen();

  if (!draft) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }

  const FOLLOWER = FOLLOWER_SOURCES(isAndroid, healthPlatform);
  const mode = isFollowerSource(draft.source, FOLLOWER) ? "follower" : "master";

  return (
    <View style={styles.root}>
      <CategoryHeader title="Upload to cloud" />
      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: bottomChrome + 32 }} keyboardShouldPersistTaps="handled">
        <UploadsSection
          draft={draft}
          set={set}
          mode={mode}
          secrets={secrets}
          setSecret={setSecret}
          secretPh={secretPh}
          status={status.data}
          nsUpload={nsUpload}
          tpUpload={tpUpload}
          dxUpload={dxUpload}
        />
        {healthPlatform && <HealthCard />}
      </KeyboardAwareScrollView>
    </View>
  );
}
