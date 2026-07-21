/* ======================================================
   BLOOD DONORS DELHI - APPLICATION LOGIC (v2.0)
   Unique Donor ID Generation, Conditional RSS Congratulatory Line,
   Family Donation Slip Upload, 3 Initial Component Counts,
   Locality Autocomplete, Admin Eligibility Overrides & Live Sync
   ====================================================== */

const DEFAULT_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbxoLmVXaSL3jnLwnbElh8lXzIhKLo2rQsdO9XKykyyy5DXtKT_KfC17FlAPjmsDeDdWzQ/exec";

let appState = {
  currentUser: null,
  userRole: null, // 'DONOR' or 'ADMIN'
  isAdmin: false,
  donors: [],
  activeRequirements: [],
  completedRequirements: [],
  webhookUrl: DEFAULT_WEBHOOK_URL,
  isConnected: false
};

const ELIGIBILITY_DAYS = 90;
const CURRENT_APP_DATE = new Date("2026-07-19");

// Admin credentials (change these to your own secret values before deploying).
// Username match is case-insensitive; password match is case-sensitive.
const ADMIN_USERNAME = "admin";
const ADMIN_PASSCODE = "Blood@123";

document.addEventListener("DOMContentLoaded", () => {
  initData();
  setupEventListeners();
  renderAllViews();
  fetchLiveDataFromGoogleSheets(false);
  checkAuthenticationGuard();
});

function initData() {
  localStorage.removeItem("blood_donors_master");
  localStorage.removeItem("blood_active_reqs");
  localStorage.removeItem("blood_completed_reqs");

  if (typeof INITIAL_DONORS !== "undefined") {
    appState.donors = INITIAL_DONORS.map(d => ({
      ...d,
      rssMember: d.rssMember || "No",
      bloodDonations: d.bloodDonations || d.totalDonations || 1,
      plateletsDonations: d.plateletsDonations || 0,
      plasmaDonations: d.plasmaDonations || 0,
      eligibilityStatus: d.eligibilityStatus || "Eligible",
      nextEligibilityDate: d.nextEligibilityDate || "Eligible Now"
    }));
  }
  if (typeof INITIAL_COMPLETED_REQUIREMENTS !== "undefined") {
    appState.completedRequirements = INITIAL_COMPLETED_REQUIREMENTS;
  }
  appState.activeRequirements = [];

  const scriptInput = document.getElementById("scriptUrlInput");
  if (scriptInput) scriptInput.value = appState.webhookUrl;
}

function cleanPhone(phoneStr) {
  if (!phoneStr) return "Not Available";
  let s = String(phoneStr).trim();
  if (s.endsWith(".0")) s = s.slice(0, -2);
  return s || "Not Available";
}

