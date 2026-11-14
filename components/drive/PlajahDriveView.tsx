// The app's unified Files, Drive, Content HQ, Sync & Explorer screen.
// Wraps PlajahFilesWorkspace (which integrates PlajahDrive, Content HQ, Local File Explorer,
// Folder Sync, Send Transfers, and Connected Locations under one roof).

import React from 'react';
import type { DriveOrg } from './PlajahDrive';
import { PlajahFilesWorkspace } from '../files/PlajahFilesWorkspace';
import type { StageMediaItem } from '../../services/files/unifiedVfs';

export default function PlajahDriveView({
  onBack,
  orgs,
  apiBase = '',
  onOpenCinemaPlayer,
  onSendToChora,
}: {
  onBack?: () => void;
  orgs?: DriveOrg[];
  apiBase?: string;
  onOpenCinemaPlayer?: (item: StageMediaItem, siblings: StageMediaItem[]) => void;
  onSendToChora?: (item: StageMediaItem) => void;
}) {
  return (
    <PlajahFilesWorkspace
      onBack={onBack}
      orgs={orgs}
      apiBase={apiBase}
      onOpenCinemaPlayer={onOpenCinemaPlayer}
      onSendToChora={onSendToChora}
    />
  );
}
