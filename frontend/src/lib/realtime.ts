'use client';
import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { getAccessToken, refreshSession } from './api';

let socket: Socket | null = null;

/** One socket per tab, authenticated with the in-memory access token (re-read on every reconnect). */
function connect() {
  if (socket) return socket;
  socket = io(process.env.NEXT_PUBLIC_WS_URL || undefined, {
    auth: (cb) => cb({ token: getAccessToken() }),
    withCredentials: true,
  });
  socket.on('unauthorized', () => {
    socket?.disconnect();
    refreshSession().then((ok) => ok && socket?.connect());
  });
  return socket;
}

export function disconnectRealtime() {
  socket?.disconnect();
  socket = null;
}

/** Subscribes to a server event for the lifetime of the component. */
export function useRealtime<T = Record<string, unknown>>(event: string, handler: (payload: T) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const s = connect();
    const fn = (p: T) => ref.current(p);
    s.on(event, fn);
    return () => { s.off(event, fn); };
  }, [event]);
}
