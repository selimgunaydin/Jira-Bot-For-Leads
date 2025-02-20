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

jiraBaseUrl.value = localStorage.getItem("JIRA_BASE_URL") || "";
email.value = localStorage.getItem("EMAIL") || "";
apiToken.value = localStorage.getItem("API_TOKEN") || "";
projectKey.value = localStorage.getItem("PROJECT_KEY") || "S1";
taskStatus.value = localStorage.getItem("TASK_STATUS") || "Selected for Development";

const configInputs = [
  jiraBaseUrl,
  email,
  apiToken,
  projectKey,
  taskStatus,
];
configInputs.forEach((input) => {
  input.addEventListener("change", () => {
    localStorage.setItem("JIRA_BASE_URL", jiraBaseUrl.value);
    localStorage.setItem("EMAIL", email.value);
    localStorage.setItem("API_TOKEN", apiToken.value);
    localStorage.setItem("PROJECT_KEY", projectKey.value);
    localStorage.setItem("TASK_STATUS", taskStatus.value);

    ipcRenderer.send("update-config", {
      JIRA_BASE_URL: jiraBaseUrl.value,
      EMAIL: email.value,
      API_TOKEN: apiToken.value,
      PROJECT_KEY: projectKey.value,
      TASK_STATUS: taskStatus.value,
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
  });
});

const logs = document.getElementById("logs");

ipcRenderer.on("log-message", (event, message) => {
  const formattedMessage = message.trim() + "\n";
  logs.textContent += formattedMessage;
  logs.scrollTop = logs.scrollHeight;
});

// Leaderboard operations
const refreshLeaderboardBtn = document.getElementById("refreshLeaderboard");
const leaderboardList = document.getElementById("leaderboardList");

async function updateLeaderboard() {
  leaderboardList.innerHTML =
    '<div class="text-center text-gray-500">Loading...</div>';
  ipcRenderer.send("get-leaderboard");
}

ipcRenderer.on("leaderboard-data", (event, data) => {
  if (!data || data.length === 0) {
    leaderboardList.innerHTML =
      '<div class="text-center text-gray-500">No data found</div>';
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
        } tasks, ${user.totalPoints} points</div>
        <div class="text-sm text-gray-500">All: ${user.totalTaskCount} tasks, ${
        user.allTaskTotalPoint
      } points</div>
        <div class="text-sm text-gray-500">Points/Task Ratio: ${(
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

// Update leaderboard on page load and every 5 minutes
window.addEventListener("load", () => {
  updateLeaderboard();
  setInterval(updateLeaderboard, 5 * 60 * 1000);
});

// Task assignment elements
const assigneeUser = document.getElementById("assigneeUser");
const taskToAssign = document.getElementById("taskToAssign");
const assignmentType = document.getElementById("assignmentType");
const assignTask = document.getElementById("assignTask");
const refreshTaskAssignment = document.getElementById("refreshTaskAssignment");
const userSelectContainer = document.getElementById("userSelectContainer");

// Update user list
async function updateUserList() {
  ipcRenderer.send("get-project-users");
}

// Update task list
async function updateTaskList() {
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

// IPC Event Listeners
ipcRenderer.on("project-users-data", (event, users) => {
  try {
    assigneeUser.innerHTML =
      '<option value="">Select a user (optional)</option>';
    users.forEach((user) => {
      const option = document.createElement("option");
      option.value = user.accountId;
      option.textContent = user.displayName;
      assigneeUser.appendChild(option);
    });
  } catch (error) {
    console.error("Error updating user list:", error);
  }
});

ipcRenderer.on("unassigned-tasks-data", (event, tasks) => {
  try {
    taskToAssign.innerHTML = '<option value="">Select a task</option>';
    tasks.forEach((task) => {
      const option = document.createElement("option");
      option.value = task.key;
      option.textContent = `${task.key}: ${task.fields.summary}`;
      taskToAssign.appendChild(option);
    });
  } catch (error) {
    console.error("Error updating task list:", error);
  }
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
});

// Task assignment process
assignTask.addEventListener("click", () => {
  // Stop if button is already disabled
  if (assignTask.disabled) {
    return;
  }

  if (!taskToAssign.value) {
    alert("Please select a task!");
    return;
  }

  if (assignmentType.value === "specific" && !assigneeUser.value) {
    alert("Please select a user!");
    return;
  }

  // Disable button and add visual feedback
  assignTask.disabled = true;
  assignTask.classList.add("opacity-50", "cursor-not-allowed");
  assignTask.textContent = "Processing...";

  ipcRenderer.send("assign-task", {
    taskKey: taskToAssign.value,
    assignmentType: assignmentType.value,
    selectedUserId: assigneeUser.value,
  });
});

// Task assignment result listener
ipcRenderer.on("task-assigned", (event, result) => {
  // Re-enable button and remove visual feedback
  assignTask.disabled = false;
  assignTask.classList.remove("opacity-50", "cursor-not-allowed");
  assignTask.textContent = "Start Process";

  if (result.success) {
    alert(`Task successfully assigned to ${result.selectedUser.displayName}!`);
    updateTaskList();
  } else {
    alert(result.error || "Task assignment failed!");
  }
});

// Update lists on page load
window.addEventListener("load", () => {
  updateUserList();
  updateTaskList();
});
