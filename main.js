const { app, BrowserWindow, ipcMain } = require("electron");
const { getLeaderboard } = require("./script/jira");

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  global.mainWindow = win;
  win.loadFile("index.html");
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Leaderboard operations
ipcMain.on("get-leaderboard", async (event) => {
  try {
    const leaderboardData = await getLeaderboard();
    event.reply("leaderboard-data", leaderboardData);
  } catch (error) {
    console.error("Error while fetching leaderboard data:", error);
    event.reply("leaderboard-data", []);
  }
});
