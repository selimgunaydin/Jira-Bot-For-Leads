const axios = require("axios");
const { createLogger, transports, format } = require("winston");
const { app, BrowserWindow, ipcMain } = require("electron");
const Transport = require("winston-transport");

class ElectronTransport extends Transport {
  constructor(opts) {
    super(opts);
  }

  log(info, callback) {
    setImmediate(() => {
      this.emit("logged", info);
    });

    const message = `[${info.timestamp}] ${info.level}: ${info.message}\n`;
    if (global.mainWindow) {
      global.mainWindow.webContents.send("log-message", message);
    }

    callback();
  }
}

const logger = createLogger({
  level: "debug",
  format: format.combine(
    format.colorize(),
    format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    format.printf(
      ({ timestamp, level, message }) => `[${timestamp}] ${level}: ${message}`
    )
  ),
  transports: [new transports.Console(), new ElectronTransport()],
});

let userCount = 0;
let JIRA_BASE_URL;
let EMAIL;
let API_TOKEN;
let PROJECT_KEY = "S1";
let TASK_STATUS = "Selected for Development";
let EXCLUDED_EMAILS = "";

ipcMain.on("update-config", (event, config) => {
  JIRA_BASE_URL = config.JIRA_BASE_URL;
  EMAIL = config.EMAIL;
  API_TOKEN = config.API_TOKEN;
  PROJECT_KEY = config.PROJECT_KEY || "S1";
  TASK_STATUS = config.TASK_STATUS || "Selected for Development";
  EXCLUDED_EMAILS = config.EXCLUDED_EMAILS || "";
  logger.info("---- Konfigürasyon güncellendi ----");
  logger.info(`JIRA_BASE_URL: ${JIRA_BASE_URL}`);
  logger.info(`EMAIL: ${EMAIL}`);
  logger.info(`API_TOKEN: ********`);
  logger.info(`PROJECT_KEY: ${PROJECT_KEY}`);
  logger.info(`TASK_STATUS: ${TASK_STATUS}`);
  logger.info(`EXCLUDED_EMAILS: ${EXCLUDED_EMAILS}`);
  logger.info("---- Konfigürasyon güncellendi ----");
});

async function getProjectUsers() {
  userCount++;
  try {
    if (userCount === 1) {
      logger.info("Proje kullanıcıları yükleniyor (Task Assignment)");
    } else {
      logger.info(`Proje kullanıcıları yükleniyor (Leaderboard)`);
    }
    // Son 3 ayda projede aktif olan kullanıcıları bulmak için JQL sorgusu
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 1);

    const jqlQuery = `project = "${PROJECT_KEY}" AND assignee IS NOT EMPTY AND updated >= "${
      threeMonthsAgo.toISOString().split("T")[0]
    }"`;

    // Önce son 3 ayda aktif olan taskları çek
    const tasksResponse = await axios.get(
      `${JIRA_BASE_URL}/rest/api/3/search?jql=${encodeURIComponent(
        jqlQuery
      )}&maxResults=100`,
      {
        auth: { username: EMAIL, password: API_TOKEN },
      }
    );

    // Task'lardan benzersiz kullanıcı ID'lerini çıkar
    const activeUserIds = new Set();
    tasksResponse.data.issues.forEach((issue) => {
      if (issue.fields.assignee && issue.fields.assignee.accountId) {
        activeUserIds.add(issue.fields.assignee.accountId);
      }
    });

    // Hariç tutulacak e-postaları diziye çevir ve boşlukları temizle
    const excludedEmailList = EXCLUDED_EMAILS
      ? EXCLUDED_EMAILS.split(/[\n\r]+/).map(email => email.trim().toLowerCase()).filter(email => email.length > 0)
      : [];

    // Aktif kullanıcıların detaylarını çek
    const activeUsers = [];
    for (const accountId of activeUserIds) {
      try {
        const userResponse = await axios.get(
          `${JIRA_BASE_URL}/rest/api/3/user?accountId=${accountId}`,
          {
            auth: { username: EMAIL, password: API_TOKEN },
          }
        );

        const user = userResponse.data;
        if (
          user.active &&
          !user.displayName.includes("addon") &&
          !user.displayName.toLowerCase().includes("bot") &&
          !user.displayName.toLowerCase().includes("system") &&
          !excludedEmailList.includes(user.emailAddress.toLowerCase())
        ) {
          activeUsers.push(user);
        }
      } catch (error) {
        logger.error(
          `Kullanıcı detayları çekilemedi (${accountId}): ${error.message}`
        );
      }
    }
    if (userCount === 1) {
      logger.info(`Toplam ${activeUsers.length} aktif kullanıcı bulundu (Task Assignment)`);
    } else {
      logger.info(`Toplam ${activeUsers.length} aktif kullanıcı bulundu (Leaderboard)`);
    }
    return activeUsers;
  } catch (error) {
    logger.error(
      `Hata oluştu (kullanıcı çekme): ${
        error.response ? JSON.stringify(error.response.data) : error.message
      }`
    );
    return [];
  }
}

