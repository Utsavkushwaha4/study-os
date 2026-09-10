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
  onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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
  console.warn("Firebase running in offline-ready mode.");
}

// ================= 2. LOCAL STATE =================
const STORAGE_KEY = "study_os_login_first_data_v2";

let appState = {
  courses: [],
  history: [],
  dailyTasks: [
    { id: "t_sample_1", title: "Complete Python OOP Chapter", done: false },
    { id: "t_sample_2", title: "Review 15 ML Equations", done: false },
    { id: "t_sample_3", title: "30 Mins Deep Focus Session", done: true }
  ],
  streak: {
    current: 2,
    best: 5,
    lastActiveDate: new Date().toLocaleDateString()
  }
};

let tempTopics = [];
let activeViewingCourseId = null;

let currentSession = {
  courseId: null,
  topicId: null,
  title: "",
  category: "Course Focus",
  totalMinutes: 25,
  remainingSeconds: 25 * 60,
  intervalId: null,
  isPaused: false
};

// Distinct theme accent palettes for course cards
const cardThemes = [
  { border: "border-emerald-500/30", hover: "hover:border-emerald-400", badgeBg: "bg-emerald-500", text: "text-emerald-400", bar: "bg-emerald-400", btn: "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" },
  { border: "border-sky-500/40", hover: "hover:border-sky-400", badgeBg: "bg-sky-500", text: "text-sky-400", bar: "bg-sky-400", btn: "bg-sky-600 hover:bg-sky-500 text-white shadow" },
  { border: "border-indigo-500/30", hover: "hover:border-indigo-400", badgeBg: "bg-indigo-600", text: "text-indigo-300", bar: "bg-indigo-500", btn: "bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30" },
  { border: "border-amber-500/30", hover: "hover:border-amber-400", badgeBg: "bg-amber-500", text: "text-amber-300", bar: "bg-amber-500", btn: "bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30" },
  { border: "border-rose-500/30", hover: "hover:border-rose-400", badgeBg: "bg-rose-500", text: "text-rose-300", bar: "bg-rose-500", btn: "bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30" },
  { border: "border-cyan-500/30", hover: "hover:border-cyan-400", badgeBg: "bg-cyan-500", text: "text-cyan-300", bar: "bg-cyan-500", btn: "bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/30" }
];

// ================= 3. AUTH & VIEW SWITCHER =================
function showView(screen) {
  const authView = document.getElementById("authGatewayView");
  const workspaceView = document.getElementById("mainWorkspaceView");

  if (screen === "workspace") {
    authView.classList.add("hidden");
    workspaceView.classList.remove("hidden");
    updateTimeGreeting();
    renderWorkspace();
  } else {
    workspaceView.classList.add("hidden");
    authView.classList.remove("hidden");
  }
}

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
    updateUserInterface();
    showView("workspace");
  } catch (err) {
    if (err.code === "auth/popup-closed-by-user" || err.code === "auth/cancelled-popup-request") {
      console.warn("Login window was closed.");
    } else {
      console.error("Sign in failed:", err);
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
  loadLocalState();
  updateUserInterface();
  showView("workspace");
};

window.handleSignOut = async function() {
  if (auth && currentUser?.uid !== "guest_user") {
    await signOut(auth);
  }
  currentUser = null;
  showView("auth");
};

if (auth) {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      currentUser = user;
      updateUserInterface();
      
      const userDocRef = doc(db, "users", user.uid);
      onSnapshot(userDocRef, (snap) => {
        if (snap.exists() && snap.data().courses) {
          appState = snap.data();
          if (!appState.dailyTasks) appState.dailyTasks = [];
          if (!appState.streak) appState.streak = { current: 1, best: 1, lastActiveDate: new Date().toLocaleDateString() };
        } else {
          loadLocalState();
          persist();
        }
        showView("workspace");
      });
    } else {
      currentUser = null;
      showView("auth");
    }
  });
}

function updateTimeGreeting() {
  const hour = new Date().getHours();
  let greeting = "Good Day";
  if (hour >= 4 && hour < 12) greeting = "Good Morning";
  else if (hour >= 12 && hour < 17) greeting = "Good Afternoon";
  else if (hour >= 17 && hour < 22) greeting = "Good Evening";
  else greeting = "Good Night";

  const greetingElem = document.getElementById("timeGreetingText");
  if (greetingElem) greetingElem.innerText = greeting;
}

