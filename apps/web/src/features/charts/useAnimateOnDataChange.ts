import { useState } from 'react'

/**
 * Bar props that animate only when `data` changes. Recharts otherwise replays
 * its bar animation on every resize, so while a split panel slides open the
 * bars restart each frame and only catch up once the panel has stopped;
 * with this they track the container width frame by frame instead.
 */
export function useAnimateOnDataChange(data: unknown) {
  const [settledData, setSettledData] = useState<unknown>(null)
  return {
    isAnimationActive: settledData !== data,
    onAnimationEnd: () => setSettledData(data),
  }
}