async function getUserAllTasks(accountId) {
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 2);
  const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const jqlQuery = `project = "${PROJECT_KEY}" 
    AND assignee = ${accountId}
    AND updated >= "${firstDayOfMonth.toISOString().split("T")[0]}" 
    AND updated <= "${lastDayOfMonth.toISOString().split("T")[0]}" 
    ORDER BY updated DESC`;

  try {
    const response = await axios.get(
      `${JIRA_BASE_URL}/rest/api/3/search?jql=${encodeURIComponent(
        jqlQuery
      )}&maxResults=100`,
      {
        auth: { username: EMAIL, password: API_TOKEN },
      }
    );
    return response.data.issues;
  } catch (error) {
    logger.error(
      `Hata oluştu (kullanıcı tüm taskları çekme): ${
        error.response ? JSON.stringify(error.response.data) : error.message
      }`
    );
    return [];
  }
}

async function calculateLeaderboard() {
  const users = await getProjectUsers();
  logger.info("Leaderboard hesaplanıyor...");
  const leaderboardData = [];

  for (const user of users) {
    const allTasks = await getUserAllTasks(user.accountId);
    let totalPoints = 0;
    let allTaskTotalPoint = 0;
    let completedTaskCount = 0;

    for (const task of allTasks) {
      const storyPoints = task.fields.customfield_10028;
      if (storyPoints && task.fields.status.name === "Done") {
        totalPoints += storyPoints;
        completedTaskCount++;
      }
    }

    for (const task of allTasks) {
      const storyPoints = task.fields.customfield_10028;
      if (storyPoints) {
        allTaskTotalPoint += storyPoints;
      }
    }

    leaderboardData.push({
      displayName: user.displayName,
      email: user.emailAddress,
      accountId: user.accountId,
      avatarUrl: user.avatarUrls["48x48"],
      totalPoints,
      completedTaskCount,
      totalTaskCount: allTasks.length,
      allTaskTotalPoint,
      tasks: allTasks.map((t) => ({
        key: t.key,
        summary: t.fields.summary,
        points: t.fields.customfield_10028 || 0,
      })),
      allTasks: allTasks.map((t) => ({
        key: t.key,
        summary: t.fields.summary,
        points: t.fields.customfield_10028 || 0,
        status: t.fields.status.name,
      })),
    });
  }

  // Puanlara göre sırala
  leaderboardData.sort((a, b) => b.totalPoints - a.totalPoints);

  logger.info("Leaderboard hesaplandı");
  return leaderboardData;
}

async function getLeaderboard() {
  try {
    const leaderboard = await calculateLeaderboard();
    logger.info(
      `Leaderboard oluşturuldu. Toplam ${leaderboard.length} kullanıcı listelendi.`
    );

    // Detaylı log
    leaderboard.forEach((user, index) => {
      logger.info(
        `${index + 1}. ${user.displayName}: ${user.totalPoints} puan (${
          user.completedTaskCount
        } task)`
      );
    });

    return leaderboard;
  } catch (error) {
    logger.error(
      `Leaderboard oluşturulurken hata oluştu: ${
        error.response ? JSON.stringify(error.response.data) : error.message
      }`
    );
    return [];
  }
}

