async function waitForJitsiApi(timeoutMs = 10000) {
  if (window.JitsiMeetExternalAPI) return;

  return new Promise((resolve, reject) => {
    const start = Date.now();
    const poll = () => {
      if (window.JitsiMeetExternalAPI) {
        return resolve();
      }
      if (Date.now() - start > timeoutMs) {
        return reject(new Error('Jitsi API failed to load in time')); 
      }
      requestAnimationFrame(poll);
    };
    poll();
  });
}

function buildRoomName(channelId) {
  const workspaceId = typeof currentWorkspaceId !== 'undefined' ? currentWorkspaceId : 'default';
  const channel = channelId || (typeof currentChannelId !== 'undefined' ? currentChannelId : 'general');
  return `${workspaceId}_${channel}`;
}

async function openLiveClass(channelId) {
  const roomName = buildRoomName(channelId);
  const container = document.getElementById('liveContainer');
  if (!container) {
    console.warn('Live container missing');
    return;
  }

  container.style.display = 'block';
  container.innerHTML = '';

  try {
    const response = await fetch('/api/live/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room: roomName }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || 'Unable to request live token');
    }

    const { token } = await response.json();
    await waitForJitsiApi();

    if (window.liveClassApi) {
      window.liveClassApi.dispose();
    }

    window.liveClassApi = new window.JitsiMeetExternalAPI('meet.studistalk.de', {
      roomName,
      parentNode: container,
      jwt: token,
      width: '100%',
      height: '100%',
      configOverwrite: {
        disableInviteFunctions: true,
        disableDeepLinking: true,
      },
      interfaceConfigOverwrite: {
        TOOLBAR_BUTTONS: [
          'microphone',
          'camera',
          'chat',
          'raisehand',
          'tileview',
          'fullscreen',
          'hangup',
        ],
      },
    });
  } catch (error) {
    console.error('Live class failed', error);
    container.textContent = error.message;
  }
}

window.openLiveClass = openLiveClass;

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.querySelector('.app-rail-btn-live');
  if (!btn) return;
  btn.addEventListener('click', () => {
    openLiveClass();
  });
});
