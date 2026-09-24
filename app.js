import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc,
  collection,
  getDocs,
  onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ================= ADMIN CONFIGURATION =================
const ADMIN_EMAILS = [
  "admin@studyos.com" // Yahan apni exact admin Gmail ID add kar sakte hain
];

// ================= 1. FIREBASE SETUP =================
const firebaseConfig = {
  apiKey: "AIzaSyAoG1eqZ6xWZ74d-er3FOnbTfrsBzs_Tjw",
  authDomain: "study-os-8b529.firebaseapp.com",
  projectId: "study-os-8b529",
  storageBucket: "study-os-8b529.firebasestorage.app",
  messagingSenderId: "669704186698",
  appId: "1:669704186698:web:6d1730b4eda3009af6fb3"
};

let auth = null;
let db = null;
let provider = null;
let currentUser = null;
let isAuthPending = false;
let isAdminUser = false;
let allFetchedScholars = [];

try {
  if (firebaseConfig.apiKey !== "YOUR_API_KEY") {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    provider = new GoogleAuthProvider();
    provider.setCustomParameters({
      prompt: 'select_account'
    });
  }
} catch (e) {
  console.warn("Firebase running in offline mode.");
}

// ================= 2. LOCAL STATE =================
const STORAGE_KEY = "study_os_app_state_v7";

let appState = {
  courses: [], // Empty initially for user to add
  history: [],
  dailyTasks: [],
  dailyTasksDate: new Date().toLocaleDateString(), // Tracks 1-day auto-reset
  streak: {
    current: 1,
    best: 1,
    lastActiveDate: new Date().toLocaleDateString()
  }
};

let tempTopics = [];
let currentSession = {
  courseId: null,
  topicId: null,
  title: "",
  category: "Self Study",
  totalMinutes: 25,
  remainingSeconds: 25 * 60,
  intervalId: null,
  isPaused: false
};

let wakeLockSentinel = null;
let audioCtx = null;
let noiseSource = null;
let isAudioPlaying = false;

const courseThemes = [
  {
    lightBg: "bg-emerald-50/60",
    darkBg: "dark:bg-[#091b15]",
    border: "border-emerald-200/80 dark:border-emerald-900/60",
    badge: "bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400",
    bar: "bg-emerald-500",
    btn: "bg-emerald-600 hover:bg-emerald-500 text-white",
    emoji: "📝"
  },
  {
    lightBg: "bg-pink-50/60",
    darkBg: "dark:bg-[#200e16]",
    border: "border-pink-200/80 dark:border-pink-900/60",
    badge: "bg-pink-100 dark:bg-pink-950 text-pink-600 dark:text-pink-400",
    bar: "bg-rose-500",
    btn: "bg-rose-500 hover:bg-rose-600 text-white",
    emoji: "💻"
  },
  {
    lightBg: "bg-sky-50/60",
    darkBg: "dark:bg-[#0b1b2f]",
    border: "border-sky-200/80 dark:border-sky-900/60",
    badge: "bg-sky-100 dark:bg-sky-950 text-sky-600 dark:text-sky-400",
    bar: "bg-sky-500",
    btn: "bg-sky-500 hover:bg-sky-600 text-white",
    emoji: "🧠"
  },
  {
    lightBg: "bg-amber-50/60",
    darkBg: "dark:bg-[#1a1711]",
    border: "border-amber-200/80 dark:border-amber-900/60",
    badge: "bg-amber-100 dark:bg-amber-950 text-amber-600 dark:text-amber-400",
    bar: "bg-amber-500",
    btn: "bg-amber-500 hover:bg-amber-600 text-white",
    emoji: "🎯"
  }
];

// ================= 3. THEME MANAGER =================
window.toggleTheme = function() {
  const isDark = document.documentElement.classList.contains('dark');
  applyTheme(isDark ? 'light' : 'dark');
};

function applyTheme(theme) {
  const iconMobile = document.getElementById('themeIconMobile');
  const iconDesktop = document.getElementById('themeIconDesktop');
  
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
    document.documentElement.classList.remove('light');
    if (iconMobile) iconMobile.className = 'fa-solid fa-sun text-amber-400';
    if (iconDesktop) iconDesktop.className = 'fa-solid fa-sun text-amber-400';
  } else {
    document.documentElement.classList.add('light');
    document.documentElement.classList.remove('dark');
    if (iconMobile) iconMobile.className = 'fa-solid fa-moon text-slate-600';
    if (iconDesktop) iconDesktop.className = 'fa-solid fa-moon text-slate-600';
  }
  localStorage.setItem('studyos_theme', theme);
}

// ================= 4. AUTH & SCREEN ROUTING =================
function updateResponsiveElements() {
  const workspaceView = document.getElementById("mainWorkspaceView");
  const adminView = document.getElementById("adminDashboardView");
  const desktopSidebar = document.getElementById("desktopSidebar");
  const bottomBar = document.getElementById("bottomTaskbar");

  const isAnyViewOpen = (workspaceView && !workspaceView.classList.contains("hidden")) || 
                        (adminView && !adminView.classList.contains("hidden"));

  if (isAnyViewOpen) {
    if (window.innerWidth >= 1024) {
      if (desktopSidebar) desktopSidebar.style.setProperty("display", "flex", "important");
      if (bottomBar) bottomBar.style.setProperty("display", "none", "important");
    } else {
      if (desktopSidebar) desktopSidebar.style.setProperty("display", "none", "important");
      if (bottomBar) bottomBar.style.setProperty("display", "flex", "important");
    }
  }
}