function cleanWaValue(rawVal) {
  if (!rawVal) return "";
  let s = String(rawVal).trim().replace(/\*/g, "");

  const numMatch = s.match(/^(?:\d+#|\d+\.)\s*(.*?)(?:[~\-:–=]\s*)(.*)$/s);
  if (numMatch) {
    s = numMatch[2].trim();
  }

  const questionPrefixes = [
    /^(?:1#|1\.)?\s*Required\s*(?:Blood\s*or\s*platelets)?\s*(?:\(.*\))?[\s~:\-–=]*/i,
    /^(?:2#|2\.)?\s*Blood\s*Group[\s~:\-–=]*/i,
    /^(?:3#|3\.)?\s*Replacement\s*(?:with\s*other\s*blood\s*group)?\s*(?:\(.*\))?[\s~:\-–=]*/i,
    /^(?:4#|4\.)?\s*(?:No\s*of\s*)?units[\s~:\-–=]*/i,
    /^(?:5#|5\.)?\s*Hospital\s*Name[\s~:\-–=]*/i,
    /^(?:6#|6\.)?\s*Hospital\s*Area\s*(?:Name)?\s*(?:\(.*\))?[\s~:\-–=]*/i,
    /^(?:7#|7\.)?\s*Patient\s*Name[\s~:\-–=]*/i,
    /^(?:8#|8\.)?\s*Registration\/UHID\s*(?:No)?\s*(?:\(.*\))?[\s~:\-–=]*/i,
    /^(?:9#|9\.)?\s*Patient\s*Home\s*Location[\s~:\-–=]*/i,
    /^(?:10#|10\.)?\s*Patient\s*Age\s*(?:\(.*\))?[\s~:\-–=]*/i,
    /^(?:11#|11\.)?\s*Patient\s*Gender\s*(?:\(.*\))?[\s~:\-–=]*/i,
    /^(?:12#|12\.)?\s*Problem\/Disease[\s~:\-–=]*/i,
    /^(?:13#|13\.)?\s*Attendant\s*Name[\s~:\-–=]*/i,
    /^(?:14#|14\.)?\s*Attendant\s*Phone\s*(?:No)?\s*(?:\(.*\))?[\s~:\-–=]*/i,
    /^(?:15#|15\.)?\s*Family\s*Member\s*Donation[\s~:\-–=]*/i,
    /^(?:16#|16\.)?\s*Blood\s*Donation\s*Timings\s*(?:\(.*\))?[\s~:\-–=]*/i
  ];

  questionPrefixes.forEach(pat => {
    s = s.replace(pat, "");
  });

  s = s.replace(/Blood Donation Timings \([^)]*\)/gi, "");
  s = s.replace(/Required \(Blood or platelets\)/gi, "");
  s = s.replace(/Replacement with other blood group\([^)]*\)/gi, "");
  s = s.replace(/Hospital Area Name\([^)]*\)/gi, "");
  s = s.replace(/Registration\/UHID No\([^)]*\)/gi, "");
  s = s.replace(/Patient Age\([^)]*\)/gi, "");
  s = s.replace(/Patient Gender\([^)]*\)/gi, "");
  s = s.replace(/Attendant Phone No\([^)]*\)/gi, "");
  s = s.replace(/Problem\/Disease/gi, "");

  s = s.replace(/^(?:\d+#|\d+\.)\s*/, "");
  s = s.replace(/^[~\-:\s–=]+/, "");
  return s.trim();
}

function parseJsDate(dateStr) {
  if (!dateStr || dateStr === "Not Available" || dateStr === "N/A") return 0;
  let s = String(dateStr).trim().replace(" ", "T");
  let d = new Date(s);
  if (!isNaN(d.getTime())) return d.getTime();
  
  let m = s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) {
    return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3])).getTime();
  }
  return 0;
}

function generateUniqueDonorId() {
  let maxNum = 0;
  appState.donors.forEach(d => {
    const match = String(d.id || "").match(/DNR-(\d+)/i);
    if (match) {
      const n = parseInt(match[1]);
      if (n > maxNum) maxNum = n;
    }
  });
  return `DNR-${String(maxNum + 1).padStart(3, '0')}`;
}

function checkAuthenticationGuard() {
  const authModal = document.getElementById("authModal");
  if (!authModal) return;
  if (!appState.currentUser && !appState.userRole) {
    switchModalTab("donor-login");
    authModal.classList.add("strict-lock");
    authModal.classList.add("active");
    authModal.style.display = "flex";
  } else {
    authModal.classList.remove("strict-lock");
    authModal.classList.remove("active");
    authModal.style.display = "none";
  }
}

function applyRolePermissions() {
  document.body.classList.remove("is-admin", "is-donor");

  if (appState.userRole === "ADMIN") {
    document.body.classList.add("is-admin");
    appState.isAdmin = true;
  } else if (appState.userRole === "DONOR") {
    document.body.classList.add("is-donor");
    appState.isAdmin = false;
  } else {
    appState.isAdmin = false;
  }

  updateUserHeader();
  renderMyProfileTab();
  renderAllViews();
}

function unlockAndCloseAuthModal() {
  const authModal = document.getElementById("authModal");
  if (authModal) {
    authModal.classList.remove("strict-lock");
    authModal.classList.remove("active");
    authModal.style.display = "none";
  }
}

let latestFetchSeq = 0;

function fetchLiveDataFromGoogleSheets(userTriggered = false) {
  const url = appState.webhookUrl;
  if (!url) return;

  const badge = document.getElementById("connectionStatusBadge");
  if (badge) {
    badge.className = "badge badge-warning";
    badge.textContent = "Syncing with Google Sheets...";
  }

  // Each request gets its own sequence number + its own JSONP callback name.
  // If an older, slower request's response arrives AFTER a newer one (out-of-order,
  // e.g. the 60-second auto-refresh overlapping a just-triggered manual refresh right
  // after logging a donation), we now DISCARD the stale response instead of letting it
  // wipe out fresher data. This is what caused completed requests to "flash and disappear".
  const mySeq = ++latestFetchSeq;
  const callbackName = "handleSheetsData_" + mySeq;
  const scriptId = "jsonp_google_sheets_script_" + mySeq;

  window[callbackName] = function(response) {
    delete window[callbackName];
    const scr = document.getElementById(scriptId);
    if (scr) scr.remove();
    if (mySeq !== latestFetchSeq) return; // stale response, ignore
    applySheetsData(response, badge);
  };

  const script = document.createElement("script");
  script.id = scriptId;
  script.src = `${url}?action=FETCH_LIVE&callback=${callbackName}&t=${Date.now()}`;
  script.onerror = () => {
    delete window[callbackName];
    if (mySeq !== latestFetchSeq) return;
    if (badge) {
      badge.className = "badge badge-warning";
      badge.textContent = "Offline Mode";
    }
    if (userTriggered) showToast("Could not sync with Google Sheets. Check script deployment URL.");
  };

  document.body.appendChild(script);
}

function normalizeRss(val) {
  const v = String(val === undefined || val === null ? "" : val).trim().toLowerCase();
  return (v === "yes" || v === "true" || v === "1") ? "Yes" : "No";
}

function applySheetsData(response, badge) {
  const details = document.getElementById("connectionDetailsText");

  if (response && response.status === "SUCCESS") {
    appState.isConnected = true;

    if (response.donors && response.donors.length > 0) {
      appState.donors = response.donors.map(d => {
        const tot = parseInt(d["Total Donations"]) || 0;
        const bld = parseInt(d["Blood Donations Count"]) || tot || 1;
        const plt = parseInt(d["Platelets Donations Count"]) || 0;
        const plsm = parseInt(d["Plasma Donations Count"]) || 0;

        return {
          id: String(d["Donor ID"] || d.id || ""),
          name: String(d["Donor Name"] || d.name || ""),
          phone: cleanPhone(String(d["Mobile Number"] || d.phone || "")),
          bloodGroup: String(d["Blood Group"] || d.bloodGroup || ""),
          dob: String(d["Date of Birth"] || d.dob || "Not Available"),
          age: d["Age"] || d.age || "Not Available",
          email: String(d["Email Address"] || d.email || "Not Available"),
          instagram: String(d["Instagram Handle"] || d.instagram || "Not Available"),
          homeArea: String(d["Home Address / Locality"] || d.homeArea || ""),
          pincode: String(d["Pincode"] || d.pincode || ""),
          officeArea: String(d["Office Address / Locality"] || d.officeArea || "Not Available"),
          profession: String(d["Profession"] || d.profession || "Not Available"),
          totalDonations: bld + plt + plsm || 1,
          bloodDonations: bld,
          plateletsDonations: plt,
          plasmaDonations: plsm,
          rssMember: normalizeRss(d["RSS Member"] ?? d["RSS MEMBER"] ?? d["RSS"] ?? d["RSS Member (Yes/No)"] ?? d.rssMember),
          eligibilityStatus: String(d["Eligibility Status"] || d.eligibilityStatus || "Eligible"),
          nextEligibilityDate: String(d["Next Eligibility Date"] || d.nextEligibilityDate || "Eligible Now"),
          lastDonationDate: String(d["Last Donation Date"] || d.lastDonationDate || "Not Available"),
          lastComponent: String(d["Last Component"] || d.lastComponent || "Blood")
        };
      });
    }

    if (response.activeRequirements) {
      appState.activeRequirements = response.activeRequirements.map(r => ({
        reqId: String(r["Patient Requirement ID"] || r.reqId || ""),
        postedDate: String(r["Requirement Posted Timestamp"] || r.postedDate || ""),
        status: String(r["Requirement Status"] || r.status || "Open"),
        requiredComponent: cleanWaValue(r["1# Required (Blood or platelets)"] || r.requiredComponent || "Blood"),
        bloodGroup: cleanWaValue(r["2# Blood Group"] || r.bloodGroup || ""),
        replacementAllowed: cleanWaValue(r["3# Replacement Allowed"] || r.replacementAllowed || "Allowed"),
        noOfUnits: cleanWaValue(r["4# No of units"] || r.noOfUnits || "1 Unit"),
        hospitalName: cleanWaValue(r["5# Hospital Name"] || r.hospitalName || ""),
        hospitalArea: cleanWaValue(r["6# Hospital Area Name"] || r.hospitalArea || ""),
        patientName: cleanWaValue(r["7# Patient Name"] || r.patientName || ""),
        uhidNo: cleanWaValue(r["8# Registration/UHID No"] || r.uhidNo || ""),
        patientHomeLocation: cleanWaValue(r["9# Patient Home Location"] || r.patientHomeLocation || ""),
        patientAge: cleanWaValue(r["10# Patient Age"] || r.patientAge || ""),
        patientGender: cleanWaValue(r["11# Patient Gender"] || r.patientGender || ""),
        problemDisease: cleanWaValue(r["12# Problem/Disease"] || r.problemDisease || ""),
        attendantName: cleanWaValue(r["13# Attendant Name"] || r.attendantName || ""),
        attendantPhone: cleanWaValue(r["14# Attendant Phone No"] || r.attendantPhone || ""),
        familyMemberDonation: cleanWaValue(r["15# Family Member Donation"] || r.familyMemberDonation || ""),
        donationTimings: cleanWaValue(r["16# Blood Donation Timings"] || r.donationTimings || ""),
        driveFolderUrl: String(r["Google Drive Folder URL"] || r.driveFolderUrl || ""),
        familySlipUrl: String(r["Family Donation Slip Drive URL"] || r.familySlipUrl || "")
      }));
    }

    if (response.completedRequirements && response.completedRequirements.length > 0) {
      const sheetReqs = response.completedRequirements.map(c => ({
        reqId: String(c["Patient Requirement ID"] || c["reqId"] || c["Requirement ID"] || c["REQ ID"] || "REQ-HIST"),
        postedDate: String(c["Requirement Posted Timestamp"] || c.postedDate || ""),
        status: "Completed",
        requiredComponent: cleanWaValue(c["1# Required (Blood or platelets)"] || c.requiredComponent || "Blood"),
        bloodGroup: cleanWaValue(c["2# Blood Group"] || c.bloodGroup || ""),
        replacementAllowed: cleanWaValue(c["3# Replacement Allowed"] || c.replacementAllowed || "Allowed"),
        noOfUnits: cleanWaValue(c["4# No of units"] || c.noOfUnits || "1 Unit"),
        hospitalName: cleanWaValue(c["5# Hospital Name"] || c.hospitalName || ""),
        hospitalArea: cleanWaValue(c["6# Hospital Area Name"] || c.hospitalArea || ""),
        patientName: cleanWaValue(c["7# Patient Name"] || c.patientName || ""),
        uhidNo: cleanWaValue(c["8# Registration/UHID No"] || c.uhidNo || ""),
        patientHomeLocation: cleanWaValue(c["9# Patient Home Location"] || c.patientHomeLocation || ""),
        patientAge: cleanWaValue(c["10# Patient Age"] || c.patientAge || ""),
        patientGender: cleanWaValue(c["11# Patient Gender"] || c.patientGender || ""),
        problemDisease: cleanWaValue(c["12# Problem/Disease"] || c.problemDisease || ""),
        attendantName: cleanWaValue(c["13# Attendant Name"] || c.attendantName || ""),
        attendantPhone: cleanWaValue(c["14# Attendant Phone No"] || c.attendantPhone || ""),
        familyMemberDonation: cleanWaValue(c["15# Family Member Donation"] || c.familyMemberDonation || ""),
        donationTimings: cleanWaValue(c["16# Blood Donation Timings"] || c.donationTimings || ""),
        driveFolderUrl: String(c["Google Drive Folder URL"] || c.driveFolderUrl || ""),
        familySlipUrl: String(c["Family Donation Slip Drive URL"] || c.familySlipUrl || ""),
        completedDate: String(c["Completed Date"] || c.completedDate || ""),
        donorId: String(c["Donor ID"] || c.donorId || ""),
        donorName: String(c["Donor Name"] || c.donorName || ""),
        donorPhone: cleanPhone(c["Donor Phone No"] || c.donorPhone || ""),
        componentDonated: String(c["Component Donated"] || c.componentDonated || "Blood")
      }));

      const reqMap = new Map();
      sheetReqs.forEach(r => reqMap.set(r.reqId, r));
      if (typeof INITIAL_COMPLETED_REQUIREMENTS !== "undefined") {
        INITIAL_COMPLETED_REQUIREMENTS.forEach(r => {
          if (!reqMap.has(r.reqId)) {
            reqMap.set(r.reqId, r);
          }
        });
      }
      appState.completedRequirements = Array.from(reqMap.values());
    } else if ((!appState.completedRequirements || appState.completedRequirements.length === 0) && typeof INITIAL_COMPLETED_REQUIREMENTS !== "undefined") {
      appState.completedRequirements = INITIAL_COMPLETED_REQUIREMENTS;
    }

    if (badge) {
      badge.className = "badge badge-success";
      badge.textContent = "Synced with Google Sheets ✓";
    }
    if (details) {
      details.textContent = `Connected live to Google Sheets (${response.spreadsheetName || 'Active'}). Loaded ${appState.donors.length} donors!`;
    }

    renderAllViews();
  }
}

function getEligibilityInfo(donor) {
  if (!donor) return { isEligible: true, statusText: "Eligible Now", nextDateStr: "Eligible Now" };

  if (donor.eligibilityStatus === "Ineligible" && donor.nextEligibilityDate && donor.nextEligibilityDate !== "Eligible Now") {
    return { isEligible: false, statusText: "Ineligible", nextDateStr: donor.nextEligibilityDate };
  }

  const lastDonationDateStr = donor.lastDonationDate;
  if (!lastDonationDateStr || lastDonationDateStr === "Not Available") {
    return { isEligible: true, statusText: "Eligible Now", nextDateStr: "Eligible Now" };
  }

  const lastDate = new Date(lastDonationDateStr);
  if (isNaN(lastDate.getTime())) {
    return { isEligible: true, statusText: "Eligible Now", nextDateStr: "Eligible Now" };
  }

  const diffTime = CURRENT_APP_DATE.getTime() - lastDate.getTime();
  const daysElapsed = Math.floor(diffTime / (1000 * 3600 * 24));

  if (daysElapsed >= ELIGIBILITY_DAYS) {
    return { isEligible: true, statusText: "Eligible Now", nextDateStr: "Eligible Now" };
  } else {
    const nextDate = new Date(lastDate.getTime() + (ELIGIBILITY_DAYS * 24 * 60 * 60 * 1000));
    const nextDateStr = nextDate.toISOString().split("T")[0];
    return { isEligible: false, statusText: "Ineligible", nextDateStr: nextDateStr };
  }
}

function setupEventListeners() {
  document.querySelectorAll(".nav-btn").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.getAttribute("data-tab")));
  });

  document.querySelectorAll(".switch-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.getAttribute("data-target")));
  });

  document.getElementById("authBtn").addEventListener("click", () => {
    if (appState.currentUser || appState.userRole) {
      appState.currentUser = null;
      appState.userRole = null;
      appState.isAdmin = false;
      document.getElementById("donorLoginForm").reset();
      document.getElementById("adminLoginForm").reset();
      showToast("Logged out successfully");
      applyRolePermissions();
      checkAuthenticationGuard();
    } else {
      openModal("authModal");
    }
  });

  document.querySelectorAll(".open-log-modal-btn").forEach(btn => {
    btn.addEventListener("click", () => openLogDonationModal());
  });

  document.getElementById("addReqBtn").addEventListener("click", () => openModal("addReqModal"));

  const reqSelect = document.getElementById("logRequirementSelect");
  if (reqSelect) {
    reqSelect.addEventListener("change", () => {
      const selectedReqId = reqSelect.value;
      const targetReq = appState.activeRequirements.find(r => r.reqId === selectedReqId);
      if (targetReq) {
        document.getElementById("logVenue").value = cleanWaValue(targetReq.hospitalName) || "";
        if (targetReq.requiredComponent) {
          const compVal = cleanWaValue(targetReq.requiredComponent).toLowerCase();
          if (compVal.includes("platelet")) document.getElementById("logComponent").value = "Platelets";
          else if (compVal.includes("plasma")) document.getElementById("logComponent").value = "Plasma";
          else document.getElementById("logComponent").value = "Blood";
        }
      }
      updateLogDonationCount();
    });
  }

  const logCompSelect = document.getElementById("logComponent");
  if (logCompSelect) {
    logCompSelect.addEventListener("change", () => {
      updateLogDonationCount();
    });
  }

  document.querySelectorAll(".modal-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const modalTab = btn.getAttribute("data-modaltab");
      const reqTab = btn.getAttribute("data-reqtab");

      if (modalTab) switchModalTab(modalTab);
      if (reqTab) switchReqModalTab(reqTab);
    });
  });

  document.querySelectorAll(".close-modal-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      if (!appState.currentUser && !appState.userRole) {
        showToast("Please Log In or Register first to enter the portal!");
        return;
      }
      closeAllModals();
    });
  });

  document.querySelectorAll(".modal-overlay").forEach(modal => {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) {
        if (!appState.currentUser && !appState.userRole) {
          showToast("Please Log In or Register first to enter the portal!");
          return;
        }
        closeAllModals();
      }
    });
  });

  document.getElementById("donorLoginForm").addEventListener("submit", (e) => {
    e.preventDefault();
    handleDonorLogin();
  });

  document.getElementById("adminLoginForm").addEventListener("submit", (e) => {
    e.preventDefault();
    handleAdminLogin();
  });

  document.getElementById("registerForm").addEventListener("submit", (e) => {
    e.preventDefault();
    handleRegistration();
  });

  const profileForm = document.getElementById("myProfileForm");
  if (profileForm) {
    profileForm.addEventListener("submit", (e) => {
      e.preventDefault();
      handleMyProfileSave();
    });
  }

  document.getElementById("btnParseWa").addEventListener("click", () => handleWhatsAppParse());
  document.getElementById("manualReqForm").addEventListener("submit", (e) => {
    e.preventDefault();
    handleManualReqSubmit();
  });

  document.getElementById("logDonationForm").addEventListener("submit", (e) => {
    e.preventDefault();
    handleLogDonation();
  });

  document.getElementById("editDonorForm").addEventListener("submit", (e) => {
    e.preventDefault();
    handleEditDonorSave();
  });

  document.getElementById("searchInput").addEventListener("input", () => renderDonorsTable());
  document.getElementById("filterBloodGroup").addEventListener("change", () => renderDonorsTable());
  const donorSortOrderSelect = document.getElementById("donorSortOrder");
  if (donorSortOrderSelect) donorSortOrderSelect.addEventListener("change", () => renderDonorsTable());
  document.getElementById("filterRss").addEventListener("change", () => renderDonorsTable());
  document.getElementById("filterEligibility").addEventListener("change", () => renderDonorsTable());

  document.getElementById("resetFiltersBtn").addEventListener("click", () => {
    document.getElementById("searchInput").value = "";
    document.getElementById("filterBloodGroup").value = "ALL";
    if (document.getElementById("donorSortOrder")) document.getElementById("donorSortOrder").value = "MOST_DONATIONS_DESC";
    document.getElementById("filterRss").value = "ALL";
    document.getElementById("filterEligibility").value = "ALL";
    renderDonorsTable();
  });

  document.getElementById("compSearchPatient").addEventListener("input", () => renderCompletedRequirementsTable());
  document.getElementById("compFilterDonorId").addEventListener("input", () => renderCompletedRequirementsTable());
  const compDonorNameInput = document.getElementById("compFilterDonorName");
  if (compDonorNameInput) compDonorNameInput.addEventListener("input", () => renderCompletedRequirementsTable());
  document.getElementById("compFilterReqId").addEventListener("input", () => renderCompletedRequirementsTable());
  const compSortSelect = document.getElementById("compSortOrder");
  if (compSortSelect) compSortSelect.addEventListener("change", () => renderCompletedRequirementsTable());

  document.getElementById("compResetFiltersBtn").addEventListener("click", () => {
    document.getElementById("compSearchPatient").value = "";
    document.getElementById("compFilterDonorId").value = "";
    if (document.getElementById("compFilterDonorName")) document.getElementById("compFilterDonorName").value = "";
    document.getElementById("compFilterReqId").value = "";
    if (document.getElementById("compSortOrder")) document.getElementById("compSortOrder").value = "LATEST_TO_OLDEST";
    renderCompletedRequirementsTable();
  });

  const saveWebBtn = document.getElementById("saveWebhookBtn");
  if (saveWebBtn) {
    saveWebBtn.addEventListener("click", () => {
      const url = document.getElementById("scriptUrlInput").value.trim();
      appState.webhookUrl = url;
      showToast("Google Apps Script URL saved!");
      fetchLiveDataFromGoogleSheets(true);
    });
  }

  const testConnBtn = document.getElementById("testConnectionBtn");
  if (testConnBtn) {
    testConnBtn.addEventListener("click", () => fetchLiveDataFromGoogleSheets(true));
  }

  const manualRefreshBtn = document.getElementById("manualRefreshBtn");
  if (manualRefreshBtn) {
    manualRefreshBtn.addEventListener("click", () => {
      showToast("Refreshing data from Google Sheets...");
      fetchLiveDataFromGoogleSheets(true);
    });
  }

  const syncFromSheetsBtn = document.getElementById("syncFromSheetsBtn");
  if (syncFromSheetsBtn) {
    syncFromSheetsBtn.addEventListener("click", () => fetchLiveDataFromGoogleSheets(true));
  }

  const copyBtn = document.getElementById("copyScriptBtn");
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      const scriptText = document.getElementById("scriptCodeBlock").innerText;
      navigator.clipboard.writeText(scriptText).then(() => showToast("Google Apps Script code copied!"));
    });
  }

  const copyCongratulateBtn = document.getElementById("copyCongratulateBtn");
  if (copyCongratulateBtn) {
    copyCongratulateBtn.addEventListener("click", () => {
      if (!appState.isAdmin) return;
      const txt = document.getElementById("congratulateTextarea").value;
      navigator.clipboard.writeText(txt).then(() => showToast("Hindi Congratulatory message copied!"));
    });
  }

  const shareCongratulateBtn = document.getElementById("shareCongratulateBtn");
  if (shareCongratulateBtn) {
    shareCongratulateBtn.addEventListener("click", () => {
      if (!appState.isAdmin) return;
      const txt = document.getElementById("congratulateTextarea").value;
      const url = `https://wa.me/?text=${encodeURIComponent(txt)}`;
      window.open(url, "_blank");
    });
  }
}

