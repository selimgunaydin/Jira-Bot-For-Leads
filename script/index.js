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
const projectKey = document.getElementById("projectKey");
const taskStatus = document.getElementById("taskStatus");
const excludedEmails = document.getElementById("excludedEmails");
const automationMethod = document.getElementById("assignmentMethodAutomation");
const sourceEmail = document.getElementById("sourceEmailAutomation");

jiraBaseUrl.value = localStorage.getItem("JIRA_BASE_URL_LEAD") || "";
email.value = localStorage.getItem("EMAIL_LEAD") || "";
apiToken.value = localStorage.getItem("API_TOKEN_LEAD") || "";
projectKey.value = localStorage.getItem("PROJECT_KEY_LEAD") || "S1";
taskStatus.value =
  localStorage.getItem("TASK_STATUS_LEAD") || "Selected for Development";
excludedEmails.value = localStorage.getItem("EXCLUDED_EMAILS_LEAD") || "";
sourceEmail.value = localStorage.getItem("SOURCE_EMAIL_LEAD") || "";
const configInputs = [
  jiraBaseUrl,
  email,
  apiToken,
  projectKey,
  taskStatus,
  excludedEmails,
];
configInputs.forEach((input) => {
  input.addEventListener("change", () => {
    localStorage.setItem("JIRA_BASE_URL_LEAD", jiraBaseUrl.value);
    localStorage.setItem("EMAIL_LEAD", email.value);
    localStorage.setItem("API_TOKEN_LEAD", apiToken.value);
    localStorage.setItem("PROJECT_KEY_LEAD", projectKey.value);
    localStorage.setItem("TASK_STATUS_LEAD", taskStatus.value);
    localStorage.setItem("EXCLUDED_EMAILS_LEAD", excludedEmails.value);
    localStorage.setItem("SOURCE_EMAIL_LEAD", sourceEmail.value);
    ipcRenderer.send("update-config", {
      JIRA_BASE_URL: jiraBaseUrl.value,
      EMAIL: email.value,
      API_TOKEN: apiToken.value,
      PROJECT_KEY: projectKey.value,
      TASK_STATUS: taskStatus.value,
      EXCLUDED_EMAILS: excludedEmails.value,
      SOURCE_EMAIL: sourceEmail.value,
    });
  });
});

window.addEventListener("load", () => {
  ipcRenderer.send("update-config", {
    JIRA_BASE_URL: jiraBaseUrl.value,
    EMAIL: email.value,
    API_TOKEN: apiToken.value,
    PROJECT_KEY: projectKey.value,
    TASK_STATUS: taskStatus.value,
    EXCLUDED_EMAILS: excludedEmails.value,
    SOURCE_EMAIL: sourceEmail.value,
  });
});

const logs = document.getElementById("logs");

ipcRenderer.on("log-message", (event, message) => {
  const formattedMessage = message.trim() + "\n";
  logs.textContent += formattedMessage;
  logs.scrollTop = logs.scrollHeight;
});

// Task assignment elements
const assigneeUser = document.getElementById("assigneeUser");
const taskToAssign = document.getElementById("taskToAssign");
const manualTaskContainer = document.getElementById("manualTaskContainer");
const manualTaskInput = document.getElementById("manualTaskInput");
const assignmentType = document.getElementById("assignmentType");
const assignTask = document.getElementById("assignTask");
const refreshTaskAssignment = document.getElementById("refreshTaskAssignment");
const userSelectContainer = document.getElementById("userSelectContainer");
const taskComment = document.getElementById("taskComment");
const moveToSelectedForDev = document.getElementById("moveToSelectedForDev");
const testMode = document.getElementById("testMode");

// Global değişkenler
let cachedUsers = [];
let cachedTasks = [];
let isUsersLoaded = false;
let isTasksLoaded = false;
let isCalculating = false;
let userPointsCache = {
  lowest_done: null,
  lowest_total: null,
  random: null,
};
let userPointsData = [];
let lowPerformers = [];
let performanceType = localStorage.getItem("PERFORMANCE_TYPE_LEAD") || "done"; // Varsayılan performans hesaplama tipi

