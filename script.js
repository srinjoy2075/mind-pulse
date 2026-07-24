(function () {
  "use strict";

  // ---- Config mirrored from the FastAPI Pydantic model ----
  const API_BASE = "http://127.0.0.1:8000";
  const PREDICT_URL = API_BASE + "/predict";

  const PLATFORMS = [
    "Facebook", "LinkedIn", "Instagram", "Snapchat", "Twitter",
    "YouTube", "TikTok", "LINE", "KakaoTalk", "VKontakte", "WhatsApp", "WeChat"
  ];

  const TOP_COUNTRIES = ["Other", "India", "USA", "Canada", "Australia", "UK", "Germany", "Mexico", "Turkey", "France"];

  // field -> { type, min, max }, used for client-side pre-validation
  const NUMERIC_CONSTRAINTS = {
    age: { min: 10, max: 100, integer: true },
    avg_daily_usage_hours: { min: 0, max: 24 },
    daily_unlocks: { min: 0, integer: true },
    study_hours: { min: 0, max: 24 },
    physical_activity_hours: { min: 0, max: 24 },
    sleep_hours_per_night: { min: 0, max: 24 },
  };

  const FIELD_LABELS = {
    age: "Age", gender: "Gender", country: "Country", academic_level: "Academic level",
    most_used_platform: "Most-used platform", purpose_of_use: "Purpose of use",
    avg_daily_usage_hours: "Avg. daily usage", daily_unlocks: "Daily unlocks",
    study_hours: "Study hours", physical_activity_hours: "Physical activity",
    sleep_hours_per_night: "Sleep per night", stress_level: "Stress level",
  };

  const form = document.getElementById("predict-form");
  const submitBtn = document.getElementById("submit-btn");
  const serverNote = document.getElementById("server-note");
  const apiLabel = document.getElementById("api-base-label");

  const resultEmpty = document.getElementById("result-empty");
  const resultContent = document.getElementById("result-content");
  const resultError = document.getElementById("result-error");
  const errorDetail = document.getElementById("error-detail");
  const scoreValueEl = document.getElementById("score-value");
  const resultBand = document.getElementById("result-band");
  const resultBlurb = document.getElementById("result-blurb");
  const gaugeArc = document.getElementById("gauge-arc");
  const needleGroup = document.getElementById("needle-group");

  apiLabel.textContent = API_BASE;

  // ---- Populate dynamic options ----
  const platformSelect = document.getElementById("most_used_platform");
  PLATFORMS.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p;
    opt.textContent = p;
    platformSelect.appendChild(opt);
  });

  const countryList = document.getElementById("country-list");
  TOP_COUNTRIES.filter((c) => c !== "Other").forEach((c) => {
    const opt = document.createElement("option");
    opt.value = c;
    countryList.appendChild(opt);
  });

  // ---- Live labels for range sliders ----
  ["avg_daily_usage_hours", "study_hours", "physical_activity_hours", "sleep_hours_per_night"].forEach((id) => {
    const input = document.getElementById(id);
    const label = document.getElementById(id + "-val");
    const update = () => { label.textContent = Number(input.value).toFixed(2).replace(/\.?0+$/, "") + " h"; };
    input.addEventListener("input", update);
    update();
  });

  // ---- Validation helpers ----
  function clearFieldError(name) {
    const field = form.querySelector(`[name="${name}"]`)?.closest(".field");
    const errEl = form.querySelector(`[data-error-for="${name}"]`);
    if (field) field.classList.remove("invalid");
    if (errEl) errEl.textContent = "";
  }

  function setFieldError(name, message) {
    const field = form.querySelector(`[name="${name}"]`)?.closest(".field");
    const errEl = form.querySelector(`[data-error-for="${name}"]`);
    if (field) field.classList.add("invalid");
    if (errEl) errEl.textContent = message;
  }

  function clearAllErrors() {
    Object.keys(FIELD_LABELS).forEach(clearFieldError);
    serverNote.textContent = "";
  }

  function validateClientSide(data) {
    let firstInvalid = null;
    Object.entries(NUMERIC_CONSTRAINTS).forEach(([name, rule]) => {
      const raw = data[name];
      const value = Number(raw);
      if (raw === "" || raw === null || Number.isNaN(value)) {
        setFieldError(name, `${FIELD_LABELS[name]} is required.`);
        firstInvalid = firstInvalid || name;
        return;
      }
      if (rule.integer && !Number.isInteger(value)) {
        setFieldError(name, `${FIELD_LABELS[name]} must be a whole number.`);
        firstInvalid = firstInvalid || name;
        return;
      }
      if (rule.min !== undefined && value < rule.min) {
        setFieldError(name, `Must be at least ${rule.min}.`);
        firstInvalid = firstInvalid || name;
      }
      if (rule.max !== undefined && value > rule.max) {
        setFieldError(name, `Must be at most ${rule.max}.`);
        firstInvalid = firstInvalid || name;
      }
    });
    ["gender", "country", "academic_level", "most_used_platform", "purpose_of_use", "stress_level"].forEach((name) => {
      if (!data[name]) {
        setFieldError(name, `${FIELD_LABELS[name]} is required.`);
        firstInvalid = firstInvalid || name;
      }
    });
    return firstInvalid;
  }

  // ---- Gauge rendering ----
  // Semicircular arc from -90deg (score 0) to +90deg (score 10). Path length ~283 (measured).
  const ARC_LENGTH = 283;

  function bandFor(score) {
    if (score >= 7) return { key: "calm", label: "Thriving", color: "var(--accent-calm)",
      blurb: "Your habits line up with strong, steady wellbeing right now." };
    if (score >= 4.5) return { key: "neutral", label: "Balanced", color: "var(--accent-neutral)",
      blurb: "A mixed picture — some habits are helping, others could use attention." };
    return { key: "warn", label: "Strained", color: "var(--accent-warn)",
      blurb: "Your inputs suggest your feed and routine may be weighing on you lately." };
  }

  function renderResult(score) {
    resultEmpty.hidden = true;
    resultError.hidden = true;
    resultContent.hidden = false;

    const clamped = Math.max(0, Math.min(10, score));
    const pct = clamped / 10;
    const band = bandFor(clamped);

    scoreValueEl.textContent = Number(score).toFixed(2).replace(/\.?0+$/, "");
    resultBand.textContent = band.label;
    resultBand.className = "result-band " + band.key;
    resultBlurb.textContent = band.blurb;

    gaugeArc.style.stroke = band.color;
    // force reflow so the transition replays every submission
    gaugeArc.style.transition = "none";
    gaugeArc.setAttribute("stroke-dashoffset", ARC_LENGTH);
    needleGroup.style.transition = "none";
    needleGroup.style.transform = "rotate(-90deg)";
    // eslint-disable-next-line no-unused-expressions
    gaugeArc.getBoundingClientRect();

    requestAnimationFrame(() => {
      gaugeArc.style.transition = "";
      needleGroup.style.transition = "";
      gaugeArc.setAttribute("stroke-dashoffset", String(ARC_LENGTH * (1 - pct)));
      needleGroup.style.transform = `rotate(${-90 + pct * 180}deg)`;
    });
  }

  function renderError(message) {
    resultEmpty.hidden = true;
    resultContent.hidden = true;
    resultError.hidden = false;
    errorDetail.textContent = message;
  }

  // ---- Submit handling ----
  function setLoading(isLoading) {
    submitBtn.disabled = isLoading;
    submitBtn.classList.toggle("loading", isLoading);
  }

  function formatServerValidationError(detailArray) {
    try {
      return detailArray.map((d) => {
        const field = d.loc && d.loc.length ? d.loc[d.loc.length - 1] : "field";
        const label = FIELD_LABELS[field] || field;
        return `${label}: ${d.msg}`;
      }).join(" · ");
    } catch (e) {
      return "The server rejected one or more fields.";
    }
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearAllErrors();

    const raw = Object.fromEntries(new FormData(form).entries());

    const firstInvalid = validateClientSide(raw);
    if (firstInvalid) {
      form.querySelector(`[name="${firstInvalid}"]`)?.focus();
      return;
    }

    const payload = {
      age: parseInt(raw.age, 10),
      gender: raw.gender,
      country: raw.country.trim(),
      academic_level: raw.academic_level,
      most_used_platform: raw.most_used_platform,
      purpose_of_use: raw.purpose_of_use,
      avg_daily_usage_hours: parseFloat(raw.avg_daily_usage_hours),
      daily_unlocks: parseInt(raw.daily_unlocks, 10),
      study_hours: parseFloat(raw.study_hours),
      physical_activity_hours: parseFloat(raw.physical_activity_hours),
      sleep_hours_per_night: parseFloat(raw.sleep_hours_per_night),
      stress_level: raw.stress_level,
    };

    setLoading(true);

    try {
      const res = await fetch(PREDICT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      let body = null;
      try { body = await res.json(); } catch (parseErr) { body = null; }

      if (!res.ok) {
        if (res.status === 422 && body && Array.isArray(body.detail)) {
          renderError(formatServerValidationError(body.detail));
        } else if (body && typeof body.detail === "string") {
          renderError(body.detail);
        } else {
          renderError(`The server responded with status ${res.status}. Please check your inputs and try again.`);
        }
        return;
      }

      if (!body || typeof body.predicted_mental_health_score !== "number") {
        renderError("The server responded, but not with the expected prediction format.");
        return;
      }

      renderResult(body.predicted_mental_health_score);
    } catch (err) {
      renderError(
        `Couldn't reach the prediction server at ${API_BASE}. Make sure your FastAPI server is running (uvicorn) and reachable at that address.`
      );
    } finally {
      setLoading(false);
    }
  });
})();
