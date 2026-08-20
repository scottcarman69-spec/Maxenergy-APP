import React, { useCallback, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Linking, Platform } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { api } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";
import ScreenHeader from "@/src/components/ScreenHeader";

type Result = { ok: boolean; already?: boolean; needs_confirm?: boolean; already_today?: number; passes_left?: number; repeat_today?: boolean; member_name?: string; class_name?: string; when?: string; error?: string; child_name?: string; child_age?: number };

export default function AdminScan() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(true);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const lastRef = useRef<string>("");

  const onScanned = useCallback(async ({ data }: { data: string }) => {
    if (!scanning || checking) return;
    if (data === lastRef.current) return;
    lastRef.current = data;
    setScanning(false);
    setChecking(true);
    try {
      const r = await api.scanCheckin(data);
      setResult({ ok: true, already: r.already, needs_confirm: r.needs_confirm, already_today: r.already_today, passes_left: r.passes_left, repeat_today: r.repeat_today, member_name: r.member_name, class_name: r.class_name, when: r.when, child_name: r.child_name, child_age: r.child_age });
    } catch (e: any) {
      setResult({ ok: false, error: e?.message || "Could not check in." });
    }
    setChecking(false);
  }, [scanning, checking]);

  // Staff confirmed a repeat walk-in (extra class / friend or guest) — re-scan
  // the same code with confirm=true so the backend deducts another class pass.
  const confirmRepeat = useCallback(async () => {
    if (!lastRef.current) return;
    setChecking(true);
    try {
      const r = await api.scanCheckin(lastRef.current, true);
      setResult({ ok: true, already: r.already, passes_left: r.passes_left, repeat_today: r.repeat_today, member_name: r.member_name, class_name: r.class_name, when: r.when });
    } catch (e: any) {
      setResult({ ok: false, error: e?.message || "Could not check in." });
    }
    setChecking(false);
  }, []);

  const scanAgain = () => {
    lastRef.current = "";
    setResult(null);
    setScanning(true);
  };

  const Header = (
    <ScreenHeader title="Scan Check-In" backTestID="scan-back" fallback="/admin" />
  );

  // Web / no camera support
  if (Platform.OS === "web") {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        {Header}
        <View style={styles.centerBox}>
          <Ionicons name="phone-portrait-outline" size={48} color={colors.onSurfaceSecondary} />
          <Text style={styles.infoTitle}>Use a phone to scan</Text>
          <Text style={styles.infoText}>QR scanning uses the camera and works on the iOS/Android app. Open this screen on a staff phone at the door.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!permission) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        {Header}
        <ActivityIndicator color={colors.brand} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.root} edges={["top"]}>
        {Header}
        <View style={styles.centerBox}>
          <Ionicons name="camera-outline" size={48} color={colors.brand} />
          <Text style={styles.infoTitle}>Camera access needed</Text>
          <Text style={styles.infoText}>To scan member QR codes and check them in, please allow camera access.</Text>
          {permission.canAskAgain ? (
            <Pressable testID="scan-grant" style={styles.primaryBtn} onPress={requestPermission}>
              <Text style={styles.primaryBtnText}>ALLOW CAMERA</Text>
            </Pressable>
          ) : (
            <Pressable testID="scan-settings" style={styles.primaryBtn} onPress={() => Linking.openSettings()}>
              <Text style={styles.primaryBtnText}>OPEN SETTINGS</Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      {Header}
      <View style={styles.cameraWrap}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={scanning ? onScanned : undefined}
        />
        {/* Scan frame overlay */}
        {!result && (
          <View style={styles.overlay} pointerEvents="none">
            <View style={styles.frame} />
            <Text style={styles.scanHint}>{checking ? "Checking…" : "Point at the member's QR code"}</Text>
          </View>
        )}

        {result && (
          <View style={[styles.resultOverlay, { backgroundColor: result.needs_confirm ? "rgba(217,119,6,0.95)" : result.ok ? "rgba(22,163,74,0.94)" : "rgba(220,38,38,0.94)" }]}>
            {result.needs_confirm ? (
              <>
                <Ionicons name="alert-circle" size={72} color="#fff" />
                <Text style={styles.resultTitle}>Already checked in today</Text>
                <Text style={styles.resultName}>{result.member_name}</Text>
                <Text style={styles.resultMeta}>
                  {result.member_name} already used {result.already_today} class pass{result.already_today === 1 ? "" : "es"} today.
                </Text>
                <Text style={[styles.resultMeta, { marginTop: 8, fontWeight: "800" }]}>
                  Checking into another class, or bringing a friend/guest?
                </Text>
                <Text style={[styles.resultMeta, { opacity: 0.9 }]}>
                  Confirming will use another class pass{typeof result.passes_left === "number" ? ` (${result.passes_left} left)` : ""}.
                </Text>
                <Pressable testID="scan-confirm-repeat" style={styles.confirmBtn} onPress={confirmRepeat} disabled={checking}>
                  {checking ? <ActivityIndicator color={colors.surface} /> : (
                    <>
                      <Ionicons name="checkmark-circle-outline" size={18} color={colors.surface} />
                      <Text style={styles.againText}>Yes — use another pass</Text>
                    </>
                  )}
                </Pressable>
                <Pressable testID="scan-cancel-repeat" style={styles.cancelBtn} onPress={scanAgain} disabled={checking}>
                  <Text style={styles.cancelText}>No, cancel</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Ionicons name={result.ok ? (result.already ? "information-circle" : "checkmark-circle") : "close-circle"} size={72} color="#fff" />
                {result.ok ? (
                  <>
                    <Text style={styles.resultTitle}>{result.already ? "Already checked in" : "Checked in!"}</Text>
                    <Text style={styles.resultName}>{result.member_name}</Text>
                    <Text style={styles.resultMeta}>{result.class_name}{result.when ? ` · ${result.when}` : ""}</Text>
                    {(result.child_name || typeof result.child_age === "number") && (
                      <View testID="scan-child" style={styles.childBadge}>
                        <Ionicons name="body" size={16} color="#fff" />
                        <Text style={styles.childBadgeText}>
                          Attending: {result.child_name || "Child"}{typeof result.child_age === "number" ? ` · age ${result.child_age}` : ""}
                        </Text>
                      </View>
                    )}
                  </>
                ) : (
                  <>
                    <Text style={styles.resultTitle}>Not checked in</Text>
                    <Text style={styles.resultMeta}>{result.error}</Text>
                  </>
                )}
                <Pressable testID="scan-again" style={styles.againBtn} onPress={scanAgain}>
                  <Ionicons name="scan-outline" size={18} color={colors.onSurface} />
                  <Text style={styles.againText}>Scan another</Text>
                </Pressable>
              </>
            )}
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  headerTitle: { color: colors.onSurface, fontSize: 17, fontWeight: "800" },
  cameraWrap: { flex: 1, position: "relative" },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: spacing.xl },
  frame: { width: 240, height: 240, borderRadius: 24, borderWidth: 3, borderColor: colors.brand, backgroundColor: "transparent" },
  scanHint: { color: "#fff", fontSize: 15, fontWeight: "700", backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.pill },
  resultOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.sm },
  resultTitle: { color: "#fff", fontSize: 26, fontFamily: font.display, marginTop: spacing.md },
  resultName: { color: "#fff", fontSize: 22, fontWeight: "900", marginTop: 4 },
  resultMeta: { color: "#fff", fontSize: 15, fontWeight: "600", textAlign: "center", marginTop: 2, opacity: 0.95 },
  childBadge: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(0,0,0,0.28)", paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.pill, marginTop: spacing.md },
  childBadgeText: { color: "#fff", fontSize: 16, fontWeight: "900" },
  againBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fff", paddingHorizontal: spacing.xl, paddingVertical: 14, borderRadius: radius.pill, marginTop: spacing.xl },
  confirmBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#fff", paddingHorizontal: spacing.xl, paddingVertical: 14, borderRadius: radius.pill, marginTop: spacing.xl, minWidth: 240 },
  cancelBtn: { paddingHorizontal: spacing.xl, paddingVertical: 12, borderRadius: radius.pill, borderWidth: 1.5, borderColor: "rgba(255,255,255,0.85)", marginTop: spacing.sm },
  cancelText: { color: "#fff", fontWeight: "900", fontSize: 15 },
  againText: { color: colors.surface, fontWeight: "900", fontSize: 15 },
  centerBox: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  infoTitle: { color: colors.onSurface, fontSize: 20, fontWeight: "900", marginTop: spacing.sm },
  infoText: { color: colors.onSurfaceSecondary, fontSize: 14, textAlign: "center", lineHeight: 21 },
  primaryBtn: { backgroundColor: colors.brand, paddingVertical: 15, paddingHorizontal: spacing.xl, borderRadius: radius.md, alignItems: "center", marginTop: spacing.md },
  primaryBtnText: { color: colors.onBrand, fontFamily: font.display, fontSize: 15, letterSpacing: 1 },
});
