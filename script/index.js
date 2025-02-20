const { ipcRenderer } = require("electron");

const sidebar = document.getElementById("sidebar");
const overlay = document.getElementById("overlay");
const openSidebarBtn = document.getElementById("openSidebar");
const closeSidebarBtn = document.getElementById("closeSidebar");

function openSidebar() {
  sidebar.classList.add("open");
  overlay.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeSidebar() {
  sidebar.classList.remove("open");
  overlay.classList.remove("active");
  document.body.style.overflow = "";
}

openSidebarBtn.addEventListener("click", openSidebar);
closeSidebarBtn.addEventListener("click", closeSidebar);
overlay.addEventListener("click", closeSidebar);

const jiraBaseUrl = document.getElementById("jiraBaseUrl");
const email = document.getElementById("email");
const apiToken = document.getElementById("apiToken");
const accountId = document.getElementById("accountId");
const projectKey = document.getElementById("projectKey");

const taskStatus = document.getElementById("taskStatus");
const testMode = document.getElementById("testMode");

jiraBaseUrl.value = localStorage.getItem("JIRA_BASE_URL") || "";
email.value = localStorage.getItem("EMAIL") || "";
apiToken.value = localStorage.getItem("API_TOKEN") || "";
accountId.value = localStorage.getItem("YOUR_ACCOUNT_ID") || "";
projectKey.value = localStorage.getItem("PROJECT_KEY") || "S1";
taskStatus.value =
  localStorage.getItem("TASK_STATUS") || "Selected for Development";
testMode.checked = localStorage.getItem("TEST_MODE") === "true";

const configInputs = [
  jiraBaseUrl,
  email,
  apiToken,
  accountId,
  projectKey,
  taskStatus,
];
configInputs.forEach((input) => {
  input.addEventListener("change", () => {
    localStorage.setItem("JIRA_BASE_URL", jiraBaseUrl.value);
    localStorage.setItem("EMAIL", email.value);
    localStorage.setItem("API_TOKEN", apiToken.value);
    localStorage.setItem("YOUR_ACCOUNT_ID", accountId.value);
    localStorage.setItem("PROJECT_KEY", projectKey.value);
    localStorage.setItem("TASK_STATUS", taskStatus.value);

    ipcRenderer.send("update-config", {
      JIRA_BASE_URL: jiraBaseUrl.value,
      EMAIL: email.value,
      API_TOKEN: apiToken.value,
      YOUR_ACCOUNT_ID: accountId.value,
      PROJECT_KEY: projectKey.value,
      TASK_STATUS: taskStatus.value,
    });
  });
});

testMode.addEventListener("change", () => {
  localStorage.setItem("TEST_MODE", testMode.checked);
  ipcRenderer.send("update-config", {
    JIRA_BASE_URL: jiraBaseUrl.value,
    EMAIL: email.value,
    API_TOKEN: apiToken.value,
    YOUR_ACCOUNT_ID: accountId.value,
    PROJECT_KEY: projectKey.value,
    TASK_STATUS: taskStatus.value,
    TEST_MODE: testMode.checked,
  });
});

window.addEventListener("load", () => {
  ipcRenderer.send("update-config", {
    JIRA_BASE_URL: jiraBaseUrl.value,
    EMAIL: email.value,
    API_TOKEN: apiToken.value,
    YOUR_ACCOUNT_ID: accountId.value,
    PROJECT_KEY: projectKey.value,
    TASK_STATUS: taskStatus.value,
    TEST_MODE: testMode.checked,
  });
});

const logs = document.getElementById("logs");

ipcRenderer.on("log-message", (event, message) => {
  const formattedMessage = message.trim() + "\n";
  logs.textContent += formattedMessage;
  logs.scrollTop = logs.scrollHeight;
});

const excludedTasksList = document.getElementById("excludedTasksList");
excludedTasksList.value = localStorage.getItem("excludedTasks") || "S1-30899";

excludedTasksList.addEventListener("input", () => {
  localStorage.setItem("excludedTasks", excludedTasksList.value);
  ipcRenderer.send("update-excluded-tasks", excludedTasksList.value);
});

// Aylık task listelerini güncelle
async function updateMonthlyTaskLists() {
  const doneTasksList = document.getElementById("doneTasksList");
  const allTasksList = document.getElementById("allTasksList");

  // Done taskları getir
  ipcRenderer.send("get-monthly-done-tasks");
  ipcRenderer.once("monthly-done-tasks", (event, tasks) => {
    const totalPoints = tasks.reduce(
      (sum, task) => sum + (task.fields.customfield_10028 || 0),
      0
    );

    doneTasksList.innerHTML = `
      <div class="mb-4 text-right">
        <span class="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
          Toplam Puan: ${totalPoints}
        </span>
      </div>
      ${
        tasks.length > 0
          ? tasks
              .map(
                (task) => `
            <div class="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
              <div class="flex justify-between items-start">
                <div class="flex items-center space-x-2">
                  <a href="#" data-url="${jiraBaseUrl.value}/browse/${
                  task.key
                }" class="text-blue-600 hover:text-blue-800 font-medium jira-link">
                    ${task.key}
                  </a>
                  ${
                    task.fields.customfield_10028
                      ? `<span class="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs">
                      ${task.fields.customfield_10028} puan
                    </span>`
                      : ""
                  }
                </div>
                <span class="text-sm text-gray-500">
                  ${new Date(task.fields.updated).toLocaleDateString("tr-TR")}
                </span>
              </div>
              <p class="text-sm text-gray-700 mt-1">${task.fields.summary}</p>
            </div>
          `
              )
              .join("")
          : '<p class="text-gray-500 text-center">Bu ay tamamlanan task bulunamadı.</p>'
      }`;

    // Link tıklama olaylarını ekle
    doneTasksList.querySelectorAll(".jira-link").forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        ipcRenderer.send("open-in-chrome", e.target.dataset.url);
      });
    });
  });

  // Tüm taskları getir
  ipcRenderer.send("get-monthly-all-tasks");
  ipcRenderer.once("monthly-all-tasks", (event, tasks) => {
    const totalPoints = tasks.reduce(
      (sum, task) => sum + (task.fields.customfield_10028 || 0),
      0
    );

    allTasksList.innerHTML = `
      <div class="mb-4 text-right">
        <span class="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
          Toplam Puan: ${totalPoints}
        </span>
      </div>
      ${
        tasks.length > 0
          ? tasks
              .map(
                (task) => `
            <div class="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
              <div class="flex justify-between items-start">
                <div class="flex items-center space-x-2">
                  <a href="#" data-url="${jiraBaseUrl.value}/browse/${
                  task.key
                }" class="text-blue-600 hover:text-blue-800 font-medium jira-link">
                    ${task.key}
                  </a>
                  ${
                    task.fields.customfield_10028
                      ? `<span class="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs">
                      ${task.fields.customfield_10028} puan
                    </span>`
                      : ""
                  }
                </div>
                <span class="text-sm text-gray-500">
                  ${new Date(task.fields.updated).toLocaleDateString("tr-TR")}
                </span>
              </div>
              <p class="text-sm text-gray-700 mt-1">${task.fields.summary}</p>
              <span class="inline-block px-2 py-1 text-xs rounded mt-2 ${
                task.fields.status.name === "Done"
                  ? "bg-green-100 text-green-800"
                  : task.fields.status.name === "In Progress"
                  ? "bg-blue-100 text-blue-800"
                  : "bg-gray-100 text-gray-800"
              }">
                ${task.fields.status.name}
              </span>
            </div>
          `
              )
              .join("")
          : '<p class="text-gray-500 text-center">Bu ay task bulunamadı.</p>'
      }`;

    // Link tıklama olaylarını ekle
    allTasksList.querySelectorAll(".jira-link").forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        ipcRenderer.send("open-in-chrome", e.target.dataset.url);
      });
    });
  });
}

