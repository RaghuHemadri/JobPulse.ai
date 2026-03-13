const { app, BrowserWindow, shell } = require("electron");
const path = require("path");

const APP_PORT = process.env.PORT || "5123";
process.env.PORT = APP_PORT;
process.env.NODE_ENV = "production";

function startServer() {
  const serverEntrypoint = path.resolve(__dirname, "..", "dist", "index.cjs");
  // The server bootstraps immediately when required.
  require(serverEntrypoint);
}

async function waitForServer(url, attempts = 80) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch (_err) {
      // Server is still starting.
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    autoHideMenuBar: true,
    title: "JobPulse",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  const baseUrl = `http://127.0.0.1:${APP_PORT}`;
  const healthy = await waitForServer(`${baseUrl}/api/settings`);
  await mainWindow.loadURL(healthy ? baseUrl : `${baseUrl}`);
}

app.whenReady().then(async () => {
  startServer();
  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow().catch(console.error);
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
