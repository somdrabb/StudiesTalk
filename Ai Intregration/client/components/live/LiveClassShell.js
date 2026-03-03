import React, { useMemo, useState } from 'react';
import JitsiEmbed from './JitsiEmbed';
import SlidePanel from './SlidePanel';

const statusLabels = {
  scheduled: 'Scheduled',
  live: 'Live',
  ended: 'Ended',
};

export default function LiveClassShell({ classes = [], user = {} }) {
  const currentClass = classes[0];
  const [jitsiApi, setJitsiApi] = useState(null);

  const statusLabel = useMemo(
    () => (currentClass ? statusLabels[currentClass.status] || 'Scheduled' : 'Scheduled'),
    [currentClass]
  );

  if (!currentClass) {
    return <p className="live-class-shell empty-state">No live class scheduled.</p>;
  }

  const handleLeave = () => {
    if (jitsiApi) {
      jitsiApi.executeCommand('hangup');
      jitsiApi.dispose();
      setJitsiApi(null);
    }
  };

  return (
    <div className="live-class-shell">
      <header className="live-class-header">
        <div>
          <h1>{currentClass.title}</h1>
          <p className="status-pill">{statusLabel}</p>
        </div>
        <button type="button" className="leave-button" onClick={handleLeave}>
          Leave
        </button>
      </header>
      <div className="live-class-main">
        <section className="live-class-video">
          <JitsiEmbed
            room={currentClass.room_key}
            liveClassId={currentClass.id}
            displayName={user.displayName || user.name || 'Student'}
            onApiReady={setJitsiApi}
          />
        </section>
        <aside className="live-class-panel">
          <SlidePanel />
        </aside>
      </div>
    </div>
  );
}
