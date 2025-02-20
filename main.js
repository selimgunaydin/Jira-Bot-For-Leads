const { app, BrowserWindow, ipcMain } = require("electron");
const { exec } = require("child_process");
const {
  autoAssignTask,
  checkAndAssignSpecificTask,
  getMonthlyDoneTasks,
  getMonthlyAllTasks,
  getLeaderboard,
} = require("./script/jira");

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

ipcMain.on("start-task-assignment", async (event) => {
  try {
    await autoAssignTask();
    event.reply("task-assignment-complete", { success: true });
  } catch (error) {
    event.reply("task-assignment-complete", {
      success: false,
      error: error.message,
    });
  }
});

ipcMain.on("assign-specific-task", async (event, taskId) => {
  try {
    const result = await checkAndAssignSpecificTask(taskId);
    event.reply("specific-task-assignment-complete", result);
  } catch (error) {
    event.reply("specific-task-assignment-complete", {
      success: false,
      error: error.message,
    });
  }
});

ipcMain.on("get-monthly-done-tasks", async (event) => {
  try {
    const tasks = await getMonthlyDoneTasks();
    event.reply("monthly-done-tasks", tasks);
  } catch (error) {
    console.error("Tamamlanan taskları getirirken hata:", error);
    event.reply("monthly-done-tasks", []);
  }
});

ipcMain.on("get-monthly-all-tasks", async (event) => {
  try {
    const tasks = await getMonthlyAllTasks();
    event.reply("monthly-all-tasks", tasks);
  } catch (error) {
    console.error("Tüm taskları getirirken hata:", error);
    event.reply("monthly-all-tasks", []);
  }
});

// Chrome'da link açma işlevi
ipcMain.on("open-in-chrome", (event, url) => {
  // MacOS için Chrome açma komutu
  const command = `open -a "Google Chrome" "${url}"`;

  exec(command, (error) => {
    if (error) {
      console.error("Chrome açılırken hata oluştu:", error);
      // Hata durumunda varsayılan tarayıcıda aç
      exec(`open "${url}"`);
    }
  });
});

// Leaderboard işlemleri
ipcMain.on("get-leaderboard", async (event) => {
  try {
    const leaderboardData = await getLeaderboard();
    event.reply("leaderboard-data", leaderboardData);
  } catch (error) {
    console.error("Leaderboard verileri alınırken hata:", error);
    event.reply("leaderboard-data", []);
  }
});