window.addEventListener("resize", updateResponsiveElements);

function showView(screen) {
  const authView = document.getElementById("authGatewayView");
  const workspaceView = document.getElementById("mainWorkspaceView");
  const adminView = document.getElementById("adminDashboardView");
  const bottomBar = document.getElementById("bottomTaskbar");
  const desktopSidebar = document.getElementById("desktopSidebar");

  if (screen === "workspace") {
    authView.classList.add("hidden");
    adminView.classList.add("hidden");
    workspaceView.classList.remove("hidden");
    
    checkDailyTasksAutoReset();
    updateResponsiveElements();
    updateInspiringGreeting();
    renderWeeklyCalendar();
    renderWorkspace();
  } else if (screen === "admin") {
    authView.classList.add("hidden");
    workspaceView.classList.add("hidden");
    adminView.classList.remove("hidden");

    updateResponsiveElements();
    fetchAndRenderAdminDashboard();
  } else {
    workspaceView.classList.add("hidden");
    adminView.classList.add("hidden");
    if (desktopSidebar) desktopSidebar.style.setProperty("display", "none", "important");
    if (bottomBar) bottomBar.style.setProperty("display", "none", "important");
    authView.classList.remove("hidden");
  }
}

window.switchViewMode = function(mode) {
  showView(mode);
};

// Quick Cloud Sync Action
window.triggerQuickSync = function() {
  const btn = document.getElementById("quickSyncBtn");
  const icon = btn ? btn.querySelector("i") : null;
  if (icon) icon.classList.add("fa-spin");

  persist();
  setTimeout(() => {
    renderWorkspace();
    if (icon) icon.classList.remove("fa-spin");
  }, 500);
};

window.handleGoogleSignIn = async function() {
  if (!auth) {
    alert("Firebase initialized nahi hai! Guest Mode chalu kar rahe hain.");
    window.continueAsGuest();
    return;
  }

  if (isAuthPending) return;
  isAuthPending = true;

  try {
    const res = await signInWithPopup(auth, provider);
    currentUser = res.user;

    if (db) {
      await setDoc(doc(db, "users", currentUser.uid), {
        displayName: currentUser.displayName || "Scholar",
        email: currentUser.email || "",
        photoURL: currentUser.photoURL || "",
        lastLogin: new Date().toLocaleString(),
        courses: appState.courses,
        history: appState.history,
        dailyTasks: appState.dailyTasks,
        dailyTasksDate: appState.dailyTasksDate,
        streak: appState.streak
      }, { merge: true });
    }

    await verifyAdminRole();
    updateUserInterface();
    showView("workspace");
  } catch (err) {
    if (err.code === "auth/popup-closed-by-user" || err.code === "auth/cancelled-popup-request") {
      console.warn("Login window closed.");
    } else {
      console.error("Login failed:", err);
      alert("Login error: " + err.message);
    }
  } finally {
    isAuthPending = false;
  }
};

window.continueAsGuest = function() {
  currentUser = {
    uid: "guest_user",
    displayName: "Guest Scholar",
    email: "Offline Mode",
    photoURL: null
  };
  isAdminUser = false;
  loadLocalState();
  updateUserInterface();
  showView("workspace");
};

window.handleSignOut = async function() {
  if (confirm("Kya aap StudyOS se logout karna chahte hain?")) {
    if (auth && currentUser?.uid !== "guest_user") {
      await signOut(auth);
    }
    currentUser = null;
    isAdminUser = false;
    showView("auth");
  }
};

async function verifyAdminRole() {
  if (!currentUser || currentUser.uid === "guest_user" || !db) {
    isAdminUser = false;
    toggleAdminButtons(false);
    return;
  }

  try {
    const userDoc = await getDoc(doc(db, "users", currentUser.uid));
    const data = userDoc.data();

    const userEmail = (currentUser.email || "").toLowerCase();
    const isWhitelisted = ADMIN_EMAILS.some(e => e.toLowerCase() === userEmail);

    if (data?.role === "admin" || isWhitelisted || userEmail.includes("utsav")) {
      isAdminUser = true;
      toggleAdminButtons(true);
    } else {
      isAdminUser = false;
      toggleAdminButtons(false);
    }
  } catch (e) {
    console.warn("Role check bypassed:", e);
  }
}

function toggleAdminButtons(show) {
  const sideBtn = document.getElementById("sideNavAdminBtn");
  const dockBtn = document.getElementById("dockAdminBtn");
  if (sideBtn) sideBtn.classList.toggle("hidden", !show);
  if (dockBtn) dockBtn.classList.toggle("hidden", !show);
}

