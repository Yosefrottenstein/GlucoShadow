import Ionicons from "@react-native-vector-icons/ionicons";
import { Pressable, Text, View } from "react-native";

import { PermItem, PermState } from "@/src/permissions";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

/** One row per permission: status, why it is needed, and an Allow button that shows the system dialog or opens its settings screen. */
export function PermissionsList({ items, state, onRefresh }: { items: PermItem[]; state: PermState; onRefresh: () => void }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View>
      {items.map((p, i) => {
        const ok = state[p.id];
        return (
          <View key={p.id} style={[styles.row, i > 0 && styles.border]} testID={`permission-${p.id}`}>
            <Ionicons name={ok ? "checkmark-circle" : "alert-circle"} size={24} color={ok ? colors.inRange : colors.warning} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{p.title}</Text>
              <Text style={styles.why}>{p.why}</Text>
            </View>
            {ok ? (
              <Text style={styles.on}>On</Text>
            ) : (
              <Pressable
                testID={`permission-${p.id}-allow`}
                onPress={async () => {
                  await p.request();
                  onRefresh();
                }}
                style={styles.btn}
              >
                <Text style={styles.btnText}>Allow</Text>
              </Pressable>
            )}
          </View>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  border: { borderTopWidth: 1, borderTopColor: c.border },
  title: { fontFamily: fonts.text, fontSize: 15, fontWeight: "700", color: c.onSurface },
  why: { fontFamily: fonts.text, fontSize: 12, lineHeight: 17, color: c.muted, marginTop: 2 },
  on: { fontFamily: fonts.text, fontSize: 13, fontWeight: "700", color: c.inRange },
  btn: { backgroundColor: c.brandPrimary, borderRadius: radius.pill, paddingHorizontal: spacing.lg, minHeight: 40, justifyContent: "center" },
  btnText: { color: c.onBrandPrimary ?? "#fff", fontFamily: fonts.text, fontSize: 14, fontWeight: "700" },
}));
