const form = document.getElementById('prompt-form');
const sendBtn = document.getElementById('send');
const stopBtn = document.getElementById('stop');
const promptInput = document.getElementById('prompt');
const status = document.getElementById('status');
const tempInput = document.getElementById('temperature');
const tempValue = document.getElementById('temp-value');
const tempDescription = document.getElementById('temp-description');
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

function updateTempDescription() {
  const temp = parseFloat(tempInput.value);
  let description = "";
  if (temp >= 0.2 && temp <= 0.4) {
    description = "Code Generation & Factual Tasks";
  } else if (temp >= 0.6 && temp <= 0.8) {
    description = "General Chat & Summarization";
  } else if (temp >= 0.9 && temp <= 1.3) {
    description = "Brainstorming & Creative Content";
  } else if (temp >= 1.4 && temp <= 2.0) {
    description = "Experimental / Highly Creative";
  }
  tempDescription.textContent = description;
}

tempInput.addEventListener('input', () => {
  tempValue.textContent = tempInput.value;
  updateTempDescription();
});
tokensInput.addEventListener('input', () => {
  tokensValue.textContent = tokensInput.value;
});

// Set initial description on page load
document.addEventListener('DOMContentLoaded', updateTempDescription);

let controller = null;
let attachedFile = null;

attachBtn.addEventListener('click', () => {
  fileInput.click();
});

function resizeImage(file, maxSize = 650) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(img.src);
      let { width, height } = img;

      if (width <= maxSize && height <= maxSize) {
        return resolve(file); // No resizing needed
      }

      if (width > height) {
        if (width > maxSize) {
          height = Math.round(height * (maxSize / width));
          width = maxSize;
        }
      } else {
        if (height > maxSize) {
          width = Math.round(width * (maxSize / height));
          height = maxSize;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob((blob) => {
        if (blob) {
          const resizedFile = new File([blob], file.name, {
            type: file.type,
            lastModified: Date.now(),
          });
          resolve(resizedFile);
        } else {
          reject(new Error('Canvas to Blob conversion failed'));
        }
      }, file.type, 0.9);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(img.src);
      reject(err);
    };
  });
}

fileInput.addEventListener('change', async () => {
  const file = fileInput.files[0];
  if (file) {
    try {
      status.textContent = 'Resizing image...';
      const resizedFile = await resizeImage(file);
      attachedFile = resizedFile;
      displayImagePreview(resizedFile);
      status.textContent = '';
    } catch (err) {
      console.error('Image resize error:', err);
      status.textContent = 'Error resizing image.';
      fileInput.value = '';
    }
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
  
  let bubbleHtml = '';
  if (role === 'ai') {
    bubbleHtml = `<div class="bubble markdown-body">${marked.parse(text || '')}</div>`;
  } else if (text) {
    bubbleHtml = `<div class="bubble">${text}</div>`;
  }

  let imageHtml = '';
  if (imageUrl) {
    imageHtml = `<img src="${imageUrl}" class="msg-image" alt="attached image" />`;
  }

  if (role === 'user' && (imageHtml || bubbleHtml)) {
    const group = document.createElement('div');
    group.className = 'bubble-group';
    group.innerHTML = imageHtml + bubbleHtml;
    msg.appendChild(group);
  } else {
    msg.innerHTML = imageHtml + bubbleHtml;
  }

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