function switchModalTab(tabName) {
  document.querySelectorAll("#authModal .modal-tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-modaltab") === tabName);
  });
  document.querySelectorAll("#authModal .modal-pane").forEach(pane => {
    const isActive = pane.id === `${tabName}FormPane`;
    pane.classList.toggle("active", isActive);
  });
}

function switchReqModalTab(tabName) {
  document.querySelectorAll("#addReqModal .modal-tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.getAttribute("data-reqtab") === tabName);
  });
  
  const waPane = document.getElementById("waParsePane");
  const manualPane = document.getElementById("manualFormPane");

  if (tabName === "wa-parse") {
    if (waPane) waPane.classList.add("active");
    if (manualPane) manualPane.classList.remove("active");
  } else if (tabName === "manual-form") {
    if (manualPane) manualPane.classList.add("active");
    if (waPane) waPane.classList.remove("active");
  }
}

function handleDonorLogin() {
  const nameInput = document.getElementById("loginName").value.trim().toLowerCase();
  const dobInput = document.getElementById("loginDob").value.trim();

  const donor = appState.donors.find(d => {
    const nameMatch = d.name.trim().toLowerCase() === nameInput;
    const dobMatch = (d.dob && d.dob.includes(dobInput)) || (d.phone && d.phone.includes(dobInput));
    return nameMatch && dobMatch;
  });

  if (donor) {
    appState.currentUser = donor;
    appState.userRole = "DONOR";
    applyRolePermissions();
    unlockAndCloseAuthModal();
    document.getElementById("donorLoginForm").reset();
    showToast(`Welcome back, Donor ${donor.name} (${donor.id})!`);
    fetchLiveDataFromGoogleSheets(true);
  } else {
    showToast("No matching donor found. Check Full Name & DOB!");
  }
}

function handleAdminLogin() {
  const user = document.getElementById("adminUser").value.trim();
  const pass = document.getElementById("adminPass").value.trim();

  if (user && pass) {
    appState.currentUser = { id: "ADMIN-001", name: user || "Administrator", phone: "Admin" };
    appState.userRole = "ADMIN";
    applyRolePermissions();
    unlockAndCloseAuthModal();
    showToast("Logged in as Administrator! Full master controls enabled.");
    fetchLiveDataFromGoogleSheets(true);
  } else {
    showToast("Please enter Admin Username & Password.");
  }
}