async function getUnassignedTasks() {
  try {
    const jqlQuery = `project = "${PROJECT_KEY}" AND Sprint IS NOT EMPTY AND "Story Points" IS NOT EMPTY AND status = "${TASK_STATUS}" AND assignee IS EMPTY AND created >= -30d ORDER BY created DESC`;

    const response = await axios.get(
      `${JIRA_BASE_URL}/rest/api/3/search?jql=${encodeURIComponent(
        jqlQuery
      )}&maxResults=100`,
      {
        auth: { username: EMAIL, password: API_TOKEN },
      }
    );

    return response.data.issues;
  } catch (error) {
    logger.error(
      `Hata oluştu (atanmamış taskları çekme): ${
        error.response ? JSON.stringify(error.response.data) : error.message
      }`
    );
    return [];
  }
}

async function assignTaskToUser(taskKey, accountId) {
  try {
    await axios.put(
      `${JIRA_BASE_URL}/rest/api/3/issue/${taskKey}/assignee`,
      {
        accountId: accountId,
      },
      {
        auth: { username: EMAIL, password: API_TOKEN },
      }
    );
    logger.info(`Task ${taskKey} başarıyla ${accountId} kullanıcısına atandı.`);
    return true;
  } catch (error) {
    logger.error(
      `Hata oluştu (task atama): ${
        error.response ? JSON.stringify(error.response.data) : error.message
      }`
    );
    return false;
  }
}

async function getRandomUser(users) {
  if (!users || users.length === 0) {
    return null;
  }
  const randomIndex = Math.floor(Math.random() * users.length);
  return users[randomIndex];
}

async function getUserWithLowestPoints(users, type = "done") {
  if (!users || users.length === 0) {
    return null;
  }

  let lowestPointsUser = null;
  let lowestPoints = Infinity;

  for (const user of users) {
    const tasks = await getUserAllTasks(user.accountId);
    let points = 0;

    if (type === "done") {
      // Sadece Done durumundaki taskların puanlarını topla
      points = tasks.reduce((sum, task) => {
        if (
          task.fields.status.name === "Done" &&
          task.fields.customfield_10028
        ) {
          return sum + task.fields.customfield_10028;
        }
        return sum;
      }, 0);
    } else {
      // Tüm taskların puanlarını topla
      points = tasks.reduce((sum, task) => {
        return sum + (task.fields.customfield_10028 || 0);
      }, 0);
    }

    if (points < lowestPoints) {
      lowestPoints = points;
      lowestPointsUser = user;
    }
  }

  return lowestPointsUser;
}

// IPC Event Listeners
ipcMain.on("get-project-users", async (event) => {
  try {
    const users = await getProjectUsers();
    event.reply("project-users-data", users);
  } catch (error) {
    logger.error(`Kullanıcı listesi alınırken hata oluştu: ${error.message}`);
    event.reply("project-users-data", []);
  }
});

ipcMain.on("get-unassigned-tasks", async (event) => {
  try {
    const tasks = await getUnassignedTasks();
    event.reply("unassigned-tasks-data", tasks);
  } catch (error) {
    logger.error(`Atanmamış tasklar alınırken hata oluştu: ${error.message}`);
    event.reply("unassigned-tasks-data", []);
  }
});

ipcMain.on(
  "assign-task",
  async (event, { taskKey, assignmentType, selectedUserId }) => {
    try {
      const users = await getProjectUsers();
      let selectedUser = null;

      switch (assignmentType) {
        case "specific":
          selectedUser = users.find((u) => u.accountId === selectedUserId);
          break;
        case "random":
          selectedUser = await getRandomUser(users);
          break;
        case "lowest_done":
          selectedUser = await getUserWithLowestPoints(users, "done");
          break;
        case "lowest_total":
          selectedUser = await getUserWithLowestPoints(users, "total");
          break;
      }

      if (!selectedUser) {
        throw new Error("Kullanıcı bulunamadı");
      }

      const success = await assignTaskToUser(taskKey, selectedUser.accountId);
      event.reply("task-assigned", { success, selectedUser });
    } catch (error) {
      logger.error(`Task atama işlemi başarısız oldu: ${error.message}`);
      event.reply("task-assigned", { success: false, error: error.message });
    }
  }
);

module.exports = {
  getLeaderboard,
  getUserAllTasks,
  getUnassignedTasks,
  assignTaskToUser,
  getRandomUser,
  getUserWithLowestPoints,
};
