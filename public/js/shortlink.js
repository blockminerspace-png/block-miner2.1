// shortlink URLs
const SHORTLINK_LIS_URL = "https://lis.shortlink.example.com"; // Replace with actual URL
const SHORTLINK_STORY_URL = "https://story.shortlink.example.com"; // Replace with actual URL

let currentStatus = null;

// Load shortlink status on page load
document.addEventListener("DOMContentLoaded", async () => {
  await loadShortlinkStatus();
  attachEventListeners();
});

async function loadShortlinkStatus() {
  try {
    const response = await fetch("/api/shortlink/status", {
      method: "GET",
      headers: { "Content-Type": "application/json" }
    });

    if (!response.ok) {
      throw new Error("Failed to load shortlink status");
    }

    const data = await response.json();
    currentStatus = data.status;

    renderStatus();
  } catch (error) {
    console.error("Error loading shortlink status:", error);
    const statusDiv = document.getElementById("shortlinkStatus");
    statusDiv.innerHTML = `<div class="status-error"><i class="bi bi-exclamation-triangle"></i> <p>Error loading status</p></div>`;
  }
}

function renderStatus() {
  const statusDiv = document.getElementById("shortlinkStatus");
  const contentDiv = document.getElementById("shortlinkContent");
  const progressFill = document.getElementById("progressFill");
  const progressText = document.getElementById("progressText");
  const rewardInfo = document.getElementById("rewardInfo");
  const resetInfo = document.getElementById("resetInfo");

  // Hide loading state
  statusDiv.style.display = "none";
  contentDiv.style.display = "block";

  // Update progress
  const totalSteps = 3;
  const completedSteps = currentStatus.current_step;
  const progressPercent = (completedSteps / totalSteps) * 100;
  progressFill.style.width = `${progressPercent}%`;
  progressText.textContent = `${completedSteps}/${totalSteps} Steps Completed`;

  // Check if already completed and can't retry
  if (currentStatus.isCompleted && !currentStatus.canRetry) {
    resetInfo.style.display = "block";
    disableAllSteps();
  } else if (currentStatus.isCompleted && currentStatus.canRetry) {
    // Reset for new day
    currentStatus.completed_at = null;
    currentStatus.current_step = 0;
  }

  // Update step UI
  updateStepUI(1, completedSteps >= 1);
  updateStepUI(2, completedSteps >= 2);
  updateStepUI(3, completedSteps >= 3);

  // Show reward info if completed today
  if (currentStatus.isCompleted && !currentStatus.canRetry) {
    rewardInfo.style.display = "block";
  }
}

function updateStepUI(stepNum, isCompleted) {
  const stepCard = document.getElementById(`step${stepNum}Card`);
  const statusSpan = document.getElementById(`step${stepNum}Status`);
  const actionBtn = document.getElementById(`step${stepNum}Btn`);
  const actionLink = document.getElementById(`step${stepNum}Link`);

  if (isCompleted) {
    stepCard.classList.add("completed");
    statusSpan.textContent = "✓ Completed";
    statusSpan.classList.add("completed");
    if (actionBtn) actionBtn.style.display = "none";
    if (actionLink) actionLink.style.display = "none";
  } else {
    stepCard.classList.remove("completed");
    statusSpan.textContent = "Pending";
    statusSpan.classList.remove("completed");
    if (stepNum < 3) {
      if (actionBtn) actionBtn.style.display = "inline-block";
      if (actionLink) actionLink.style.display = "inline-block";
    }
  }
}

function disableAllSteps() {
  const steps = [1, 2, 3];
  steps.forEach((stepNum) => {
    const actionBtn = document.getElementById(`step${stepNum}Btn`);
    const actionLink = document.getElementById(`step${stepNum}Link`);
    if (actionBtn) actionBtn.disabled = true;
    if (actionLink) actionLink.style.pointerEvents = "none";
  });
}

function attachEventListeners() {
  // Step buttons
  const step1Btn = document.getElementById("step1Btn");
  const step2Btn = document.getElementById("step2Btn");
  const step3Btn = document.getElementById("step3Btn");

  if (step1Btn) step1Btn.addEventListener("click", () => completeStep(1));
  if (step2Btn) step2Btn.addEventListener("click", () => completeStep(2));
  if (step3Btn) step3Btn.addEventListener("click", () => completeStep(3));

  // Set shortlink URLs
  const step1Link = document.getElementById("step1Link");
  const step2Link = document.getElementById("step2Link");

  if (step1Link) step1Link.href = SHORTLINK_LIS_URL;
  if (step2Link) step2Link.href = SHORTLINK_STORY_URL;

  // Track when user visits shortlinks
  if (step1Link) {
    step1Link.addEventListener("click", () => {
      // Show the complete button after they've visited
      setTimeout(() => {
        const btn = document.getElementById("step1Btn");
        if (btn) btn.style.display = "inline-block";
      }, 500);
    });
  }

  if (step2Link) {
    step2Link.addEventListener("click", () => {
      // Show the complete button after they've visited
      setTimeout(() => {
        const btn = document.getElementById("step2Btn");
        if (btn) btn.style.display = "inline-block";
      }, 500);
    });
  }
}

async function completeStep(stepNum) {
  try {
    const btn = document.getElementById(`step${stepNum}Btn`);
    if (btn) btn.disabled = true;

    const response = await fetch("/api/shortlink/complete-step", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step: stepNum })
    });

    if (!response.ok) {
      const errorData = await response.json();
      alert(`Error: ${errorData.message}`);
      if (btn) btn.disabled = false;
      return;
    }

    const data = await response.json();

    if (data.ok) {
      currentStatus.current_step = stepNum;

      // If step 3 completed, show reward
      if (stepNum === 3) {
        currentStatus.isCompleted = true;
        currentStatus.completed_at = Date.now();
        const rewardInfo = document.getElementById("rewardInfo");
        if (rewardInfo) rewardInfo.style.display = "block";

        // Show success toast
        showToast("🎉 Reward Claimed! You received a 5 GHS machine!");
      }

      renderStatus();
    }
  } catch (error) {
    console.error("Error completing step:", error);
    alert("Error completing step. Please try again.");
    const btn = document.getElementById(`step${stepNum}Btn`);
    if (btn) btn.disabled = false;
  }
}

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("show");
  }, 10);

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// Refresh status periodically
setInterval(() => {
  loadShortlinkStatus();
}, 30000); // Every 30 seconds
