import { useState } from "react";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { LANGUAGES, setLanguage, t, useHasChosenLanguage, useLanguageLoaded } from "@/src/i18n";
import { fonts, makeStyles, radius, spacing } from "@/src/theme";
import { Button } from "./ui";

/** Shown once, before anything else, the very first time the app runs on this phone. */
export function LanguageGate({ children }: { children: ReactNode }) {
  const loaded = useLanguageLoaded();
  const chosen = useHasChosenLanguage();
  if (!loaded) return null;
  if (!chosen) return <LanguagePicker />;
  return <>{children}</>;
}

function LanguagePicker() {
  const styles = useStyles();
  // What's tapped so far, previewed on this screen in its own language; nothing is saved
  // until Continue, so the picker itself shows live in whichever language is selected.
  const [picked, setPicked] = useState<(typeof LANGUAGES)[number]["value"]>("en");
  const tr = (key: string) => t(key, picked);
  return (
    <View style={styles.root} testID="language-picker">
      <Text style={styles.title}>{tr("Welcome to GlucoShadow")}</Text>
      <Text style={styles.sub}>{tr("Choose your language")}</Text>
      <View style={{ marginTop: spacing.xl, gap: spacing.sm, width: "100%" }}>
        {LANGUAGES.map((l) => (
          <Pressable key={l.value} testID={`language-option-${l.value}`} onPress={() => setPicked(l.value)} style={[styles.option, picked === l.value && styles.optionOn]}>
            <Text style={[styles.optionText, picked === l.value && styles.optionTextOn]}>{l.label}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={[styles.sub, { marginTop: spacing.lg }]}>{tr("You can change this later in Settings.")}</Text>
      <Button title={tr("Continue")} onPress={() => setLanguage(picked)} testID="language-continue-button" style={{ marginTop: spacing.xl, width: "100%" }} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, backgroundColor: c.surface },
  title: { fontFamily: fonts.display, fontSize: 24, fontWeight: "700", color: c.onSurface, textAlign: "center" },
  sub: { fontFamily: fonts.text, fontSize: 14, color: c.muted, textAlign: "center", marginTop: spacing.sm },
  option: { height: 52, borderRadius: radius.md, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: c.border },
  optionOn: { backgroundColor: c.brandSecondary, borderColor: c.brandPrimary },
  optionText: { fontFamily: fonts.text, fontSize: 16, fontWeight: "700", color: c.onSurface },
  optionTextOn: { color: c.onBrandSecondary },
}));
