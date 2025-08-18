const form = document.getElementById('prompt-form');
const sendBtn = document.getElementById('send');
const stopBtn = document.getElementById('stop');
const promptInput = document.getElementById('prompt');
const status = document.getElementById('status');
const tempInput = document.getElementById('temperature');
const tempValue = document.getElementById('temp-value');
const tokensInput = document.getElementById('tokens');
const tokensValue = document.getElementById('tokens-value');
const thread = document.getElementById('chat-thread');
const attachBtn = document.getElementById('attach');
const fileInput = document.getElementById('file-input');
const previewContainer = document.getElementById('preview-container');

// Sidebar/flyout
const sidebar = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebar-overlay');
const menuBtn = document.getElementById('menu-btn');
const closeSidebarBtn = document.getElementById('close-sidebar');

// Settings flyout controls
menuBtn.onclick = () => openSidebar();
closeSidebarBtn.onclick = () => closeSidebar();
sidebarOverlay.onclick = () => closeSidebar();
function openSidebar() {
  sidebar.classList.add('open');
  sidebarOverlay.style.display = 'block';
}
function closeSidebar() {
  sidebar.classList.remove('open');
  sidebarOverlay.style.display = 'none';
}

tempInput.addEventListener('input', () => {
  tempValue.textContent = tempInput.value;
});
tokensInput.addEventListener('input', () => {
  tokensValue.textContent = tokensInput.value;
});

let controller = null;
let attachedFile = null;

attachBtn.addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (file) {
    attachedFile = file;
    displayImagePreview(file);
  }
});

function displayImagePreview(file) {
  previewContainer.innerHTML = '';
  const previewWrapper = document.createElement('div');
  previewWrapper.className = 'img-preview';

  const img = document.createElement('img');
  img.src = URL.createObjectURL(file);
  img.onload = () => URL.revokeObjectURL(img.src);

  const removeBtn = document.createElement('button');
  removeBtn.className = 'remove-btn';
  removeBtn.textContent = '×';
  removeBtn.onclick = () => {
    attachedFile = null;
    previewContainer.innerHTML = '';
    fileInput.value = ''; // Clear the file input
  };

  previewWrapper.appendChild(img);
  previewWrapper.appendChild(removeBtn);
  previewContainer.appendChild(previewWrapper);
}

function addMessage(role, text, imageUrl = null) {
  const msg = document.createElement('div');
  msg.className = `message ${role}`;
  let content = '';

  if (imageUrl) {
    content += `<img src="${imageUrl}" class="msg-image" alt="attached image" />`;
  }
  if (text) {
    if (role === "ai") {
      content += `<div class="bubble markdown-body">${marked.parse(text)}</div>`;
    } else {
      content += `<div class="bubble">${text}</div>`;
    }
  }
  
  msg.innerHTML = content;
  thread.appendChild(msg);
  thread.scrollTop = thread.scrollHeight;
  return msg.querySelector('.bubble');
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const prompt = promptInput.value.trim();
  if (!prompt && !attachedFile) return;
  const temperature = parseFloat(tempInput.value);
  const maxTokens = parseInt(tokensInput.value, 10);

  sendBtn.disabled = true;
  stopBtn.disabled = false;
  status.textContent = '';

  // Show user message
  const userImageURL = attachedFile ? URL.createObjectURL(attachedFile) : null;
  addMessage('user', prompt, userImageURL);

  controller = new AbortController();
  let aiBubble = addMessage('ai', ''); // create placeholder

  let fullResponse = "";
  try {
    const formData = new FormData();
    formData.append('prompt', prompt);
    formData.append('temperature', temperature);
    formData.append('max_tokens', maxTokens);
    if (attachedFile) {
      formData.append('image', attachedFile);
    }

    const res = await fetch('https://api.arkoninteractive.com/api/chat/stream', {
      method: 'POST',
      body: formData,
      signal: controller.signal
    });

    if (!res.ok || !res.body) {
      const err = await safeJson(res);
      throw new Error(err?.error || `HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    status.textContent = '';

    stream_loop:
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const frames = buffer.split('\n\n');
      buffer = frames.pop() || '';

      for (const frame of frames) {
        if (frame.startsWith('event: done')) {
          aiBubble.innerHTML = marked.parse(fullResponse);
          fullResponse = "";
          break stream_loop;
        }
        const line = frame.split('\n').find(l => l.startsWith('data:'));
        if (!line) continue;
        try {
          const data = JSON.parse(line.slice(5).trim());
          if (data.delta) {
            fullResponse += data.delta;
            aiBubble.innerHTML = marked.parse(fullResponse);
          }
        } catch {}
      }
    }
  } catch (err) {
    if (controller?.signal.aborted) {
      aiBubble.innerHTML = `<span style="color:#bbb">Cancelled.</span>`;
    } else {
      aiBubble.innerHTML = `<span style="color:#b00">Error: ${err.message}</span>`;
    }
  } finally {
    sendBtn.disabled = false;
    stopBtn.disabled = true;
    controller = null;
    promptInput.value = "";
    if (attachedFile) {
      attachedFile = null;
      previewContainer.innerHTML = '';
      fileInput.value = '';
    }
    promptInput.focus();
  }
});

stopBtn.addEventListener('click', () => {
  if (controller) controller.abort();
});

async function safeJson(r) {
  try { return await r.json(); } catch { return null; }
}
