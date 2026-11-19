import Ionicons from "@react-native-vector-icons/ionicons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { Image, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, Settings } from "@/src/api";
import { useAuth } from "@/src/auth";
import { PasswordSheet } from "@/src/components/PasswordSheet";
import { useToast } from "@/src/components/Toast";
import { useSettingsStyles } from "@/src/components/settings/styles";
import { Button, Card, Field, Hint, SectionTitle } from "@/src/components/ui";
import { usesNativeTabs } from "@/src/navigation";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

type Me = { username: string; email: string | null; avatar?: string | null };

export default function ProfileScreen() {
  const styles = useStyles();
  const headerStyles = useSettingsStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const { username, signOut, signIn } = useAuth();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<Me>("/auth/me") });
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api<Settings>("/settings") });

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [user, setUser] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [delPw, setDelPw] = useState("");
  const [deleting, setDeleting] = useState(false);

  const curName = settings.data?.em_name ?? "";
  const curUser = me.data?.username ?? username;
  const curEmail = me.data?.email ?? "";
  const curAvatar = me.data?.avatar ?? null;
  const shown = (curName || curUser || "?").trim();

  const startEdit = () => {
    setName(curName);
    setUser(curUser);
    setEmail(curEmail);
    setPw("");
    setAvatar(curAvatar);
    setEditing(true);
  };

  const pickPicture = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return toast("Allow photo access to choose a picture", "error");
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.3,
      base64: true,
    });
    if (res.canceled || !res.assets[0]?.base64) return;
    const a = res.assets[0];
    setAvatar(`data:${a.mimeType === "image/png" ? "image/png" : "image/jpeg"};base64,${a.base64}`);
  };

  const save = async () => {
    const n = name.replace(/\s+/g, " ").trim();
    const u = user.trim();
    const e = email.trim().toLowerCase();
    if (n.length < 3) return toast("Name needs at least 3 characters", "error");
    if (u !== curUser && !pw) return toast("Enter your password to change the username", "error");
    setSaving(true);
    try {
      if (n !== curName) qc.setQueryData(["settings"], await api<Settings>("/settings", { method: "PUT", body: { em_name: n } }));
      if (e && e !== curEmail) await api("/auth/email", { method: "PUT", body: { email: e } });
      if (avatar !== curAvatar) await api("/auth/avatar", { method: "PUT", body: { image: avatar } });
      if (u !== curUser) {
        const r = await api<{ access_token: string; username: string }>("/auth/username", { method: "PUT", body: { username: u, password: pw } });
        await signIn(r.access_token, r.username);
      }
      await qc.invalidateQueries({ queryKey: ["me"] });
      toast("Profile saved", "success");
      setEditing(false);
    } catch (err) {
      toast((err as Error).message, "error");
      qc.invalidateQueries({ queryKey: ["me"] });
    } finally {
      setSaving(false);
    }
  };

  const deleteAccount = async () => {
    if (!delPw) return toast("Enter your password to delete the account", "error");
    setDeleting(true);
    try {
      await api("/auth/delete-account", { method: "POST", body: { password: delPw } });
      setDelOpen(false);
      setDelPw("");
      await signOut(); // signs out automatically
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setDeleting(false);
    }
  };

  const picture = editing ? avatar : curAvatar;

  return (
    <View style={styles.root}>
      <View style={[headerStyles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="settings-back-button" onPress={() => router.back()} hitSlop={8} style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="chevron-back" size={24} color={colors.onSurface} />
        </Pressable>
        <Text style={[headerStyles.title, { flex: 1, fontSize: 20 }]}>Profile</Text>
      </View>
      <ScrollView
        contentContainerStyle={{ paddingTop: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: (usesNativeTabs ? insets.bottom : 0) + 32 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <View style={styles.avatar} testID="profile-avatar">
            {picture ? (
              <Image source={{ uri: picture }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarText}>{shown.charAt(0).toUpperCase()}</Text>
            )}
          </View>
          {editing ? (
            <View style={styles.picRow}>
              <Pressable testID="profile-picture-change" onPress={pickPicture} hitSlop={8}>
                <Text style={styles.action}>{picture ? "Change picture" : "Add picture"}</Text>
              </Pressable>
              {picture ? (
                <Pressable testID="profile-picture-remove" onPress={() => setAvatar(null)} hitSlop={8}>
                  <Text style={[styles.action, { color: colors.error }]}>Remove</Text>
                </Pressable>
              ) : null}
            </View>
          ) : (
            <>
              <Text style={styles.name} testID="profile-name">
                {shown}
              </Text>
              <Text style={styles.username} testID="profile-username">
                {curUser}
              </Text>
            </>
          )}
        </View>

        {!editing ? (
          <>
            <Card style={{ paddingVertical: spacing.xs }}>
              <InfoRow icon="happy" title="Name" value={curName || "Not set"} testID="profile-view-name" />
              <InfoRow icon="person" title="Username" value={curUser} testID="profile-view-username" />
              <InfoRow icon="mail" title="Email" value={curEmail || "Not set"} testID="profile-view-email" />
              <InfoRow icon="key" title="Password" value="••••••••" last testID="profile-view-password" />
            </Card>
            <Button title="Edit profile" onPress={startEdit} testID="profile-edit-button" style={{ marginTop: spacing.xl }} />
            <Button title="Sign out" kind="secondary" onPress={signOut} testID="profile-signout-button" style={{ marginTop: spacing.md }} />
            <Pressable testID="profile-delete-button" onPress={() => setDelOpen(true)} style={styles.deleteLink} hitSlop={8}>
              <Text style={[styles.action, { color: colors.error }]}>Delete account</Text>
            </Pressable>
          </>
        ) : (
          <>
            <SectionTitle>Name</SectionTitle>
            <Card style={{ paddingVertical: spacing.xs }}>
              <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Anna" autoCapitalize="words" testID="profile-name-input" last />
            </Card>
            <Hint>{`Used in emergency texts and calls: "${name.trim() || "Name"}'s glucose is…"`}</Hint>

            <SectionTitle>Account</SectionTitle>
            <Card style={{ paddingVertical: spacing.xs }}>
              <Field label="Username" value={user} onChangeText={setUser} placeholder="At least 5 characters" testID="profile-username-input" last={user.trim() === curUser} />
              {user.trim() !== curUser && (
                <Field label="Password" value={pw} onChangeText={setPw} placeholder="Your current password" secureTextEntry testID="profile-username-password" last />
              )}
            </Card>
            <Hint>Letters, numbers, dots and underscores. To change the username, enter your current password.</Hint>

            <SectionTitle>Email</SectionTitle>
            <Card style={{ paddingVertical: spacing.xs }}>
              <Field label="Email" value={email} onChangeText={setEmail} placeholder="name@example.com" keyboardType="email-address" testID="profile-email-input" last />
            </Card>

            <SectionTitle>Password</SectionTitle>
            <Card style={{ paddingVertical: spacing.xs }}>
              <Pressable testID="profile-password-row" onPress={() => setPwOpen(true)} style={styles.row}>
                <Ionicons name="key" size={22} color={colors.muted} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>Password</Text>
                  <Text style={styles.rowSub}>••••••••</Text>
                </View>
                <Text style={styles.action}>Change</Text>
              </Pressable>
            </Card>

            <Button title="Save" onPress={save} loading={saving} testID="profile-save-button" style={{ marginTop: spacing.xl }} />
            <Button title="Cancel" kind="secondary" onPress={() => setEditing(false)} testID="profile-cancel-button" style={{ marginTop: spacing.md }} />
          </>
        )}
      </ScrollView>
      <PasswordSheet visible={pwOpen} onClose={() => setPwOpen(false)} />
      <Modal visible={delOpen} transparent animationType="fade" onRequestClose={() => setDelOpen(false)}>
        <View style={styles.scrim}>
          <View style={styles.dialog} testID="delete-account-dialog">
            <Text style={styles.dialogTitle}>Delete your account?</Text>
            <Text style={styles.dialogText}>
              Your readings, entries, settings and contacts are deleted forever, and you are signed out automatically. This can&apos;t be undone.
            </Text>
            <Card style={{ paddingVertical: spacing.xs, marginTop: spacing.md }}>
              <Field label="Password" value={delPw} onChangeText={setDelPw} placeholder="Your password" secureTextEntry testID="delete-account-password" last />
            </Card>
            <Button title="Delete account" kind="danger" onPress={deleteAccount} loading={deleting} testID="delete-account-confirm" style={{ marginTop: spacing.lg }} />
            <Button title="Cancel" kind="secondary" onPress={() => { setDelOpen(false); setDelPw(""); }} testID="delete-account-cancel" style={{ marginTop: spacing.sm }} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function InfoRow({ icon, title, value, last, testID }: { icon: "happy" | "person" | "mail" | "key"; title: string; value: string; last?: boolean; testID: string }) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={[styles.row, !last && styles.border]}>
      <Ionicons name={icon} size={22} color={colors.muted} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSub} testID={testID}>
          {value}
        </Text>
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  hero: { alignItems: "center", gap: spacing.xs, marginBottom: spacing.lg },
  avatar: { width: 96, height: 96, borderRadius: 48, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm, overflow: "hidden" },
  avatarImg: { width: 96, height: 96 },
  avatarText: { fontFamily: fonts.display, fontSize: 44, fontWeight: "700", color: c.onBrandPrimary },
  picRow: { flexDirection: "row", gap: spacing.xl },
  name: { fontFamily: fonts.display, fontSize: 26, fontWeight: "700", color: c.onSurface },
  username: { fontFamily: fonts.text, fontSize: 14, color: c.muted },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 60, paddingVertical: spacing.sm },
  border: { borderBottomWidth: 0.5, borderBottomColor: c.divider },
  rowTitle: { fontFamily: fonts.text, fontSize: 15, fontWeight: "600", color: c.onSurface },
  rowSub: { fontFamily: fonts.text, fontSize: 13, color: c.muted, marginTop: 2 },
  deleteLink: { alignItems: "center", marginTop: spacing.xl, paddingVertical: spacing.sm },
  scrim: { flex: 1, backgroundColor: c.scrim, justifyContent: "center", padding: spacing.lg },
  dialog: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg },
  dialogTitle: { fontFamily: fonts.display, fontSize: 22, fontWeight: "700", color: c.onSurface },
  dialogText: { fontFamily: fonts.text, fontSize: 14, color: c.onSurfaceTertiary, marginTop: spacing.sm },
  action: { fontFamily: fonts.text, fontSize: 15, fontWeight: "600", color: c.brandPrimary },
}));
