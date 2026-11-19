import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "@/src/api";
import { queryClient } from "@/src/query-client";
import { useAuth } from "@/src/auth";
import { useT } from "@/src/i18n";
import { emailPromptState } from "@/src/components/EmailPrompt";
import { Button } from "@/src/components/ui";
import { fonts, makeStyles, radius, spacing, useTheme } from "@/src/theme";

type Mode = "login" | "forgotPw" | "resetPw" | "forgotUser" | "codeUser" | "showUser" | "reg1" | "reg2" | "reg3";

const TERMS = [
  "GlucoShadow is not a medical device.",
  "GlucoShadow has not been tested or approved for medical use.",
  "GlucoShadow does not replace your official sensor application (such as Dexcom, Libre, Medtronic or Omnipod). You must keep the official application running, with its alarms enabled.",
  "Do not use this application for real-time decisions. Always rely on your official applications and systems before making any decision regarding your health and well-being.",
  "Readings, alarms and emergency messages may be delayed, inaccurate, or may fail to be delivered, for example because of a powered-off phone, lack of signal, a Bluetooth interruption or a server outage.",
  "The developer of this application may not be held responsible for any inconvenience caused directly or indirectly through its use.",
  "GlucoShadow is not affiliated with, endorsed by or approved by any sensor manufacturer.",
];
const validEmail = (v: string) => /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(v.trim());

