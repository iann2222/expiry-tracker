import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { deviceUsesUtc8, getTaipeiToday } from '../domain/taipeiTime';

interface TaipeiClockValue {
  now: Date;
  today: string;
  deviceIsUtc8: boolean;
}

const TaipeiClockContext = createContext<TaipeiClockValue | null>(null);

export function TaipeiClockProvider({ children }: { children: ReactNode }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const refresh = () => setNow(new Date());
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const intervalId = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('pageshow', refresh);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const value = useMemo(
    () => ({ now, today: getTaipeiToday(now), deviceIsUtc8: deviceUsesUtc8(now) }),
    [now],
  );

  return <TaipeiClockContext.Provider value={value}>{children}</TaipeiClockContext.Provider>;
}

export function useTaipeiClock(): TaipeiClockValue {
  const value = useContext(TaipeiClockContext);
  if (!value) throw new Error('useTaipeiClock 必須在 TaipeiClockProvider 中使用');
  return value;
}
