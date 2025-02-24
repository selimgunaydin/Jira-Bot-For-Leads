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
    logger.info("Proje Developerları yükleniyor..");

    // Son 1 ayda projede aktif olan Developerları bulmak için JQL sorgusu
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

    // Hariç tutulacak e-postaları diziye çevir ve boşlukları temizle
    const excludedEmailList = EXCLUDED_EMAILS
      ? EXCLUDED_EMAILS.split(/[\n\r]+/)
          .map((email) => email.trim().toLowerCase())
          .filter((email) => email.length > 0)
      : [];

    // Daha spesifik JQL sorgusu - sadece aktif kullanıcıları getir
    const jqlQuery = `project = "${PROJECT_KEY}" 
      AND assignee IS NOT EMPTY 
      AND updated >= "${oneMonthAgo.toISOString().split("T")[0]}"
      AND assignee not in (addon, system)`;

    // Tüm taskları tek seferde çek
    const tasksResponse = await axios.get(
      `${JIRA_BASE_URL}/rest/api/3/search?jql=${encodeURIComponent(jqlQuery)}&maxResults=100&fields=assignee`,
      {
        auth: { username: EMAIL, password: API_TOKEN },
      }
    );

    // Benzersiz kullanıcı ID'lerini ve bilgilerini topla
    const uniqueUsers = new Map();
    tasksResponse.data.issues.forEach((issue) => {
      if (issue.fields.assignee) {
        const user = issue.fields.assignee;
        if (!uniqueUsers.has(user.accountId)) {
          uniqueUsers.set(user.accountId, {
            accountId: user.accountId,
            displayName: user.displayName,
            emailAddress: user.emailAddress,
            active: user.active
          });
        }
      }
    });

    // Filtrele ve paralel olarak in-progress durumlarını kontrol et
    const userPromises = Array.from(uniqueUsers.values())
      .filter(user => 
        user.active &&
        !user.displayName.includes("addon") &&
        !user.displayName.toLowerCase().includes("bot") &&
        !user.displayName.toLowerCase().includes("system") &&
        !excludedEmailList.includes(user.emailAddress.toLowerCase())
      )
      .map(async (user) => {
        const hasInProgress = await hasInProgressTasks(user.accountId);
        return {
          ...user,
          hasInProgressTasks: hasInProgress
        };
      });

    const activeUsers = await Promise.all(userPromises);
    logger.info(`Toplam ${activeUsers.length} aktif Developer bulundu.`);

    return activeUsers;
  } catch (error) {
    logger.error(
      `Hata oluştu (Developer çekme): ${
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

  // Kullanıcının e-posta adresini al
  let userEmail = '';
  try {
    const userResponse = await axios.get(
      `${JIRA_BASE_URL}/rest/api/3/user?accountId=${accountId}`,
      {
        auth: { username: EMAIL, password: API_TOKEN },
      }
    );
    userEmail = userResponse.data.emailAddress.toLowerCase();
  } catch (error) {
    logger.error(`Kullanıcı e-posta adresi alınamadı: ${error.message}`);
  }

  // PROJECT_KEY filtresi olmadan hesaplanacak kullanıcıları al
  const excludedEmails = global.mainWindow ? 
    await global.mainWindow.webContents.executeJavaScript(
      `localStorage.getItem('EXCLUDED_FROM_PROJECT_KEY_FILTER')`,
      true
    ) : '';
  
  const excludedEmailList = excludedEmails
    ? excludedEmails.split(/[\n\r]+/).map(email => email.trim().toLowerCase())
    : [];

  // JQL sorgusunu oluştur
  let jqlQuery = '';
  if (excludedEmailList.includes(userEmail)) {
    // PROJECT_KEY filtresi olmadan
    jqlQuery = `assignee = ${accountId}
      AND updated >= "${firstDayOfMonth.toISOString().split("T")[0]}" 
      AND updated <= "${lastDayOfMonth.toISOString().split("T")[0]}" 
      ORDER BY updated DESC`;
    logger.info(`${userEmail} için PROJECT_KEY filtresi olmadan puanlar hesaplanıyor...`);
  } else {
    // Normal sorgu (PROJECT_KEY filtresi ile)
    jqlQuery = `project = "${PROJECT_KEY}" 
      AND assignee = ${accountId}
      AND updated >= "${firstDayOfMonth.toISOString().split("T")[0]}" 
      AND updated <= "${lastDayOfMonth.toISOString().split("T")[0]}" 
      ORDER BY updated DESC`;
  }

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
      `Hata oluştu (Developer tüm taskları çekme): ${
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

async function assignTaskToUser(taskKey, selectedUserId, comment, moveToSelectedForDev, assignmentType) {
  try {
    // Eğer under_80 seçeneği seçilmişse
    if (assignmentType === "under_80") {
      // Düşük performanslı Developerları al
      const lowPerformers = await new Promise((resolve) => {
        if (global.mainWindow) {
          global.mainWindow.webContents.executeJavaScript(
            `localStorage.getItem('lowPerformers')`,
            true
          ).then(result => {
            resolve(JSON.parse(result || '[]'));
          });
        } else {
          resolve([]);
        }
      });
      
      // In progress'te işi olmayan düşük performanslı Developeryı bul
      const availableLowPerformer = lowPerformers.find(user => !user.hasInProgressTasks);
      
      if (availableLowPerformer) {
        selectedUserId = availableLowPerformer.accountId;
      } else {
        // Eğer uygun Developer yoksa Selected for Development'a taşı
        await updateTaskStatus(taskKey, "Selected for Development");
        return {
          success: false,
          message: "Uygun düşük performanslı Developer bulunamadı. Task 'Selected for Development' durumuna taşındı."
        };
      }
    }

    // Developernın aktif task'larını kontrol et
    const activeTaskCheck = await hasActiveTask(selectedUserId);

    if (activeTaskCheck.hasActive) {
      const taskList = activeTaskCheck.tasks.join("\n");
      logger.warn(`Developernın üzerinde aktif task'lar var:\n${taskList}`);
      return {
        success: false,
        error: "Developernın üzerinde aktif task'lar var",
        activeTasks: activeTaskCheck.tasks,
      };
    }

    // Task'ı ata
    await axios.put(
      `${JIRA_BASE_URL}/rest/api/3/issue/${taskKey}/assignee`,
      {
        accountId: selectedUserId,
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

    logger.info(`Task ${taskKey} başarıyla ${selectedUserId} Developersına atandı.`);
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

// Developer puanlarını hesapla
async function calculateUserPoints(users, performanceType = "done") {
  try {
    let userPointsData = [];
    let lowPerformers = [];

    // Ay içindeki iş günü hesaplama
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    
    // İş günü hesaplamalarını tek seferde yap
    const { workDaysUntilToday, totalWorkDays } = calculateWorkDays(firstDayOfMonth, lastDayOfMonth, today);
    
    // Beklenen tamamlanma oranı (iş günü bazlı)
    const expectedCompletionRatio = (workDaysUntilToday / totalWorkDays) * 100;

    logger.info("=== Developer Puanları Hesaplanıyor ===");
    logger.info(`Hesaplama Tipi: ${performanceType === "done" ? "Done Points" : "All Points"}`);
    logger.info(`Ay içindeki toplam iş günü: ${totalWorkDays}`);
    logger.info(`Bugüne kadar geçen iş günü: ${workDaysUntilToday}`);
    logger.info(`Beklenen tamamlanma oranı: ${expectedCompletionRatio.toFixed(1)}%\n`);

    // Tüm hedef puanları tek seferde al
    const targetPointsMap = await getTargetPointsForUsers(users);

    // Tüm kullanıcıların task'larını paralel olarak çek
    const userDataPromises = users.map(async user => {
      const tasks = await getUserAllTasks(user.accountId);
      const { donePoints, totalPoints } = calculatePoints(tasks);
      
      const targetPoints = targetPointsMap.get(user.emailAddress) || 0;
      const calculatedPoints = performanceType === "done" ? donePoints : totalPoints;
      
      // Oranları hesapla
      const completionRatio = targetPoints > 0 ? (calculatedPoints / targetPoints) * 100 : 0;
      const currentTargetPoints = (targetPoints * workDaysUntilToday) / totalWorkDays;
      const currentCompletionRatio = currentTargetPoints > 0 ? (calculatedPoints / currentTargetPoints) * 100 : 0;

      return {
        ...user,
        donePoints,
        totalPoints,
        targetPoints,
        completionRatio,
        currentCompletionRatio,
        calculatedPoints
      };
    });

    // Tüm kullanıcı verilerini paralel olarak işle
    userPointsData = await Promise.all(userDataPromises);

    // Kullanıcı verilerini logla ve düşük performanslıları belirle
    userPointsData.forEach(userData => {
      logUserStats(userData, workDaysUntilToday, totalWorkDays);
      
      if (userData.currentCompletionRatio < 80) {
        lowPerformers.push(userData);
        logger.warn(`  ⚠️ Düşük performans! (${userData.currentCompletionRatio.toFixed(1)}% < 80%)`);
      }
    });

    // Düşük performanslı Developerları kaydet
    if (global.mainWindow) {
      await global.mainWindow.webContents.executeJavaScript(
        `localStorage.setItem('lowPerformers', '${JSON.stringify(lowPerformers)}')`,
        true
      );
    }

    // Özet logları
    logSummary(users.length, lowPerformers, performanceType, workDaysUntilToday, totalWorkDays);

    return {
      userPointsData,
      lowPerformers
    };
  } catch (error) {
    logger.error(`Developer puanları hesaplanırken hata oluştu: ${error.message}`);
    return {
      userPointsData: [],
      lowPerformers: []
    };
  }
}

// Yardımcı fonksiyonlar
function calculateWorkDays(firstDayOfMonth, lastDayOfMonth, today) {
  let workDaysUntilToday = 0;
  let totalWorkDays = 0;
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  // Ay başından bugüne kadar olan iş günlerini say
  let currentDay = new Date(firstDayOfMonth);
  while (currentDay <= todayStart) {
    const dayOfWeek = currentDay.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      workDaysUntilToday++;
    }
    currentDay.setDate(currentDay.getDate() + 1);
  }

  // Ay içindeki toplam iş günü sayısı
  currentDay = new Date(firstDayOfMonth);
  while (currentDay <= lastDayOfMonth) {
    const dayOfWeek = currentDay.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      totalWorkDays++;
    }
    currentDay.setDate(currentDay.getDate() + 1);
  }

  return { workDaysUntilToday, totalWorkDays };
}

async function getTargetPointsForUsers(users) {
  const targetPointsMap = new Map();
  
  if (global.mainWindow) {
    const promises = users.map(async user => {
      const value = await global.mainWindow.webContents.executeJavaScript(
        `localStorage.getItem("targetPoints-${user.emailAddress}")`,
        true
      );
      if (value) {
        targetPointsMap.set(user.emailAddress, parseInt(value));
      }
    });
    
    await Promise.all(promises);
  }
  
  return targetPointsMap;
}

function calculatePoints(tasks) {
  return tasks.reduce((acc, task) => {
    const points = task.fields.customfield_10028 || 0;
    if (task.fields.status.name === "Done") {
      acc.donePoints += points;
    }
    acc.totalPoints += points;
    return acc;
  }, { donePoints: 0, totalPoints: 0 });
}

function logUserStats(userData, workDaysUntilToday, totalWorkDays) {
  const currentTargetPoints = (userData.targetPoints * workDaysUntilToday) / totalWorkDays;
  logger.info(`${userData.displayName}:`);
  logger.info(`  ├─ Done Points: ${userData.donePoints}`);
  logger.info(`  ├─ Total Points: ${userData.totalPoints}`);
  logger.info(`  ├─ Target Points: ${userData.targetPoints}`);
  logger.info(`  ├─ Current Target Points: ${currentTargetPoints.toFixed(1)}`);
  logger.info(`  ├─ Overall Completion: ${userData.completionRatio.toFixed(1)}%`);
  logger.info(`  └─ Current Completion: ${userData.currentCompletionRatio.toFixed(1)}%`);
}

function logSummary(totalUsers, lowPerformers, performanceType, workDaysUntilToday, totalWorkDays) {
  logger.info("\n=== Özet ===");
  logger.info(`Toplam Developer: ${totalUsers}`);
  logger.info(`Düşük Performanslı Developer: ${lowPerformers.length}`);
  
  if (lowPerformers.length > 0) {
    logger.info("\n=== Düşük Performanslı Developerlar ===");
    lowPerformers.forEach(user => {
      const currentTargetPoints = (user.targetPoints * workDaysUntilToday) / totalWorkDays;
      logger.info(`${user.displayName}:`);
      logger.info(`  ├─ ${performanceType === "done" ? "Done" : "Total"} Points: ${user.calculatedPoints}`);
      logger.info(`  ├─ Güncel Hedef: ${currentTargetPoints.toFixed(1)}`);
      logger.info(`  ├─ Aylık Hedef: ${user.targetPoints}`);
      logger.info(`  └─ Performans: ${user.currentCompletionRatio.toFixed(1)}%`);
      logger.info(`  └─ Durum: ${user.hasInProgressTasks ? '🔄 In Progress Taskı Var' : '✅ Müsait'}`);
    });
  }
  
  logger.info("=== Hesaplama Tamamlandı ===\n");
}

// IPC Event Listeners
ipcMain.on("get-project-users", async (event) => {
  try {
    const users = await getProjectUsers();
    event.reply("project-users-data", users);
  } catch (error) {
    logger.error(`Developer listesi alınırken hata oluştu: ${error.message}`);
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
    const { taskKey, selectedUserId, cachedUsers, cachedTasks, comment, moveToSelectedForDev, isTestMode, assignmentType } = data;
    const selectedUser = cachedUsers.find(user => user.accountId === selectedUserId);

    if (!selectedUser) {
      logger.error("Developer bulunamadı!");
      return;
    }

    let result;
    logger.info(isTestMode);
    if (isTestMode) {
      // Test modunda gerçek atama yapmadan simülasyon yap
      logger.info("=== TEST MODU ===");
      logger.info(`Task ${taskKey} için simülasyon yapılıyor...`);
      logger.info(`Seçilen Developer: ${selectedUser.displayName} (${selectedUser.accountId})`);
      
      // Aktif task kontrolü simülasyonu
      const activeTaskCheck = await hasActiveTask(selectedUser.accountId);
      if (activeTaskCheck.hasActive) {
        const taskList = activeTaskCheck.tasks.join("\n");
        logger.warn(`[TEST] Developernın üzerinde aktif task'lar var:\n${taskList}`);
        result = {
          success: false,
          error: "Developernın üzerinde aktif task'lar var",
          activeTasks: activeTaskCheck.tasks,
        };
      } else {
        // Başarılı atama simülasyonu
        logger.info(`[TEST] Task ${taskKey} başarıyla ${selectedUser.displayName} Developersına atanacaktı`);
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
      result = await assignTaskToUser(taskKey, selectedUser.accountId, comment, moveToSelectedForDev, assignmentType);
    }
    
    if (result.success) {
      // Başarılı atama sonrası cached listeleri güncelle
      const taskIndex = cachedTasks.findIndex(task => task.key === taskKey);
      if (taskIndex !== -1) {
        cachedTasks.splice(taskIndex, 1);
      }

      event.reply("task-assigned", {
        success: true,
        message: `Task ${taskKey} başarıyla ${selectedUser.displayName} Developersına atandı.`,
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

ipcMain.on("calculate-user-points", async (event, { users, performanceType }) => {
  try {
    logger.info("Developer puanları hesaplanıyor...");
    const userPoints = await calculateUserPoints(users, performanceType);
    logger.info("Developer puanları hesaplandı.");
    event.reply("user-points-calculated", userPoints);
  } catch (error) {
    logger.error(`Developer puanları hesaplanırken hata oluştu: ${error.message}`);
    event.reply("user-points-calculated", {
      userPointsData: [],
      lowPerformers: []
    });
  }
});

ipcMain.on("save-target-points", async (event, data) => {
  try {
    const { email, value } = data;
    if (global.mainWindow) {
      await global.mainWindow.webContents.executeJavaScript(
        `localStorage.setItem("targetPoints-${email}", "${value}")`,
        true
      );
    }
    event.reply("target-points-saved", { success: true });
  } catch (error) {
    logger.error(`Hedef puan kaydedilirken hata oluştu: ${error.message}`);
    event.reply("target-points-saved", { success: false, error: error.message });
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
