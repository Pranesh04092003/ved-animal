const authStatus = document.getElementById('authStatus');

/* ------------------ Status Message ------------------ */
function setStatus(message, isError = false) {
  authStatus.textContent = message;
  authStatus.style.color = isError ? '#b93636' : '#1f7a57';
}

/* ------------------ API Helper ------------------ */
async function api(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || response.statusText);
  }

  return data;
}

/* ------------------ Session Save ------------------ */
function saveSession(owner) {
  localStorage.setItem('ownerSession', JSON.stringify(owner));
}

/* ------------------ Contact Validation ------------------ */
function isValidContact(contact) {
  return /^\d{10}$/.test(contact);
}

/* ------------------ Restrict Input to 10 Digits ------------------ */
function restrictContactInput(input) {
  input.addEventListener('input', () => {
    input.value = input.value
      .replace(/\D/g, '') // remove non-digits
      .slice(0, 10);      // limit to 10 digits
  });
}

/* Apply restriction */
restrictContactInput(document.getElementById('loginContact'));
restrictContactInput(document.getElementById('registerContact'));

/* ------------------ Register Form ------------------ */
document.getElementById('registerForm').addEventListener('submit', async (event) => {
  event.preventDefault();

  const contact = document.getElementById('registerContact').value.trim();

  if (!isValidContact(contact)) {
    setStatus('Contact must be a 10-digit number', true);
    return;
  }

  try {
    const owner = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        owner_name: document.getElementById('registerName').value.trim(),
        contact: contact,
        password: document.getElementById('registerPassword').value,
      }),
    });

    saveSession(owner);
    setStatus('Registration successful. Redirecting...');
    window.location.href = '/index.html';
  } catch (error) {
    setStatus(error.message, true);
  }
});

/* ------------------ Login Form ------------------ */
document.getElementById('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();

  const contact = document.getElementById('loginContact').value.trim();

  if (!isValidContact(contact)) {
    setStatus('Contact must be a 10-digit number', true);
    return;
  }

  try {
    const owner = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        contact: contact,
        password: document.getElementById('loginPassword').value,
      }),
    });

    saveSession(owner);
    setStatus('Login successful. Redirecting...');
    window.location.href = '/index.html';
  } catch (error) {
    setStatus(error.message, true);
  }
});