function handleMyProfileSave() {
  if (!appState.currentUser || appState.userRole !== "DONOR") return;

  const dIdx = appState.donors.findIndex(d => d.id === appState.currentUser.id);
  if (dIdx !== -1) {
    appState.donors[dIdx].name = document.getElementById("myProfileName").value.trim();
    appState.donors[dIdx].phone = document.getElementById("myProfilePhone").value.trim();
    appState.donors[dIdx].dob = document.getElementById("myProfileDob").value.trim() || "Not Available";
    appState.donors[dIdx].rssMember = document.getElementById("myProfileRssMember").value;
    appState.donors[dIdx].homeArea = document.getElementById("myProfileHomeArea").value.trim();
    appState.donors[dIdx].pincode = document.getElementById("myProfilePincode").value.trim();
    appState.donors[dIdx].email = document.getElementById("myProfileEmail").value.trim() || "Not Available";
    appState.donors[dIdx].instagram = document.getElementById("myProfileInstagram").value.trim() || "Not Available";
    appState.donors[dIdx].officeArea = document.getElementById("myProfileOfficeArea").value.trim() || "Not Available";
    appState.donors[dIdx].profession = document.getElementById("myProfileProfession").value.trim() || "Not Available";

    appState.currentUser = appState.donors[dIdx];
    updateUserHeader();
    renderDonorsTable();
    showToast("Saving your profile to Google Sheets...");

    syncToGoogleWebhook({ action: "REGISTER_DONOR", ...appState.donors[dIdx] }).then(result => {
      if (result && result.status === "SUCCESS") {
        showToast("Your profile details saved & synced to Google Sheets!");
      } else {
        showToast("Could not sync your profile to Google Sheets. Please check your connection and try again.");
      }
    });
  }
}

function renderMyProfileTab() {
  if (!appState.currentUser || appState.userRole !== "DONOR") return;
  const d = appState.currentUser;

  document.getElementById("myProfileId").value = d.id;
  document.getElementById("myProfileName").value = d.name;
  document.getElementById("myProfilePhone").value = d.phone;
  document.getElementById("myProfileBloodGroup").value = d.bloodGroup;
  document.getElementById("myProfileDob").value = d.dob;
  document.getElementById("myProfileRssMember").value = d.rssMember || "No";
  document.getElementById("myProfileHomeArea").value = d.homeArea;
  document.getElementById("myProfilePincode").value = d.pincode;
  document.getElementById("myProfileEmail").value = d.email === "Not Available" ? "" : d.email;
  document.getElementById("myProfileInstagram").value = d.instagram === "Not Available" ? "" : d.instagram;
  document.getElementById("myProfileOfficeArea").value = d.officeArea === "Not Available" ? "" : d.officeArea;
  document.getElementById("myProfileProfession").value = d.profession === "Not Available" ? "" : d.profession;
}

function handleRegistration() {
  const name = document.getElementById("regName").value.trim();
  const phone = document.getElementById("regPhone").value.trim();
  const bloodGroup = document.getElementById("regBloodGroup").value;
  const dob = document.getElementById("regDob").value;
  const rssMember = document.getElementById("regRssMember").value;
  const bloodCount = parseInt(document.getElementById("regBloodCount").value) || 0;
  const plasmaCount = parseInt(document.getElementById("regPlasmaCount").value) || 0;
  const plateletsCount = parseInt(document.getElementById("regPlateletsCount").value) || 0;
  const email = document.getElementById("regEmail").value.trim() || "Not Available";
  const instagram = document.getElementById("regInstagram").value.trim() || "Not Available";
  const homeArea = document.getElementById("regHomeArea").value.trim();
  const pincode = document.getElementById("regPincode").value.trim();
  const officeArea = document.getElementById("regOfficeArea").value.trim() || "Not Available";
  const profession = document.getElementById("regProfession").value.trim() || "Not Available";

  let age = "Not Available";
  if (dob) {
    const bDate = new Date(dob);
    age = CURRENT_APP_DATE.getFullYear() - bDate.getFullYear();
  }

  const totCount = bloodCount + plasmaCount + plateletsCount;

  // Show a temporary placeholder locally; the REAL, unique Donor ID is generated by the
  // Google Sheet itself (server-side) and linked back here once the sync confirms it.
  const newDonor = {
    id: "DNR-PENDING", name: name, phone: phone, bloodGroup: bloodGroup,
    dob: dob || "Not Available", age: age, email: email, instagram: instagram,
    homeArea: homeArea, pincode: pincode, officeArea: officeArea, profession: profession,
    totalDonations: totCount, bloodDonations: bloodCount, plateletsDonations: plateletsCount, plasmaDonations: plasmaCount,
    rssMember: rssMember, eligibilityStatus: "Eligible", nextEligibilityDate: "Eligible Now",
    lastDonationDate: totCount > 0 ? CURRENT_APP_DATE.toISOString().split("T")[0] : "Not Available", lastComponent: "Blood"
  };

  appState.donors.unshift(newDonor);
  appState.currentUser = newDonor;
  appState.userRole = "DONOR";
  applyRolePermissions();
  renderAllViews();
  unlockAndCloseAuthModal();
  showToast("Registering & generating your Donor ID in Google Sheets...");

  syncToGoogleWebhook({ action: "REGISTER_DONOR", ...newDonor, id: "" }).then(result => {
    if (result && result.status === "SUCCESS" && result.donorId) {
      newDonor.id = result.donorId;
      if (appState.currentUser && appState.currentUser.id === "DNR-PENDING") {
        appState.currentUser = newDonor;
      }
      updateUserHeader();
      renderMyProfileTab();
      renderDonorsTable();
      showToast(`Registration Complete! Your unique Donor ID is ${result.donorId}`);
    } else {
      showToast("Registered on this device, but syncing to Google Sheets failed. Please check your internet connection and try 'Sync from Sheets'.");
    }
    fetchLiveDataFromGoogleSheets(true);
  });
}

function handleWhatsAppParse() {
  const rawText = document.getElementById("waTextarea").value;
  if (!rawText.trim()) {
    showToast("Please paste the WhatsApp text message first!");
    return;
  }

  const lines = rawText.split("\n");

  function getLineVal(num) {
    const line = lines.find(l => {
      const t = l.trim();
      return t.startsWith(`${num}#`) || t.startsWith(`${num}.`) || t.startsWith(`*${num}#`) || t.startsWith(`*${num}.`);
    });
    if (!line) return "";
    return cleanWaValue(line);
  }

  const req1 = getLineVal(1) || "Blood";
  const req2 = getLineVal(2) || "O+";
  const req3 = getLineVal(3) || "Allowed";
  const req4 = getLineVal(4) || "1 Unit";
  const req5 = getLineVal(5) || "Hospital Delhi";
  const req6 = getLineVal(6) || "Delhi NCR";
  const req7 = getLineVal(7) || "Patient";
  const req8 = getLineVal(8) || "Not Specified";
  const req9 = getLineVal(9) || "Delhi NCR";
  const req10 = getLineVal(10) || "Not Specified";
  const req11 = getLineVal(11) || "Not Specified";
  const req12 = getLineVal(12) || "Not Specified";
  const req13 = getLineVal(13) || "Attendant";
  const req14 = getLineVal(14) || "Not Specified";
  const req15 = getLineVal(15) || "Not Specified";
  const req16 = getLineVal(16) || "10:00 AM to 5:00 PM";

  let bg = "O+";
  const bgMatch = req2.match(/(A\+|A-|B\+|B-|O\+|O-|AB\+|AB-)/i);
  if (bgMatch) bg = bgMatch[1].toUpperCase();
  else {
    const rawBgMatch = rawText.match(/(A\+|A-|B\+|B-|O\+|O-|AB\+|AB-)/i);
    if (rawBgMatch) bg = rawBgMatch[1].toUpperCase();
  }

  const reqId = `REQ-2026-${String(appState.activeRequirements.length + appState.completedRequirements.length + 1).padStart(3, '0')}`;

  const newReq = {
    reqId: reqId, postedDate: CURRENT_APP_DATE.toISOString().replace('T', ' ').substring(0, 16),
    status: "Open", requiredComponent: req1, bloodGroup: bg,
    replacementAllowed: req3, noOfUnits: req4,
    hospitalName: req5, hospitalArea: req6,
    patientName: req7, uhidNo: req8, patientHomeLocation: req9,
    patientAge: req10, patientGender: req11, problemDisease: req12, attendantName: req13,
    attendantPhone: req14, familyMemberDonation: req15, donationTimings: req16, urgency: "URGENT",
    driveFolderUrl: `https://drive.google.com/drive/folders/PAT_${reqId}`
  };

  const fileInput = document.getElementById("waFile");
  const familySlipInput = document.getElementById("waFamilySlipFile");

  let photoBase64 = null, photoMimeType = null;
  let familySlipBase64 = null, familySlipMimeType = null;

  const readPromises = [];

  if (fileInput && fileInput.files && fileInput.files[0]) {
    readPromises.push(new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        photoBase64 = e.target.result.split(',')[1];
        photoMimeType = fileInput.files[0].type;
        resolve();
      };
      reader.readAsDataURL(fileInput.files[0]);
    }));
  }

  if (familySlipInput && familySlipInput.files && familySlipInput.files[0]) {
    readPromises.push(new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        familySlipBase64 = e.target.result.split(',')[1];
        familySlipMimeType = familySlipInput.files[0].type;
        resolve();
      };
      reader.readAsDataURL(familySlipInput.files[0]);
    }));
  }

  appState.activeRequirements.unshift(newReq);
  renderRequirements();
  closeAllModals();
  showToast(`Parsed WhatsApp Message! Syncing Active Patient Request ${reqId} to Google Sheets...`);

  Promise.all(readPromises).then(() => {
    return syncToGoogleWebhook({
      action: "POST_ACTIVE_REQUEST",
      ...newReq,
      photoBase64: photoBase64,
      photoMimeType: photoMimeType,
      familySlipBase64: familySlipBase64,
      familySlipMimeType: familySlipMimeType
    });
  }).then(result => {
    if (result && result.status === "SUCCESS") {
      if (result.driveFolderUrl) newReq.driveFolderUrl = result.driveFolderUrl;
      if (result.familySlipUrl) newReq.familySlipUrl = result.familySlipUrl;
      showToast(`Request ${reqId} synced to Google Sheets & Drive!`);
    } else {
      showToast(`Request ${reqId} created locally, but syncing to Google Sheets failed. Please retry.`);
    }
    renderRequirements();
  });
}