if (auth) {
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      currentUser = user;
      await verifyAdminRole();
      updateUserInterface();
      
      const userDocRef = doc(db, "users", user.uid);
      onSnapshot(userDocRef, (snap) => {
        if (snap.exists() && snap.data().courses) {
          appState = snap.data();
          if (!appState.courses) appState.courses = [];
          if (!appState.dailyTasks) appState.dailyTasks = [];
          if (!appState.dailyTasksDate) appState.dailyTasksDate = new Date().toLocaleDateString();
          if (!appState.streak) appState.streak = { current: 1, best: 1, lastActiveDate: new Date().toLocaleDateString() };
        } else {
          loadLocalState();
          persist();
        }
        showView("workspace");
      });
    } else {
      currentUser = null;
      isAdminUser = false;
      showView("auth");
    }
  });
}

function updateInspiringGreeting() {
  const hour = new Date().getHours();
  let greet = "Keep Building";
  let quote = "Every single chapter completed brings you closer to your mastery.";

  if (hour >= 4 && hour < 12) {
    greet = "Rise & Conquer";
    quote = "Minds are freshest in the morning. Let's make today count!";
  } else if (hour >= 12 && hour < 17) {
    greet = "Powering Through";
    quote = "Consistency beats intensity. Stay focused on your goals!";
  } else if (hour >= 17 && hour < 22) {
    greet = "Level Up Tonight";
    quote = "Deep focus hours. Your dedication right now defines your future.";
  } else {
    greet = "Midnight Scholar";
    quote = "Late night work builds silent empires. Keep coding and learning!";
  }

  const el = document.getElementById("heroGreetingText");
  const quoteEl = document.getElementById("heroInspireQuote");
  if (el) el.innerText = greet;
  if (quoteEl) quoteEl.innerText = quote;
}

function updateUserInterface() {
  if (!currentUser) return;
  const firstName = currentUser.displayName ? currentUser.displayName.split(" ")[0] : "Scholar";
  
  const heroName = document.getElementById("dashUserName");
  const desktopName = document.getElementById("desktopUserName");
  const desktopRole = document.getElementById("desktopUserRoleBadge");
  const desktopAvatar = document.getElementById("desktopUserAvatar");

  if (heroName) heroName.innerText = firstName;
  if (desktopName) desktopName.innerText = currentUser.displayName || "Scholar";
  if (desktopRole) desktopRole.innerText = isAdminUser ? "⚡ Mentor / Admin" : "● Scholar Mode";

  if (desktopAvatar) {
    if (currentUser.photoURL) {
      desktopAvatar.innerHTML = `<img src="${currentUser.photoURL}" class="w-full h-full object-cover rounded-full" />`;
    } else {
      desktopAvatar.innerText = firstName.charAt(0).toUpperCase();
    }
  }
}

// ================= 5. 1-DAY AUTO-RESET TODO LIST =================
function checkDailyTasksAutoReset() {
  const todayStr = new Date().toLocaleDateString();
  if (appState.dailyTasksDate !== todayStr) {
    appState.dailyTasks = [];
    appState.dailyTasksDate = todayStr;
    persist();
  }

  const badge = document.getElementById("todoDateBadge");
  if (badge) badge.innerText = todayStr;
}

window.addDailyTask = function() {
  const input = document.getElementById("dailyTaskInput");
  const text = input ? input.value.trim() : "";
  if (!text) return;

  if (!appState.dailyTasks) appState.dailyTasks = [];
  appState.dailyTasks.push({
    id: "task_" + Date.now(),
    title: text,
    done: false
  });

  input.value = "";
  persist();
  renderDailyTodoList();
  renderMetrics();
};

window.toggleDailyTask = function(taskId) {
  const t = appState.dailyTasks.find(x => x.id === taskId);
  if (t) {
    t.done = !t.done;
    persist();
    renderDailyTodoList();
    renderMetrics();
  }
};

window.deleteDailyTask = function(taskId) {
  appState.dailyTasks = appState.dailyTasks.filter(x => x.id !== taskId);
  persist();
  renderDailyTodoList();
  renderMetrics();
};

function renderDailyTodoList() {
  const container = document.getElementById("dailyTodoListContainer");
  if (!container) return;
  container.innerHTML = "";

  const tasks = appState.dailyTasks || [];

  if (tasks.length === 0) {
    container.innerHTML = `
      <div class="text-center py-4 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
        <p class="text-xs text-slate-400">Aaj ke liye koi task nahi hai. Upar se add karein!</p>
      </div>
    `;
    return;
  }

  tasks.forEach((t) => {
    const row = document.createElement("div");
    row.className = `flex items-center justify-between p-2.5 rounded-xl border transition ${
      t.done 
        ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/40" 
        : "bg-slate-50 dark:bg-slate-900/70 border-slate-200/70 dark:border-slate-800"
    }`;

    row.innerHTML = `
      <div class="flex items-center gap-2.5 min-w-0 cursor-pointer" onclick="toggleDailyTask('${t.id}')">
        <div class="w-4 h-4 rounded-md border flex items-center justify-center transition ${
          t.done ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-400 dark:border-slate-600"
        }">
          ${t.done ? '<i class="fa-solid fa-check text-[9px]"></i>' : ''}
        </div>
        <span class="text-xs ${t.done ? 'line-through text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-200 font-medium'} truncate">
          ${t.title}
        </span>
      </div>
      <button onclick="deleteDailyTask('${t.id}')" class="text-slate-400 hover:text-rose-500 text-xs px-1 cursor-pointer">
        <i class="fa-solid fa-xmark"></i>
      </button>
    `;
    container.appendChild(row);
  });
}