// Buton durumunu kontrol et
function checkButtonState() {
  const shouldBeEnabled = isUsersLoaded && isTasksLoaded && !isCalculating;

  assignTask.disabled = !shouldBeEnabled;
  assignTask.classList.toggle("opacity-50", !shouldBeEnabled);
  assignTask.classList.toggle("cursor-not-allowed", !shouldBeEnabled);

  // Hesaplama durumuna göre buton metnini güncelle
  if (isCalculating) {
    assignTask.textContent = "Puanlar Hesaplanıyor...";
  } else if (!isUsersLoaded || !isTasksLoaded) {
    assignTask.textContent = "Veriler Yükleniyor...";
  } else {
    assignTask.textContent = "Start Process";
  }
}

// Update user list
async function updateUserList() {
  isUsersLoaded = false;
  checkButtonState();
  ipcRenderer.send("get-project-users");
}

// Update task list
async function updateTaskList() {
  isTasksLoaded = false;
  checkButtonState();
  ipcRenderer.send("get-unassigned-tasks");
}

// Refresh task assignment area
function refreshTaskAssignmentArea() {
  // Add animation to refresh button
  refreshTaskAssignment.classList.add("animate-spin");

  // Update lists
  updateUserList();
  updateTaskList();

  // Remove animation after 1 second
  setTimeout(() => {
    refreshTaskAssignment.classList.remove("animate-spin");
  }, 1000);
}

// Add click event to refresh button
refreshTaskAssignment.addEventListener("click", refreshTaskAssignmentArea);

// Performans tipini değiştirme
document
  .getElementById("performanceType")
  .addEventListener("change", async (e) => {
    performanceType = e.target.value;
    localStorage.setItem("PERFORMANCE_TYPE_LEAD", performanceType);
    await calculateUserPoints();
  });

// Sayfa yüklendiğinde performans tipini seç
document.getElementById("performanceType").value = performanceType;

// PROJECT_KEY filtresi olmadan hesaplanacak kullanıcılar için localStorage işlemleri
const excludedFromProjectKeyFilter = document.getElementById(
  "excludedFromProjectKeyFilter"
);
excludedFromProjectKeyFilter.value =
  localStorage.getItem("EXCLUDED_FROM_PROJECT_KEY_FILTER") || "";
excludedFromProjectKeyFilter.addEventListener("change", (e) => {
  localStorage.setItem("EXCLUDED_FROM_PROJECT_KEY_FILTER", e.target.value);
});

// Developer puanlarını hesapla
async function calculateUserPoints() {
  isCalculating = true;
  checkButtonState();
  ipcRenderer.send("calculate-user-points", {
    users: cachedUsers,
    performanceType: performanceType,
  });
}

// Modal elements
const targetPointsModal = document.getElementById("targetPointsModal");
const targetPointsContent = document.getElementById("targetPointsContent");
const saveTargetPoints = document.getElementById("saveTargetPoints");
const closeTargetPointsModal = document.getElementById(
  "closeTargetPointsModal"
);
const editTargetPoints = document.getElementById("editTargetPoints");

// Modal işlemleri
function showTargetPointsModal() {
  targetPointsContent.innerHTML = "";
  cachedUsers.forEach((user) => {
    const savedTarget =
      localStorage.getItem(`targetPoints-${user.emailAddress}`) || 0;
    const userDiv = document.createElement("div");
    userDiv.className = "p-4 bg-gray-50 rounded-lg";
    userDiv.innerHTML = `
            <label class="block text-sm font-medium text-gray-700 mb-2">${user.displayName}</label>
            <div class="flex items-center space-x-2">
                <input type="number" 
                       class="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all" 
                       value="${savedTarget}"
                       data-email="${user.emailAddress}"
                       min="0">
                <span class="text-sm text-gray-500 whitespace-nowrap">puan/ay</span>
            </div>
        `;
    targetPointsContent.appendChild(userDiv);
  });
  targetPointsModal.classList.remove("hidden");
}

saveTargetPoints.addEventListener("click", async () => {
  const inputs = targetPointsContent.querySelectorAll("input");

  for (const input of inputs) {
    const email = input.dataset.email;
    const value = parseInt(input.value) || 0;
    localStorage.setItem(`targetPoints-${email}`, value);
  }

  targetPointsModal.classList.add("hidden");
  await calculateUserPoints();
});

closeTargetPointsModal.addEventListener("click", () => {
  targetPointsModal.classList.add("hidden");
});

// Hedef düzenleme butonu
editTargetPoints.addEventListener("click", () => {
  showTargetPointsModal();
});

