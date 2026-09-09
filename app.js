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

try {
  if (firebaseConfig.apiKey !== "YOUR_API_KEY") {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    provider = new GoogleAuthProvider();
  }
} catch (e) {
  console.warn("Firebase running in offline-ready mode.");
}

// ================= 2. LOCAL STATE =================
const STORAGE_KEY = "study_os_login_first_data_v1";

let appState = {
  courses: [],
  history: []
};

let tempTopics = [];

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

// ================= 3. AUTH & VIEW SWITCHER =================
function showView(screen) {
  const authView = document.getElementById("authGatewayView");
  const workspaceView = document.getElementById("mainWorkspaceView");

  if (screen === "workspace") {
    authView.classList.add("hidden");
    workspaceView.classList.remove("hidden");
    renderWorkspace();
  } else {
    workspaceView.classList.add("hidden");
    authView.classList.remove("hidden");
  }
}

window.handleGoogleSignIn = async function() {
  if (!auth) {
    alert("Firebase Keys abhi default hain! Temporary Guest Mode chalu kar rahe hain taaki screen khul sake.");
    window.continueAsGuest();
    return;
  }
  try {
    const res = await signInWithPopup(auth, provider);
    currentUser = res.user;
  } catch (err) {
    console.error("Sign in failed:", err);
    alert("Login error: " + err.message);
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
      
      // Cloud Listener for real-time multi-device sync
      const userDocRef = doc(db, "users", user.uid);
      onSnapshot(userDocRef, (snap) => {
        if (snap.exists() && snap.data().courses) {
          appState = snap.data();
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

function updateUserInterface() {
  if (!currentUser) return;
  document.getElementById("userDisplayName").innerText = currentUser.displayName;
  document.getElementById("userEmailText").innerText = currentUser.email;

  const container = document.getElementById("userAvatarContainer");
  if (currentUser.photoURL) {
    container.innerHTML = `<img src="${currentUser.photoURL}" class="w-full h-full object-cover rounded-xl" />`;
  } else {
    container.innerHTML = `⚡`;
  }
}

// ================= 4. PERSISTENCE ENGINE =================
function loadLocalState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    appState = JSON.parse(saved);
  } else {
    appState = { courses: [], history: [] };
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  if (currentUser && db && currentUser.uid !== "guest_user") {
    const userDocRef = doc(db, "users", currentUser.uid);
    setDoc(userDocRef, {
      courses: appState.courses,
      history: appState.history,
      lastUpdated: new Date().toISOString()
    }, { merge: true }).catch(e => console.error("Cloud push failed:", e));
  }
}

// ================= 5. WORKSPACE RENDERING =================
function renderWorkspace() {
  renderCourses();
  renderHistory();
}

function renderCourses() {
  const container = document.getElementById("coursesContainer");
  const countBadge = document.getElementById("coursesCount");
  container.innerHTML = "";

  countBadge.innerText = `${appState.courses.length} Courses`;

  if (appState.courses.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 border border-dashed border-app-border rounded-2xl">
        <p class="text-xs text-app-textMuted">Screen khali hai. Upar "+ Add Course" ya "Self Study" daba kar start karo!</p>
      </div>
    `;
    return;
  }

  appState.courses.forEach(course => {
    const total = course.topics.length;
    const completed = course.topics.filter(t => t.done).length;
    const pct = total ? Math.round((completed / total) * 100) : 0;

    const card = document.createElement("div");
    card.className = "bg-app-card border border-app-border rounded-2xl p-4 space-y-3";

    card.innerHTML = `
      <div class="flex justify-between items-center">
        <div>
          <h3 class="text-sm font-bold text-white">${course.name}</h3>
          <span class="text-[10px] text-app-textMuted font-mono">${completed} of ${total} Chapters Finished</span>
        </div>
        <span class="text-xs font-mono font-bold text-emerald-400">${pct}%</span>
      </div>

      <div class="space-y-1.5 pt-1">
        ${course.topics.map((t, idx) => {
          return `
            <div class="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border ${t.done ? 'border-app-border/40 opacity-50' : 'border-app-border'} text-xs">
              <div class="flex items-center gap-2">
                <span class="font-mono text-emerald-400 font-bold">${idx + 1}.</span>
                <span class="${t.done ? 'line-through text-slate-500' : 'text-slate-200'} font-medium">${t.name}</span>
                <span class="text-[10px] text-slate-500 font-mono">(${t.time}m)</span>
              </div>
              <div>
                ${t.done ? '<span class="text-emerald-400 text-xs font-mono">Done ✓</span>' : `
                  <button onclick="startCourseFocus('${course.id}', '${t.id}', '${t.name}', ${t.time})" class="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition">
                    Start
                  </button>
                `}
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;

    container.appendChild(card);
  });
}

function renderHistory() {
  const container = document.getElementById("historyList");
  container.innerHTML = "";

  const todayStr = new Date().toLocaleDateString();
  const todayHistory = appState.history.filter(h => h.date === todayStr);

  let totalMins = 0;
  todayHistory.forEach(h => totalMins += h.duration);
  document.getElementById("totalStudyTimeToday").innerText = `${totalMins} Mins`;

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

// ================= 6. ZERO-DISTRACTION FULL SCREEN TIMER =================
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

// ================= 7. MODAL ACTIONS =================
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
      <button onclick="tempTopics.splice(${idx}, 1); renderModalPreview();" class="text-slate-500 hover:text-rose-400">
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
  renderCourses();
};

window.openSelfStudyModal = function() {
  document.getElementById("selfStudySubject").value = "";
  document.getElementById("selfStudyModal").classList.remove("hidden");
};

window.closeSelfStudyModal = function() {
  document.getElementById("selfStudyModal").classList.add("hidden");
};

// Initial state: Show Auth Gateway
showView("auth");