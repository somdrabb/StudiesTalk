import React, { useEffect, useState } from 'react';
import LiveClassShell from '../components/live/LiveClassShell';

export default function LiveClassPage() {
  const [classes, setClasses] = useState([]);

  useEffect(() => {
    async function fetchClasses() {
      const res = await fetch('/api/live-classes');
      const data = await res.json();
      setClasses(data);
    }

    fetchClasses();
  }, []);

  return <LiveClassShell classes={classes} />;
}