// IPC Event Listeners
ipcRenderer.on("project-users-data", async (event, users) => {
  try {
    cachedUsers = users;

    assigneeUser.innerHTML =
      '<option value="">Select a user (optional)</option>';
    let needsTargetPoints = false;

    users.forEach((user) => {
      const option = document.createElement("option");
      option.value = user.accountId;
      const savedTarget = localStorage.getItem(
        `targetPoints-${user.emailAddress}`
      );
      if (!savedTarget) {
        needsTargetPoints = true;
      }
      option.textContent = `${user.displayName} ${
        user.hasInProgressTasks ? "(🔄 In Progress)" : "(✅ Available)"
      }`;
      assigneeUser.appendChild(option);
    });

    isUsersLoaded = true;
    checkButtonState();

    if (needsTargetPoints) {
      showTargetPointsModal();
    } else {
      // Hedefler varsa hesaplamayı başlat
      await calculateUserPoints();
    }
  } catch (error) {
    console.error("Error updating user list:", error);
  }
});

ipcRenderer.on("unassigned-tasks-data", (event, tasks) => {
  try {
    // Cache tasks
    cachedTasks = tasks;

    taskToAssign.innerHTML =
      '<option value="">Select a task</option><option value="manual">Manuel Task Gir</option>';
    tasks.forEach((task) => {
      const option = document.createElement("option");
      option.value = task.key;
      option.textContent = `${task.key}: ${task.fields.summary}`;
      taskToAssign.appendChild(option);
    });
    isTasksLoaded = true;
    checkButtonState();
  } catch (error) {
    console.error("Error updating task list:", error);
  }
});

// Leaderboard sıralama seçeneği
const leaderboardOrder = document.getElementById("leaderboardOrder");
let currentOrder = localStorage.getItem("LEADERBOARD_ORDER") || "done";
leaderboardOrder.value = currentOrder;

// Sıralama değiştiğinde
leaderboardOrder.addEventListener("change", () => {
  currentOrder = leaderboardOrder.value;
  localStorage.setItem("LEADERBOARD_ORDER", currentOrder);
  if (userPointsData.length > 0) {
    updateLeaderboard(userPointsData, currentOrder);
  }
});

