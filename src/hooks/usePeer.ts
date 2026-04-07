import { useState, useRef, useCallback } from 'react';
import Peer, { DataConnection } from 'peerjs';

const PREFIX = 'tac-arena-';

const MAX_JOIN_RETRIES = 5;
const RETRY_DELAY_MS = 1200;

const LOCAL_P2P_CONFIG: RTCConfiguration = {
  // Use public STUN servers so peers can find each other on different networks.
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

type PeerData = unknown;
type DataHandler = (data: PeerData, fromId: string) => void;
type PeerErrorLike = { type?: string; message?: string };

const formatPeerError = (err: unknown) => {
  const peerError = err as PeerErrorLike;
  return {
    type: peerError?.type ?? 'peer-error',
    message: peerError?.message ?? 'Unknown PeerJS error',
  };
};

const getRemoteAddress = (connection: DataConnection) => {
  return (connection as DataConnection & { remoteAddress?: string }).remoteAddress;
};

export function usePeer() {
  const [connected, setConnected] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [error, setError] = useState('');
  const [myId, setMyId] = useState('');
  const [playerCount, setPlayerCount] = useState(0);

  const peerRef = useRef<Peer | null>(null);
  const connectionsRef = useRef<Map<string, DataConnection>>(new Map());
  const hostConnRef = useRef<DataConnection | null>(null);
  const dataHandlerRef = useRef<DataHandler | null>(null);
  const joinRetryTimeoutRef = useRef<number | null>(null);

  const clearRetryTimeout = useCallback(() => {
    if (joinRetryTimeoutRef.current !== null) {
      window.clearTimeout(joinRetryTimeoutRef.current);
      joinRetryTimeoutRef.current = null;
    }
  }, []);

  const closeExistingPeer = useCallback(() => {
    connectionsRef.current.forEach((connection) => connection.close());
    connectionsRef.current.clear();
    hostConnRef.current?.close();
    hostConnRef.current = null;
    peerRef.current?.destroy();
    peerRef.current = null;
  }, []);

  const setPeerError = useCallback((err: unknown) => {
    const { type, message } = formatPeerError(err);
    setError(`${type}: ${message}`);
    console.error('Peer error:', err);
  }, []);

  const setupHostConnection = useCallback((connection: DataConnection) => {
    const peerId = connection.peer;
    connection.on('open', () => {
      console.log('Connected via:', getRemoteAddress(connection));
      connectionsRef.current.set(peerId, connection);
      setPlayerCount(connectionsRef.current.size + 1);
      setConnected(true);
    });
    connection.on('data', (data) => {
      dataHandlerRef.current?.(data, peerId);
    });
    connection.on('close', () => {
      connectionsRef.current.delete(peerId);
      setPlayerCount(connectionsRef.current.size + 1);
    });
    connection.on('error', setPeerError);
  }, [setPeerError]);

  const createRoom = useCallback(() => {
    clearRetryTimeout();
    closeExistingPeer();
    setError('');
    setConnected(false);

    const code = Math.random().toString(36).substring(2, 6).toUpperCase();

    const p = new Peer(PREFIX + code, {
      host: '0.peerjs.com',
      port: 443,
      secure: true,
      config: LOCAL_P2P_CONFIG,
      reliable: true,
    });

    peerRef.current = p;

    p.on('open', (id) => {
      setMyId(id);
      setRoomCode(code);
      setIsHost(true);
      setPlayerCount(1);
      setError('');
    });
    p.on('connection', setupHostConnection);
    p.on('error', setPeerError);
  }, [clearRetryTimeout, closeExistingPeer, setPeerError, setupHostConnection]);

  const joinRoom = useCallback((code: string) => {
    clearRetryTimeout();
    closeExistingPeer();
    setError('');
    setConnected(false);

    const upperCode = code.trim().toUpperCase();

    const p = new Peer({
      host: '0.peerjs.com',
      port: 443,
      secure: true,
      config: LOCAL_P2P_CONFIG,
      reliable: true,
    });

    peerRef.current = p;

    p.on('open', (id) => {
      setMyId(id);

      const attemptConnect = (attempt: number) => {
        const connection = p.connect(PREFIX + upperCode, { reliable: true });
        hostConnRef.current = connection;

        connection.on('open', () => {
          clearRetryTimeout();
          console.log('Connected via:', getRemoteAddress(connection));
          setConnected(true);
          setRoomCode(upperCode);
          setIsHost(false);
          setError('');
        });

        connection.on('data', (data) => {
          dataHandlerRef.current?.(data, 'host');
        });

        connection.on('close', () => {
          setConnected(false);
        });

        connection.on('error', (err) => {
          const { type } = formatPeerError(err);

          if (type === 'peer-unavailable' && attempt < MAX_JOIN_RETRIES) {
            setError(`Retrying connection (${attempt + 1}/${MAX_JOIN_RETRIES})...`);
            connection.close();
            clearRetryTimeout();
            joinRetryTimeoutRef.current = window.setTimeout(() => {
              attemptConnect(attempt + 1);
            }, RETRY_DELAY_MS);
            return;
          }

          setPeerError(err);
        });
      };

      attemptConnect(0);
    });

    p.on('error', setPeerError);
  }, [clearRetryTimeout, closeExistingPeer, setPeerError]);

  const sendData = useCallback((data: PeerData) => {
    if (hostConnRef.current?.open) {
      hostConnRef.current.send(data);
    }
  }, []);

  const broadcast = useCallback((data: PeerData, excludeId?: string) => {
    connectionsRef.current.forEach((conn, id) => {
      if (id !== excludeId && conn.open) {
        conn.send(data);
      }
    });
  }, []);

  const onData = useCallback((handler: DataHandler) => {
    dataHandlerRef.current = handler;
  }, []);

  const disconnect = useCallback(() => {
    clearRetryTimeout();
    closeExistingPeer();
    setConnected(false);
    setRoomCode('');
    setPlayerCount(0);
  }, [clearRetryTimeout, closeExistingPeer]);

  const getConnectedIds = useCallback(() => {
    return Array.from(connectionsRef.current.keys());
  }, []);

  return {
    createRoom,
    joinRoom,
    sendData,
    broadcast,
    onData,
    connected,
    isHost,
    roomCode,
    error,
    disconnect,
    myId,
    playerCount,
    getConnectedIds,
  };
}
