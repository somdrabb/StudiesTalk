import React, { useEffect, useRef } from 'react';

const EXTERNAL_API_URL = 'https://meet.studistalk.de/external_api.js';

function loadExternalApi() {
  return new Promise((resolve, reject) => {
    if (window.JitsiMeetExternalAPI) {
      return resolve(window.JitsiMeetExternalAPI);
    }

    const existingScript = document.querySelector(`script[src="${EXTERNAL_API_URL}"]`);
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(window.JitsiMeetExternalAPI));
      existingScript.addEventListener('error', () => reject(new Error('Failed to load Jitsi API')));
      return;
    }

    const script = document.createElement('script');
    script.src = EXTERNAL_API_URL;
    script.async = true;
    script.onload = () => resolve(window.JitsiMeetExternalAPI);
    script.onerror = () => reject(new Error('Failed to load Jitsi API'));
    document.body.appendChild(script);
  });
}

export default function JitsiEmbed({ room, liveClassId, displayName, onApiReady }) {
  const containerRef = useRef(null);
  const apiRef = useRef(null);

  useEffect(() => {
    let mounted = true;

    async function setupJitsi() {
      if (!containerRef.current) return;

      await loadExternalApi();
      const res = await fetch(`/api/live-classes/${liveClassId}`);
      const payload = res.ok ? await res.json() : null;
      const jwt = payload?.token;

      if (!mounted) return;

      const options = {
        roomName: room,
        width: '100%',
        height: '100%',
        parentNode: containerRef.current,
        configOverwrite: {
          disableInviteFunctions: true,
          enableWelcomePage: false,
          defaultLanguage: 'en',
        },
        interfaceConfigOverwrite: {
          TOOLBAR_BUTTONS: [
            'microphone',
            'camera',
            'fullscreen',
            'chat',
            'raisehand',
            'tileview',
          ],
        },
        userInfo: {
          displayName,
        },
        jwt,
      };

      if (apiRef.current) {
        apiRef.current.dispose();
      }

      apiRef.current = new window.JitsiMeetExternalAPI('meet.studistalk.de', options);
      onApiReady?.(apiRef.current);
    }

    setupJitsi().catch((error) => {
      console.error('Unable to initialize Jitsi', error);
    });

    return () => {
      mounted = false;
      if (apiRef.current) {
        apiRef.current.dispose();
        onApiReady?.(null);
      }
    };
  }, [room, liveClassId, displayName, onApiReady]);

  return <div ref={containerRef} className="live-class-embed" />;
}