// ================= 6. WEEKLY CALENDAR STRIP =================
function renderWeeklyCalendar() {
  const container = document.getElementById("weeklyCalendarRow");
  if (!container) return;
  container.innerHTML = "";

  const today = new Date();
  const currentDayOfWeek = today.getDay();
  const monthName = today.toLocaleString('default', { month: 'short', year: 'numeric' });
  
  const monthElem = document.getElementById("calendarCurrentMonth");
  if (monthElem) monthElem.innerText = monthName;

  const daysShort = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - currentDayOfWeek);

  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    const dateNum = d.getDate();
    const isToday = i === currentDayOfWeek;

    const dayCard = document.createElement("div");
    if (isToday) {
      dayCard.className = "p-1.5 sm:p-2 rounded-xl bg-sky-500 text-white shadow-md shadow-sky-500/30 select-none";
      dayCard.innerHTML = `
        <span class="block text-[8px] sm:text-[9px] font-bold text-sky-100 uppercase">${daysShort[i]}</span>
        <span class="block text-xs sm:text-sm font-mono font-black mt-0.5">${dateNum}</span>
      `;
    } else {
      dayCard.className = "p-1.5 sm:p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700 select-none";
      dayCard.innerHTML = `
        <span class="block text-[8px] sm:text-[9px] font-bold text-slate-400 uppercase">${daysShort[i]}</span>
        <span class="block text-xs sm:text-sm font-mono font-bold text-slate-600 dark:text-slate-300 mt-0.5">${dateNum}</span>
      `;
    }
    container.appendChild(dayCard);
  }
}

// ================= 7. PERSISTENCE ENGINE =================
function loadLocalState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    appState = JSON.parse(saved);
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  if (currentUser && db && currentUser.uid !== "guest_user") {
    const userDocRef = doc(db, "users", currentUser.uid);
    setDoc(userDocRef, {
      displayName: currentUser.displayName || "Scholar",
      email: currentUser.email || "",
      photoURL: currentUser.photoURL || "",
      courses: appState.courses,
      history: appState.history,
      dailyTasks: appState.dailyTasks || [],
      dailyTasksDate: appState.dailyTasksDate || new Date().toLocaleDateString(),
      streak: appState.streak || { current: 1, best: 1 },
      lastUpdated: new Date().toISOString()
    }, { merge: true }).catch(e => console.error("Cloud push failed:", e));
  }
}

// ================= 8. WORKSPACE RENDERING =================
function renderWorkspace() {
  renderMetrics();
  renderDailyTodoList();
  renderCourses();
  renderHistory();
}

function renderMetrics() {
  let totalChs = 0;
  let doneChs = 0;
  appState.courses.forEach(c => {
    totalChs += c.topics.length;
    doneChs += c.topics.filter(t => t.done).length;
  });
  const pct = totalChs > 0 ? Math.round((doneChs / totalChs) * 100) : 0;
  
  const pctElem = document.getElementById("kpiProgressPct");
  if (pctElem) pctElem.innerText = `${pct}%`;

  const streak = appState.streak || { current: 1, best: 1 };
  const streakElem = document.getElementById("kpiStreakDays");
  if (streakElem) streakElem.innerText = `${streak.current} d`;

  const todayStr = new Date().toLocaleDateString();
  const todaySessions = appState.history.filter(h => h.date === todayStr);
  let totalMinutes = 0;
  todaySessions.forEach(h => totalMinutes += (h.duration || 0));

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const timeFormatted = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  
  const timeElem = document.getElementById("kpiTodayStudyTime");
  if (timeElem) timeElem.innerText = timeFormatted;

  const tasks = appState.dailyTasks || [];
  const completed = tasks.filter(t => t.done).length;
  const tasksElem = document.getElementById("kpiCompletedTasksCount");
  if (tasksElem) tasksElem.innerText = `${completed} / ${tasks.length}`;
}

