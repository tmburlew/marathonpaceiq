// ---- EDIT THIS BEFORE DEPLOYING ----
// Your Strava Client ID is public (not secret), safe to hardcode here.
// Get it from https://www.strava.com/settings/api
const STRAVA_CLIENT_ID = "YOUR_STRAVA_CLIENT_ID";
// -------------------------------------

const REDIRECT_URI = `${window.location.origin}/api/callback`;

const connectSection = document.getElementById("connect-section");
const dashboardSection = document.getElementById("dashboard-section");
const statusPill = document.getElementById("status-pill");
const connectBtn = document.getElementById("connect-btn");
const errorMsg = document.getElementById("connect-error");
const syncBtn = document.getElementById("sync-btn");
const syncStatus = document.getElementById("sync-status");

let trendChartInstance = null;

connectBtn.addEventListener("click", () => {
  const authUrl = `https://www.strava.com/oauth/authorize` +
    `?client_id=${STRAVA_CLIENT_ID}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&approval_prompt=auto` +
    `&scope=activity:read_all`;
  window.location.href = authUrl;
});

syncBtn.addEventListener("click", async () => {
  syncBtn.disabled = true;
  syncStatus.textContent = "Syncing your full Strava history… this can take a moment.";

  try {
    const response = await fetch("/api/sync");
    const result = await response.json();

    if (response.ok) {
      syncStatus.textContent = `Synced ${result.synced} activities.`;
      await loadDashboard();
    } else {
      syncStatus.textContent = "Sync failed. Check the Vercel function logs.";
    }
  } catch (err) {
    syncStatus.textContent = "Sync failed. Check the Vercel function logs.";
  } finally {
    syncBtn.disabled = false;
  }
});

async function init() {
  const params = new URLSearchParams(window.location.search);

  if (params.get("error")) {
    showError(params.get("error"));
    return;
  }

  const isConnected = await loadDashboard();
  if (!isConnected) {
    showConnectScreen();
  }
}

function showError(code) {
  errorMsg.hidden = false;
  errorMsg.textContent = `Couldn't connect to Strava (${code}). Try again.`;
  showConnectScreen();
}

function showConnectScreen() {
  connectSection.hidden = false;
  dashboardSection.hidden = true;
  statusPill.textContent = "Not connected";
  statusPill.className = "status-pill status-pill--offline";
}

async function loadDashboard() {
  try {
    const response = await fetch("/api/activities");
    if (response.status === 404) return false;
    if (!response.ok) throw new Error("activities_fetch_failed");

    const activities = await response.json();
    const runs = activities.filter(a => a.type === "Run" && a.distance > 0);

    connectSection.hidden = true;
    dashboardSection.hidden = false;
    statusPill.textContent = "Connected";
    statusPill.className = "status-pill status-pill--online";

    renderStats(runs);
    renderRunsTable(runs);
    renderPredictions(runs);
    renderPersonalBests(runs);
    renderTrainingLoad(runs);
    renderEffortMix(runs);
    renderTrendChart(runs);
    renderHeatmap(runs);

    if (runs.length === 0) {
      syncStatus.textContent = "Connected, but no synced runs yet. Click \"Sync Strava data\" to pull your history.";
    }

    return true;
  } catch (err) {
    return false;
  }
}

// ---------- Stats ----------

function renderStats(runs) {
  const totalDistanceMeters = runs.reduce((sum, r) => sum + r.distance, 0);
  const totalMiles = totalDistanceMeters / 1609.34;
  const totalElevationMeters = runs.reduce((sum, r) => sum + (r.total_elevation_gain || 0), 0);
  const everestCount = totalElevationMeters / 8849;

  document.getElementById("stat-runs").textContent = runs.length;
  document.getElementById("stat-distance").textContent = `${totalMiles.toFixed(1)} mi`;
  document.getElementById("stat-elevation").textContent = `${Math.round(totalElevationMeters).toLocaleString()} m`;
  document.getElementById("stat-everest").textContent = `${everestCount.toFixed(2)}×`;

  const best = findBestPredictorRun(runs);
  document.getElementById("stat-pace").textContent = best
    ? formatPace(best.distance, best.moving_time)
    : "—";
}

// ---------- Recent runs table ----------

