import { useEffect, useState } from 'react';
import type { PracticalSession } from '@/types';
export function useNow() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  return now;
}
export function sessionInTime(session: PracticalSession, now = Date.now()) {
  return now >= Date.parse(`${session.date}T${session.startTime}:00+07:00`) && now < Date.parse(`${session.date}T${session.endTime}:00+07:00`);
}
export function wibParts(now = Date.now()) {
  const value = new Date(now + 7 * 60 * 60 * 1000).toISOString();
  return { date: value.slice(0, 10), time: value.slice(11, 16) };
}
