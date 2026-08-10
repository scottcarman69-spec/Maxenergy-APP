import React, { useCallback, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Linking, Platform } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import { api } from "@/src/api";
import { colors, spacing, radius, font } from "@/src/theme";

type Result = { ok: boolean; already?: boolean; member_name?: string; class_name?: string; when?: string; error?: string };

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
      setResult({ ok: true, already: r.already, member_name: r.member_name, class_name: r.class_name, when: r.when });
    } catch (e: any) {
      setResult({ ok: false, error: e?.message || "Could not check in." });
    }
    setChecking(false);
  }, [scanning, checking]);

  const scanAgain = () => {
    lastRef.current = "";
    setResult(null);
    setScanning(true);
  };

  const Header = (
    <View style={styles.header}>
      <Pressable testID="scan-back" onPress={() => router.back()} hitSlop={12}>
        <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
      </Pressable>
      <Text style={styles.headerTitle}>Scan Check-In</Text>
      <View style={{ width: 26 }} />
    </View>
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
          <View style={[styles.resultOverlay, { backgroundColor: result.ok ? "rgba(22,163,74,0.94)" : "rgba(220,38,38,0.94)" }]}>
            <Ionicons name={result.ok ? (result.already ? "information-circle" : "checkmark-circle") : "close-circle"} size={72} color="#fff" />
            {result.ok ? (
              <>
                <Text style={styles.resultTitle}>{result.already ? "Already checked in" : "Checked in!"}</Text>
                <Text style={styles.resultName}>{result.member_name}</Text>
                <Text style={styles.resultMeta}>{result.class_name}{result.when ? ` · ${result.when}` : ""}</Text>
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
  againBtn: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#fff", paddingHorizontal: spacing.xl, paddingVertical: 14, borderRadius: radius.pill, marginTop: spacing.xl },
  againText: { color: colors.surface, fontWeight: "900", fontSize: 15 },
  centerBox: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  infoTitle: { color: colors.onSurface, fontSize: 20, fontWeight: "900", marginTop: spacing.sm },
  infoText: { color: colors.onSurfaceSecondary, fontSize: 14, textAlign: "center", lineHeight: 21 },
  primaryBtn: { backgroundColor: colors.brand, paddingVertical: 15, paddingHorizontal: spacing.xl, borderRadius: radius.md, alignItems: "center", marginTop: spacing.md },
  primaryBtnText: { color: colors.onBrand, fontFamily: font.display, fontSize: 15, letterSpacing: 1 },
});