function updateUserInterface() {
  if (!currentUser) return;
  const firstName = currentUser.displayName ? currentUser.displayName.split(" ")[0] : "Scholar";
  
  const heroNameElem = document.getElementById("heroUserName");
  const navNameElem = document.getElementById("userDisplayName");
  const emailElem = document.getElementById("userEmailText");

  if (heroNameElem) heroNameElem.innerText = firstName;
  if (navNameElem) navNameElem.innerText = currentUser.displayName || "Scholar";
  if (emailElem) emailElem.innerText = currentUser.email || "Synced Mode";
}

// ================= 4. PERSISTENCE ENGINE =================
function loadLocalState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    appState = JSON.parse(saved);
  } else {
    appState = {
      courses: [],
      history: [],
      dailyTasks: [
        { id: "t_1", title: "Complete Chapter 1", done: false },
        { id: "t_2", title: "Review Architecture Diagram", done: false },
        { id: "t_3", title: "1 Hour Deep Study Focus", done: false }
      ],
      streak: { current: 1, best: 1, lastActiveDate: new Date().toLocaleDateString() }
    };
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  if (currentUser && db && currentUser.uid !== "guest_user") {
    const userDocRef = doc(db, "users", currentUser.uid);
    setDoc(userDocRef, {
      courses: appState.courses,
      history: appState.history,
      dailyTasks: appState.dailyTasks || [],
      streak: appState.streak || { current: 1, best: 1 },
      lastUpdated: new Date().toISOString()
    }, { merge: true }).catch(e => console.error("Cloud sync failed:", e));
  }
}

// ================= 5. WORKSPACE RENDERING =================
function renderWorkspace() {
  renderMetrics();
  renderCourses();
  renderDailyTasks();
  renderHistory();
}

function renderMetrics() {
  // 1. Overall Progress
  let totalChapters = 0;
  let completedChapters = 0;
  appState.courses.forEach(c => {
    totalChapters += (c.topics ? c.topics.length : 0);
    completedChapters += (c.topics ? c.topics.filter(t => t.done).length : 0);
  });

  const overallPct = totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0;
  
  const pctElem = document.getElementById("kpiProgressPct");
  const circleElem = document.getElementById("kpiProgressCircle");
  const fractionElem = document.getElementById("kpiChaptersFraction");
  const barElem = document.getElementById("kpiProgressBar");

  if (pctElem) pctElem.innerText = `${overallPct}%`;
  if (circleElem) circleElem.setAttribute("stroke-dasharray", `${overallPct}, 100`);
  if (fractionElem) fractionElem.innerText = `${completedChapters} / ${totalChapters} Chapters`;
  if (barElem) barElem.style.width = `${overallPct}%`;

  // 2. Study Streak
  const streak = appState.streak || { current: 1, best: 1 };
  const streakDaysElem = document.getElementById("kpiStreakDays");
  const bestStreakElem = document.getElementById("kpiBestStreak");
  if (streakDaysElem) streakDaysElem.innerText = streak.current || 1;
  if (bestStreakElem) bestStreakElem.innerText = `Best Streak: ${streak.best || streak.current || 1} Days`;

  // 3. Today's Study Time
  const todayStr = new Date().toLocaleDateString();
  const todaySessions = appState.history.filter(h => h.date === todayStr);
  let totalMinutes = 0;
  todaySessions.forEach(h => totalMinutes += (h.duration || 0));

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const timeFormatted = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  
  const todayTimeElem = document.getElementById("kpiTodayStudyTime");
  if (todayTimeElem) todayTimeElem.innerText = timeFormatted;

  // 4. Completed Tasks
  const tasks = appState.dailyTasks || [];
  const completedTasks = tasks.filter(t => t.done).length;
  const tasksElem = document.getElementById("kpiCompletedTasksCount");
  if (tasksElem) tasksElem.innerText = `${completedTasks} / ${tasks.length}`;
}