// Leaderboard güncelleme fonksiyonu
function updateLeaderboard(userPointsData, orderBy = currentOrder) {
  const leaderboard = document.getElementById("leaderboard");

  // Puanlara göre sırala
  const sortedUsers = [...userPointsData].sort((a, b) => {
    const pointsA = orderBy === "done" ? a.donePoints : a.totalPoints;
    const pointsB = orderBy === "done" ? b.donePoints : b.totalPoints;
    return pointsB - pointsA;
  });

  // Leaderboard HTML'ini oluştur
  leaderboard.innerHTML = sortedUsers
    .map((user, index) => {
      const medal =
        index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : "🏅";
      const rank = index + 1;

      // Done Points için renk ve stil
      const doneProgressColor =
        user.currentCompletionRatio >= 100
          ? "bg-green-500"
          : user.currentCompletionRatio >= 80
          ? "bg-blue-500"
          : "bg-red-500";
      const doneTextColor =
        user.currentCompletionRatio >= 100
          ? "text-green-600"
          : user.currentCompletionRatio >= 80
          ? "text-blue-600"
          : "text-red-600";

      // All Points için renk ve stil hesaplama
      const allPointsRatio = (user.totalPoints / user.targetPoints) * 100;
      const allProgressColor =
        allPointsRatio >= 100
          ? "bg-green-500"
          : allPointsRatio >= 80
          ? "bg-blue-500"
          : "bg-red-500";
      const allTextColor =
        allPointsRatio >= 100
          ? "text-green-600"
          : allPointsRatio >= 80
          ? "text-blue-600"
          : "text-red-600";

      // Seçili puana göre highlight
      const doneHighlight =
        orderBy === "done" ? "font-semibold" : "font-medium";
      const allHighlight = orderBy === "all" ? "font-semibold" : "font-medium";

      // Kart için stil
      const isTopThree = index < 3;
      const borderColor = isTopThree
        ? index === 0
          ? "border-l-yellow-400"
          : index === 1
          ? "border-l-gray-400"
          : "border-l-orange-400"
        : "border-l-transparent";

      return `
            <div class="bg-white rounded-lg shadow-sm hover:shadow-md transition-all duration-300 p-4 mb-3 border-l-4 ${borderColor}">
                <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <!-- Sol Bölüm: Kullanıcı Bilgileri -->
                    <div class="flex items-center space-x-4">
                        <div class="flex-shrink-0 text-2xl">${medal}</div>
                        <div>
                            <h3 class="font-semibold text-gray-800 text-lg">${
                              user.displayName
                            }</h3>
                            <div class="grid grid-cols-2 gap-x-6 gap-y-1 mt-2">
                                <div class="flex items-center space-x-2">
                                    <span class="text-gray-500 text-sm">Done:</span>
                                    <span class="font-medium text-gray-900 ${doneHighlight}">${
        user.donePoints
      }</span>
                                </div>
                                <div class="flex items-center space-x-2">
                                    <span class="text-gray-500 text-sm">Total:</span>
                                    <span class="font-medium text-gray-900 ${allHighlight}">${
        user.totalPoints
      }</span>
                                </div>
                                <div class="flex items-center space-x-2">
                                    <span class="text-gray-500 text-sm">Güncel Hedef:</span>
                                    <span class="font-medium text-gray-900">${
                                      user.currentTargetPoints
                                    }</span>
                                </div>
                                <div class="flex items-center space-x-2">
                                    <span class="text-gray-500 text-sm">Toplam Hedef:</span>
                                    <span class="font-medium text-gray-900">${
                                      user.targetPoints
                                    }</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Sağ Bölüm: Performans Göstergeleri -->
                    <div class="flex items-center space-x-6">
                        <div class="flex flex-col space-y-4">
                            ${
                              orderBy === "done"
                                ? `
                            <!-- Done Performans -->
                            <div class="flex items-center space-x-3">
                                <div class="w-32">
                                    <div class="w-full bg-gray-100 rounded-full h-2">
                                        <div class="${doneProgressColor} rounded-full h-2 transition-all duration-500" 
                                             style="width: ${Math.min(
                                               user.currentCompletionRatio,
                                               100
                                             )}%">
                                        </div>
                                    </div>
                                </div>
                                <span class="text-sm font-medium ${doneTextColor} w-16 text-right">
                                    ${user.currentCompletionRatio.toFixed(0)}%
                                </span>
                            </div>
                            `
                                : `
                            <!-- Total Performans -->
                            <div class="flex items-center space-x-3">
                                <div class="w-32">
                                    <div class="w-full bg-gray-100 rounded-full h-2">
                                        <div class="${allProgressColor} rounded-full h-2 transition-all duration-500" 
                                             style="width: ${Math.min(
                                               allPointsRatio,
                                               100
                                             )}%">
                                        </div>
                                    </div>
                                </div>
                                <span class="text-sm font-medium ${allTextColor} w-16 text-right">
                                    ${allPointsRatio.toFixed(0)}%
                                </span>
                            </div>
                            `
                            }
                        </div>
                        
                        <!-- Durum İkonu -->
                        <div class="text-xl">
                            ${user.hasInProgressTasks ? "🔄" : "✅"}
                        </div>
                    </div>
                </div>
            </div>
        `;
    })
    .join("");
}

// user-points-calculated event listener'ını güncelle
ipcRenderer.on("user-points-calculated", (event, data) => {
  const { userPointsData: newUserPointsData, lowPerformers: newLowPerformers } =
    data;
  userPointsData = newUserPointsData;
  lowPerformers = newLowPerformers;

  // Developer listesini güncelle ve tamamlanma oranlarını göster
  assigneeUser.innerHTML = '<option value="">Developer Seç (optional)</option>';
  userPointsData.forEach((userData) => {
    const option = document.createElement("option");
    option.value = userData.accountId;
    option.textContent = `${
      userData.displayName
    } (${userData.currentCompletionRatio.toFixed(1)}%) ${
      userData.hasInProgressTasks ? "🔄" : "✅"
    }`;
    assigneeUser.appendChild(option);
  });

  // Leaderboard'u güncelle
  updateLeaderboard(userPointsData, currentOrder);

  isCalculating = false;
  checkButtonState();
});

// Update user selection when assignment type changes
assignmentType.addEventListener("change", () => {
  if (assignmentType.value === "specific") {
    userSelectContainer.classList.remove("hidden");
    assigneeUser.disabled = false;
    assigneeUser.required = true;
  } else {
    userSelectContainer.classList.add("hidden");
    assigneeUser.disabled = true;
    assigneeUser.required = false;
    assigneeUser.value = "";
  }
  checkButtonState();
});

// Test modu değişikliğinde localStorage'a kaydet
testMode.addEventListener("change", () => {
  localStorage.setItem("TEST_MODE_LEAD", testMode.checked);
});

