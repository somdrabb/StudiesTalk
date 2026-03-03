async function readJsonSafe(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function normalizeErrorText(err) {
  if (!err) return "Something went wrong.";
  if (typeof err === "string") return err;
  if (err.error) return err.error;
  return "Something went wrong.";
}

function openLoginModal({ emailPrefill = "" } = {}) {
  const old = document.getElementById("loginModalOverlay");
  if (old) old.remove();

  const overlay = document.createElement("div");
  overlay.id = "loginModalOverlay";
  overlay.style.cssText = `
    position:fixed; inset:0; background:rgba(15,23,42,.55);
    display:flex; align-items:center; justify-content:center;
    z-index:9999; padding:16px;
  `;

  const card = document.createElement("div");
  card.style.cssText = `
    width:min(520px,100%); background:#fff; border-radius:16px;
    border:1px solid rgba(15,23,42,.18);
    box-shadow:0 40px 120px rgba(15,23,42,.45);
    overflow:hidden;
  `;

  card.innerHTML = `
    <div style="padding:14px 16px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #e2e8f0;">
      <div style="font-weight:900;">This email already has an account</div>
      <button id="loginModalClose" style="border:0;background:#f1f5f9;padding:8px 10px;border-radius:10px;cursor:pointer;font-weight:800;">
        Close
      </button>
    </div>

    <div style="padding:16px;">
      <div style="margin-bottom:10px; color:#475569;">
        Please login instead, or reset your password.
      </div>

      <div style="display:grid; gap:10px;">
        <div>
          <div style="font-size:12px;color:#64748b;font-weight:800;margin-bottom:6px;">Email</div>
          <input id="loginModalEmail" type="email" style="width:100%;border:1px solid #e2e8f0;border-radius:12px;padding:10px 12px;"
            placeholder="Email" />
        </div>

        <div>
          <div style="font-size:12px;color:#64748b;font-weight:800;margin-bottom:6px;">Password</div>
          <input id="loginModalPass" type="password" style="width:100%;border:1px solid #e2e8f0;border-radius:12px;padding:10px 12px;"
            placeholder="Password" />
        </div>

        <div id="loginModalErr" style="display:none;background:#fee2e2;color:#991b1b;border:1px solid #fca5a5;border-radius:12px;padding:10px;font-weight:800;"></div>

        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:6px;">
          <button id="loginModalSubmit" style="background:#2563eb;color:#fff;border:0;border-radius:12px;padding:10px 14px;font-weight:900;cursor:pointer;">
            Login
          </button>
          <a href="/reset-password.html" style="display:inline-block;padding:10px 12px;border-radius:12px;border:1px solid #e2e8f0;background:#fff;font-weight:900;color:#0f172a;text-decoration:none;">
            Forgot password
          </a>
        </div>
      </div>
    </div>
  `;

  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  card.querySelector("#loginModalClose").addEventListener("click", close);

  const emailEl = card.querySelector("#loginModalEmail");
  const passEl = card.querySelector("#loginModalPass");
  const errEl = card.querySelector("#loginModalErr");

  if (emailEl) emailEl.value = emailPrefill || "";

  card.querySelector("#loginModalSubmit").addEventListener("click", async () => {
    const email = (emailEl.value || "").trim();
    const password = passEl.value || "";

    errEl.style.display = "none";
    errEl.textContent = "";

    if (!email || !password) {
      errEl.textContent = "Please enter email and password.";
      errEl.style.display = "block";
      return;
    }

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const data = await readJsonSafe(res);
    if (!res.ok) {
      errEl.textContent = normalizeErrorText(data);
      errEl.style.display = "block";
      return;
    }

    close();
    window.location.href = "/";
  });
}

window.openLoginModal = openLoginModal;

function showInviteHelp({ message = "This invite link is invalid or expired. Please ask your school admin to resend it.", emailPrefill = "" } = {}) {
  const box = document.getElementById("inviteHelpBox");
  const text = document.getElementById("inviteHelpText");
  const btnLogin = document.getElementById("btnInviteTryLogin");
  const btnContact = document.getElementById("btnInviteContact");

  if (text) text.textContent = message;
  if (box) box.style.display = "block";

  if (btnLogin) {
    btnLogin.onclick = () => {
      if (window.openLoginModal) {
        window.openLoginModal({ emailPrefill });
      } else {
        window.location.href = "/#login";
      }
    };
  }

  if (btnContact) {
    btnContact.onclick = () => {
      alert("Please contact your school admin to request a new invite link.");
    };
  }

  if (box) {
    box.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

window.showInviteHelp = showInviteHelp;

document.addEventListener("DOMContentLoaded", () => {
      const openRegisterCardBtn = document.getElementById("openRegisterCardBtn");
      const registerCard = document.getElementById("registerCard");
      const loginCard = document.getElementById("loginCard");
      const registerBackBtns = document.querySelectorAll("#registerBackBtn, .step-back-btn");
      const registerSteps = Array.from(document.querySelectorAll(".register-step"));
      const stepButtons = document.querySelectorAll(".register-step-btn");
      const confirmOtpBtn = document.getElementById("confirmOtpBtn");
      const submitOtpBtn = document.getElementById("submitOtpBtn");
      const registerOtpInput = document.getElementById("registerOtp");
      const agreeCheckbox = document.getElementById("agree");
      const schoolEmailInput = document.getElementById("schoolEmail");
      const registerOtpNote = document.getElementById("registerOtpNote");
      const registerOtpStatus = document.getElementById("registerOtpStatus");
      const countryCodeSelect = document.getElementById("registerCountryCode");
      const otpFieldContainer = document.querySelector(".field-with-status");
      const registerPhone = document.getElementById("registerPhone");
      const registerMobileOtpNote = document.getElementById("registerMobileOtpNote");
      const mobileSection = document.querySelector(".mobile-verification");
      const mobileOtpInput = document.getElementById("registerMobileOtp");
      const mobileResendBtn = document.getElementById("mobileResendBtn");
      const mobileSubmitBtn = document.getElementById("submitMobileOtpBtn");
      const mobileResendWarning = document.getElementById("mobileOtpResendWarning");
      const otpResendButton = document.getElementById("otpResendBtn");
      const otpResendWarning = document.getElementById("otpResendWarning");
      const MOBILE_OTP_STATUS_URL = "/api/register/mobile-otp/status";
      const otpStep = document.querySelector(".otp-step");
      let mobileOtpAvailable = false;

      const loadMobileOtpAvailability = async () => {
        try {
          const response = await fetch(MOBILE_OTP_STATUS_URL, { cache: "reload" });
          const payload = response.ok ? await response.json().catch(() => null) : null;
          mobileOtpAvailable = Boolean(payload?.available);
        } catch (_err) {
          mobileOtpAvailable = false;
        }
        if (!mobileOtpAvailable) {
          mobileSection?.classList.add("hidden");
        } else {
          mobileSection?.classList.remove("hidden");
        }
      };
      const skipForNowBtn = document.getElementById("skipForNowBtn");
      const submitApplicationBtn = document.getElementById("submitApplicationBtn");
      const registrationSuccessPanel = document.getElementById("registrationSuccessPanel");
      const registrationSuccessMessage = registrationSuccessPanel?.querySelector(".verification-complete-label");
      const registrationSuccessIcon = registrationSuccessPanel?.querySelector(".verification-badge span");
      const schoolForm = document.getElementById("schoolForm");
      const registerProgressSegments = document.querySelectorAll(".register-progress-segment");
      const registerProgressLabel = document.querySelector(".register-progress-label");
      const OTP_RESEND_DELAY = 60;
      const REGISTER_STEP_ORDER = ["info", "address", "workspace", "credentials", "otp"];
      const MOBILE_RESEND_DELAY = 60;
      let otpResendInterval = null;
      let emailOtpVerified = false;
      let mobileResendInterval = null;
      let mobileOtpSkipped = false;
      let mobileOtpVerified = false;
      const setOtpStatus = (text = "", variant) => {
        if (!registerOtpStatus) return;
        registerOtpStatus.textContent = text;
        registerOtpStatus.classList.remove("verified", "error");
        if (variant) {
          registerOtpStatus.classList.add(variant);
        }
        registerOtpStatus.style.display = text ? "inline-flex" : "none";
      };
      const clearOtpStatus = () => {
        setOtpStatus();
        updateOtpSubmitVisibility();
      };
      const clearOtpResendState = () => {
        if (otpResendInterval) {
          clearInterval(otpResendInterval);
          otpResendInterval = null;
        }
        otpResendWarning?.classList.add("hidden");
        otpResendButton?.classList.add("hidden");
      };
      const updateOtpSubmitVisibility = () => {
        if (!submitOtpBtn) return;
        submitOtpBtn.classList.toggle("hidden", emailOtpVerified);
      };
      if (emailOtpVerified) {
        setOtpStatus("✓ Verified", "verified");
        if (registerOtpInput) {
          registerOtpInput.disabled = true;
          registerOtpInput.value = "";
        }
        otpFieldContainer?.classList.add("verified");
        clearOtpResendState();
        updateOtpSubmitVisibility();
      } else {
        clearOtpStatus();
        updateOtpSubmitVisibility();
      }
      const updateRegisterOtpNote = () => {
        if (!registerOtpNote) return;
        const emailValue = (schoolEmailInput?.value || "").trim();
        if (!emailValue) {
          registerOtpNote.textContent = "We have sent an OTP to your email address.";
          return;
        }
        registerOtpNote.innerHTML = "";
        const emailHighlight = document.createElement("span");
        emailHighlight.className = "register-otp-email";
        emailHighlight.textContent = emailValue;
        registerOtpNote.append(
          document.createTextNode("We have sent an OTP to "),
          emailHighlight,
          document.createTextNode(".")
        );
      };
      const updateRegisterMobileOtpNote = () => {
        if (!registerMobileOtpNote) return;
        const code = (countryCodeSelect?.value || "").trim();
        const phoneValue = (registerPhone?.value || "").trim();
        if (!phoneValue) {
          registerMobileOtpNote.textContent = "Enter the code sent to your mobile phone.";
          return;
        }
        registerMobileOtpNote.innerHTML = "";
        const phoneHighlight = document.createElement("span");
        phoneHighlight.className = "register-otp-number";
        const formattedPhone = `${code ? `${code} ` : ""}${phoneValue}`;
        phoneHighlight.textContent = formattedPhone;
        registerMobileOtpNote.append(
          document.createTextNode("Enter the code sent to "),
          phoneHighlight,
          document.createTextNode(".")
        );
      };
      const formatMobilePhone = () => {
        const code = (countryCodeSelect?.value || "").trim();
        const phoneValue = (registerPhone?.value || "").trim();
        if (!phoneValue) return "";
        return `${code}${phoneValue}`;
      };
      const sendMobileOtp = async () => {
        if (mobileOtpVerified || mobileOtpSkipped) return;
        const phone = formatMobilePhone();
        if (!phone) {
          setOtpStatus("Enter your phone number before requesting the mobile OTP.", "error");
          return;
        }
        setOtpStatus("Sending mobile OTP...");
        try {
          if (mobileResendBtn) {
            mobileResendBtn.disabled = true;
            mobileResendBtn.classList.remove("hidden");
          }
          const response = await fetch("/api/register/mobile-otp/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone, channel: "sms" })
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(payload?.error || "Unable to send mobile OTP.");
          }
          setOtpStatus("Mobile OTP sent. Check your phone.");
          startMobileResendCountdown();
        } catch (error) {
          console.error("Mobile OTP send failed", error);
          if (mobileResendBtn) {
            mobileResendBtn.disabled = false;
            mobileResendBtn.classList.remove("hidden");
          }
          setOtpStatus(error?.message || "Unable to send mobile OTP.", "error");
        }
      };
      const markMobileOtpVerified = () => {
        if (mobileOtpVerified) return;
        mobileOtpVerified = true;
        if (mobileOtpInput) {
          mobileOtpInput.value = "";
          mobileOtpInput.disabled = true;
        }
        mobileSubmitBtn?.classList.add("hidden");
        mobileResendBtn?.classList.add("hidden");
        mobileResendWarning?.classList.add("hidden");
        skipForNowBtn?.classList.add("hidden");
        showRegistrationSuccessPanel("verified");
        clearFieldErrorState(mobileOtpInput);
        clearFieldErrorState(registerPhone);
        clearFieldErrorState(registerOtpInput);
      };
      const handleMobileOtpSubmit = async () => {
        if (mobileOtpVerified) return;
        const phone = formatMobilePhone();
        const code = (mobileOtpInput?.value || "").trim();
        if (!phone) {
          setOtpStatus("Enter your phone number before verifying the OTP.", "error");
          return;
        }
        if (!code) {
          setOtpStatus("Enter the mobile OTP.", "error");
          return;
        }
        try {
          const response = await fetch("/api/register/mobile-otp/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone, code })
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(payload?.error || "Unable to verify mobile OTP.");
          }
          markMobileOtpVerified();
        } catch (error) {
          console.error("Mobile OTP verification failed", error);
          setOtpStatus(error?.message || "Invalid or expired mobile OTP.", "error");
        }
      };
      schoolEmailInput?.addEventListener("input", () => {
        updateRegisterOtpNote();
        if (!emailOtpVerified) {
          clearOtpStatus();
        }
      });
      schoolEmailInput?.addEventListener("change", () => {
        updateRegisterOtpNote();
        if (!emailOtpVerified) {
          clearOtpStatus();
        }
      });
      registerOtpInput?.addEventListener("input", () => {
        if (!emailOtpVerified) {
          clearOtpStatus();
        }
      });
      registerPhone?.addEventListener("input", () => {
        updateRegisterMobileOtpNote();
        if (!emailOtpVerified) clearOtpStatus();
      });
      registerPhone?.addEventListener("change", () => {
        updateRegisterMobileOtpNote();
        if (!emailOtpVerified) clearOtpStatus();
      });
      countryCodeSelect?.addEventListener("change", updateRegisterMobileOtpNote);
      updateRegisterOtpNote();
      updateRegisterMobileOtpNote();
      const startOtpResendCountdown = (deadline) => {
        if (!otpResendButton || !otpResendWarning) return;
        if (otpResendInterval) {
          clearInterval(otpResendInterval);
        }
        const storedDeadline = Number(deadline);
        const targetDeadline =
          storedDeadline && storedDeadline > Date.now()
            ? storedDeadline
            : Date.now() + OTP_RESEND_DELAY * 1000;
        otpResendButton.classList.add("hidden");
        otpResendWarning.classList.remove("hidden");
        const tick = () => {
          const remainingSeconds = Math.max(
            0,
            Math.ceil((targetDeadline - Date.now()) / 1000)
          );
          if (remainingSeconds <= 0) {
            clearInterval(otpResendInterval);
            otpResendInterval = null;
            otpResendWarning.classList.add("hidden");
            otpResendButton.classList.remove("hidden");
            return false;
          }
          otpResendWarning.textContent = `You can resend the OTP after ${remainingSeconds}s.`;
          return true;
        };
        tick();
        otpResendInterval = setInterval(tick, 1000);
      };
      const startMobileResendCountdown = (deadline) => {
        if (!mobileResendBtn || !mobileResendWarning) return;
        if (mobileResendInterval) {
          clearInterval(mobileResendInterval);
        }
        const storedDeadline = Number(deadline);
        const targetDeadline =
          storedDeadline && storedDeadline > Date.now()
            ? storedDeadline
            : Date.now() + MOBILE_RESEND_DELAY * 1000;
        mobileResendBtn.classList.add("hidden");
        mobileResendWarning.classList.remove("hidden");
        const tick = () => {
          const remainingSeconds = Math.max(
            0,
            Math.ceil((targetDeadline - Date.now()) / 1000)
          );
          if (remainingSeconds <= 0) {
            clearInterval(mobileResendInterval);
            mobileResendInterval = null;
            mobileResendWarning.classList.add("hidden");
            mobileResendBtn.classList.remove("hidden");
            mobileResendBtn.disabled = false;
            return false;
          }
          mobileResendWarning.textContent = `You can resend the mobile OTP after ${remainingSeconds}s.`;
          return true;
        };
        tick();
        mobileResendInterval = setInterval(tick, 1000);
      };
      const toggleMobileSection = (enabled) => {
        if (!mobileSection) return;
        if (!mobileOtpAvailable) {
          mobileSection.classList.add("hidden");
          return;
        }
        const shouldEnable = Boolean(enabled);
        mobileSection.classList.toggle("disabled", !shouldEnable);
        if (mobileOtpInput) mobileOtpInput.disabled = !shouldEnable;
        if (mobileSubmitBtn) mobileSubmitBtn.disabled = !shouldEnable;
        if (!shouldEnable) {
          mobileResendWarning?.classList.add("hidden");
          mobileResendBtn?.classList.add("hidden");
          if (mobileResendInterval) {
            clearInterval(mobileResendInterval);
            mobileResendInterval = null;
          }
          hideRegistrationSuccessPanel();
          hideSubmitApplicationButton();
          return;
        }
        mobileSection.classList.remove("hidden");
        hideRegistrationSuccessPanel();
        hideSubmitApplicationButton();
        mobileResendWarning?.classList.add("hidden");
        mobileResendBtn?.classList.remove("hidden");
        if (mobileResendBtn) {
          mobileResendBtn.disabled = false;
        }
      };
      const sendEmailOtp = async () => {
        if (emailOtpVerified || !schoolEmailInput) return;
        const emailValue = (schoolEmailInput.value || "").trim();
        if (!emailValue) {
          setOtpStatus("Enter your email before requesting the OTP.", "error");
          return;
        }
        setOtpStatus("Sending OTP...");
        try {
          const response = await fetch("/api/register/otp/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: emailValue })
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(payload?.error || "Unable to send OTP.");
          }
          setOtpStatus("OTP sent to your email. Check your inbox.");
          startOtpResendCountdown(payload?.expiresAt);
        } catch (error) {
          console.error("OTP send failed", error);
          setOtpStatus(error?.message || "Unable to send OTP.", "error");
        }
      };
      const maybeSendEmailOtp = async () => {
        if (emailOtpVerified || otpResendInterval) return;
        await sendEmailOtp();
      };
      const handleOtpStepEnter = () => {
        updateRegisterOtpNote();
        updateRegisterMobileOtpNote();
        void maybeSendEmailOtp();
        updateOtpSubmitVisibility();
      };
      const handleEmailOtpSubmit = async () => {
        if (!registerOtpInput || !schoolEmailInput) return;
        const code = (registerOtpInput.value || "").trim();
        const emailValue = (schoolEmailInput.value || "").trim();
        if (!code) {
          setOtpStatus("Enter the OTP from your email.", "error");
          return;
        }
        if (!emailValue) {
          setOtpStatus("Enter your email before verifying the OTP.", "error");
          return;
        }
        try {
          const response = await fetch("/api/register/otp/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: emailValue, code })
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(payload?.error || "OTP verification failed.");
          }
          setOtpStatus("✓ Verified", "verified");
          markEmailOtpVerified();
        } catch (error) {
          console.error("OTP verification failed", error);
          setOtpStatus(error?.message || "Invalid OTP code.", "error");
        }
      };
      const markEmailOtpVerified = () => {
        if (emailOtpVerified) return;
        emailOtpVerified = true;
        if (registerOtpInput) {
          registerOtpInput.value = "";
          registerOtpInput.disabled = true;
        }
        otpFieldContainer?.classList.add("verified");
        toggleMobileSection(true);
        if (mobileOtpAvailable) {
          void sendMobileOtp();
        }
        clearOtpResendState();
        updateOtpSubmitVisibility();
      };
      submitOtpBtn?.addEventListener("click", async (event) => {
        event.preventDefault();
        await handleEmailOtpSubmit();
      });
      otpResendButton?.addEventListener("click", async () => {
        await sendEmailOtp();
      });
      mobileResendBtn?.addEventListener("click", () => {
        void sendMobileOtp();
      });
      mobileSubmitBtn?.addEventListener("click", async (event) => {
        event.preventDefault();
        await handleMobileOtpSubmit();
      });
      void loadMobileOtpAvailability().then(() => toggleMobileSection(emailOtpVerified));
      const goToLoginPage = () => {
        window.location.href = '/';
      };
      const collectRegistrationFormPayload = () => {
        const payload = {};
        if (!schoolForm) return payload;
        const formData = new FormData(schoolForm);
        formData.forEach((value, key) => {
          payload[key] = value;
        });
        return payload;
      };
      const showSubmitApplicationButton = () => {
        submitApplicationBtn?.classList.remove("hidden");
      };
      const hideSubmitApplicationButton = () => {
        submitApplicationBtn?.classList.add("hidden");
      };
      const showRegistrationSuccessPanel = (state = "verified") => {
        if (!registrationSuccessPanel) return;
        registrationSuccessPanel.classList.toggle("warning", state !== "verified");
        if (registrationSuccessIcon) {
          registrationSuccessIcon.textContent = state === "verified" ? "✓" : "!";
        }
        if (registrationSuccessMessage) {
          registrationSuccessMessage.textContent =
            state === "verified"
              ? "Verifications completed"
              : "Mobile verification skipped. Submit for review when ready.";
        }
        registrationSuccessPanel.classList.remove("hidden");
        registerCard?.classList.add("finalized");
        clearOtpStatus();
        showSubmitApplicationButton();
      };
      const hideRegistrationSuccessPanel = () => {
        if (!registrationSuccessPanel) return;
        registrationSuccessPanel.classList.add("hidden");
        registrationSuccessPanel.classList.remove("warning");
        registerCard?.classList.remove("finalized");
        hideSubmitApplicationButton();
      };
      const disableMobileOtpRequirement = () => {
        if (mobileOtpSkipped) return;
        mobileOtpSkipped = true;
        mobileOtpInput?.removeAttribute("data-required");
        clearFieldErrorState(mobileOtpInput);
        clearFieldErrorState(registerPhone);
        hideRegistrationSuccessPanel();
      };
      skipForNowBtn?.addEventListener("click", () => {
        disableMobileOtpRequirement();
        showRegistrationSuccessPanel("skipped");
      });
      submitApplicationBtn?.addEventListener("click", async () => {
        if (!submitApplicationBtn) return;
        submitApplicationBtn.disabled = true;
        const payload = collectRegistrationFormPayload();
        if (schoolEmailInput) {
          payload.email = schoolEmailInput.value.trim();
        }
        try {
          const response = await fetch("/api/register/request-review", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ form: payload, email: payload.email })
          });
          const data = await readJsonSafe(response);
          if (!response.ok) {
            if (response.status === 409 && data?.action === "login_or_reset") {
              if (window.__showAlreadyRegistered) window.__showAlreadyRegistered();
              const box = document.getElementById("alreadyRegisteredBox");
              if (box) {
                box.scrollIntoView({ behavior: "smooth", block: "center" });
              }
              submitApplicationBtn.disabled = false;
              return;
            }
            throw new Error(normalizeErrorText(data));
          }
          showToast("Registration queued for superadmin review.");
          setOtpStatus("Final review requested.", "verified");
          hideSubmitApplicationButton();
          submitApplicationBtn.disabled = false;
          setTimeout(() => {
            goToLoginPage();
          }, 1200);
        } catch (error) {
          submitApplicationBtn.disabled = false;
          setOtpStatus(normalizeErrorText(error?.payload || error?.message || error), "error");
        }
      });
      const updateRegisterProgress = (stepId) => {
        if (!registerProgressSegments.length) return;
        const total = REGISTER_STEP_ORDER.length;
        const stepIndex = Math.max(0, REGISTER_STEP_ORDER.indexOf(stepId));
        registerProgressSegments.forEach((segment, idx) => {
          segment.classList.toggle("active", idx <= stepIndex);
        });
        if (registerProgressLabel) {
          registerProgressLabel.textContent = `${Math.min(stepIndex + 1, total)}/${total}`;
        }
      };
      const streetInput = document.getElementById("street");
      const houseNumberInput = document.getElementById("houseNumber");
      const postalCodeInput = document.getElementById("postalCode");
      const cityInput = document.getElementById("city");
      const stateInput = document.getElementById("state");
      const countryInput = document.getElementById("country");
      const addressSuggestions = document.getElementById("addressSuggestions");

      const showRegisterStep = (stepId) => {
        registerSteps.forEach((step) => {
          const shouldShow = step.dataset.step === stepId;
          step.classList.toggle("hidden", !shouldShow);
        });
        if (stepId === "otp") {
          handleOtpStepEnter();
        }
        updateRegisterProgress(stepId);
      };

      const showRegisterCard = () => {
        loginCard?.classList.add("hidden");
        registerCard?.classList.remove("hidden");
        showRegisterStep("info");
      };

      const showLoginCard = () => {
        registerCard?.classList.add("hidden");
        loginCard?.classList.remove("hidden");
      };

      let addressFetchController = null;
      const hideAddressSuggestions = () => {
        if (!addressSuggestions) return;
        addressSuggestions.classList.add("hidden");
        addressSuggestions.innerHTML = "";
      };

      const fillAddressFromSuggestion = (item) => {
        if (!item) return;
        if (streetInput) streetInput.value = item.street;
        if (houseNumberInput) houseNumberInput.value = item.house;
        if (postalCodeInput) postalCodeInput.value = item.postal;
        if (cityInput) cityInput.value = item.city;
        if (stateInput) stateInput.value = item.state;
        if (countryInput) countryInput.value = item.country;
        hideAddressSuggestions();
      };

      const renderAddressSuggestions = (entries) => {
        if (!addressSuggestions) return;
        const filtered = (entries || []).slice(0, 5);
        if (!filtered.length) {
          hideAddressSuggestions();
          return;
        }
        addressSuggestions.innerHTML = "";
        filtered.forEach((item) => {
          const option = document.createElement("button");
          option.type = "button";
          option.className = "address-suggestion-item";
          const strong = document.createElement("strong");
          strong.textContent = item.street || "";
          const span = document.createElement("span");
          span.textContent = item.label || "";
          option.appendChild(strong);
          option.appendChild(span);
          option.addEventListener("click", () => fillAddressFromSuggestion(item));
          addressSuggestions.appendChild(option);
        });
        addressSuggestions.classList.remove("hidden");
      };

      const normalizeAddressResult = (result) => {
        const addr = result.address || {};
        return {
          street: addr.road || addr.pedestrian || addr.footway || addr.street || "",
          house: addr.house_number || "",
          postal: addr.postcode || "",
          city: addr.city || addr.town || addr.village || "",
          state: addr.state || addr.region || "",
          country: addr.country || "Germany",
          label: result.display_name || ""
        };
      };

      const fetchAddressSuggestions = (query) => {
        if (!query || !addressSuggestions) {
          hideAddressSuggestions();
          return;
        }
        const normalized = query.trim();
        if (!normalized) {
          hideAddressSuggestions();
          return;
        }
        if (addressFetchController) {
          addressFetchController.abort();
        }
        addressFetchController = new AbortController();
        const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&countrycodes=de&limit=5&q=${encodeURIComponent(
          normalized
        )}%2C%20Germany`;
        fetch(url, {
          signal: addressFetchController.signal,
          headers: { "Accept-Language": "en-US" }
        })
          .then((resp) => resp.json())
          .then((data) => {
            const entries = Array.isArray(data)
              ? data.map((result) => normalizeAddressResult(result))
              : [];
            renderAddressSuggestions(entries.filter((item) => item.street));
          })
          .catch((err) => {
            if (err.name === "AbortError") return;
            console.error("Address suggestion failed", err);
            hideAddressSuggestions();
          });
      };

      const handleStreetInput = () => {
        fetchAddressSuggestions(streetInput?.value || "");
      };


      const getCurrentStepElement = () =>
        registerSteps.find((step) => !step.classList.contains("hidden")) || registerSteps[0];

      const getFieldErrorElement = (field) => {
        const container = field.closest(".field");
        if (!container) return null;
        let el = container.querySelector(".field-error");
        if (!el) {
          el = document.createElement("p");
          el.className = "field-error";
          container.appendChild(el);
        }
        return el;
      };

      const showFieldError = (field, message) => {
        if (!field) return;
        field.classList.add("input-error");
        const el = getFieldErrorElement(field);
        if (!el) return;
        el.textContent = message || field.dataset.errorMessage || "Please complete this field.";
        el.classList.add("visible");
      };

      const clearFieldErrorState = (field) => {
        if (!field) return;
        field.classList.remove("input-error");
        const el = getFieldErrorElement(field);
        if (!el) return;
        el.textContent = "";
        el.classList.remove("visible");
      };
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const PHONE_RULES = {
        "+1": { min: 10, max: 11 },
        "+44": { min: 9, max: 10 },
        "+61": { min: 9, max: 10 }
      };
      const GERMAN_PREFIXES = new Set([
        "151",
        "160",
        "170",
        "171",
        "175",
        "152",
        "162",
        "172",
        "173",
        "174",
        "155",
        "157",
        "159",
        "163",
        "176",
        "177",
        "178",
        "179",
        "1556",
        "1555"
      ]);

      const isValidEmail = (value) => emailPattern.test(String(value || "").trim());

      const isValidPhone = (code, value) => {
        const digits = String(value || "").replace(/\D/g, "");
        if (!digits) return false;
        if (code === "+49") {
          const hasZero = digits.startsWith("0");
          const normalized = hasZero ? digits.slice(1) : digits;
          if (!normalized) return false;
          const prefix = normalized.slice(0, 4);
          const prefix3 = normalized.slice(0, 3);
          const isCarrierMatch =
            GERMAN_PREFIXES.has(prefix) || GERMAN_PREFIXES.has(prefix3);
          if (!isCarrierMatch) return false;
          if (hasZero) {
            if (digits.length < 11 || digits.length > 12) return false;
          } else {
            if (digits.length < 10 || digits.length > 11) return false;
          }
          return true;
        }
        const rule = PHONE_RULES[code] || { min: 7, max: 15 };
        return digits.length >= rule.min && digits.length <= rule.max;
      };

      const validateCurrentStep = () => {
        const stepEl = getCurrentStepElement();
        if (!stepEl) return true;
        let valid = true;
        stepEl.querySelectorAll("[data-required='true']").forEach((field) => {
          const value = (field.value || "").trim();
          if (!value) {
            showFieldError(field);
            valid = false;
          } else {
            clearFieldErrorState(field);
          }
        });
        if (stepEl.dataset.step === "credentials") {
          const passwordValue = registerPassword?.value || "";
          const confirmValue = registerPasswordConfirm?.value || "";
          const strength = evaluatePasswordStrength(passwordValue);
          const meetsCriteria = [
            strength.hasLower,
            strength.hasUpper,
            strength.hasDigit,
            strength.hasSpecial,
            strength.lengthOk
          ].every(Boolean);
          if (!meetsCriteria) {
            showFieldError(registerPassword);
            valid = false;
          }
          if (passwordValue && confirmValue && passwordValue !== confirmValue) {
            showFieldError(registerPasswordConfirm);
            valid = false;
          }
          if (agreeCheckbox && !agreeCheckbox.checked) {
            showFieldError(agreeCheckbox);
            valid = false;
          }
        }
        if (stepEl.dataset.step === "info") {
          if (schoolEmailInput && !isValidEmail(schoolEmailInput.value)) {
            showFieldError(schoolEmailInput);
            valid = false;
          }
          if (
            countryCodeSelect &&
            registerPhone &&
            !isValidPhone(countryCodeSelect.value, registerPhone.value)
          ) {
            showFieldError(registerPhone);
            valid = false;
          }
        }
        return valid;
      };

      const attachFieldListeners = (field) => {
        if (!field) return;
        const handler = () => {
          clearFieldErrorState(field);
        };
        field.addEventListener("input", handler);
        field.addEventListener("change", handler);
      };

      document.querySelectorAll("[data-required='true']").forEach(attachFieldListeners);
      streetInput?.addEventListener("input", handleStreetInput);
      streetInput?.addEventListener("focus", handleStreetInput);
      document.addEventListener("click", (event) => {
        const target = event.target;
        if (
          addressSuggestions &&
          !addressSuggestions.classList.contains("hidden") &&
          target !== streetInput &&
          !addressSuggestions.contains(target)
        ) {
          hideAddressSuggestions();
        }
      });

      openRegisterCardBtn?.addEventListener("click", (event) => {
        event.preventDefault();
        showRegisterCard();
      });

      registerBackBtns?.forEach((btn) => {
        btn.addEventListener("click", (event) => {
          event.preventDefault();

          const rawTarget = btn.dataset.stepTarget || btn.getAttribute("data-step-target") || "";
          const target = rawTarget.trim();

          // If user clicked "Back" from first step → go to login card
          if (target.toLowerCase() === "login") {
            showLoginCard();
            return;
          }

          // Otherwise go to previous register step
          showRegisterStep(target || "info");
        });
      });

      stepButtons?.forEach((btn) => {
        btn.addEventListener("click", (event) => {
          event.preventDefault();
          if (!validateCurrentStep()) return;
          const rawTarget = btn.dataset.stepTarget || btn.getAttribute("data-step-target") || "";
          const target = rawTarget.trim();
          if (target) {
            showRegisterStep(target);
          }
        });
      });

      confirmOtpBtn?.addEventListener("click", (event) => {
        event.preventDefault();
        if (!validateCurrentStep()) return;
        const rawTarget = confirmOtpBtn.dataset.stepTarget || confirmOtpBtn.getAttribute("data-step-target") || "";
        const target = rawTarget.trim();
        if (target) {
          showRegisterStep(target);
        }
      });

      const registerPassword = document.getElementById("registerPassword");
      const registerPasswordConfirm = document.getElementById("registerPasswordConfirm");
      const passwordStrengthFill = document.querySelector(".password-strength-fill");
      const passwordStrength = document.querySelector(".password-strength");
      const passwordStrengthStatus = document.querySelector(".password-strength-status");
      const passwordStatusIndicators = Array.from(
        document.querySelectorAll(".password-status")
      );
      const passwordMatchMessage = document.getElementById("passwordMatchMessage");
      const passwordHintItems = new Map(
        Array.from(document.querySelectorAll(".password-hint li")).map((item) => [
          item.dataset.rule,
          item
        ])
      );

      const evaluatePasswordStrength = (value) => {
        const hasLower = /[a-z]/.test(value);
        const hasUpper = /[A-Z]/.test(value);
        const hasDigit = /[0-9]/.test(value);
        const hasSpecial = /[^A-Za-z0-9]/.test(value);
        const lengthOk = value.length >= 8;
        const score = [hasLower, hasUpper, hasDigit, hasSpecial, lengthOk].filter(Boolean).length;
        let label = "Weak";
        let color = "#9ca3af";
        let width = 33;
        if (score <= 2) {
          label = "Weak";
          color = "#9ca3af";
          width = 33;
        } else if (score === 3 || score === 4) {
          label = "Not strong";
          color = "#facc15";
          width = 66;
        } else {
          label = "Strong";
          color = "#16a34a";
          width = 100;
        }
        return { label, color, width, hasLower, hasUpper, hasDigit, hasSpecial, lengthOk };
      };

      const updatePasswordUI = () => {
        const passwordValue = registerPassword?.value || "";
        const confirmValue = registerPasswordConfirm?.value || "";
        const strength = evaluatePasswordStrength(passwordValue);

        if (passwordStrengthFill) {
          if (passwordValue.length === 0) {
            passwordStrengthFill.style.width = "0";
            passwordStrengthFill.style.background = "#9ca3af";
            if (passwordStrengthStatus) {
              passwordStrengthStatus.textContent = "";
            }
          } else {
            passwordStrengthFill.style.width = `${strength.width}%`;
            passwordStrengthFill.style.background = strength.color;
            if (passwordStrengthStatus) {
              passwordStrengthStatus.textContent = strength.label;
              passwordStrengthStatus.style.color = strength.color;
            }
          }
          if (passwordStrength) {
            passwordStrength.classList.toggle("active", passwordValue.length > 0);
          }
        }

        const passwordsMatch = passwordValue.length > 0 && passwordValue === confirmValue;
        passwordStatusIndicators.forEach((indicator) => {
          if (passwordsMatch) {
            indicator.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
            indicator.classList.add("match");
          } else {
            indicator.innerHTML = "";
            indicator.classList.remove("match");
          }
        });
        const conditions = {
          uppercase: strength.hasUpper,
          lowercase: strength.hasLower,
          digit: strength.hasDigit,
          special: strength.hasSpecial,
          length: strength.lengthOk
        };
        Object.entries(conditions).forEach(([rule, passed]) => {
          const hint = passwordHintItems.get(rule);
          if (!hint) return;
          hint.classList.toggle("met", passed);
          hint.classList.toggle("missing", !passed);
        });
        if (registerPasswordConfirm) {
          const confirmWrapper = registerPasswordConfirm.closest(".input-with-icon");
          if (confirmValue && passwordValue !== confirmValue) {
            registerPasswordConfirm.classList.add("input-error");
            confirmWrapper?.classList.add("error");
          } else {
            registerPasswordConfirm.classList.remove("input-error");
            confirmWrapper?.classList.remove("error");
          }
        }

        if (passwordMatchMessage) {
          if (passwordValue && confirmValue) {
            if (passwordValue === confirmValue) {
              passwordMatchMessage.textContent = "Passwords match";
              passwordMatchMessage.classList.remove("nomatch");
              passwordMatchMessage.classList.add("match");
            } else {
              passwordMatchMessage.textContent = "Passwords do not match";
              passwordMatchMessage.classList.remove("match");
              passwordMatchMessage.classList.add("nomatch");
            }
          } else {
            passwordMatchMessage.textContent = "";
            passwordMatchMessage.classList.remove("match", "nomatch");
          }
        }
      };

      [registerPassword, registerPasswordConfirm].forEach((input) => {
        input?.addEventListener("input", updatePasswordUI);
      });

      const passwordToggleButtons = document.querySelectorAll(".password-toggle");
      passwordToggleButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
          const targetId = btn.dataset.target;
          const targetInput = document.getElementById(targetId);
          if (!targetInput) return;
          const showing = targetInput.type === "text";
          targetInput.type = showing ? "password" : "text";
          const icon = btn.querySelector("i");
          if (icon) {
            icon.classList.toggle("fa-eye", showing);
            icon.classList.toggle("fa-eye-slash", !showing);
          }
        });
      });
    });