function renderCourses() {
  const container = document.getElementById("coursesContainer");
  const countBadge = document.getElementById("coursesCount");
  if (!container || !countBadge) return;
  container.innerHTML = "";

  countBadge.innerText = `${appState.courses.length} Courses`;

  if (appState.courses.length === 0) {
    container.className = "col-span-full";
    container.innerHTML = `
      <div class="text-center py-12 border border-dashed border-app-border rounded-2xl w-full">
        <p class="text-xs text-app-textMuted">Screen khali hai. Upar "+ Add Course" ya "Self Study" daba kar start karo!</p>
      </div>
    `;
    return;
  }

  container.className = "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4";

  appState.courses.forEach((course, index) => {
    const total = course.topics.length;
    const completed = course.topics.filter(t => t.done).length;
    const pct = total ? Math.round((completed / total) * 100) : 0;
    const theme = cardThemes[index % cardThemes.length];

    const isFullyDone = total > 0 && completed === total;
    const buttonLabel = isFullyDone ? "View →" : (completed > 0 ? "Continue →" : "Start →");

    const card = document.createElement("div");
    card.className = `bg-[#0a1122] border ${theme.border} ${theme.hover} rounded-2xl p-4 flex flex-col justify-between space-y-3.5 relative transition shadow-sm`;

    card.innerHTML = `
      <div class="space-y-2.5">
        <div class="flex items-center justify-between">
          <div class="w-7 h-7 rounded-lg ${theme.badgeBg} text-slate-950 font-bold font-mono text-xs flex items-center justify-center shadow">
            ${index + 1}
          </div>
          <span class="text-xs font-mono font-bold ${theme.text}">${pct}%</span>
        </div>
        
        <div>
          <h3 class="text-sm font-bold text-white tracking-wide truncate" title="${course.name}">${course.name}</h3>
          <span class="text-[10px] font-mono text-slate-400 block mt-0.5">${completed} / ${total} chapters</span>
        </div>

        <div class="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div class="h-full ${theme.bar} rounded-full transition-all duration-300" style="width: ${pct}%"></div>
        </div>
      </div>

      <button onclick="openCourseDrawer('${course.id}')" class="w-full py-2 rounded-xl ${theme.btn} text-[11px] font-bold flex items-center justify-center gap-1.5 transition cursor-pointer">
        <span>${buttonLabel}</span>
      </button>
    `;

    container.appendChild(card);
  });
}

// ================= 6. COURSE CHAPTERS MODAL / DRAWER =================
window.openCourseDrawer = function(courseId) {
  const course = appState.courses.find(c => c.id === courseId);
  if (!course) return;

  activeViewingCourseId = courseId;
  const completed = course.topics.filter(t => t.done).length;
  
  document.getElementById("drawerCourseTitle").innerText = course.name;
  document.getElementById("drawerCourseMeta").innerText = `${completed} of ${course.topics.length} Chapters Completed`;

  const list = document.getElementById("drawerChaptersList");
  list.innerHTML = "";

  course.topics.forEach((t, idx) => {
    const row = document.createElement("div");
    row.className = `flex items-center justify-between p-3 rounded-xl bg-slate-950/70 border ${t.done ? 'border-app-border/40 opacity-60' : 'border-app-border'} text-xs`;
    
    row.innerHTML = `
      <div class="flex items-center gap-2.5">
        <span class="font-mono text-emerald-400 font-bold">${idx + 1}.</span>
        <span class="${t.done ? 'line-through text-slate-500' : 'text-slate-200 font-medium'}">${t.name}</span>
        <span class="text-[10px] text-slate-500 font-mono">(${t.time}m)</span>
      </div>
      <div>
        ${t.done ? `
          <span class="text-emerald-400 text-xs font-mono font-bold pr-1">Done ✓</span>
        ` : `
          <button onclick="window.closeCourseDrawer(); startCourseFocus('${course.id}', '${t.id}', '${t.name.replace(/'/g, "\\'")}', ${t.time})" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition shadow-sm cursor-pointer">
            Start Focus
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
  activeViewingCourseId = null;
};

// ================= 7. TODAY'S TASKS MANAGER =================
function renderDailyTasks() {
  const container = document.getElementById("dailyTasksList");
  if (!container) return;
  container.innerHTML = "";

  const tasks = appState.dailyTasks || [];

  if (tasks.length === 0) {
    container.innerHTML = `<p class="text-xs text-app-textMuted py-2 text-center">Koi target nahi banaya. Upar "+ Add Task" se aaj ka goal set karo!</p>`;
    return;
  }

  tasks.forEach((task, idx) => {
    const row = document.createElement("div");
    row.className = "flex items-center justify-between p-2.5 rounded-xl bg-slate-950/70 border border-app-border text-xs";
    row.innerHTML = `
      <div class="flex items-center gap-2.5">
        <input type="checkbox" ${task.done ? 'checked' : ''} onchange="toggleTaskDone('${task.id}')" class="w-4 h-4 rounded bg-slate-900 border-app-border text-emerald-500 focus:ring-0 cursor-pointer" />
        <span class="${task.done ? 'line-through text-slate-500' : 'text-slate-200 font-medium'}">${task.title}</span>
      </div>
      <button onclick="removeTask('${task.id}')" class="text-slate-600 hover:text-rose-400 text-xs cursor-pointer p-1">
        <i class="fa-solid fa-trash"></i>
      </button>
    `;
    container.appendChild(row);
  });
}

window.promptAddTask = function() {
  const title = prompt("Aaj ka naya task / goal likhein:");
  if (!title || !title.trim()) return;

  if (!appState.dailyTasks) appState.dailyTasks = [];
  appState.dailyTasks.push({
    id: "task_" + Date.now(),
    title: title.trim(),
    done: false
  });

  persist();
  renderMetrics();
  renderDailyTasks();
};

window.toggleTaskDone = function(taskId) {
  const task = appState.dailyTasks.find(t => t.id === taskId);
  if (task) {
    task.done = !task.done;
    persist();
    renderMetrics();
    renderDailyTasks();
  }
};

window.removeTask = function(taskId) {
  appState.dailyTasks = appState.dailyTasks.filter(t => t.id !== taskId);
  persist();
  renderMetrics();
  renderDailyTasks();
};

// ================= 8. HISTORY RENDERING =================
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
    container.innerHTML = `<p class="text-xs text-app-textMuted py-3 text-center">Aaj abhi tak koi session log nahi hua.</p>`;
    return;
  }

  todayHistory.forEach(h => {
    const row = document.createElement("div");
    row.className = "flex items-center justify-between p-2.5 rounded-xl bg-slate-950/80 border border-app-border text-xs";
    row.innerHTML = `
      <div class="flex items-center gap-2">
        <i class="fa-solid fa-circle-check text-emerald-400 text-[10px]"></i>
        <span class="font-bold text-white">${h.title}</span>
        <span class="text-[10px] font-mono text-app-textMuted">(${h.category})</span>
      </div>
      <div class="flex items-center gap-3 font-mono text-slate-400">
        <span class="text-emerald-400 font-bold">${h.duration} min</span>
        <span class="text-[10px] text-slate-500">${h.timeLogged}</span>
      </div>
    `;
    container.appendChild(row);
  });
}