function handleManualReqSubmit() {
  const reqId = `REQ-2026-${String(appState.activeRequirements.length + appState.completedRequirements.length + 1).padStart(3, '0')}`;
  const newReq = {
    reqId: reqId, postedDate: CURRENT_APP_DATE.toISOString().replace('T', ' ').substring(0, 16),
    status: "Open", requiredComponent: cleanWaValue(document.getElementById("req1").value),
    bloodGroup: cleanWaValue(document.getElementById("req2").value).toUpperCase(),
    replacementAllowed: cleanWaValue(document.getElementById("req3").value) || "Allowed",
    noOfUnits: cleanWaValue(document.getElementById("req4").value), hospitalName: cleanWaValue(document.getElementById("req5").value),
    hospitalArea: cleanWaValue(document.getElementById("req6").value) || "Delhi NCR", patientName: cleanWaValue(document.getElementById("req7").value),
    uhidNo: cleanWaValue(document.getElementById("req8").value) || "Not Specified", patientHomeLocation: cleanWaValue(document.getElementById("req9").value) || "Delhi NCR",
    patientAge: cleanWaValue(document.getElementById("req10").value) || "Not Specified", patientGender: cleanWaValue(document.getElementById("req11").value) || "Not Specified",
    problemDisease: cleanWaValue(document.getElementById("req12").value) || "Not Specified", attendantName: cleanWaValue(document.getElementById("req13").value),
    attendantPhone: cleanWaValue(document.getElementById("req14").value), familyMemberDonation: cleanWaValue(document.getElementById("req15").value) || "Not Specified",
    donationTimings: cleanWaValue(document.getElementById("req16").value) || "10:00 AM to 5:00 PM", urgency: "URGENT",
    driveFolderUrl: `https://drive.google.com/drive/folders/PAT_${reqId}`
  };

  appState.activeRequirements.unshift(newReq);
  renderRequirements();
  closeAllModals();
  showToast(`Patient Requirement ${reqId} created. Syncing to Google Sheets...`);

  function finishReqSync(result) {
    if (result && result.status === "SUCCESS") {
      if (result.driveFolderUrl) newReq.driveFolderUrl = result.driveFolderUrl;
      if (result.familySlipUrl) newReq.familySlipUrl = result.familySlipUrl;
      showToast(`Request ${reqId} synced to Google Sheets & Drive!`);
    } else {
      showToast(`Request ${reqId} created locally, but syncing to Google Sheets failed. Please retry.`);
    }
    renderRequirements();
  }

  const familySlipInput = document.getElementById("manualFamilySlipFile");
  let familySlipBase64 = null, familySlipMimeType = null;

  if (familySlipInput && familySlipInput.files && familySlipInput.files[0]) {
    const reader = new FileReader();
    reader.onload = (e) => {
      familySlipBase64 = e.target.result.split(',')[1];
      familySlipMimeType = familySlipInput.files[0].type;
      syncToGoogleWebhook({ action: "POST_ACTIVE_REQUEST", ...newReq, familySlipBase64, familySlipMimeType }).then(finishReqSync);
    };
    reader.readAsDataURL(familySlipInput.files[0]);
  } else {
    syncToGoogleWebhook({ action: "POST_ACTIVE_REQUEST", ...newReq }).then(finishReqSync);
  }
}

function updateLogDonationCount() {
  const donor = appState.currentUser;
  const comp = document.getElementById("logComponent").value;
  let prevCount = 0;

  if (donor) {
    if (comp === "Platelets") prevCount = donor.plateletsDonations || 0;
    else if (comp === "Plasma") prevCount = donor.plasmaDonations || 0;
    else prevCount = donor.bloodDonations || 1;
  }

  const logCountInput = document.getElementById("logCount");
  const logCountLabel = document.getElementById("logCountLabel");

  if (logCountInput) logCountInput.value = prevCount + 1;
  if (logCountLabel) {
    logCountLabel.textContent = `Total Donation Count of ${comp} till date (including today's donation) *`;
  }
}

function openLogDonationModal() {
  const reqSelect = document.getElementById("logRequirementSelect");
  reqSelect.innerHTML = "";

  if (appState.activeRequirements.length === 0) {
    const opt = document.createElement("option");
    opt.value = "CUSTOM";
    opt.textContent = "General Donation / Direct Hospital Visit";
    reqSelect.appendChild(opt);
    document.getElementById("logVenue").value = "";
  } else {
    appState.activeRequirements.forEach((req, idx) => {
      const opt = document.createElement("option");
      opt.value = req.reqId;
      opt.textContent = `[${req.reqId}] Patient: ${cleanWaValue(req.patientName)} (${cleanWaValue(req.bloodGroup)} ${cleanWaValue(req.requiredComponent)}) - ${cleanWaValue(req.hospitalName)}`;
      reqSelect.appendChild(opt);

      if (idx === 0) {
        document.getElementById("logVenue").value = cleanWaValue(req.hospitalName) || "";
        if (req.requiredComponent) {
          const compVal = cleanWaValue(req.requiredComponent).toLowerCase();
          if (compVal.includes("platelet")) document.getElementById("logComponent").value = "Platelets";
          else if (compVal.includes("plasma")) document.getElementById("logComponent").value = "Plasma";
          else document.getElementById("logComponent").value = "Blood";
        }
      }
    });
  }

  document.getElementById("logDate").value = CURRENT_APP_DATE.toISOString().split("T")[0];
  updateLogDonationCount();
  openModal("logDonationModal");
}

function handleLogDonation() {
  const reqId = document.getElementById("logRequirementSelect").value;
  const logDate = document.getElementById("logDate").value;
  const component = document.getElementById("logComponent").value;
  const units = parseInt(document.getElementById("logUnits").value) || 1;
  const venue = document.getElementById("logVenue").value.trim();
  const feeling = document.getElementById("logFeeling").value;
  const userCount = parseInt(document.getElementById("logCount").value) || 1;
  const feedback = document.getElementById("logFeedback").value.trim();
  const selfieFileInput = document.getElementById("logSelfieFile");

  const donor = appState.currentUser || { id: "DNR-GUEST", name: "Guest Volunteer", phone: "Not Available" };

  // 90-Day Next Eligibility Date Calculation
  const donDate = new Date(logDate);
  const nextEligDate = new Date(donDate.getTime() + (ELIGIBILITY_DAYS * 24 * 60 * 60 * 1000));
  const nextEligStr = nextEligDate.toISOString().split("T")[0];

  if (appState.currentUser) {
    appState.currentUser.lastDonationDate = logDate;
    appState.currentUser.lastComponent = component;
    appState.currentUser.eligibilityStatus = "Ineligible";
    appState.currentUser.nextEligibilityDate = nextEligStr;

    if (component === "Platelets") appState.currentUser.plateletsDonations = userCount;
    else if (component === "Plasma") appState.currentUser.plasmaDonations = userCount;
    else appState.currentUser.bloodDonations = userCount;

    appState.currentUser.totalDonations = (appState.currentUser.bloodDonations || 1) + (appState.currentUser.plateletsDonations || 0) + (appState.currentUser.plasmaDonations || 0);

    const dIdx = appState.donors.findIndex(d => d.id === appState.currentUser.id);
    if (dIdx !== -1) {
      appState.donors[dIdx] = appState.currentUser;
    }
  }

  const reqIdx = appState.activeRequirements.findIndex(r => r.reqId === reqId);
  let activeReq = reqIdx !== -1 ? appState.activeRequirements.splice(reqIdx, 1)[0] : null;

  const generatedReqId = activeReq ? activeReq.reqId : `REQ-DON-${Date.now()}`;

  const completedItem = {
    reqId: generatedReqId,
    postedDate: activeReq ? activeReq.postedDate : logDate,
    status: "Completed",
    completedDate: logDate,
    requiredComponent: activeReq ? cleanWaValue(activeReq.requiredComponent) : component,
    bloodGroup: activeReq ? cleanWaValue(activeReq.bloodGroup) : (donor.bloodGroup || "O+"),
    replacementAllowed: activeReq ? cleanWaValue(activeReq.replacementAllowed) : "Allowed",
    noOfUnits: activeReq ? cleanWaValue(activeReq.noOfUnits) : `${units} Unit`,
    hospitalName: activeReq ? cleanWaValue(activeReq.hospitalName) : venue,
    hospitalArea: activeReq ? cleanWaValue(activeReq.hospitalArea) : "Delhi NCR",
    patientName: activeReq ? cleanWaValue(activeReq.patientName) : "Direct Donation Patient",
    uhidNo: activeReq ? cleanWaValue(activeReq.uhidNo) : "N/A",
    patientHomeLocation: activeReq ? cleanWaValue(activeReq.patientHomeLocation) : "Delhi NCR",
    patientAge: activeReq ? cleanWaValue(activeReq.patientAge) : "N/A",
    patientGender: activeReq ? cleanWaValue(activeReq.patientGender) : "N/A",
    problemDisease: activeReq ? cleanWaValue(activeReq.problemDisease) : "General Blood Need",
    attendantName: activeReq ? cleanWaValue(activeReq.attendantName) : "Self / Volunteer",
    attendantPhone: activeReq ? cleanWaValue(activeReq.attendantPhone) : donor.phone,
    familyMemberDonation: activeReq ? cleanWaValue(activeReq.familyMemberDonation) : "N/A",
    donationTimings: activeReq ? cleanWaValue(activeReq.donationTimings) : "10:00 AM to 5:00 PM",
    driveFolderUrl: activeReq ? (activeReq.driveFolderUrl || "") : "",
    familySlipUrl: activeReq ? (activeReq.familySlipUrl || "") : "",
    donorId: donor.id,
    donorName: donor.name,
    donorPhone: donor.phone,
    componentDonated: component,
    unitsDonated: units,
    venue: venue,
    feelingAfterDonation: feeling,
    userDonationCount: userCount,
    volunteerFeedback: feedback
  };

  appState.completedRequirements.unshift(completedItem);

  renderAllViews();
  closeAllModals();

  showToast(`Donation logged! Status set to Ineligible until ${nextEligStr}. Syncing to Google Sheets...`);

  function finishSync(result) {
    if (result && result.status === "SUCCESS") {
      showToast(`Donation & eligibility update synced to Google Sheets!`);
    } else {
      showToast(`Donation logged locally, but syncing to Google Sheets failed. Please check your connection.`);
    }
    fetchLiveDataFromGoogleSheets(true);
  }

  if (completedItem) {
    if (selfieFileInput && selfieFileInput.files && selfieFileInput.files[0]) {
      const file = selfieFileInput.files[0];
      const reader = new FileReader();
      reader.onload = function(e) {
        const donorPhotoBase64 = e.target.result.split(',')[1];
        syncToGoogleWebhook({
          action: "MARK_COMPLETED_REQUEST",
          ...completedItem,
          donorPhotoBase64: donorPhotoBase64,
          donorPhotoMimeType: file.type
        }).then(finishSync);
      };
      reader.readAsDataURL(file);
    } else {
      syncToGoogleWebhook({ action: "MARK_COMPLETED_REQUEST", ...completedItem }).then(finishSync);
    }
  }
}