function renderRunsTable(runs) {
  const tbody = document.getElementById("runs-tbody");
  tbody.innerHTML = "";

  const sorted = [...runs].sort((a, b) => new Date(b.start_date) - new Date(a.start_date));

  sorted.slice(0, 15).forEach(run => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${new Date(run.start_date).toLocaleDateString()}</td>
      <td>${escapeHtml(run.name)}</td>
      <td>${(run.distance / 1609.34).toFixed(2)} mi</td>
      <td>${formatDuration(run.moving_time)}</td>
      <td>${formatPace(run.distance, run.moving_time)}</td>
    `;
    tbody.appendChild(row);
  });
}

// ---------- Predictions (Riegel formula) ----------

function findBestPredictorRun(runs) {
  const qualifying = runs.filter(r => r.distance >= 3218); // ~2 miles
  if (qualifying.length === 0) return null;

  return qualifying.reduce((fastest, run) => {
    const pace = run.moving_time / run.distance;
    const fastestPace = fastest.moving_time / fastest.distance;
    return pace < fastestPace ? run : fastest;
  });
}

function predictTime(knownDistanceMeters, knownTimeSeconds, targetDistanceMeters) {
  return knownTimeSeconds * Math.pow(targetDistanceMeters / knownDistanceMeters, 1.06);
}

function renderPredictions(runs) {
  const best = findBestPredictorRun(runs);

  const distances = {
    "predict-5k": 5000,
    "predict-10k": 10000,
    "predict-half": 21097.5,
    "predict-full": 42195
  };

  if (!best) {
    Object.keys(distances).forEach(id => {
      document.getElementById(id).textContent = "—";
    });
    return;
  }

  Object.entries(distances).forEach(([id, meters]) => {
    const seconds = predictTime(best.distance, best.moving_time, meters);
    document.getElementById(id).textContent = formatDuration(Math.round(seconds));
  });
}

// ---------- Personal bests (real recorded times) ----------

function findPersonalBest(runs, targetDistanceMeters, tolerance = 0.05) {
  const lower = targetDistanceMeters * (1 - tolerance);
  const upper = targetDistanceMeters * (1 + tolerance);

  const qualifying = runs.filter(r => r.distance >= lower && r.distance <= upper);
  if (qualifying.length === 0) return null;

  return qualifying.reduce((fastest, run) =>
    run.moving_time < fastest.moving_time ? run : fastest
  );
}

function renderPersonalBests(runs) {
  const distances = {
    "best-5k": 5000,
    "best-10k": 10000,
    "best-half": 21097.5,
    "best-full": 42195
  };

  Object.entries(distances).forEach(([id, meters]) => {
    const el = document.getElementById(id);
    const best = findPersonalBest(runs, meters);

    if (best) {
      el.textContent = formatDuration(best.moving_time);
      el.classList.remove("predict-value--muted");
    } else {
      el.textContent = "No run yet";
      el.classList.add("predict-value--muted");
    }
  });
}

// ---------- Training load (ACWR) ----------

function computeACWR(runs) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dailyLoad = {};
  runs.forEach(r => {
    const d = new Date(r.start_date);
    d.setHours(0, 0, 0, 0);
    const daysAgo = Math.floor((today - d) / 86400000);
    if (daysAgo >= 0 && daysAgo < 28) {
      dailyLoad[daysAgo] = (dailyLoad[daysAgo] || 0) + (r.moving_time / 60);
    }
  });

  let acuteSum = 0;
  let chronicSum = 0;
  for (let i = 0; i < 28; i++) {
    const load = dailyLoad[i] || 0;
    chronicSum += load;
    if (i < 7) acuteSum += load;
  }

  const acute = acuteSum / 7;
  const chronic = chronicSum / 28;
  const ratio = chronic > 0 ? acute / chronic : null;

  let status = "Not enough data";
  let statusClass = "neutral";
  if (ratio !== null) {
    if (ratio < 0.8) {
      status = "Building";
      statusClass = "low";
    } else if (ratio <= 1.3) {
      status = "Optimal";
      statusClass = "good";
    } else if (ratio <= 1.5) {
      status = "Caution";
      statusClass = "warn";
    } else {
      status = "High load";
      statusClass = "danger";
    }
  }

  return { acute, chronic, ratio, status, statusClass };
}

function renderTrainingLoad(runs) {
  const { acute, chronic, ratio, status, statusClass } = computeACWR(runs);

  document.getElementById("load-acute").textContent = `${Math.round(acute)} min/day`;
  document.getElementById("load-chronic").textContent = `${Math.round(chronic)} min/day`;
  document.getElementById("load-ratio").textContent = ratio !== null ? ratio.toFixed(2) : "—";

  const badge = document.getElementById("load-status");
  badge.textContent = status;
  badge.className = `load-badge load-badge--${statusClass}`;
}

// ---------- Training mix (easy vs. hard) ----------

function computeEffortMix(runs) {
  const best = findBestPredictorRun(runs);
  if (!best) return null;

  const thresholdPaceSecPerMile = best.moving_time / (best.distance / 1609.34);
  const hardCutoff = thresholdPaceSecPerMile * 1.15;

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recent = runs.filter(r => new Date(r.start_date) >= thirtyDaysAgo && r.distance > 0);
  if (recent.length === 0) return null;

  let hard = 0;
  recent.forEach(r => {
    const pace = r.moving_time / (r.distance / 1609.34);
    if (pace <= hardCutoff) hard++;
  });

  const easyPct = Math.round(((recent.length - hard) / recent.length) * 100);
  return { easyPct, hardPct: 100 - easyPct };
}

function renderEffortMix(runs) {
  const mix = computeEffortMix(runs);
  const easyBar = document.getElementById("effort-easy-bar");
  const hardBar = document.getElementById("effort-hard-bar");
  const easyLabel = document.getElementById("effort-easy-label");
  const hardLabel = document.getElementById("effort-hard-label");

  if (!mix) {
    easyBar.style.width = "0%";
    hardBar.style.width = "0%";
    easyLabel.textContent = "Not enough recent runs";
    hardLabel.textContent = "";
    return;
  }

  easyBar.style.width = `${mix.easyPct}%`;
  hardBar.style.width = `${mix.hardPct}%`;
  easyLabel.textContent = `Easy ${mix.easyPct}%`;
  hardLabel.textContent = `Hard ${mix.hardPct}%`;
}

// ---------- Weekly trend chart ----------

function groupByWeek(runs, weeksBack = 12) {
  const today = new Date();
  const weeks = [];

  for (let i = weeksBack - 1; i >= 0; i--) {
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() - i * 7);
    const weekStart = new Date(weekEnd);
    weekStart.setDate(weekStart.getDate() - 6);
    weeks.push({ start: weekStart, end: weekEnd, miles: 0, seconds: 0 });
  }

  runs.forEach(r => {
    const d = new Date(r.start_date);
    const week = weeks.find(w => d >= w.start && d <= w.end);
    if (week) {
      week.miles += r.distance / 1609.34;
      week.seconds += r.moving_time;
    }
  });

  return weeks.map(w => ({
    label: `${w.start.getMonth() + 1}/${w.start.getDate()}`,
    miles: Math.round(w.miles * 10) / 10,
    avgPaceSecPerMile: w.miles > 0 ? Math.round(w.seconds / w.miles) : null
  }));
}

function renderTrendChart(runs) {
  const weeks = groupByWeek(runs, 12);
  const canvas = document.getElementById("trend-chart");

  if (trendChartInstance) {
    trendChartInstance.destroy();
  }

  trendChartInstance = new Chart(canvas, {
    data: {
      labels: weeks.map(w => w.label),
      datasets: [
        {
          type: "bar",
          label: "Weekly miles",
          data: weeks.map(w => w.miles),
          backgroundColor: "rgba(29,75,143,0.25)",
          yAxisID: "y"
        },
        {
          type: "line",
          label: "Avg pace (sec/mi)",
          data: weeks.map(w => w.avgPaceSecPerMile),
          borderColor: "#fc4c02",
          backgroundColor: "#fc4c02",
          spanGaps: true,
          tension: 0.3,
          yAxisID: "y1"
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          position: "left",
          title: { display: true, text: "Miles" }
        },
        y1: {
          position: "right",
          reverse: true,
          grid: { drawOnChartArea: false },
          title: { display: true, text: "Pace (sec/mi)" }
        }
      }
    }
  });
}

// ---------- Consistency heatmap ----------

function buildHeatmapDays(runs, weeksBack = 18) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - (weeksBack * 7 - 1));

  const dayTotals = {};
  runs.forEach(r => {
    const d = new Date(r.start_date);
    const key = d.toISOString().slice(0, 10);
    dayTotals[key] = (dayTotals[key] || 0) + r.distance / 1609.34;
  });

  const days = [];
  for (let i = 0; i < weeksBack * 7; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key, miles: dayTotals[key] || 0 });
  }
  return days;
}

function intensityLevel(miles, max) {
  if (miles <= 0) return 0;
  const ratio = miles / max;
  if (ratio > 0.75) return 4;
  if (ratio > 0.5) return 3;
  if (ratio > 0.25) return 2;
  return 1;
}

function renderHeatmap(runs) {
  const days = buildHeatmapDays(runs, 18);
  const max = Math.max(...days.map(d => d.miles), 1);
  const container = document.getElementById("heatmap-grid");
  container.innerHTML = "";

  days.forEach(d => {
    const cell = document.createElement("div");
    const level = intensityLevel(d.miles, max);
    cell.className = `heatmap-cell heatmap-cell--${level}`;
    cell.title = `${d.date}: ${d.miles.toFixed(1)} mi`;
    container.appendChild(cell);
  });
}

// ---------- Formatting helpers ----------

function formatPace(distanceMeters, timeSeconds) {
  const miles = distanceMeters / 1609.34;
  if (miles === 0) return "—";
  const secPerMile = timeSeconds / miles;
  const min = Math.floor(secPerMile / 60);
  const sec = Math.round(secPerMile % 60);
  return `${min}:${String(sec).padStart(2, "0")} /mi`;
}

function formatDuration(totalSeconds) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.round(totalSeconds % 60);

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

init();
