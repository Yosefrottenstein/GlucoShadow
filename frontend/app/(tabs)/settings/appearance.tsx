import { ActivityIndicator, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ChipRow } from "@/src/components/ChipRow";
import { CategoryHeader } from "@/src/components/settings/CategoryHeader";
import { useSettingsStyles } from "@/src/components/settings/styles";
import { Hint, SectionTitle } from "@/src/components/ui";
import { useSettingsScreen } from "@/src/settingsStore";
import { saveAppearance } from "@/src/appearance";
import { toDisplay } from "@/src/glucose";
import { LANGUAGES, setLanguage, useLanguage, useT } from "@/src/i18n";
import { setTimeFormat, useTimeFormat } from "@/src/timeFormat";
import { spacing, useAppearancePref, useTheme } from "@/src/theme";
import { usesNativeTabs } from "@/src/navigation";

export default function AppearanceScreen() {
  const styles = useSettingsStyles();
  const { colors } = useTheme();
  const appearance = useAppearancePref();
  const language = useLanguage();
  const timeFormat = useTimeFormat();
  const t = useT();
  const insets = useSafeAreaInsets();
  const bottomChrome = usesNativeTabs ? insets.bottom : 0;
  const { draft, set } = useSettingsScreen();

  if (!draft) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CategoryHeader title="Appearance" />
      <KeyboardAwareScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: bottomChrome + 32 }}>
        <SectionTitle>{t("Light or dark")}</SectionTitle>
        <ChipRow
          options={[
            { value: "system", label: t("Match phone") },
            { value: "light", label: t("Light") },
            { value: "dark", label: t("Dark") },
          ]}
          value={appearance}
          onChange={saveAppearance}
          testIDPrefix="appearance"
        />
        <Hint>{t("Dark uses deep, low-glare colours for checking glucose at night.")}</Hint>

        <SectionTitle>{t("Language")}</SectionTitle>
        <ChipRow
          options={LANGUAGES.map((l) => ({ value: l.value, label: l.label }))}
          value={language}
          onChange={setLanguage}
          testIDPrefix="settings-language"
          padded={false}
        />

        <SectionTitle>{t("Time format")}</SectionTitle>
        <ChipRow
          options={[
            { value: "24h", label: t("24-hour (14:30)") },
            { value: "12h", label: t("12-hour (2:30 PM)") },
          ]}
          value={timeFormat}
          onChange={setTimeFormat}
          testIDPrefix="settings-time-format"
          padded={false}
        />

        <SectionTitle>{t("Graph height")}</SectionTitle>
        <ChipRow
          options={[
            { value: "300", label: `300 mg/dL · ${toDisplay(300, "mmol")} mmol/L` },
            { value: "400", label: `400 mg/dL · ${toDisplay(400, "mmol")} mmol/L` },
          ]}
          value={String(draft.graph_max === 300 ? 300 : 400)}
          onChange={(v) => set("graph_max", Number(v))}
          testIDPrefix="settings-graph-max"
          padded={false}
        />
        <Hint>The top of the glucose graph on Home and History. In {draft.unit === "mmol" ? "mmol/L" : "mg/dL"} that is {toDisplay(draft.graph_max === 300 ? 300 : 400, draft.unit)}.</Hint>
      </KeyboardAwareScrollView>
    </View>
  );
}