// ================= 9. FOCUS TIMER ENGINE =================
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
  const subject = document.getElementById("selfStudySubject").value.trim() || "Independent Reading";
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
  document.getElementById("fullScreenFocus").classList.remove("hidden");

  document.getElementById("focusCategoryBadge").innerText = currentSession.category;
  document.getElementById("focusMainTitle").innerText = currentSession.title;
  document.getElementById("focusPauseBtn").innerText = "Pause";
  document.getElementById("focusSubState").innerText = "Deep Focus In Progress";

  updateClockDisplay();
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
    alert(`Session completed: ${currentSession.title}!`);
    exitFullScreen();
  }
}

function updateClockDisplay() {
  const m = Math.floor(currentSession.remainingSeconds / 60).toString().padStart(2, '0');
  const s = (currentSession.remainingSeconds % 60).toString().padStart(2, '0');
  document.getElementById("focusClock").innerText = `${m}:${s}`;
}

window.toggleFocusPause = function() {
  const btn = document.getElementById("focusPauseBtn");
  const sub = document.getElementById("focusSubState");

  if (currentSession.isPaused) {
    currentSession.isPaused = false;
    btn.innerText = "Pause";
    sub.innerText = "Deep Focus In Progress";
    currentSession.intervalId = setInterval(tickFocusClock, 1000);
  } else {
    currentSession.isPaused = true;
    btn.innerText = "Continue";
    sub.innerText = "Session Paused";
    clearInterval(currentSession.intervalId);
  }
};

window.endFocusEarly = function() {
  clearInterval(currentSession.intervalId);
  logSessionComplete();
  exitFullScreen();
};

window.cancelFocusSession = function() {
  if (confirm("Cancel focus session? This will not be saved.")) {
    clearInterval(currentSession.intervalId);
    exitFullScreen();
  }
};

function exitFullScreen() {
  document.getElementById("fullScreenFocus").classList.add("hidden");
  document.getElementById("mainWorkspaceView").classList.remove("hidden");
  renderWorkspace();
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

// ================= 10. COURSE MODAL ACTIONS =================
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
    item.className = "flex items-center justify-between bg-slate-950 px-3 py-1.5 rounded-lg border border-app-border text-xs";
    item.innerHTML = `
      <div class="flex items-center gap-2">
        <span class="font-mono text-emerald-400 font-bold">${idx + 1}.</span>
        <span class="text-white">${t.name}</span>
        <span class="text-[10px] text-slate-500 font-mono">(${t.time}m)</span>
      </div>
      <button onclick="tempTopics.splice(${idx}, 1); renderModalPreview();" class="text-slate-500 hover:text-rose-400 cursor-pointer">
        <i class="fa-solid fa-xmark"></i>
      </button>
    `;
    container.appendChild(item);
  });
}

window.saveNewCourse = function() {
  const title = document.getElementById("modalCourseTitle").value.trim();
  if (!title) return alert("Course name zaroori hai!");
  if (tempTopics.length === 0) return alert("Kam se kam 1 chapter add karo!");

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

// Initial state
showView("auth");