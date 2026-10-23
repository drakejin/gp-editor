// Port of TuxGuitar app.tuxguitar.io.ptb.helper.TrackInfoHelper (LGPL-2.1): which song track plays each staff of a score.
import type { DraftTrack } from '../common/song-draft';
import type { PtTrackInfo } from './ptb-model';

export class TrackInfoHelper {
  private staffTracks: DraftTrack[] = [];
  private defaultInfo: PtTrackInfo | undefined;

  /** A new score: no staff has a track yet; `defaultInfo` is its guitar for staffs no Guitar In names. */
  reset(defaultInfo: PtTrackInfo | undefined): void {
    this.defaultInfo = defaultInfo;
    this.staffTracks = [];
  }

  getDefaultInfo(): PtTrackInfo | undefined {
    return this.defaultInfo;
  }

  getStaffTrack(staff: number): DraftTrack | undefined {
    return staff >= 0 ? this.staffTracks[staff] : undefined;
  }

  countStaffTracks(): number {
    return this.staffTracks.length;
  }

  addStaffTrack(track: DraftTrack): void {
    this.staffTracks.push(track);
  }

  removeStaffTrack(staff: number): void {
    this.staffTracks.splice(staff, 1);
  }

  hasStaffTrack(track: DraftTrack): boolean {
    return this.staffTracks.some((existing) => existing.number === track.number);
  }
}