// Sayfa yüklendiğinde ve her 5 dakikada bir task listelerini güncelle
window.addEventListener("load", updateMonthlyTaskLists);
setInterval(updateMonthlyTaskLists, 5 * 60 * 1000);

// Task atandığında listeleri güncelle
ipcRenderer.on("task-assigned", updateMonthlyTaskLists);

// Leaderboard işlemleri
const refreshLeaderboardBtn = document.getElementById("refreshLeaderboard");
const leaderboardList = document.getElementById("leaderboardList");

async function updateLeaderboard() {
  leaderboardList.innerHTML =
    '<div class="text-center text-gray-500">Yükleniyor...</div>';
  ipcRenderer.send("get-leaderboard");
}

ipcRenderer.on("leaderboard-data", (event, data) => {
  if (!data || data.length === 0) {
    leaderboardList.innerHTML =
      '<div class="text-center text-gray-500">Veri bulunamadı</div>';
    return;
  }

  leaderboardList.innerHTML = data
    .map(
      (user, index) => `
    <div id="leaderboard-item" data-email="${
      user.email
    }" class="flex items-center space-x-4 p-3 ${
        index < 3 ? "bg-gray-50" : ""
      } rounded-lg">
      <div class="flex-shrink-0 relative">
        <img src="${user.avatarUrl}" alt="${
        user.displayName
      }" class="w-10 h-10 rounded-full">
        ${
          index < 3
            ? `
          <div class="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center rounded-full ${
            index === 0
              ? "bg-yellow-400"
              : index === 1
              ? "bg-gray-300"
              : "bg-yellow-600"
          } text-white text-xs font-bold">
            ${index + 1}
          </div>
        `
            : ""
        }
      </div>
      <div class="flex-grow">
        <div class="font-medium text-gray-900">${user.displayName}</div>
        <div class="text-sm text-gray-500">Done: ${
          user.completedTaskCount
        } task, ${user.totalPoints} puan</div>
        <div class="text-sm text-gray-500">All: ${user.totalTaskCount} task, ${
        user.allTaskTotalPoint
      } puan</div>
        <div class="text-sm text-gray-500">Puan/Task Oranı: ${(
          user.allTaskTotalPoint / user.totalTaskCount
        ).toFixed(2)}</div>
      </div>
      <div class="text-lg font-semibold ${
        index === 0
          ? "text-yellow-500"
          : index === 1
          ? "text-gray-500"
          : index === 2
          ? "text-yellow-700"
          : "text-gray-700"
      }">
        #${index + 1}
      </div>
    </div>
  `
    )
    .join("");
});

refreshLeaderboardBtn.addEventListener("click", updateLeaderboard);

// Sayfa yüklendiğinde leaderboard'u güncelle
window.addEventListener("load", () => {
  updateLeaderboard();
  // Her 5 dakikada bir otomatik güncelle
  setInterval(updateLeaderboard, 5 * 60 * 1000);
});