// Sayfa yüklendiğinde test modu durumunu yükle
testMode.checked = localStorage.getItem("TEST_MODE_LEAD") === "true";

// Task seçimi değiştiğinde manuel giriş alanını göster/gizle
taskToAssign.addEventListener("change", () => {
  if (taskToAssign.value === "manual") {
    manualTaskContainer.classList.remove("hidden");
    manualTaskInput.required = true;
  } else {
    manualTaskContainer.classList.add("hidden");
    manualTaskInput.required = false;
  }
});

// Task assignment process
assignTask.addEventListener("click", () => {
  // Stop if button is already disabled
  if (assignTask.disabled) {
    return;
  }

  // Task seçimini kontrol et
  let selectedTaskKey = taskToAssign.value;
  if (selectedTaskKey === "manual") {
    selectedTaskKey = manualTaskInput.value.trim();
    if (!selectedTaskKey) {
      alert("Lütfen bir Task ID girin!");
      return;
    }
  } else if (!selectedTaskKey) {
    alert("Lütfen bir task seçin!");
    return;
  }

  // Seçilen Developeryı belirle
  let selectedUserId = null;
  let selectedUser = null;

  try {
    // In-progress'te işi olmayan Developerları filtrele
    const availableUsers = userPointsData.filter(
      (user) => !user.hasInProgressTasks
    );

    if (availableUsers.length === 0) {
      alert(
        "Atama yapılabilecek uygun Developer bulunamadı! Tüm Developerların üzerinde in-progress task var."
      );
      return;
    }

    switch (assignmentType.value) {
      case "specific":
        if (!assigneeUser.value) {
          alert("Lütfen bir Developer seçin!");
          return;
        }
        selectedUserId = assigneeUser.value;
        selectedUser = userPointsData.find(
          (u) => u.accountId === selectedUserId
        );
        if (selectedUser?.hasInProgressTasks) {
          alert("Seçilen Developernın üzerinde in-progress task var!");
          return;
        }
        break;

      case "under_80":
        // Performansı %80'in üzerinde olan ve in-progress'te işi olmayan Developerları filtrele
        const lowPerformers = availableUsers.filter(
          (user) => user.currentCompletionRatio <= 80
        );
        if (lowPerformers.length > 0) {
          selectedUser =
            lowPerformers[Math.floor(Math.random() * lowPerformers.length)];
          selectedUserId = selectedUser.accountId;
        } else {
          alert(
            "Performansı %80'in altında olan ve uygun durumda Developer bulunamadı!"
          );
          return;
        }
        break;

      case "lowest_done":
        // Done puanı en düşük ve in-progress'te işi olmayan Developer
        selectedUser = availableUsers.reduce(
          (min, user) =>
            !min || user.donePoints < min.donePoints ? user : min,
          null
        );
        selectedUserId = selectedUser.accountId;
        break;

      case "lowest_total":
        // Toplam puanı en düşük ve in-progress'te işi olmayan Developer
        selectedUser = availableUsers.reduce(
          (min, user) =>
            !min || user.totalPoints < min.totalPoints ? user : min,
          null
        );
        selectedUserId = selectedUser.accountId;
        break;

      case "random":
        // In-progress'te işi olmayan Developerlar arasından rastgele seç
        selectedUser =
          availableUsers[Math.floor(Math.random() * availableUsers.length)];
        selectedUserId = selectedUser.accountId;
        break;

      default:
        alert("Geçersiz atama tipi!");
        return;
    }

    if (!selectedUserId || !selectedUser) {
      alert("Uygun Developer bulunamadı!");
      return;
    }

    // Disable button and add visual feedback
    assignTask.disabled = true;
    assignTask.classList.add("opacity-50", "cursor-not-allowed");
    assignTask.textContent = "Processing...";

    // Assign task using cached data
    ipcRenderer.send("assign-task", {
      taskKey: selectedTaskKey,
      selectedUserId: selectedUserId,
      cachedUsers: cachedUsers,
      cachedTasks: cachedTasks,
      comment: taskComment.value.trim(),
      moveToSelectedForDev: moveToSelectedForDev.checked,
      isTestMode: testMode.checked,
      assignmentType: assignmentType.value,
    });
  } catch (error) {
    console.error("Task atama sırasında hata:", error);
    alert("Task atama işlemi sırasında bir hata oluştu!");
    assignTask.disabled = false;
    assignTask.classList.remove("opacity-50", "cursor-not-allowed");
    assignTask.textContent = "Start Process";
  }
});

