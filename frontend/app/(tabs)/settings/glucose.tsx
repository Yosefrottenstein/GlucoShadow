import { ActivityIndicator, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChipRow } from "@/src/components/ChipRow";
import { CategoryHeader } from "@/src/components/settings/CategoryHeader";
import { TargetRangeSection } from "@/src/components/settings/AlarmsSection";
import { useSettingsStyles } from "@/src/components/settings/styles";
import { SectionTitle } from "@/src/components/ui";
import { useSettingsScreen } from "@/src/settingsStore";
import { useT } from "@/src/i18n";
import { spacing, useTheme } from "@/src/theme";
import { usesNativeTabs } from "@/src/navigation";

export default function GlucoseScreen() {
  const styles = useSettingsStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const t = useT();
  const { draft, thr, setThr, changeUnit } = useSettingsScreen();

  if (!draft) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CategoryHeader title="Glucose & ranges" />
      <KeyboardAwareScrollView bottomOffset={24} contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: bottomChrome + 32 }} keyboardShouldPersistTaps="handled">
        <SectionTitle>{t("Glucose unit")}</SectionTitle>
        <ChipRow
          options={[
            { value: "mgdl", label: "mg/dL" },
            { value: "mmol", label: "mmol/L" },
          ]}
          value={draft.unit}
          onChange={changeUnit}
          testIDPrefix="settings-unit"
          padded={false}
        />

        <TargetRangeSection draft={draft} thr={thr} setThr={setThr} />
      </KeyboardAwareScrollView>
    </View>
  );
}