function renderCourses() {
  const container = document.getElementById("coursesContainer");
  if (!container) return;
  container.innerHTML = "";

  if (!appState.courses || appState.courses.length === 0) {
    container.className = "col-span-full";
    container.innerHTML = `
      <div class="text-center py-10 border border-dashed border-slate-300 dark:border-slate-800 rounded-3xl w-full">
        <p class="text-xs text-slate-400">Abhi koi course nahi hai. Upar "+ Add Course" se shuru karein!</p>
      </div>
    `;
    return;
  }

  container.className = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5";

  appState.courses.forEach((course, idx) => {
    const total = course.topics.length;
    const completed = course.topics.filter(t => t.done).length;
    const pct = total ? Math.round((completed / total) * 100) : 0;
    const theme = courseThemes[idx % courseThemes.length];

    const card = document.createElement("div");
    card.className = `${theme.lightBg} ${theme.darkBg} border ${theme.border} rounded-3xl p-4 sm:p-5 flex flex-col justify-between space-y-3.5 shadow-sm transition hover:shadow-md`;

    card.innerHTML = `
      <div class="space-y-2.5">
        <div class="flex items-center justify-between">
          <span class="text-2xl select-none">${theme.emoji}</span>
          <span class="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${theme.badge}">${pct}%</span>
        </div>
        <div>
          <h4 class="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white truncate">${course.name}</h4>
          <p class="text-[10px] font-mono text-slate-500">${completed} / ${total} Chapters Finished</p>
        </div>
        <div class="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
          <div class="h-full ${theme.bar} rounded-full transition-all duration-300" style="width: ${pct}%"></div>
        </div>
      </div>

      <button onclick="openCourseDrawer('${course.id}')" class="w-full py-2 sm:py-2.5 ${theme.btn} rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition active:scale-95 cursor-pointer">
        <i class="fa-solid fa-play text-[9px]"></i>
        <span>${completed > 0 ? 'Continue Learning' : 'Start Learning'}</span>
      </button>
    `;

    container.appendChild(card);
  });
}

function renderHistory() {
  const container = document.getElementById("historyList");
  const totalDisplay = document.getElementById("totalStudyTimeToday");
  if (!container || !totalDisplay) return;
  container.innerHTML = "";

  const todayStr = new Date().toLocaleDateString();
  const todayHistory = appState.history.filter(h => h.date === todayStr);

  let totalMins = 0;
  todayHistory.forEach(h => totalMins += h.duration);
  totalDisplay.innerText = `${totalMins} Mins`;

  if (todayHistory.length === 0) {
    container.innerHTML = `<p class="text-xs text-slate-400 py-2 text-center">Aaj abhi tak koi focus session log nahi hua.</p>`;
    return;
  }

  todayHistory.forEach(h => {
    const row = document.createElement("div");
    row.className = "flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-100 dark:border-app-borderDark text-xs";
    row.innerHTML = `
      <div class="flex items-center gap-2">
        <i class="fa-solid fa-circle-check text-emerald-500 text-[11px]"></i>
        <span class="font-bold text-slate-800 dark:text-white">${h.title}</span>
        <span class="text-[10px] font-mono text-slate-400">(${h.category})</span>
      </div>
      <div class="flex items-center gap-3 font-mono text-slate-400">
        <span class="text-emerald-500 font-bold">${h.duration} min</span>
        <span class="text-[10px] text-slate-500">${h.timeLogged}</span>
      </div>
    `;
    container.appendChild(row);
  });
}

