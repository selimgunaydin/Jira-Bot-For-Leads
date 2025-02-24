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

jiraBaseUrl.value = localStorage.getItem("JIRA_BASE_URL_LEAD") || "";
email.value = localStorage.getItem("EMAIL_LEAD") || "";
apiToken.value = localStorage.getItem("API_TOKEN_LEAD") || "";
projectKey.value = localStorage.getItem("PROJECT_KEY_LEAD") || "S1";
taskStatus.value =
  localStorage.getItem("TASK_STATUS_LEAD") || "Selected for Development";
excludedEmails.value = localStorage.getItem("EXCLUDED_EMAILS_LEAD") || "";

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

    ipcRenderer.send("update-config", {
      JIRA_BASE_URL: jiraBaseUrl.value,
      EMAIL: email.value,
      API_TOKEN: apiToken.value,
      PROJECT_KEY: projectKey.value,
      TASK_STATUS: taskStatus.value,
      EXCLUDED_EMAILS: excludedEmails.value,
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
  random: null
};
let userPointsData = [];
let lowPerformers = [];
let performanceType = localStorage.getItem("PERFORMANCE_TYPE_LEAD") || "done"; // Varsayılan performans hesaplama tipi

// Buton durumunu kontrol et
function checkButtonState() {
  const shouldBeEnabled = isUsersLoaded && 
    isTasksLoaded && 
    !isCalculating;

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
document.getElementById("performanceType").addEventListener("change", async (e) => {
    performanceType = e.target.value;
    localStorage.setItem("PERFORMANCE_TYPE_LEAD", performanceType);
    await calculateUserPoints();
});

// Sayfa yüklendiğinde performans tipini seç
document.getElementById("performanceType").value = performanceType;

// PROJECT_KEY filtresi olmadan hesaplanacak kullanıcılar için localStorage işlemleri
const excludedFromProjectKeyFilter = document.getElementById("excludedFromProjectKeyFilter");
excludedFromProjectKeyFilter.value = localStorage.getItem('EXCLUDED_FROM_PROJECT_KEY_FILTER') || '';
excludedFromProjectKeyFilter.addEventListener('change', (e) => {
    localStorage.setItem('EXCLUDED_FROM_PROJECT_KEY_FILTER', e.target.value);
});

// Developer puanlarını hesapla
async function calculateUserPoints() {
  isCalculating = true;
  checkButtonState();
  ipcRenderer.send("calculate-user-points", { 
    users: cachedUsers,
    performanceType: performanceType 
  });
}

// Modal elements
const targetPointsModal = document.getElementById("targetPointsModal");
const targetPointsContent = document.getElementById("targetPointsContent");
const saveTargetPoints = document.getElementById("saveTargetPoints");
const closeTargetPointsModal = document.getElementById("closeTargetPointsModal");
const editTargetPoints = document.getElementById("editTargetPoints");

// Modal işlemleri
function showTargetPointsModal() {
    targetPointsContent.innerHTML = '';
    cachedUsers.forEach(user => {
        const savedTarget = localStorage.getItem(`targetPoints-${user.emailAddress}`) || 0;
        const userDiv = document.createElement('div');
        userDiv.className = 'p-4 bg-gray-50 rounded-lg';
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
    targetPointsModal.classList.remove('hidden');
}

saveTargetPoints.addEventListener('click', async () => {
    const inputs = targetPointsContent.querySelectorAll('input');
    
    for (const input of inputs) {
        const email = input.dataset.email;
        const value = parseInt(input.value) || 0;
        localStorage.setItem(`targetPoints-${email}`, value);
    }

    targetPointsModal.classList.add('hidden');
    await calculateUserPoints();
});

closeTargetPointsModal.addEventListener('click', () => {
    targetPointsModal.classList.add('hidden');
});

// Hedef düzenleme butonu
editTargetPoints.addEventListener('click', () => {
    showTargetPointsModal();
});

// IPC Event Listeners
ipcRenderer.on("project-users-data", async (event, users) => {
    try {
        cachedUsers = users;
        
        assigneeUser.innerHTML = '<option value="">Select a user (optional)</option>';
        let needsTargetPoints = false;
        
        users.forEach((user) => {
            const option = document.createElement("option");
            option.value = user.accountId;
            const savedTarget = localStorage.getItem(`targetPoints-${user.emailAddress}`);
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
    
    taskToAssign.innerHTML = '<option value="">Select a task</option><option value="manual">Manuel Task Gir</option>';
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

ipcRenderer.on("user-points-calculated", (event, data) => {
    const { userPointsData: newUserPointsData, lowPerformers: newLowPerformers } = data;
    userPointsData = newUserPointsData;
    lowPerformers = newLowPerformers;
    
    // Developer listesini güncelle ve tamamlanma oranlarını göster
    assigneeUser.innerHTML = '<option value="">Select a user (optional)</option>';
    userPointsData.forEach((userData) => {
        const option = document.createElement("option");
        option.value = userData.accountId;
        option.textContent = `${userData.displayName} (${userData.currentCompletionRatio.toFixed(1)}%) ${
            userData.hasInProgressTasks ? "🔄" : "✅"
        }`;
        assigneeUser.appendChild(option);
    });

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
    const availableUsers = userPointsData.filter(user => !user.hasInProgressTasks);

    if (availableUsers.length === 0) {
      alert("Atama yapılabilecek uygun Developer bulunamadı! Tüm Developerların üzerinde in-progress task var.");
      return;
    }

    switch (assignmentType.value) {
      case "specific":
        if (!assigneeUser.value) {
          alert("Lütfen bir Developer seçin!");
          return;
        }
        selectedUserId = assigneeUser.value;
        selectedUser = userPointsData.find(u => u.accountId === selectedUserId);
        if (selectedUser?.hasInProgressTasks) {
          alert("Seçilen Developernın üzerinde in-progress task var!");
          return;
        }
        break;

      case "under_80":
        // Performansı %80'in üzerinde olan ve in-progress'te işi olmayan Developerları filtrele
        const highPerformers = availableUsers.filter(user => user.currentCompletionRatio <= 80);
        if (highPerformers.length > 0) {
          selectedUser = highPerformers[Math.floor(Math.random() * highPerformers.length)];
          selectedUserId = selectedUser.accountId;
        } else {
          alert("Performansı %80'in altında olan ve uygun durumda Developer bulunamadı!");
          return;
        }
        break;

      case "lowest_done":
        // Done puanı en düşük ve in-progress'te işi olmayan Developer
        selectedUser = availableUsers.reduce((min, user) => 
          !min || user.donePoints < min.donePoints ? user : min, null);
        selectedUserId = selectedUser.accountId;
        break;

      case "lowest_total":
        // Toplam puanı en düşük ve in-progress'te işi olmayan Developer
        selectedUser = availableUsers.reduce((min, user) => 
          !min || user.totalPoints < min.totalPoints ? user : min, null);
        selectedUserId = selectedUser.accountId;
        break;

      case "random":
        // In-progress'te işi olmayan Developerlar arasından rastgele seç
        selectedUser = availableUsers[Math.floor(Math.random() * availableUsers.length)];
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
      assignmentType: assignmentType.value
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
