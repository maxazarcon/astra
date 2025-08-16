const form = document.getElementById('prompt-form');
const sendBtn = document.getElementById('send');
const stopBtn = document.getElementById('stop');
const out = document.getElementById('response');
const status = document.getElementById('status');
const tempInput = document.getElementById('temperature');
const tempValue = document.getElementById('temp-value');
let controller = null;

tempInput.addEventListener('input', () => {
  tempValue.textContent = tempInput.value;
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const prompt = new FormData(form).get('prompt').toString().trim();
  if (!prompt) return;
  const temperature = parseFloat(tempInput.value);

  out.textContent = '';
  out.innerHTML = '';
  status.textContent = 'Connecting';
  sendBtn.disabled = true;
  stopBtn.disabled = false;
  controller = new AbortController();

  let fullResponse = "";

  try {
    const res = await fetch('https://api.arkoninteractive.com/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, temperature }),
      signal: controller.signal
    });

    if (!res.ok || !res.body) {
      const err = await safeJson(res);
      throw new Error(err?.error || `HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    status.textContent = 'Streaming';

    stream_loop:
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const frames = buffer.split('\n\n');
      buffer = frames.pop() || '';

      for (const frame of frames) {
        if (frame.startsWith('event: done')) {
          status.textContent = 'Done';
          out.innerHTML = marked.parse(fullResponse);
          fullResponse = "";
          break stream_loop;
        }
        const line = frame.split('\n').find(l => l.startsWith('data:'));
        if (!line) continue;
        try {
          const data = JSON.parse(line.slice(5).trim());
          if (data.delta) {
            fullResponse += data.delta;
            // Optional: live-updating plain text
            // out.textContent = fullResponse;
          }
        } catch {}
      }
    }
  } catch (err) {
    if (controller?.signal.aborted) {
      status.textContent = 'Cancelled';
    } else {
      status.textContent = 'Error';
      out.textContent = `Error: ${err.message}`;
    }
  } finally {
    sendBtn.disabled = false;
    stopBtn.disabled = true;
    controller = null;
  }
});

stopBtn.addEventListener('click', () => {
  if (controller) controller.abort();
});

async function safeJson(r) {
  try { return await r.json(); } catch { return null; }
}
