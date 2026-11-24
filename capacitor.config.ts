import type { CapacitorConfig } from "@capacitor/cli";

// The Android app is a shell that opens the hosted web app.
// Set APP_URL (e.g. https://school.example.com) when syncing/building.
const appUrl = process.env.APP_URL;

const config: CapacitorConfig = {
  appId: "ke.co.ndeb.schooladmin",
  appName: "NDEB School Admin",
  // Fallback page shown only if the server cannot be reached.
  webDir: "www",
  server: {
    ...(appUrl ? { url: appUrl, cleartext: appUrl.startsWith("http://") } : {}),
    androidScheme: "https",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: "#1e40af",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
    },
    StatusBar: {
      style: "LIGHT",
      backgroundColor: "#1e40af",
    },
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
