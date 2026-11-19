import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSettingsScreen } from "@/src/settingsStore";
import { useT } from "@/src/i18n";
import { spacing, useTheme } from "@/src/theme";
import { useSettingsStyles } from "./styles";

/** Header shared by every settings category screen: back to the menu, the category title, and Save.
 * `title` is an English UI string; it's translated here so every call site stays plain English. */
export function CategoryHeader({ title }: { title: string }) {
  const styles = useSettingsStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();
  const { dirty, save } = useSettingsScreen();
  return (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
      <Pressable testID="settings-back-button" onPress={() => router.back()} hitSlop={8} style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}>
        <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
      </Pressable>
      <Text style={[styles.title, { flex: 1, fontSize: 20 }]}>{t(title)}</Text>
      <Pressable
        testID="settings-save-button"
        disabled={!dirty || save.isPending}
        onPress={() => save.mutate()}
        style={[styles.saveBtn, !dirty && { opacity: 0.4 }]}
      >
        {save.isPending ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.saveText}>{t("Save")}</Text>}
      </Pressable>
    </View>
  );
}
