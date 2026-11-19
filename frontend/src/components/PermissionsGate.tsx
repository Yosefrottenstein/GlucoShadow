import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, Settings } from "@/src/api";
import { PermissionsList } from "@/src/components/PermissionsList";
import { Button } from "@/src/components/ui";
import { usePermissions } from "@/src/permissions";
import { fonts, makeStyles, spacing } from "@/src/theme";

/** Shown at start-up while something important is still off (notifications, background running, silent-mode override...). */
export function PermissionsGate() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api<Settings>("/settings") });
  const { items, state, missing, refresh } = usePermissions(settings.data);
  const [hidden, setHidden] = useState(false);
  const critical = missing.filter((p) => p.critical);
  if (!settings.data || hidden || !critical.length) return null;

  return (
    <Modal visible animationType="slide" onRequestClose={() => setHidden(true)}>
      <View style={[styles.root, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.lg }]}>
        <Text style={styles.title}>Allow what GlucoShadow needs</Text>
        <Text style={styles.sub}>
          Alarms only work when the phone allows them to run, make sound and stay awake. Tap Allow on each item. When you return from a settings screen, the list updates by itself.
        </Text>
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          <PermissionsList items={items} state={state} onRefresh={refresh} />
        </ScrollView>
        <Button
          title="Allow next"
          onPress={async () => {
            await missing[0]?.request();
            refresh();
          }}
          testID="permissions-allow-next"
        />
        <Pressable onPress={() => setHidden(true)} style={styles.later} testID="permissions-later">
          <Text style={styles.laterText}>Not now (alarms may not work reliably)</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface, paddingHorizontal: spacing.xl },
  title: { fontFamily: fonts.display, fontSize: 26, fontWeight: "700", color: c.onSurface },
  sub: { fontFamily: fonts.text, fontSize: 14, lineHeight: 20, color: c.muted, marginVertical: spacing.md },
  later: { alignSelf: "center", minHeight: 44, justifyContent: "center", marginTop: spacing.sm },
  laterText: { fontFamily: fonts.text, fontSize: 13, color: c.muted },
}));
