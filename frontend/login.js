const authStatus = document.getElementById('authStatus');

function setStatus(message, isError = false) {
  authStatus.textContent = message;
  authStatus.style.color = isError ? '#b93636' : '#1f7a57';
}

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

function saveSession(owner) {
  localStorage.setItem('ownerSession', JSON.stringify(owner));
}

document.getElementById('registerForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const owner = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        owner_name: document.getElementById('registerName').value.trim(),
        contact: document.getElementById('registerContact').value.trim(),
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

document.getElementById('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const owner = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        contact: document.getElementById('loginContact').value.trim(),
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