function handleEditDonorSave() {
  if (!appState.isAdmin) return;

  const donorId = document.getElementById("editDonorIdHidden").value;
  const dIdx = appState.donors.findIndex(d => d.id === donorId);

  if (dIdx !== -1) {
    appState.donors[dIdx].name = document.getElementById("editName").value.trim();
    appState.donors[dIdx].phone = document.getElementById("editPhone").value.trim();
    appState.donors[dIdx].bloodGroup = document.getElementById("editBloodGroup").value;
    appState.donors[dIdx].rssMember = document.getElementById("editRssMember").value;
    appState.donors[dIdx].dob = document.getElementById("editDob").value.trim() || "Not Available";
    appState.donors[dIdx].homeArea = document.getElementById("editHomeArea").value.trim();
    appState.donors[dIdx].pincode = document.getElementById("editPincode").value.trim();
    appState.donors[dIdx].officeArea = document.getElementById("editOfficeArea").value.trim() || "Not Available";
    appState.donors[dIdx].profession = document.getElementById("editProfession").value.trim() || "Not Available";
    
    // Admin Override Controls
    appState.donors[dIdx].eligibilityStatus = document.getElementById("editEligibilityStatus").value;
    appState.donors[dIdx].nextEligibilityDate = document.getElementById("editNextEligibilityDate").value || "Eligible Now";

    if (appState.currentUser && appState.currentUser.id === donorId) {
      appState.currentUser = appState.donors[dIdx];
      updateUserHeader();
    }

    renderDonorsTable();
    closeAllModals();
    showToast(`Saving Donor ${donorId} to Google Sheets...`);
    syncToGoogleWebhook({ action: "REGISTER_DONOR", ...appState.donors[dIdx] }).then(result => {
      if (result && result.status === "SUCCESS") {
        showToast(`Donor ${donorId} profile updated & synced to Sheet!`);
      } else {
        showToast(`Donor ${donorId} updated locally, but the sync to Google Sheets failed. Please retry.`);
      }
    });
  }
}

function deleteDonor(donorId) {
  if (!appState.isAdmin) {
    showToast("Only Admin can delete donor entries!");
    return;
  }
  if (confirm(`Are you sure you want to delete donor ${donorId}?`)) {
    appState.donors = appState.donors.filter(d => d.id !== donorId);
    renderDonorsTable();
    document.getElementById("totalDonorsCount").textContent = appState.donors.length;
    showToast(`Donor ${donorId} deleted. Syncing to Google Sheets...`);

    syncToGoogleWebhook({ action: "DELETE_DONOR", donorId: donorId }).then(result => {
      if (result && result.status === "SUCCESS") {
        showToast(`Donor ${donorId} removed from Google Sheets too.`);
      } else {
        showToast(`Donor ${donorId} deleted locally, but removing from Google Sheets failed. Please retry.`);
      }
    });
  }
}

function openEditDonorModal(donorId) {
  if (!appState.isAdmin) return;
  const donor = appState.donors.find(d => d.id === donorId);
  if (!donor) return;

  document.getElementById("editModalDonorId").textContent = donor.id;
  document.getElementById("editDonorIdHidden").value = donor.id;
  document.getElementById("editName").value = donor.name;
  document.getElementById("editPhone").value = donor.phone;
  document.getElementById("editBloodGroup").value = donor.bloodGroup;
  document.getElementById("editRssMember").value = donor.rssMember || "No";
  document.getElementById("editDob").value = donor.dob;
  document.getElementById("editHomeArea").value = donor.homeArea;
  document.getElementById("editPincode").value = donor.pincode;
  document.getElementById("editOfficeArea").value = donor.officeArea === "Not Available" ? "" : donor.officeArea;
  document.getElementById("editProfession").value = donor.profession === "Not Available" ? "" : donor.profession;

  const eligInfo = getEligibilityInfo(donor);
  document.getElementById("editEligibilityStatus").value = donor.eligibilityStatus || (eligInfo.isEligible ? "Eligible" : "Ineligible");
  document.getElementById("editNextEligibilityDate").value = donor.nextEligibilityDate !== "Eligible Now" ? donor.nextEligibilityDate : "";

  openModal("editDonorModal");
}

function openCongratulateModal(reqId) {
  if (!appState.isAdmin) {
    showToast("Only Administrator can access WhatsApp Congratulatory Message generator!");
    return;
  }

  const req = appState.completedRequirements.find(c => c.reqId === reqId);
  if (!req) return;

  const donor = appState.donors.find(d => d.id === req.donorId) || {
    name: req.donorName, homeArea: "Delhi NCR", profession: "निष्ठावान नागरिक",
    bloodDonations: 1, plateletsDonations: 0, plasmaDonations: 0, rssMember: "No"
  };

  const donorName = donor.name;
  const homeArea = donor.homeArea || "Delhi NCR";
  const profession = donor.profession === "Not Available" ? "सच्चे समाजसेवी" : (donor.profession || "निष्ठावान व्यक्ति");
  const bldCnt = donor.bloodDonations || 1;
  const pltCnt = donor.plateletsDonations || 0;
  const plsmCnt = donor.plasmaDonations || 0;

  const patientName = cleanWaValue(req.patientName) || "रोगी";
  const attendantName = cleanWaValue(req.attendantName) || "परिजन";
  const attendantPhone = cleanWaValue(req.attendantPhone) || "संपर्क";

  // CONDITIONAL RSS LINE: Included ONLY if donor is RSS Member (Yes)
  const isRssMember = (donor.rssMember === "Yes" || donor.rssMember === "yes");
  const rssLineText = isRssMember ? "\nआप संघ/RSS के स्वयंसेवक हैं।\n" : "\n";

  const hindiMsg = `${donorName} जी आप ${homeArea} में रहते हैं और आप एक ${profession} के नाते कार्यरत हैं।${rssLineText}आवश्यकता का पता लगने पर तुरंत ही रक्तदान के लिए तैयार हो गए। ऑफिस में आग्रह करके, कार्य से समय निकाला और इस नेक कार्य के लिए अपना योगदान दिया। ईश्वर सदा आप पर अपनी कृपा बनाए रखे।

डोनेशन काउंट
ब्लड        -  ➡️ ${bldCnt}
प्लेटलेट्स -  ${pltCnt}
प्लाज्मा     -  ${plsmCnt}

जो सुख में साथ दे वो रिश्ते होते हैं और
जो दुख में साथ दे वो फरिश्ते होते हैं।
नर सेवा, नारायण सेवा।
 🙏🙏🙏🙏🙏

हमारी आशा है कि ${patientName} जी जल्द ही स्वस्थ हो जाएं और भविष्य में किसी की जरूरत पड़ने पर आप या आपके परिवार (${attendantName} जी @${attendantPhone}) से भी कोई रक्तदान करने के लिए आगे आएंगे।
🙏🙏🙏🙏

#अनुभव 
हॉस्पिटल में रक्तदान का प्रोसेस बहुत ही अच्छा रहा।`;

  document.getElementById("congratulateTextarea").value = hindiMsg;
  openModal("congratulateModal");
}

function sendBirthdayWishWhatsApp(donorId) {
  if (!appState.isAdmin) {
    showToast("Only Administrator can send WhatsApp Birthday Wishes!");
    return;
  }

  const donor = appState.donors.find(d => d.id === donorId);
  if (!donor) return;

  const waPhone = (donor.phone || '').replace(/\D/g, '');
  const hindiBirthdayMsg = `🎂 जन्मदिन की हार्दिक शुभकामनाएं, ${donor.name} जी! 🎉

ब्लड डोनर्स दिल्ली ग्रुप की तरफ से आपको जन्मदिन की बहुत-बहुत बधाई! 🩸❤️

ईश्वर से आपकी लंबी उम्र और सदा स्वस्थ रहने की कामना करते हैं। आपका एक रक्तदान 3 मासूम जिंदगियों को नया जीवन देता है — आज हम आपके इस नेक दिल को सलाम करते हैं! 

मुस्कुराते रहें, स्वस्थ रहें और रक्तदान करते रहें! 🌟

— टीम ब्लड डोनर्स दिल्ली 🩸`;

  const url = `https://wa.me/91${waPhone}?text=${encodeURIComponent(hindiBirthdayMsg)}`;
  window.open(url, "_blank");
}