export function LoginScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const { signIn } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newUser, setNewUser] = useState("");
  const [foundUser, setFoundUser] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [agreedMed, setAgreedMed] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const go = (m: Mode) => {
    setMode(m);
    setError("");
    setInfo("");
    setCode("");
    if (m === "login" || m === "reg1") {
      setPassword("");
      setConfirm("");
    }
  };

  const finish = async (r: { access_token: string; username: string }) => {
    await signIn(r.access_token, r.username, { askEmail: false });
    // fill the graph right away instead of waiting for the next background sync
    api("/sync", { method: "POST" })
      .then(() => queryClient.invalidateQueries())
      .catch(() => {});
  };

  const run = async (fn: () => Promise<void>) => {
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message.replace(/^Invalid settings: /, ""));
    } finally {
      setBusy(false);
    }
  };

  const checkUsername = (v: string): string => {
    if (/\s/.test(v)) return t("Username can't contain spaces.");
    if (v.trim().length < 5) return t("Username needs at least 5 characters.");
    if (!/^[A-Za-z0-9_.]+$/.test(v.trim())) return t("Username can use letters, numbers, dots and underscores.");
    return "";
  };
  const cleanName = () => name.replace(/\s+/g, " ").trim();

  const createAccount = (withEmail: string) =>
    run(async () => {
      await finish(
        await api("/auth/register", {
          method: "POST",
          body: { username: username.trim(), password, name: cleanName(), ...(withEmail ? { email: withEmail.trim() } : {}) },
        }),
      );
    });

  const submit = () => {
    const u = username.trim();
    switch (mode) {
      case "login":
        if (!u) return setError(t("Enter your username."));
        if (!password) return setError(t("Enter your password."));
        return run(async () => finish(await api("/auth/login", { method: "POST", body: { username: u, password } })));
      case "forgotPw":
        if (!u) return setError(t("Enter your username."));
        return run(async () => {
          const r = await api<{ message: string }>("/auth/forgot", { method: "POST", body: { username: u } });
          setMode("resetPw");
          setInfo(`${r.message} ${t("If no email was added to this account, the password can't be recovered.")}`);
        });
      case "resetPw":
        if (!/^\d{6}$/.test(code)) return setError(t("Enter the 6-digit code from the email."));
        if (password.length < 8) return setError(t("Password needs at least 8 characters."));
        if (password !== confirm) return setError(t("Passwords don't match."));
        return run(async () => finish(await api("/auth/reset", { method: "POST", body: { username: u, code, new_password: password } })));
      case "forgotUser":
        if (!validEmail(email)) return setError(t("Enter the email address you added to your account."));
        return run(async () => {
          const r = await api<{ message: string }>("/auth/forgot-username", { method: "POST", body: { email } });
          setMode("codeUser");
          setInfo(r.message);
        });
      case "codeUser":
        if (!/^\d{6}$/.test(code)) return setError(t("Enter the 6-digit code from the email."));
        return run(async () => {
          const r = await api<{ username: string }>("/auth/username-code", { method: "POST", body: { email, code } });
          setFoundUser(r.username);
          setNewUser("");
          setMode("showUser");
        });
      case "showUser": {
        // optional: choose a new username (the same code is used once more)
        const bad = checkUsername(newUser);
        if (bad) return setError(bad);
        return run(async () => {
          const r = await api<{ username: string }>("/auth/reset-username", { method: "POST", body: { email, code, new_username: newUser.trim() } });
          setUsername(r.username);
          setFoundUser(r.username);
          setNewUser("");
          setInfo(t("Username changed."));
        });
      }
      case "reg1": {
        if (cleanName().length < 3) return setError(t("Enter your name (at least 3 characters)."));
        const bad = checkUsername(username);
        if (bad) return setError(bad);
        if (password.length < 8) return setError(t("Password needs at least 8 characters."));
        if (password !== confirm) return setError(t("Passwords don't match."));
        return go("reg2");
      }
      case "reg2":
        if (!validEmail(email)) return setError(t("Enter a valid email address, or tap Skip."));
        return go("reg3");
      case "reg3":
        if (!agreed || !agreedMed) return setError(t("Please tick both boxes to continue."));
        return createAccount(email && validEmail(email) ? email : "");
    }
  };

  const titles: Record<Mode, string> = {
    login: t("Sign in to see your glucose."),
    forgotPw: t("Forgot your password? We'll email a code to the address on your account."),
    resetPw: t("Enter the code and choose a new password."),
    forgotUser: t("Forgot your username? Enter the email address you added to your account and we'll send a code."),
    codeUser: t("Enter the code we emailed you."),
    showUser: t("Your username"),
    reg1: t("Create your private account. Step 1 of 3"),
    reg2: t("Step 2 of 3 — recovery email"),
    reg3: t("Step 3 of 3 — before you start"),
  };
  const button: Record<Mode, string> = {
    login: t("Sign in"),
    forgotPw: t("Send code"),
    resetPw: t("Set new password"),
    forgotUser: t("Send code"),
    codeUser: t("Show my username"),
    showUser: t("Change my username"),
    reg1: t("Next"),
    reg2: t("Next"),
    reg3: t("Create account"),
  };
  const backOf: Partial<Record<Mode, Mode>> = { reg2: "reg1", reg3: "reg2", codeUser: "forgotUser" };
  const field = (props: React.ComponentProps<typeof TextInput> & { testID: string }) => (
    <TextInput placeholderTextColor={colors.muted} style={styles.input} {...props} />
  );

  return (
    <View style={styles.root}>
      <KeyboardAwareScrollView
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + spacing.xxxl, paddingBottom: insets.bottom + spacing.xl, paddingHorizontal: spacing.xl }}
      >
        <Text style={styles.brand}>GlucoShadow</Text>
        <Text style={styles.sub}>{titles[mode]}</Text>
        <View style={styles.card}>
          {(mode === "login" || mode === "forgotPw" || mode === "resetPw") &&
            field({
              testID: "auth-username-input",
              value: username,
              onChangeText: setUsername,
              placeholder: t("Username"),
              autoCapitalize: "none",
              autoCorrect: false,
              editable: mode !== "resetPw",
            })}

          {mode === "reg1" && (
            <>
              {field({ testID: "auth-name-input", value: name, onChangeText: setName, placeholder: t("Your name (3+ characters)"), autoCapitalize: "words" })}
              <Text style={styles.hint}>
                {t("Used in emergency messages: \"{name}'s glucose is…\"").replace("{name}", name.trim() || t("Name"))}
              </Text>
              {field({
                testID: "auth-username-input",
                value: username,
                onChangeText: setUsername,
                placeholder: t("Username (5+ characters, no spaces)"),
                autoCapitalize: "none",
                autoCorrect: false,
              })}
              <Text style={styles.hint}>{t("Letters, numbers, dots or underscores, no spaces.")}</Text>
            </>
          )}

          {(mode === "forgotUser" || mode === "reg2") &&
            field({
              testID: "auth-email-input",
              value: email,
              onChangeText: setEmail,
              placeholder: t("Email address"),
              autoCapitalize: "none",
              autoCorrect: false,
              keyboardType: "email-address",
            })}
          {mode === "reg2" && (
            <Text style={styles.hint}>
              {t("If you forget your username or password, we email a 6-digit code to this address. Without it there is no way back into your account.")}
              {"\n\n"}
              {t("You can add, change, or remove this recovery email anytime later in Settings.")}
            </Text>
          )}

          {info ? (
            <Text style={styles.info} testID="auth-info">
              {info}
            </Text>
          ) : null}

          {(mode === "resetPw" || mode === "codeUser") &&
            field({
              testID: "auth-code-input",
              value: code,
              onChangeText: (v: string) => setCode(v.replace(/\D/g, "").slice(0, 6)),
              placeholder: t("6-digit code"),
              keyboardType: "number-pad",
              style: [styles.input, styles.code],
            })}

          {mode === "showUser" && (
            <>
              <Text style={styles.found} testID="auth-found-username">
                {foundUser}
              </Text>
              {field({
                testID: "auth-new-username-input",
                value: newUser,
                onChangeText: setNewUser,
                placeholder: t("New username (optional)"),
                autoCapitalize: "none",
                autoCorrect: false,
              })}
            </>
          )}

          {(mode === "login" || mode === "resetPw" || mode === "reg1") &&
            field({
              testID: "auth-password-input",
              value: password,
              onChangeText: setPassword,
              placeholder: mode === "login" ? t("Password") : mode === "resetPw" ? t("New password (8+ characters)") : t("Password (8+ characters)"),
              secureTextEntry: true,
            })}
          {(mode === "resetPw" || mode === "reg1") &&
            field({ testID: "auth-confirm-input", value: confirm, onChangeText: setConfirm, placeholder: t("Repeat password"), secureTextEntry: true })}

          {mode === "reg3" && (
            <View style={styles.terms} testID="auth-terms">
              {TERMS.map((term) => (
                <Text key={term} style={styles.termsText}>
                  {"•  "}
                  {t(term)}
                </Text>
              ))}
            </View>
          )}
          {mode === "reg3" && (
            <>
              <Pressable testID="auth-agree" onPress={() => setAgreed((v) => !v)} style={styles.agree} accessibilityRole="checkbox" accessibilityState={{ checked: agreed }}>
                <View style={[styles.box, agreed && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}>
                  {agreed ? <Text style={styles.tick}>✓</Text> : null}
                </View>
                <Text style={styles.agreeText}>{t("I have read and understood the above, and I agree. I acknowledge that this application has not been tested for medical purposes.")}</Text>
              </Pressable>
              <Pressable testID="auth-agree-medical" onPress={() => setAgreedMed((v) => !v)} style={styles.agree} accessibilityRole="checkbox" accessibilityState={{ checked: agreedMed }}>
                <View style={[styles.box, agreedMed && { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary }]}>
                  {agreedMed ? <Text style={styles.tick}>✓</Text> : null}
                </View>
                <Text style={[styles.agreeText, { fontWeight: "700" }]}>{t("I agree: NOT FOR ANY MEDICAL USE.")}</Text>
              </Pressable>
            </>
          )}

          {error ? (
            <Text style={styles.error} testID="auth-error">
              {error}
            </Text>
          ) : null}
          <Button title={button[mode]} onPress={submit} loading={busy} testID="auth-submit-button" />

          {mode === "reg2" && (
            <Pressable testID="auth-skip-email" onPress={() => {
                emailPromptState.skippedNow = true;
                setEmail("");
                go("reg3");
              }} style={styles.forgot}>
              <Text style={styles.forgotText}>{t("Skip")}</Text>
            </Pressable>
          )}
          {mode === "showUser" && (
            <Pressable testID="auth-back-signin" onPress={() => go("login")} style={styles.forgot}>
              <Text style={styles.forgotText}>{t("Back to sign in")}</Text>
            </Pressable>
          )}
          {mode === "login" && (
            <View style={styles.forgotRow}>
              <Pressable testID="auth-forgot-username-link" onPress={() => go("forgotUser")} style={styles.forgot}>
                <Text style={styles.forgotText}>{t("Forgot username?")}</Text>
              </Pressable>
              <Pressable testID="auth-forgot-link" onPress={() => go("forgotPw")} style={styles.forgot}>
                <Text style={styles.forgotText}>{t("Forgot password?")}</Text>
              </Pressable>
            </View>
          )}
          {mode === "resetPw" && (
            <Pressable testID="auth-resend-link" onPress={() => go("forgotPw")} style={styles.forgot}>
              <Text style={styles.forgotText}>{t("Didn't get it? Send a new code")}</Text>
            </Pressable>
          )}
          {mode === "codeUser" && (
            <Pressable testID="auth-resend-user-link" onPress={() => go("forgotUser")} style={styles.forgot}>
              <Text style={styles.forgotText}>{t("Didn't get it? Send a new code")}</Text>
            </Pressable>
          )}
        </View>

        {mode === "login" ? (
          <Pressable testID="auth-switch-mode" onPress={() => go("reg1")} style={styles.create}>
            <Text style={styles.createText}>{t("Create account")}</Text>
          </Pressable>
        ) : (
          <Pressable testID="auth-switch-mode" onPress={() => go(backOf[mode] ?? "login")} style={styles.switch}>
            <Text style={styles.switchText}>{backOf[mode] ? t("Back") : t("Back to sign in")}</Text>
          </Pressable>
        )}
      </KeyboardAwareScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  brand: { fontFamily: fonts.display, fontSize: 44, fontWeight: "700", color: c.onSurface },
  sub: { fontFamily: fonts.text, fontSize: 16, lineHeight: 23, color: c.onSurfaceTertiary, marginTop: spacing.xs, marginBottom: spacing.xl },
  card: { backgroundColor: c.surfaceSecondary, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  input: {
    height: 52,
    borderRadius: radius.md,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.border,
    paddingHorizontal: spacing.lg,
    fontFamily: fonts.text,
    fontSize: 16,
    color: c.onSurface,
  },
  code: { fontFamily: fonts.display, fontSize: 24, letterSpacing: 8, textAlign: "center" },
  hint: { fontFamily: fonts.text, fontSize: 12, color: c.onSurfaceTertiary, marginTop: -spacing.xs },
  info: { fontFamily: fonts.text, fontSize: 14, lineHeight: 20, color: c.onSurfaceTertiary },
  error: { fontFamily: fonts.text, fontSize: 14, color: c.error },
  forgot: { alignSelf: "center", minHeight: 44, justifyContent: "center" },
  forgotText: { fontFamily: fonts.text, fontSize: 14, fontWeight: "600", color: c.onSurfaceTertiary },
  forgotRow: { flexDirection: "row", justifyContent: "space-between" },
  found: { fontFamily: fonts.display, fontSize: 26, fontWeight: "700", color: c.onSurface, textAlign: "center", paddingVertical: spacing.sm },
  terms: { gap: spacing.sm, backgroundColor: c.surface, borderRadius: radius.md, padding: spacing.md },
  termsText: { fontFamily: fonts.text, fontSize: 14, lineHeight: 20, color: c.onSurface },
  agree: { flexDirection: "row", alignItems: "center", gap: spacing.md, minHeight: 48 },
  box: { width: 26, height: 26, borderRadius: 6, borderWidth: 2, borderColor: c.border, alignItems: "center", justifyContent: "center" },
  tick: { color: "#fff", fontWeight: "700", fontSize: 16 },
  agreeText: { flex: 1, fontFamily: fonts.text, fontSize: 15, lineHeight: 21, color: c.onSurface },
  create: { alignSelf: "stretch", minHeight: 54, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", marginTop: spacing.xl, backgroundColor: c.brandTertiary },
  createText: { fontFamily: fonts.text, fontSize: 18, fontWeight: "800", color: c.onBrandTertiary },
  switch: { alignSelf: "center", minHeight: 44, justifyContent: "center", marginTop: spacing.lg },
  switchText: { fontFamily: fonts.text, fontSize: 15, fontWeight: "700", color: c.onBrandTertiary },
}));
