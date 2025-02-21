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

async function hasInProgressTasks(accountId) {
  try {
    const jqlQuery = `project = "${PROJECT_KEY}" AND assignee = ${accountId} AND status = "In Progress"`;
    const response = await axios.get(
      `${JIRA_BASE_URL}/rest/api/3/search?jql=${encodeURIComponent(jqlQuery)}`,
      {
        auth: { username: EMAIL, password: API_TOKEN },
      }
    );
    return response.data.total > 0;
  } catch (error) {
    logger.error(
      `Hata oluştu (in-progress task kontrolü): ${
        error.response ? JSON.stringify(error.response.data) : error.message
      }`
    );
    return false;
  }
}

async function getProjectUsers() {
  try {
    logger.info("Proje kullanıcıları yükleniyor..");

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
      ? EXCLUDED_EMAILS.split(/[\n\r]+/)
          .map((email) => email.trim().toLowerCase())
          .filter((email) => email.length > 0)
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
          const hasInProgress = await hasInProgressTasks(accountId);
          activeUsers.push({
            ...user,
            hasInProgressTasks: hasInProgress,
          });
        }
      } catch (error) {
        logger.error(
          `Kullanıcı detayları çekilemedi (${accountId}): ${error.message}`
        );
      }
    }

    logger.info(`Toplam ${activeUsers.length} aktif kullanıcı bulundu.`);

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

async function hasActiveTask(accountId) {
  try {
    const jqlQuery = `project = "${PROJECT_KEY}" AND assignee = ${accountId} AND status in ("Selected for Development", "In Progress") AND created >= -30d AND Sprint IS NOT EMPTY`;
    const response = await axios.get(
      `${JIRA_BASE_URL}/rest/api/3/search?jql=${encodeURIComponent(jqlQuery)}`,
      {
        auth: { username: EMAIL, password: API_TOKEN },
      }
    );

    if (response.data.total > 0) {
      const tasks = response.data.issues.map(
        (issue) =>
          `${issue.key}: ${issue.fields.summary} (${issue.fields.status.name})`
      );
      return {
        hasActive: true,
        tasks: tasks,
      };
    }

    return {
      hasActive: false,
      tasks: [],
    };
  } catch (error) {
    logger.error(
      `Hata oluştu (aktif task kontrolü): ${
        error.response ? JSON.stringify(error.response.data) : error.message
      }`
    );
    return {
      hasActive: false,
      tasks: [],
    };
  }
}

async function addCommentToTask(taskKey, comment) {
  try {
    if (!comment) return; // Comment boşsa işlem yapma

    await axios.post(
      `${JIRA_BASE_URL}/rest/api/3/issue/${taskKey}/comment`,
      {
        body: {
          type: "doc",
          version: 1,
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: comment
                }
              ]
            }
          ]
        }
      },
      {
        auth: { username: EMAIL, password: API_TOKEN },
      }
    );
    logger.info(`Task ${taskKey}'e yorum eklendi: ${comment}`);
  } catch (error) {
    logger.error(
      `Yorum eklenirken hata oluştu: ${
        error.response ? JSON.stringify(error.response.data) : error.message
      }`
    );
    throw error;
  }
}

async function updateTaskStatus(taskKey, status) {
  try {
    await axios.post(
      `${JIRA_BASE_URL}/rest/api/3/issue/${taskKey}/transitions`,
      {
        transition: {
          id: status === "Selected for Development" ? "3" : "4" // 3: Selected for Development, 4: In Progress
        }
      },
      {
        auth: { username: EMAIL, password: API_TOKEN },
      }
    );
    logger.info(`Task ${taskKey} durumu "${status}" olarak güncellendi.`);
  } catch (error) {
    logger.error(
      `Task durumu güncellenirken hata oluştu: ${
        error.response ? JSON.stringify(error.response.data) : error.message
      }`
    );
    throw error;
  }
}