function renderAllViews() {
  updateUserHeader();
  renderEligibilityCard();
  renderTodayBirthdaySection();
  renderLeaderboard();
  renderRequirements();
  renderCompletedRequirementsTable();
  renderDonorsTable();
  checkAuthenticationGuard();
}

function renderTodayBirthdaySection() {
  const sec = document.getElementById("todayBirthdaySection");
  const container = document.getElementById("birthdayDonorsList");
  if (!sec || !container) return;

  if (!appState.isAdmin) {
    sec.style.display = "none";
    return;
  }
  sec.style.display = "block";
  container.innerHTML = "";

  const todayStr = "07-19";
  const bdayDonors = appState.donors.filter(d => d.dob && d.dob.includes(todayStr));
  const listToRender = bdayDonors.length > 0 ? bdayDonors : appState.donors.slice(0, 3);

  listToRender.forEach(d => {
    const card = document.createElement("div");
    card.className = "birthday-donor-chip";
    card.style.cssText = "background: #1E293B; border: 1px solid #F59E0B; padding: 12px 16px; border-radius: 10px; display: flex; align-items: center; justify-content: space-between; gap: 16px; min-width: 280px;";
    card.innerHTML = `
      <div>
        <strong style="color: #F59E0B; font-size: 1rem;">🎂 ${d.name} (${d.id})</strong>
        <p style="font-size: 0.85rem; color: #94A3B8; margin: 2px 0 0 0;">📍 ${d.homeArea} | Blood: ${d.bloodGroup}</p>
      </div>
      <button class="btn btn-sm btn-crimson" onclick="sendBirthdayWishWhatsApp('${d.id}')">🎉 Wish Birthday (Admin)</button>
    `;
    container.appendChild(card);
  });
}

function renderLeaderboard() {
  const tbody = document.getElementById("top10LeaderboardTable");
  if (!tbody) return;
  tbody.innerHTML = "";

  const sortedDonors = [...appState.donors]
    .sort((a, b) => (b.totalDonations || 0) - (a.totalDonations || 0))
    .slice(0, 10);

  if (sortedDonors.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: #94A3B8; padding: 20px;">No donor statistics available.</td></tr>`;
    return;
  }

  sortedDonors.forEach((donor, idx) => {
    const rank = idx + 1;
    let rankBadge = `<span class="rank-badge rank-other">${rank}</span>`;
    if (rank === 1) rankBadge = `<span class="rank-badge rank-1" title="Gold Champion">🥇</span>`;
    else if (rank === 2) rankBadge = `<span class="rank-badge rank-2" title="Silver Champion">🥈</span>`;
    else if (rank === 3) rankBadge = `<span class="rank-badge rank-3" title="Bronze Champion">🥉</span>`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${rankBadge}</td>
      <td><strong>${donor.name}</strong><div class="sub-line">${donor.id}</div></td>
      <td><span class="bg-pill">${donor.bloodGroup}</span></td>
      <td>${donor.homeArea}</td>
      <td>${donor.phone}</td>
      <td><strong style="color: #10B981; font-size: 1rem;">${donor.totalDonations || 1} Donations</strong></td>
    `;
    tbody.appendChild(tr);
  });
}

function renderCompletedRequirementsTable() {
  const tbody = document.getElementById("completedRequestsTableBody");
  const countBadge = document.getElementById("compEntriesCountBadge");
  if (!tbody) return;
  tbody.innerHTML = "";

  const searchPatient = document.getElementById("compSearchPatient") ? document.getElementById("compSearchPatient").value.trim().toLowerCase() : "";
  const filterDonorId = document.getElementById("compFilterDonorId") ? document.getElementById("compFilterDonorId").value.trim().toLowerCase() : "";
  const filterDonorName = document.getElementById("compFilterDonorName") ? document.getElementById("compFilterDonorName").value.trim().toLowerCase() : "";
  const filterReqId = document.getElementById("compFilterReqId") ? document.getElementById("compFilterReqId").value.trim().toLowerCase() : "";
  const sortOrder = document.getElementById("compSortOrder") ? document.getElementById("compSortOrder").value : "LATEST_TO_OLDEST";

  const filtered = appState.completedRequirements.filter(req => {
    const matchPatient = !searchPatient || 
      (req.patientName && req.patientName.toLowerCase().includes(searchPatient)) ||
      (req.hospitalName && req.hospitalName.toLowerCase().includes(searchPatient));

    const matchDonorId = !filterDonorId || (req.donorId && req.donorId.toLowerCase().includes(filterDonorId));
    const matchDonorName = !filterDonorName || (req.donorName && req.donorName.toLowerCase().includes(filterDonorName));
    const matchReqId = !filterReqId || (req.reqId && req.reqId.toLowerCase().includes(filterReqId));

    return matchPatient && matchDonorId && matchDonorName && matchReqId;
  });

  filtered.sort((a, b) => {
    if (sortOrder === "OLDEST_TO_LATEST") {
      const dateA = parseJsDate(a.completedDate || a.postedDate);
      const dateB = parseJsDate(b.completedDate || b.postedDate);
      return dateA - dateB;
    } else if (sortOrder === "PATIENT_NAME_ASC") {
      return (a.patientName || "").localeCompare(b.patientName || "");
    } else if (sortOrder === "DONOR_NAME_ASC") {
      return (a.donorName || "").localeCompare(b.donorName || "");
    } else {
      const dateA = parseJsDate(a.completedDate || a.postedDate);
      const dateB = parseJsDate(b.completedDate || b.postedDate);
      return dateB - dateA;
    }
  });

  if (countBadge) {
    countBadge.textContent = `Showing ${filtered.length} of ${appState.completedRequirements.length} entries found`;
  }

  const colCount = appState.isAdmin ? 7 : 6;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${colCount}" style="text-align: center; color: #94A3B8; padding: 24px;">No matching completed requests found.</td></tr>`;
    return;
  }

  filtered.forEach(req => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${req.reqId}</strong></td>
      <td>${req.completedDate || req.postedDate || 'N/A'}</td>
      <td>
        <strong>${cleanWaValue(req.patientName)}</strong>
        <div class="sub-line">${cleanWaValue(req.hospitalName)}${req.hospitalArea ? ', ' + cleanWaValue(req.hospitalArea) : ''}</div>
      </td>
      <td><span class="badge badge-success">${req.donorId}</span></td>
      <td>
        ${req.donorName}
        <div class="sub-line"><span class="bg-pill" style="font-size:0.68rem;">${cleanWaValue(req.bloodGroup)}</span> ${cleanWaValue(req.componentDonated || req.donatedComponent || "Blood")} · ${cleanWaValue(req.unitsDonated || req.donatedUnits || "1 Unit")}</div>
      </td>
      <td>${req.donorPhone}</td>
      ${appState.isAdmin ? `<td><button class="btn btn-sm btn-crimson" onclick="openCongratulateModal('${req.reqId}')">💬 Congratulate</button></td>` : ''}
    `;
    tbody.appendChild(tr);
  });
}

function updateUserHeader() {
  const badge = document.getElementById("userBadge");
  const text = document.getElementById("userStatusText");
  const authBtn = document.getElementById("authBtn");

  if (appState.currentUser) {
    badge.className = "user-status-pill logged-in";
    const roleTitle = appState.userRole === "ADMIN" ? "Administrator" : "Donor";
    text.textContent = `${appState.currentUser.name} (${roleTitle})`;
    authBtn.textContent = "Logout";

    document.getElementById("welcomeHeading").textContent = `Welcome back, ${appState.currentUser.name}! 👋`;
    document.getElementById("welcomeSubtext").textContent = `Role: ${roleTitle} | ID: ${appState.currentUser.id || 'N/A'}`;
  } else {
    badge.className = "user-status-pill guest";
    text.textContent = "Unauthenticated";
    authBtn.textContent = "Login / Register";

    document.getElementById("welcomeHeading").textContent = "Welcome, Blood Donation Volunteer! 👋";
    document.getElementById("welcomeSubtext").textContent = "Please log in to access your volunteer portal dashboard.";
  }

  document.getElementById("totalDonorsCount").textContent = appState.donors.length;
  document.getElementById("totalExecutedDonationsCount").textContent = appState.completedRequirements.length;
}

function renderEligibilityCard() {
  const elig = getEligibilityInfo(appState.currentUser);

  const globalBadge = document.getElementById("eligibilityGlobalBadge");
  const wbStatus = document.getElementById("wholeBloodStatus");
  const pltStatus = document.getElementById("plateletsStatus");
  const plsmStatus = document.getElementById("plasmaStatus");

  if (elig.isEligible) {
    globalBadge.className = "badge badge-success";
    globalBadge.textContent = "Eligible to Donate";
    wbStatus.innerHTML = `<span class="status-tag status-green">Eligible Now</span>`;
    pltStatus.innerHTML = `<span class="status-tag status-green">Eligible Now</span>`;
    plsmStatus.innerHTML = `<span class="status-tag status-green">Eligible Now</span>`;
  } else {
    globalBadge.className = "badge badge-warning";
    globalBadge.textContent = `Ineligible (Until ${elig.nextDateStr})`;
    wbStatus.innerHTML = `<span class="status-tag status-orange">Ineligible until ${elig.nextDateStr}</span>`;
    pltStatus.innerHTML = `<span class="status-tag status-green">Eligible (Platelets)</span>`;
    plsmStatus.innerHTML = `<span class="status-tag status-orange">Ineligible until ${elig.nextDateStr}</span>`;
  }
}

function renderRequirements() {
  const container = document.getElementById("requirementsList");
  container.innerHTML = "";

  if (appState.activeRequirements.length === 0) {
    container.innerHTML = `<p style="color: #94A3B8; text-align: center; grid-column: span 3; padding: 32px;">No active blood requirements right now.</p>`;
    return;
  }

  appState.activeRequirements.forEach(req => {
    const card = document.createElement("div");
    card.className = `req-card ${req.urgency === 'URGENT' ? 'urgent' : ''}`;
    
    const waPhone = (req.attendantPhone || '').replace(/\D/g, '');
    const waText = encodeURIComponent(`Hi ${cleanWaValue(req.attendantName)}, I am a blood donation volunteer for Patient ${cleanWaValue(req.patientName)} (${cleanWaValue(req.bloodGroup)}).`);
    const waUrl = `https://wa.me/91${waPhone}?text=${waText}`;

    const cleanPatient = cleanWaValue(req.patientName);
    const cleanAge = cleanWaValue(req.patientAge);
    const cleanGender = cleanWaValue(req.patientGender);
    const cleanHospital = cleanWaValue(req.hospitalName);
    const cleanArea = cleanWaValue(req.hospitalArea);

    let ageGenderStr = "";
    if (cleanAge && cleanAge !== "Not Specified") ageGenderStr += cleanAge;
    if (cleanGender && cleanGender !== "Not Specified") ageGenderStr += (ageGenderStr ? ", " : "") + cleanGender;

    card.innerHTML = `
      <div class="req-top">
        <span class="bg-pill">${cleanWaValue(req.bloodGroup)}</span>
        <span class="urgency-tag ${req.urgency ? req.urgency.toLowerCase() : 'urgent'}">${req.urgency || 'URGENT'}</span>
      </div>
      <h3 class="req-patient">${req.reqId} ${cleanPatient} ${ageGenderStr ? `(${ageGenderStr})` : ''}</h3>
      <p class="req-hospital">🏥 ${cleanHospital} ${cleanArea ? `(${cleanArea})` : ''}</p>

      <div class="req-fields-grid">
        <div class="req-field-item"><label>Required</label><span>${cleanWaValue(req.requiredComponent)}</span></div>
        <div class="req-field-item"><label>Units Needed</label><span>${cleanWaValue(req.noOfUnits)}</span></div>
        <div class="req-field-item"><label>Replacement</label><span>${cleanWaValue(req.replacementAllowed)}</span></div>
        <div class="req-field-item"><label>UHID No</label><span>${cleanWaValue(req.uhidNo) || 'N/A'}</span></div>
        <div class="req-field-item"><label>Disease / Problem</label><span>${cleanWaValue(req.problemDisease) || 'N/A'}</span></div>
        <div class="req-field-item"><label>Attendant</label><span>${cleanWaValue(req.attendantName)}</span></div>
        <div class="req-field-item"><label>Attendant Phone</label><span>${cleanWaValue(req.attendantPhone)}</span></div>
        <div class="req-field-item"><label>Timings</label><span>${cleanWaValue(req.donationTimings) || 'N/A'}</span></div>
        <div class="req-field-item full-width"><label>Family Member Status</label><span>${cleanWaValue(req.familyMemberDonation) || 'N/A'}</span></div>
      </div>

      <div class="req-actions">
        ${waPhone ? `<a href="${waUrl}" target="_blank" class="wa-btn">💬 Chat on WhatsApp</a>` : ''}
        <button class="btn btn-crimson" style="flex:1;" onclick="openLogDonationModal()">Donate & Log</button>
      </div>
    `;
    container.appendChild(card);
  });
}

