const API_BASE = 'http://localhost:3000'; 
let token = localStorage.getItem('token') || null;

// Utility
const $ = (sel) => document.querySelector(sel);

// SIGNUP
$('#signup-submit')?.addEventListener('click', async (e) => {
  e.preventDefault();
  const email = $('#signup-form input[placeholder="Email"]').value.trim();
  const password = $('#signup-form input[placeholder="Password"]').value;
  const confirm = $('#signup-form input[placeholder="Confirm Password"]').value;

  if (!email || !password) return alert('Enter email & password');
  if (password !== confirm) return alert('Passwords do not match');

  const resp = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  const data = await resp.json();
  if (!resp.ok) return alert(data.error || 'Sign-up failed');
  token = data.token;
  localStorage.setItem('token', token);
  showAIDiet();
});

// LOGIN
$('#login-submit')?.addEventListener('click', async (e) => {
  e.preventDefault();
  const email = $('#login-form input[placeholder="Email"]').value.trim();
  const password = $('#login-form input[placeholder="Password"]').value;

  if (!email || !password) return alert('Enter email & password');

  const resp = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  const data = await resp.json();
  if (!resp.ok) return alert(data.error || 'Login failed');
  token = data.token;
  localStorage.setItem('token', token);
  showAIDiet();
});

// Toggle forms
function showForm(formName) {
  const loginForm = $('#login-form');
  const signupForm = $('#signup-form');
  const toggleLogin = $('#toggle-login');
  const toggleSignup = $('#toggle-signup');
  const headerLoginBtn = $('#header-login');
  const headerSignupBtn = $('#header-signup');

  if (!loginForm || !signupForm) return;

  loginForm.style.display = 'none';
  signupForm.style.display = 'none';
  toggleLogin.classList.remove('active');
  toggleSignup.classList.remove('active');

  if (formName === 'login') {
    loginForm.style.display = 'block';
    toggleLogin.classList.add('active');
    headerLoginBtn?.classList.add('btn-warning');
    headerSignupBtn?.classList.add('btn-outline-light');
  } else {
    signupForm.style.display = 'block';
    toggleSignup.classList.add('active');
    headerSignupBtn?.classList.add('btn-warning');
    headerLoginBtn?.classList.add('btn-outline-light');
  }
}

// Show AI section
function showAIDiet() {
  const aiSection = $('#ai-section');
  const formContainer = $('.form-container');
  if (formContainer) formContainer.style.display = 'none';
  if (aiSection) {
    aiSection.style.display = 'block';
    aiSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  showForm('login');

  // Header navigation
  $('#header-login')?.addEventListener('click', () => showForm('login'));
  $('#header-signup')?.addEventListener('click', () => showForm('signup'));
  $('#header-home')?.addEventListener('click', () => {
    showForm('login');
    $('.form-container').style.display = 'block';
    $('#ai-section').style.display = 'none';
  });

  $('#toggle-login')?.addEventListener('click', () => showForm('login'));
  $('#toggle-signup')?.addEventListener('click', () => showForm('signup'));
  $('#inline-signup')?.addEventListener('click', (e) => {
    e.preventDefault();
    showForm('signup');
  });

  // === SHOW HISTORY BUTTON HANDLER ===
  const historyBtn = document.getElementById('btn-history');
  if (historyBtn) {
    historyBtn.addEventListener('click', async () => {
      if (!token) return alert('Please log in first.');

      const resp = await fetch(`${API_BASE}/api/history`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await resp.json();
      if (!resp.ok) return alert(data.error || 'Could not load history');

      const box = document.getElementById('history-box');
      box.classList.remove('hidden');

      if (!data.items || data.items.length === 0) {
        box.innerHTML = `<p class="text-gray-500 text-center">No history yet. Generate a plan first.</p>`;
        return;
      }

      box.innerHTML = data.items.map(item => `
        <div class="mb-6 p-4 bg-white rounded-lg shadow-sm border">
          <div class="text-sm text-gray-500 mb-2">
            <b>${item.created_at}</b> • Target: <b>${item.target_calories || "-"}</b> kcal
          </div>
          <pre class="whitespace-pre-wrap text-gray-800 text-sm">${item.result}</pre>
        </div>
      `).join('');
    });
  }

  // === DIET FORM ===
  const dietForm = document.getElementById('diet-form');
  const generateBtn = document.getElementById('generate-btn');
  const loadingEl = document.getElementById('loading');
  const resultsEl = document.getElementById('results');
  const summaryEl = document.getElementById('summary');
  const planContentEl = document.getElementById('plan-content');

  dietForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!generateBtn) return;

    loadingEl?.classList.remove('hidden');
    resultsEl?.classList.add('hidden');
    generateBtn.disabled = true;
    generateBtn.textContent = 'Generating...';

    const formData = new FormData(dietForm);
    const data = Object.fromEntries(formData.entries());
    const age = parseInt(data.age);
    const weight = parseFloat(data.weight);
    const height = parseFloat(data.height);

    const bmi = calculateBMI(weight, height);
    const bmr = calculateBMR(data.gender, weight, height, age);
    const tdee = calculateTDEE(bmr, data.activity);
    const targetCalories = calculateTargetCalories(tdee, data.goal);

    if (summaryEl) {
      summaryEl.innerHTML = `
        <div><strong>Your BMI:</strong> ${bmi.toFixed(1)} (${getBmiCategory(bmi)})</div>
        <div><strong>Maintain Calories:</strong> ${Math.round(tdee)} kcal/day</div>
        <div><strong>Goal Calories:</strong> ${Math.round(targetCalories)} kcal/day</div>
      `;
    }

    const systemPrompt = `You are an expert nutritionist...`; // same as before
    const userPrompt = `Please generate a one-day meal plan...`; // same as before

    try {
      const resp = await fetch(`${API_BASE}/api/mealplan`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ userPrompt, systemPrompt, targetCalories: Math.round(targetCalories) })
      });

      if (!resp.ok) throw new Error('AI API failed: ' + resp.status);
      const data = await resp.json();
      planContentEl && (planContentEl.textContent = data.text || 'No response from AI.');
      resultsEl?.classList.remove('hidden');
    } catch (err) {
      console.error(err);
      planContentEl && (planContentEl.textContent = 'Error generating plan: ' + err.message);
      resultsEl?.classList.remove('hidden');
    } finally {
      loadingEl?.classList.add('hidden');
      generateBtn.disabled = false;
      generateBtn.textContent = 'Generate My Plan';
    }
  });
});

/* === Calculations === */
function calculateBMI(weight, height) {
  const h = height / 100;
  return weight / (h * h);
}
function getBmiCategory(bmi) {
  if (bmi < 18.5) return 'Underweight';
  if (bmi < 24.9) return 'Normal weight';
  if (bmi < 29.9) return 'Overweight';
  return 'Obese';
}
function calculateBMR(gender, weight, height, age) {
  return gender === 'male'
    ? 88.362 + 13.397 * weight + 4.799 * height - 5.677 * age
    : 447.593 + 9.247 * weight + 3.098 * height - 4.33 * age;
}
function calculateTDEE(bmr, activityLevel) {
  const multipliers = {
    sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9
  };
  return bmr * (multipliers[activityLevel] || 1.55);
}
function calculateTargetCalories(tdee, goal) {
  switch (goal) {
    case 'weight_loss': return tdee - 500;
    case 'muscle_gain': return tdee + 500;
    default: return tdee;
  }
}