async function assignTaskToUser(taskKey, accountId, comment = "", moveToSelectedForDev = false) {
  try {
    // Kullanıcının aktif task'larını kontrol et
    const activeTaskCheck = await hasActiveTask(accountId);

    if (activeTaskCheck.hasActive) {
      const taskList = activeTaskCheck.tasks.join("\n");
      logger.warn(`Kullanıcının üzerinde aktif task'lar var:\n${taskList}`);
      return {
        success: false,
        error: "Kullanıcının üzerinde aktif task'lar var",
        activeTasks: activeTaskCheck.tasks,
      };
    }

    // Task'ı ata
    await axios.put(
      `${JIRA_BASE_URL}/rest/api/3/issue/${taskKey}/assignee`,
      {
        accountId: accountId,
      },
      {
        auth: { username: EMAIL, password: API_TOKEN },
      }
    );

    // Eğer comment varsa ekle
    if (comment) {
      await addCommentToTask(taskKey, comment);
    }

    // Eğer isteniyorsa task durumunu güncelle
    if (moveToSelectedForDev) {
      await updateTaskStatus(taskKey, "Selected for Development");
    }

    logger.info(`Task ${taskKey} başarıyla ${accountId} kullanıcısına atandı.`);
    return {
      success: true,
    };
  } catch (error) {
    logger.error(
      `Hata oluştu (task atama): ${
        error.response ? JSON.stringify(error.response.data) : error.message
      }`
    );
    return {
      success: false,
      error: error.message,
    };
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

// Kullanıcı puanlarını hesapla
async function calculateUserPoints(users) {
  try {
    let lowestDoneUser = null;
    let lowestTotalUser = null;
    let lowestDonePoints = Infinity;
    let lowestTotalPoints = Infinity;

    for (const user of users) {
      if (user.hasInProgressTasks) continue; // Aktif task'ı olan kullanıcıları atla

      const tasks = await getUserAllTasks(user.accountId);
      let donePoints = 0;
      let totalPoints = 0;

      tasks.forEach(task => {
        const points = task.fields.customfield_10028 || 0;
        totalPoints += points;
        
        if (task.fields.status.name === "Done") {
          donePoints += points;
        }
      });

      logger.info(`${user.displayName} - Done Points: ${donePoints}, Total Points: ${totalPoints}`);

      if (donePoints < lowestDonePoints) {
        lowestDonePoints = donePoints;
        lowestDoneUser = user;
      }

      if (totalPoints < lowestTotalPoints) {
        lowestTotalPoints = totalPoints;
        lowestTotalUser = user;
      }
    }

    // Sonuçları logla
    if (lowestDoneUser) {
      logger.info(`En düşük Done puanlı kullanıcı: ${lowestDoneUser.displayName} (${lowestDonePoints} puan)`);
    }
    if (lowestTotalUser) {
      logger.info(`En düşük Total puanlı kullanıcı: ${lowestTotalUser.displayName} (${lowestTotalPoints} puan)`);
    }

    return {
      lowest_done: lowestDoneUser,
      lowest_total: lowestTotalUser
    };
  } catch (error) {
    logger.error(`Kullanıcı puanları hesaplanırken hata oluştu: ${error.message}`);
    return {
      lowest_done: null,
      lowest_total: null
    };
  }
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

ipcMain.on("assign-task", async (event, data) => {
  try {
    const { taskKey, selectedUserId, cachedUsers, cachedTasks, comment, moveToSelectedForDev, isTestMode } = data;
    const selectedUser = cachedUsers.find(user => user.accountId === selectedUserId);

    if (!selectedUser) {
      logger.error("Kullanıcı bulunamadı!");
      return;
    }

    let result;
    logger.info(isTestMode);
    if (isTestMode) {
      // Test modunda gerçek atama yapmadan simülasyon yap
      logger.info("=== TEST MODU ===");
      logger.info(`Task ${taskKey} için simülasyon yapılıyor...`);
      logger.info(`Seçilen kullanıcı: ${selectedUser.displayName} (${selectedUser.accountId})`);
      
      // Aktif task kontrolü simülasyonu
      const activeTaskCheck = await hasActiveTask(selectedUser.accountId);
      if (activeTaskCheck.hasActive) {
        const taskList = activeTaskCheck.tasks.join("\n");
        logger.warn(`[TEST] Kullanıcının üzerinde aktif task'lar var:\n${taskList}`);
        result = {
          success: false,
          error: "Kullanıcının üzerinde aktif task'lar var",
          activeTasks: activeTaskCheck.tasks,
        };
      } else {
        // Başarılı atama simülasyonu
        logger.info(`[TEST] Task ${taskKey} başarıyla ${selectedUser.displayName} kullanıcısına atanacaktı`);
        if (comment) {
          logger.info(`[TEST] Task'a eklenecek yorum: "${comment}"`);
        }
        if (moveToSelectedForDev) {
          logger.info(`[TEST] Task durumu "Selected for Development" olarak güncellenecekti`);
        }
        result = { success: true };
      }
      logger.info("=== TEST MODU ===");
    } else {
      // Gerçek atama işlemi
      //result = await assignTaskToUser(taskKey, selectedUser.accountId, comment, moveToSelectedForDev);
    }
    
    if (result.success) {
      // Başarılı atama sonrası cached listeleri güncelle
      const taskIndex = cachedTasks.findIndex(task => task.key === taskKey);
      if (taskIndex !== -1) {
        cachedTasks.splice(taskIndex, 1);
      }

      event.reply("task-assigned", {
        success: true,
        message: `Task ${taskKey} başarıyla ${selectedUser.displayName} kullanıcısına atandı.`,
      });

      // UI'ı güncelle
      event.reply("unassigned-tasks-data", cachedTasks);
      event.reply("project-users-data", cachedUsers);
    } else {
      event.reply("task-assigned", result);
    }
  } catch (error) {
    logger.error(
      `Hata oluştu (task atama): ${
        error.response ? JSON.stringify(error.response.data) : error.message
      }`
    );
    event.reply("task-assigned", {
      success: false,
      message: "Task atama işlemi başarısız oldu.",
    });
  }
});

ipcMain.on("calculate-user-points", async (event, { users }) => {
  try {
    logger.info("Kullanıcı puanları hesaplanıyor...");
    const userPoints = await calculateUserPoints(users);
    logger.info("Kullanıcı puanları hesaplandı.");
    event.reply("user-points-calculated", userPoints);
  } catch (error) {
    logger.error(`Kullanıcı puanları hesaplanırken hata oluştu: ${error.message}`);
    event.reply("user-points-calculated", {
      lowest_done: null,
      lowest_total: null
    });
  }
});

module.exports = {
  getProjectUsers,
  getUserAllTasks,
  getUnassignedTasks,
  assignTaskToUser,
  getRandomUser,
  getUserWithLowestPoints,
};