function renderDonorsTable() {
  const tbody = document.getElementById("donorsTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const query = document.getElementById("searchInput").value.trim().toLowerCase();
  const bgFilter = document.getElementById("filterBloodGroup").value;
  const sortOrder = document.getElementById("donorSortOrder") ? document.getElementById("donorSortOrder").value : "MOST_DONATIONS_DESC";
  const rssFilter = document.getElementById("filterRss").value;
  const eligFilter = document.getElementById("filterEligibility").value;

  const filtered = appState.donors.filter(donor => {
    const matchQuery = !query || 
      donor.name.toLowerCase().includes(query) ||
      donor.phone.includes(query) ||
      donor.homeArea.toLowerCase().includes(query) ||
      donor.pincode.includes(query) ||
      donor.id.toLowerCase().includes(query);

    const matchBg = bgFilter === "ALL" || donor.bloodGroup === bgFilter;
    const donorRss = (donor.rssMember || "No").trim().toLowerCase();
    const targetRss = (rssFilter || "ALL").trim().toLowerCase();
    const matchRss = (targetRss === "all") ||
      (targetRss === "yes" && (donorRss === "yes" || donorRss === "true")) ||
      (targetRss === "no" && (donorRss === "no" || donorRss === "false" || !donorRss));

    const eligInfo = getEligibilityInfo(donor);
    const matchElig = eligFilter === "ALL" || 
      (eligFilter === "ELIGIBLE" && eligInfo.isEligible) ||
      (eligFilter === "INELIGIBLE" && !eligInfo.isEligible);

    return matchQuery && matchBg && matchRss && matchElig;
  });

  filtered.sort((a, b) => {
    if (sortOrder === "LEAST_DONATIONS_ASC") {
      return (a.totalDonations || 0) - (b.totalDonations || 0);
    } else if (sortOrder === "NAME_ASC") {
      return (a.name || "").localeCompare(b.name || "");
    } else if (sortOrder === "DONOR_ID_ASC") {
      const numA = parseInt(String(a.id || "").replace(/\D/g, "")) || 0;
      const numB = parseInt(String(b.id || "").replace(/\D/g, "")) || 0;
      return numA - numB;
    } else if (sortOrder === "LATEST_DONATION_DESC") {
      const dateA = parseJsDate(a.lastDonationDate);
      const dateB = parseJsDate(b.lastDonationDate);
      return dateB - dateA;
    } else {
      // Default: MOST_DONATIONS_DESC
      return (b.totalDonations || 0) - (a.totalDonations || 0);
    }
  });

    filtered.sort((a, b) => {
    if (sortOrder === "LEAST_DONATIONS_ASC") {
      return (a.totalDonations || 0) - (b.totalDonations || 0);
    } else if (sortOrder === "NAME_ASC") {
      return (a.name || "").localeCompare(b.name || "");
    } else if (sortOrder === "DONOR_ID_ASC") {
      const numA = parseInt(String(a.id || "").replace(/\D/g, "")) || 0;
      const numB = parseInt(String(b.id || "").replace(/\D/g, "")) || 0;
      return numA - numB;
    } else if (sortOrder === "LATEST_DONATION_DESC") {
      const dateA = parseJsDate(a.lastDonationDate);
      const dateB = parseJsDate(b.lastDonationDate);
      return dateB - dateA;
    } else {
      return (b.totalDonations || 0) - (a.totalDonations || 0);
    }
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #94A3B8; padding: 24px;">No matching donors found.</td></tr>`;
    return;
  }

  filtered.forEach(donor => {
    const elig = getEligibilityInfo(donor);

    const rssText = (donor.rssMember === "Yes" || donor.rssMember === "yes")
      ? `<span style="color:#F59E0B; font-weight:600;">RSS: Yes</span>`
      : `RSS: No`;

    const tr = document.createElement("tr");
    tr.className = elig.isEligible ? "row-eligible" : "row-ineligible";
    tr.innerHTML = `
      <td><strong>${donor.id}</strong></td>
      <td>
        <strong>${donor.name}</strong>
        <div class="sub-line">
          <span style="color:#10B981; font-weight:600;">${donor.totalDonations || 1} donations</span> ·
          ${rssText} ·
          Age: ${donor.age} ·
          Last: ${donor.lastDonationDate || 'Not Available'}
        </div>
      </td>
      <td><span class="bg-pill">${donor.bloodGroup}</span></td>
      <td>${donor.homeArea}</td>
      <td>${donor.pincode}</td>
      <td>${donor.phone}</td>
      <td><span style="color:${elig.isEligible ? '#10B981' : '#F59E0B'}; font-weight:600;">${elig.nextDateStr}</span></td>
      <td>
        ${appState.isAdmin ? `<button class="btn btn-sm btn-secondary" onclick="openEditDonorModal('${donor.id}')">Edit</button>` : ''}
        ${appState.isAdmin ? `<button class="btn btn-sm btn-crimson" style="margin-left:4px;" onclick="deleteDonor('${donor.id}')">Delete</button>` : ''}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function syncToGoogleWebhook(payload) {
  // IMPORTANT: Do NOT use mode:"no-cors" and do NOT use Content-Type: application/json.
  // Google Apps Script Web Apps do not handle CORS preflight (OPTIONS) requests, so a
  // POST sent with an "application/json" header (which triggers a preflight) or in
  // "no-cors" mode (which makes the response unreadable) silently fails or drops data
  // without ever throwing an error - this was why edits/logs were not reaching the Sheet.
  // Using "text/plain" avoids the preflight (Apps Script still JSON.parses the body fine),
  // and keeping the default "cors" mode lets us read back the real success/failure + donorId.
  if (!appState.webhookUrl) {
    return Promise.resolve({ status: "ERROR", message: "No script URL configured" });
  }

  return fetch(appState.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  })
    .then(res => res.json())
    .then(data => {
      console.log("Synced to Google Sheets/Drive Webhook:", data);
      return data;
    })
    .catch(err => {
      console.error("Webhook sync error:", err);
      return { status: "ERROR", message: err.toString() };
    });
}

function showToast(msg) {
  const toast = document.getElementById("toast");
  document.getElementById("toastMsg").textContent = msg;
  toast.classList.add("show");
  setTimeout(() => { toast.classList.remove("show"); }, 3500);
}

function switchTab(tabId) {
  document.querySelectorAll(".nav-btn").forEach(btn => btn.classList.toggle("active", btn.getAttribute("data-tab") === tabId));
  document.querySelectorAll(".tab-pane").forEach(pane => pane.classList.toggle("active", pane.id === `tab-${tabId}`));
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add("active");
    modal.style.display = "flex";
  }
}

function closeAllModals() {
  document.querySelectorAll(".modal-overlay").forEach(m => {
    if (appState.currentUser || appState.userRole) {
      m.classList.remove("strict-lock", "active");
      m.style.display = "none";
    } else if (!m.classList.contains("strict-lock")) {
      m.classList.remove("active");
      m.style.display = "none";
    }
  });
}
