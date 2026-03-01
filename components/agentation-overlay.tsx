"use client";

import { useEffect, useState } from "react";
import { Agentation } from "agentation";

export function AgentationOverlay() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      setEnabled(false);
      return;
    }
    const host = window.location.hostname;
    setEnabled(host === "localhost" || host === "127.0.0.1");
  }, []);

  if (!enabled) return null;
  return <Agentation />;
}