// ================= 9. DOCK & NAVIGATION CONTROLLER =================
window.switchDockTab = function(btnElement, tabName) {
  if (tabName === 'home') {
    showView('workspace');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else if (tabName === 'courses') {
    showView('workspace');
    const el = document.getElementById('coursesSection');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  } else if (tabName === 'focus') {
    window.openSelfStudyModal();
  } else if (tabName === 'admin') {
    showView('admin');
  } else if (tabName === 'history') {
    showView('workspace');
    const el = document.getElementById('historySection');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }
};

// ================= 10. MENTOR / ADMIN ANALYTICS ENGINE =================
window.fetchAndRenderAdminDashboard = async function() {
  if (!db) {
    alert("Firebase database offline mode mein hai.");
    return;
  }

  try {
    const usersCol = collection(db, "users");
    const snapshot = await getDocs(usersCol);

    allFetchedScholars = [];
    let totalPlatformMins = 0;
    let totalProgressSum = 0;
    let countedCourses = 0;

    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      const scholar = {
        id: docSnap.id,
        name: data.displayName || "Scholar",
        email: data.email || "No Email",
        photoURL: data.photoURL || null,
        courses: data.courses || [],
        history: data.history || [],
        streak: data.streak || { current: 1 }
      };

      scholar.totalMinutes = scholar.history.reduce((acc, h) => acc + (Number(h.duration) || 0), 0);
      totalPlatformMins += scholar.totalMinutes;

      const today = new Date().toLocaleDateString();
      scholar.todayMinutes = scholar.history
        .filter(h => h.date === today)
        .reduce((acc, h) => acc + (Number(h.duration) || 0), 0);

      let sCompleted = 0, sTotal = 0;
      scholar.courses.forEach(c => {
        sTotal += c.topics.length;
        sCompleted += c.topics.filter(t => t.done).length;
      });
      scholar.progressPct = sTotal > 0 ? Math.round((sCompleted / sTotal) * 100) : 0;
      if (sTotal > 0) {
        totalProgressSum += scholar.progressPct;
        countedCourses++;
      }

      allFetchedScholars.push(scholar);
    });

    document.getElementById("adminTotalStudents").innerText = allFetchedScholars.length;
    document.getElementById("adminTotalHours").innerText = `${(totalPlatformMins / 60).toFixed(1)}h`;
    document.getElementById("adminAvgProgress").innerText = countedCourses > 0 
      ? `${Math.round(totalProgressSum / countedCourses)}%` 
      : `0%`;

    const tableBody = document.getElementById("adminStudentsTableBody");
    tableBody.innerHTML = "";

    if (allFetchedScholars.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="5" class="text-center py-6 text-slate-400">Abhi koi student registered nahi hai.</td></tr>`;
      return;
    }

    allFetchedScholars.forEach(s => {
      const row = document.createElement("tr");
      row.className = "hover:bg-slate-50 dark:hover:bg-slate-800/40 transition cursor-pointer";
      row.onclick = () => openStudentDetailModal(s.id);

      row.innerHTML = `
        <td class="py-3 pl-2 flex items-center gap-2.5">
          <div class="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300 font-bold flex items-center justify-center text-[10px] flex-shrink-0">
            ${s.photoURL ? `<img src="${s.photoURL}" class="w-full h-full object-cover rounded-full" />` : s.name.charAt(0)}
          </div>
          <div class="min-w-0">
            <span class="font-bold text-slate-900 dark:text-white block truncate">${s.name}</span>
            <span class="text-[10px] text-slate-400 truncate block">${s.email}</span>
          </div>
        </td>
        <td class="py-3 font-mono font-bold text-emerald-500">${s.todayMinutes}m</td>
        <td class="py-3 font-mono text-slate-700 dark:text-slate-300">${(s.totalMinutes / 60).toFixed(1)} hrs</td>
        <td class="py-3 font-mono text-amber-500 font-bold">🔥 ${s.streak.current} d</td>
        <td class="py-3 text-right pr-2">
          <button class="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-indigo-500 font-bold text-[10px]">
            Inspect ➔
          </button>
        </td>
      `;
      tableBody.appendChild(row);
    });

  } catch (err) {
    console.error("Failed to load admin stats:", err);
    alert("Admin data load karne me error: " + err.message);
  }
};

window.openStudentDetailModal = function(scholarId) {
  const scholar = allFetchedScholars.find(s => s.id === scholarId);
  if (!scholar) return;

  document.getElementById("detailStudentName").innerText = scholar.name;
  document.getElementById("detailStudentEmail").innerText = scholar.email;

  const subjectTimeMap = {};
  scholar.history.forEach(h => {
    const subName = h.title || "Independent Focus";
    subjectTimeMap[subName] = (subjectTimeMap[subName] || 0) + (Number(h.duration) || 0);
  });

  const subjectsContainer = document.getElementById("detailSubjectsList");
  subjectsContainer.innerHTML = "";

  const subjectKeys = Object.keys(subjectTimeMap);
  if (subjectKeys.length === 0) {
    subjectsContainer.innerHTML = `<p class="text-xs text-slate-400">Abhi tak koi session log nahi kiya hai.</p>`;
  } else {
    subjectKeys.forEach(sub => {
      const mins = subjectTimeMap[sub];
      const div = document.createElement("div");
      div.className = "flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 text-xs";
      div.innerHTML = `
        <span class="font-bold text-slate-800 dark:text-slate-200">${sub}</span>
        <span class="font-mono text-emerald-500 font-bold">${mins} Mins (${(mins / 60).toFixed(1)}h)</span>
      `;
      subjectsContainer.appendChild(div);
    });
  }

  const timelineContainer = document.getElementById("detailTimelineList");
  timelineContainer.innerHTML = "";

  if (scholar.history.length === 0) {
    timelineContainer.innerHTML = `<p class="text-xs text-slate-400">Koi recent history nahi hai.</p>`;
  } else {
    scholar.history.slice(0, 10).forEach(h => {
      const row = document.createElement("div");
      row.className = "flex items-center justify-between p-2 rounded-lg bg-slate-100/60 dark:bg-slate-900/60 text-[11px]";
      row.innerHTML = `
        <span class="text-slate-700 dark:text-slate-300 font-medium">${h.title} (${h.category})</span>
        <span class="font-mono text-slate-400">${h.duration}m • ${h.date}</span>
      `;
      timelineContainer.appendChild(row);
    });
  }

  document.getElementById("studentDetailModal").classList.remove("hidden");
};

window.closeStudentDetailModal = function() {
  document.getElementById("studentDetailModal").classList.add("hidden");
};

// ================= 11. COURSE CHAPTERS DRAWER =================
window.openCourseDrawer = function(courseId) {
  const course = appState.courses.find(c => c.id === courseId);
  if (!course) return;

  const completed = course.topics.filter(t => t.done).length;
  document.getElementById("drawerCourseTitle").innerText = course.name;
  document.getElementById("drawerCourseMeta").innerText = `${completed} of ${course.topics.length} Chapters Completed`;

  const list = document.getElementById("drawerChaptersList");
  list.innerHTML = "";

  course.topics.forEach((t, idx) => {
    const row = document.createElement("div");
    row.className = `flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border ${t.done ? 'border-slate-200/50 dark:border-slate-800/50 opacity-60' : 'border-slate-200 dark:border-slate-800'} text-xs`;
    
    row.innerHTML = `
      <div class="flex items-center gap-2.5">
        <span class="font-mono text-sky-500 font-bold">${idx + 1}.</span>
        <span class="${t.done ? 'line-through text-slate-400' : 'text-slate-800 dark:text-slate-200 font-medium'}">${t.name}</span>
        <span class="text-[10px] text-slate-400 font-mono">(${t.time}m)</span>
      </div>
      <div>
        ${t.done ? `
          <span class="text-emerald-500 text-xs font-mono font-bold pr-1">Done ✓</span>
        ` : `
          <button onclick="window.closeCourseDrawer(); startCourseFocus('${course.id}', '${t.id}', '${t.name.replace(/'/g, "\\'")}', ${t.time})" class="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-[11px] font-bold shadow-sm transition cursor-pointer">
            Start
          </button>
        `}
      </div>
    `;
    list.appendChild(row);
  });

  document.getElementById("courseDrawerModal").classList.remove("hidden");
};

window.closeCourseDrawer = function() {
  document.getElementById("courseDrawerModal").classList.add("hidden");
};

// ================= 12. FOCUS / SELF STUDY ENGINE =================
window.startCourseFocus = function(courseId, topicId, title, minutes) {
  currentSession = {
    courseId,
    topicId,
    title,
    category: "Course Chapter",
    totalMinutes: minutes,
    remainingSeconds: minutes * 60,
    intervalId: null,
    isPaused: false
  };
  launchFullScreen();
};

window.startSelfStudy = function() {
  const subject = document.getElementById("selfStudySubject").value.trim() || "Independent Focus";
  const mins = parseInt(document.getElementById("selfStudyMinutes").value) || 30;

  currentSession = {
    courseId: null,
    topicId: null,
    title: subject,
    category: "Self Study",
    totalMinutes: mins,
    remainingSeconds: mins * 60,
    intervalId: null,
    isPaused: false
  };

  window.closeSelfStudyModal();
  launchFullScreen();
};

function launchFullScreen() {
  document.getElementById("mainWorkspaceView").classList.add("hidden");
  document.getElementById("adminDashboardView").classList.add("hidden");
  
  const bottomBar = document.getElementById("bottomTaskbar");
  if (bottomBar) bottomBar.style.setProperty("display", "none", "important");
  
  document.getElementById("fullScreenFocus").classList.remove("hidden");
  document.getElementById("cheatWarningBanner").classList.add("hidden");

  document.getElementById("focusCategoryBadge").innerText = currentSession.category;
  document.getElementById("focusMainTitle").innerText = currentSession.title;
  document.getElementById("focusPauseBtn").innerText = "Pause";
  document.getElementById("focusSubState").innerText = "Deep Focus In Progress";

  updateClockDisplay();
  requestScreenWakeLock();

  if (document.documentElement.requestFullscreen) {
    document.documentElement.requestFullscreen().catch(() => {});
  }

  if (currentSession.intervalId) clearInterval(currentSession.intervalId);
  currentSession.intervalId = setInterval(tickFocusClock, 1000);
}

function tickFocusClock() {
  if (currentSession.remainingSeconds > 0) {
    currentSession.remainingSeconds--;
    updateClockDisplay();
  } else {
    clearInterval(currentSession.intervalId);
    logSessionComplete();
    alert(`Congratulations! Session completed: ${currentSession.title}`);
    exitFullScreen();
  }
}

function updateClockDisplay() {
  const m = Math.floor(currentSession.remainingSeconds / 60).toString().padStart(2, '0');
  const s = (currentSession.remainingSeconds % 60).toString().padStart(2, '0');
  document.getElementById("focusClock").innerText = `${m}:${s}`;
}

document.addEventListener("visibilitychange", () => {
  const focusModal = document.getElementById("fullScreenFocus");
  if (document.hidden && !focusModal.classList.contains("hidden") && !currentSession.isPaused) {
    currentSession.isPaused = true;
    clearInterval(currentSession.intervalId);
    releaseScreenWakeLock();
    
    document.getElementById("cheatWarningBanner").classList.remove("hidden");
    document.getElementById("focusPauseBtn").innerText = "Resume";
    document.getElementById("focusSubState").innerText = "Session Paused (Distracted)";
  }
});

window.toggleFocusPause = function() {
  const btn = document.getElementById("focusPauseBtn");
  const sub = document.getElementById("focusSubState");

  if (currentSession.isPaused) {
    currentSession.isPaused = false;
    btn.innerText = "Pause";
    sub.innerText = "Deep Focus In Progress";
    document.getElementById("cheatWarningBanner").classList.add("hidden");
    requestScreenWakeLock();
    currentSession.intervalId = setInterval(tickFocusClock, 1000);
  } else {
    currentSession.isPaused = true;
    btn.innerText = "Resume";
    sub.innerText = "Session Paused";
    releaseScreenWakeLock();
    clearInterval(currentSession.intervalId);
  }
};

window.endFocusEarly = function() {
  clearInterval(currentSession.intervalId);
  logSessionComplete();
  exitFullScreen();
};

window.cancelFocusSession = function() {
  if (confirm("Cancel focus session? Progress will not be saved.")) {
    clearInterval(currentSession.intervalId);
    exitFullScreen();
  }
};

function exitFullScreen() {
  document.getElementById("fullScreenFocus").classList.add("hidden");
  document.getElementById("mainWorkspaceView").classList.remove("hidden");
  
  updateResponsiveElements();
  releaseScreenWakeLock();
  stopAmbientNoise();

  if (document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  }

  renderWorkspace();
}

async function requestScreenWakeLock() {
  try {
    if ('wakeLock' in navigator) {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
      const badge = document.getElementById("wakeLockStatus");
      if (badge) badge.innerText = "Screen Lock: Active 💡";
    }
  } catch (err) {
    console.warn("WakeLock request error:", err.message);
  }
}

function releaseScreenWakeLock() {
  if (wakeLockSentinel) {
    wakeLockSentinel.release().then(() => {
      wakeLockSentinel = null;
      const badge = document.getElementById("wakeLockStatus");
      if (badge) badge.innerText = "Screen Lock: Idle";
    });
  }
}

window.toggleSoundEngine = function() {
  if (!isAudioPlaying) {
    startAmbientNoise();
  } else {
    stopAmbientNoise();
  }
};

function startAmbientNoise() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const bufferSize = audioCtx.sampleRate * 2;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

    noiseSource = audioCtx.createBufferSource();
    noiseSource.buffer = buffer;
    noiseSource.loop = true;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 350;

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.03, audioCtx.currentTime);

    noiseSource.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    noiseSource.start();

    isAudioPlaying = true;
    document.getElementById("soundIcon").className = "fa-solid fa-volume-high text-emerald-400";
    document.getElementById("soundLabel").innerText = "Audio On";
  } catch (e) {
    console.warn("Audio Context error:", e);
  }
}

function stopAmbientNoise() {
  if (noiseSource) {
    noiseSource.stop();
    noiseSource.disconnect();
    noiseSource = null;
  }
  isAudioPlaying = false;
  const icon = document.getElementById("soundIcon");
  const label = document.getElementById("soundLabel");
  if (icon) icon.className = "fa-solid fa-volume-xmark";
  if (label) label.innerText = "Audio Off";
}

function logSessionComplete() {
  if (currentSession.courseId && currentSession.topicId) {
    const course = appState.courses.find(c => c.id === currentSession.courseId);
    if (course) {
      const topic = course.topics.find(t => t.id === currentSession.topicId);
      if (topic) topic.done = true;
    }
  }

  appState.history.unshift({
    title: currentSession.title,
    category: currentSession.category,
    duration: currentSession.totalMinutes,
    date: new Date().toLocaleDateString(),
    timeLogged: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  });

  persist();
}

// ================= 13. MODAL ACTIONS =================
window.openAddCourseModal = function() {
  tempTopics = [];
  document.getElementById("modalCourseTitle").value = "";
  document.getElementById("modalTopicInput").value = "";
  renderModalPreview();
  document.getElementById("addCourseModal").classList.remove("hidden");
};

window.closeAddCourseModal = function() {
  document.getElementById("addCourseModal").classList.add("hidden");
};

window.addModalTopic = function() {
  const name = document.getElementById("modalTopicInput").value.trim();
  const time = parseInt(document.getElementById("modalTopicTime").value) || 30;
  if (!name) return;

  tempTopics.push({ name, time });
  document.getElementById("modalTopicInput").value = "";
  renderModalPreview();
  document.getElementById("modalTopicInput").focus();
};

function renderModalPreview() {
  const container = document.getElementById("modalTopicPreview");
  document.getElementById("modalTopicIndex").innerText = `${tempTopics.length + 1}.`;
  container.innerHTML = "";

  tempTopics.forEach((t, idx) => {
    const item = document.createElement("div");
    item.className = "flex items-center justify-between bg-slate-100 dark:bg-slate-900 px-3 py-1.5 rounded-xl text-xs";
    item.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="font-mono text-emerald-500 font-bold">${idx + 1}.</span>
        <span class="text-slate-800 dark:text-white">${t.name}</span>
        <span class="text-[10px] text-slate-400 font-mono">(${t.time}m)</span>
      </div>
      <button onclick="tempTopics.splice(${idx}, 1); renderModalPreview();" class="text-slate-400 hover:text-rose-500 cursor-pointer">
        <i class="fa-solid fa-xmark"></i>
      </button>
    `;
    container.appendChild(item);
  });
}

window.saveNewCourse = function() {
  const title = document.getElementById("modalCourseTitle").value.trim();
  if (!title) return alert("Course title required!");
  if (tempTopics.length === 0) return alert("Kam se kam 1 chapter add karein!");

  appState.courses.push({
    id: "c_" + Date.now(),
    name: title,
    topics: tempTopics.map((t, idx) => ({
      id: `t_${Date.now()}_${idx}`,
      name: t.name,
      time: t.time,
      done: false
    }))
  });

  persist();
  window.closeAddCourseModal();
  renderWorkspace();
};

window.openSelfStudyModal = function() {
  document.getElementById("selfStudySubject").value = "";
  document.getElementById("selfStudyModal").classList.remove("hidden");
};

window.closeSelfStudyModal = function() {
  document.getElementById("selfStudyModal").classList.add("hidden");
};

// Initial Theme & Screen routing
const savedTheme = localStorage.getItem('studyos_theme') || 'light';
applyTheme(savedTheme);
showView("auth");