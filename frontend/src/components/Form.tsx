import React from "react";
import { View, Text, TextInput, Pressable, StyleSheet, TextInputProps } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radius } from "@/src/theme";

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function Field({
  label,
  testID,
  ...rest
}: { label: string; testID?: string } & TextInputProps) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        testID={testID}
        placeholderTextColor={colors.onSurfaceSecondary}
        style={styles.input}
        {...rest}
      />
    </View>
  );
}

export function Checkbox({
  label,
  value,
  onToggle,
  testID,
}: {
  label: string;
  value: boolean;
  onToggle: () => void;
  testID?: string;
}) {
  return (
    <Pressable testID={testID} style={styles.checkRow} onPress={onToggle}>
      <View style={[styles.checkBox, value && styles.checkBoxOn]}>
        {value && <Ionicons name="checkmark" size={14} color={colors.onBrand} />}
      </View>
      <Text style={styles.checkLabel}>{label}</Text>
    </Pressable>
  );
}

export function Segmented({
  options,
  value,
  onChange,
  testIDPrefix,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  testIDPrefix?: string;
}) {
  return (
    <View style={styles.segWrap}>
      {options.map((o) => {
        const active = o === value;
        return (
          <Pressable
            key={o}
            testID={testIDPrefix ? `${testIDPrefix}-${o.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : undefined}
            style={[styles.segItem, active && styles.segItemOn]}
            onPress={() => onChange(o)}
          >
            <Text style={[styles.segText, active && styles.segTextOn]}>{o}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function YesNo({
  label,
  value,
  onChange,
  testID,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
  testID?: string;
}) {
  return (
    <View style={styles.yesNoRow}>
      <Text style={styles.yesNoLabel}>{label}</Text>
      <View style={styles.yesNoBtns}>
        <Pressable
          testID={testID ? `${testID}-yes` : undefined}
          style={[styles.ynBtn, value === true && styles.ynYes]}
          onPress={() => onChange(true)}
        >
          <Text style={[styles.ynText, value === true && { color: colors.onBrand }]}>Yes</Text>
        </Pressable>
        <Pressable
          testID={testID ? `${testID}-no` : undefined}
          style={[styles.ynBtn, value === false && styles.ynNo]}
          onPress={() => onChange(false)}
        >
          <Text style={[styles.ynText, value === false && { color: colors.onSurface }]}>No</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    color: colors.brand,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1.5,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  fieldWrap: { marginBottom: spacing.md },
  label: { color: colors.onSurfaceSecondary, fontSize: 12, fontWeight: "700", marginBottom: 6 },
  input: {
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.onSurface,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: radius.md,
    fontSize: 15,
  },
  checkRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: 8 },
  checkBox: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  checkBoxOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  checkLabel: { color: colors.onSurface, fontSize: 14, flex: 1 },
  segWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  segItem: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segItemOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  segText: { color: colors.onSurfaceSecondary, fontWeight: "700", fontSize: 13 },
  segTextOn: { color: colors.onBrand },
  yesNoRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, gap: spacing.md },
  yesNoLabel: { color: colors.onSurface, fontSize: 14, flex: 1 },
  yesNoBtns: { flexDirection: "row", gap: spacing.sm },
  ynBtn: {
    width: 52,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceSecondary,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
  },
  ynYes: { backgroundColor: colors.brand, borderColor: colors.brand },
  ynNo: { backgroundColor: colors.surfaceTertiary, borderColor: colors.borderStrong },
  ynText: { color: colors.onSurfaceSecondary, fontWeight: "800", fontSize: 13 },
});
