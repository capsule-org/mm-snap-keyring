import { isLocalSnap } from './snap';
import { hideReconnectButton } from '../config/snap';
import type { Snap } from '../types';

export const shouldDisplayReconnectButton = (installedSnap?: Snap) =>
  !hideReconnectButton && installedSnap && isLocalSnap(installedSnap?.id);
