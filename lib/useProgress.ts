"use client";

import { useCallback, useEffect, useState } from "react";
import type { PipelineStage } from "./types";

const STORAGE_KEY = "vacationer-progress-v1";

type ProgressMap = Record<string, PipelineStage>;

export function useProgress() {
  const [progress, setProgress] = useState<ProgressMap>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setProgress(JSON.parse(raw));
    } catch {
      // corrupt or unavailable storage — start fresh
    }
    setLoaded(true);
  }, []);

  const setStage = useCallback((id: string, stage: PipelineStage) => {
    setProgress((prev) => {
      const next = { ...prev };
      if (stage === "none") delete next[id];
      else next[id] = stage;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // storage full/blocked — state still updates for this session
      }
      return next;
    });
  }, []);

  return { progress, setStage, loaded };
}
