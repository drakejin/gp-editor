import type { TrackManager } from '../hooks/use-track-manager';
import type { Palette } from '../theme';
import { AddTrackPanel } from './AddTrackPanel';
import { DeleteTrackPanel } from './DeleteTrackPanel';

interface TrackManagerOverlaysProps {
  readonly manager: TrackManager;
  /** The dark chrome's palette. */
  readonly palette: Palette;
}

/** Track ▸ Add Track…'s panel and the question before a track with notes is deleted, over the window. */
export function TrackManagerOverlays({ manager, palette }: TrackManagerOverlaysProps) {
  const { pendingDelete } = manager;
  return (
    <>
      {manager.isAddPanelOpen ? <AddTrackPanel palette={palette} onAdd={manager.addTrack} onCancel={() => manager.close()} /> : null}
      {pendingDelete === undefined ? null : (
        <DeleteTrackPanel
          palette={palette}
          trackLabel={`${pendingDelete.track.number}. ${pendingDelete.track.name}`}
          onDelete={manager.confirmDelete}
          onCancel={() => manager.close()}
        />
      )}
    </>
  );
}
