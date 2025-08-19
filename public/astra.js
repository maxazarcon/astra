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

async function handleImageGeneration(prompt, aiBubble) {
  try {
    aiBubble.innerHTML = 'Generating image...';
    const res = await fetch('https://api.arkoninteractive.com/api/image/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await safeJson(res);
      throw new Error(err?.error || `HTTP ${res.status}`);
    }

    const blob = await res.blob();
    const imageUrl = URL.createObjectURL(blob);
    aiBubble.innerHTML = `<img src="${imageUrl}" class="msg-image" alt="generated image" />`;

  } catch (err) {
    if (controller?.signal.aborted) {
      aiBubble.innerHTML = `<span style="color:#bbb">Cancelled.</span>`;
    } else {
      aiBubble.innerHTML = `<span style="color:#b00">Error: ${err.message}</span>`;
    }
  }
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

  if (prompt.startsWith('/imagine ')) {
    const imagePrompt = prompt.slice(8).trim();
    await handleImageGeneration(imagePrompt, aiBubble);
    // Reset form and controls
    sendBtn.disabled = false;
    stopBtn.disabled = true;
    controller = null;
    promptInput.value = "";
    promptInput.focus();
    return; // End execution here for image generation
  }

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
    let buffer = "";
    let eventName = null;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("event:")) {
          eventName = line.substring(6).trim();
        } else if (line.startsWith("data:")) {
          const dataStr = line.substring(5).trim();
          if (!dataStr) continue;

          if (eventName === 'tool_result') {
            try {
              const data = JSON.parse(dataStr);
              if (data.type === 'image') {
                aiBubble.innerHTML = `<img src="${data.data}" class="msg-image" alt="generated image" />`;
              }
            } catch (e) {
              aiBubble.innerHTML = `<span style="color:#b00">Error: ${e.message}</span>`;
            }
            return;
          } else if (eventName === 'done') {
            aiBubble.innerHTML = marked.parse(fullResponse);
            fullResponse = "";
            return;
          } else { // Default message
            try {
              const data = JSON.parse(dataStr);
              if (data.response) {
                fullResponse += data.response;
                aiBubble.innerHTML = marked.parse(fullResponse);
              }
            } catch (e) {
              // ignore incomplete json
            }
          }
        } else if (line.trim() === '') {
          // Reset on message boundary
          eventName = null;
        }
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