// Task assignment result listener
ipcRenderer.on("task-assigned", (event, result) => {
  // Re-enable button and remove visual feedback
  assignTask.disabled = false;
  assignTask.classList.remove("opacity-50", "cursor-not-allowed");
  assignTask.textContent = "Start Process";

  if (result.success) {
    alert(`Task başarıyla atandı!`);
    taskComment.value = "";
    moveToSelectedForDev.checked = false;
    updateTaskList();
  } else {
    if (result.activeTasks && result.activeTasks.length > 0) {
      const taskList = result.activeTasks.join("\n");
      alert(
        `Developernın üzerinde aktif task'lar olduğu için atama yapılamadı.\n\nAktif Task'lar:\n${taskList}`
      );
    } else {
      alert(result.error || "Task atama işlemi başarısız oldu!");
    }
  }
});

// Update lists on page load
window.addEventListener("load", () => {
  updateUserList();
  updateTaskList();
});

// Selim'e Ata butonu
const assignToSelim = document.getElementById("assignToSelim");
const selimModal = document.getElementById("selimModal");
const closeSelimModal = document.getElementById("closeSelimModal");

taskToAssign.addEventListener("change", () => {
  if (taskToAssign.value === "") {
    assignToSelim.classList.add("hidden");
  } else {
    assignToSelim.classList.remove("hidden");
  }
});

assignToSelim.addEventListener("click", () => {
  selimModal.classList.remove("hidden");
});

closeSelimModal.addEventListener("click", () => {
  selimModal.classList.add("hidden");
});

// Modal dışına tıklandığında kapatma
selimModal.addEventListener("click", (e) => {
  if (e.target === selimModal) {
    selimModal.classList.add("hidden");
  }
});

// Log fonksiyonu
function log(message) {
  const logs = document.getElementById('logs');
  const formattedMessage = message.trim() + '\n';
  logs.textContent += formattedMessage;
  logs.scrollTop = logs.scrollHeight;
}

// Otomasyon fonksiyonları
async function startAutomation() {
  const sourceEmail = document.getElementById('sourceEmailAutomation').value;
  const assignmentMethod = document.getElementById('assignmentMethodAutomation').value;
  const testMode = document.getElementById('testMode').checked;

  if (!sourceEmail) {
    log('Hata: Kaynak e-posta adresi gerekli');
    return;
  }

  try {
    // Butonu devre dışı bırak
    const startAutomationBtn = document.getElementById('startAutomation');
    startAutomationBtn.disabled = true;
    startAutomationBtn.classList.add('opacity-50', 'cursor-not-allowed');
    startAutomationBtn.innerHTML = '<svg class="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>İşlem Yapılıyor...';

    log('Otomasyon başlatılıyor...');
    log(`Kaynak e-posta: ${sourceEmail}`);
    log(`Atama yöntemi: ${assignmentMethod}`);
    log(`Test modu: ${testMode ? 'Aktif' : 'Pasif'}`);

    // Otomasyonu başlat
    ipcRenderer.send('start-automation', {
      sourceEmail,
      assignmentMethod,
      isTestMode: testMode
    });

  } catch (error) {
    log(`Hata: ${error.message}`);
    // Butonu tekrar aktif et
    const startAutomationBtn = document.getElementById('startAutomation');
    startAutomationBtn.disabled = false;
    startAutomationBtn.classList.remove('opacity-50', 'cursor-not-allowed');
    startAutomationBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" /></svg><span>Otomasyonu Başlat</span>';
  }
}

// Event listener'ları ekle
document.addEventListener('DOMContentLoaded', function() {
  // ... existing code ...

  // Otomasyon başlatma butonu
  const startAutomationBtn = document.getElementById('startAutomation');
  if (startAutomationBtn) {
    startAutomationBtn.addEventListener('click', startAutomation);
  }
});

// Otomasyon tamamlandığında
ipcRenderer.on('automation-completed', (event, result) => {
  // Butonu tekrar aktif et
  const startAutomationBtn = document.getElementById('startAutomation');
  startAutomationBtn.disabled = false;
  startAutomationBtn.classList.remove('opacity-50', 'cursor-not-allowed');
  startAutomationBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" /></svg><span>Otomasyonu Başlat</span>';

  if (result.success) {
    log(result.message);
  } else {
    log(`Hata: ${result.error}`);
  }
});
