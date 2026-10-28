// i18n-exempt-file: tool descriptions and answers for MCP clients (English, read by a language model), never shown in the app
// A musician's annotations on the score (Edit ▸ Annotation…, J): read, written, changed, deleted and moved as the
// annotation panel does, one undo step each, the cursor going to the beat.

import { ANNOTATION_PLACEMENTS, type AnnotationPlacement, MAX_ANNOTATION_LENGTH, type Song, isAnnotationPlacement, isSameAnnotation, songAnnotations, toAnnotation } from '@gp-editor/core';
import { beatAnnotation } from '../../lib/annotation-draft';
import type { TrackBeat } from '../../state/song-actions';
import type { AppHost } from '../app-host';
import type { JsonObject } from '../json-rpc';
import type { JsonSchema } from '../json-schema';
import type { McpTool, ToolArguments, ToolResult } from '../tool-types';
import { BAR_ARGUMENT, TAB_ARGUMENT, TRACK_ARGUMENT, addressAt, answer, editAt, editTab, objectSchema, optionalInteger, optionalString, readTab, toolError, unchanged } from './tool-kit';

const READ_ONLY = { readOnlyHint: true, idempotentHint: true, openWorldHint: false } as const;
const EDIT = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

const PLACEMENT_ARGUMENT: JsonSchema = {
  type: 'string', enum: [...ANNOTATION_PLACEMENTS], description: 'The box over the staves (above) or under them (below). Default: where the beat’s annotation is, else above.',
};
/** Where the annotation is (each defaults to the cursor's). */
const track = TRACK_ARGUMENT;
const bar: JsonSchema = { ...BAR_ARGUMENT, description: 'Bar number (1 = the first bar). Default: the cursor’s bar.' };
const beat: JsonSchema = { type: 'integer', minimum: 1, maximum: 999, description: 'Beat number in the bar (1 = its first beat). Default: the cursor’s beat, or 1 in another bar.' };
const tab = TAB_ARGUMENT;

/** "bar 3, beat 2" of a beat. */
const placeName = (at: TrackBeat) => `bar ${at.measureIndex + 1}, beat ${at.beatIndex + 1}`;

function annotationJson(song: Song, at: TrackBeat): JsonObject | undefined {
  const annotation = beatAnnotation(song, at);
  return annotation === undefined ? undefined : { track: at.trackIndex + 1, bar: at.measureIndex + 1, beat: at.beatIndex + 1, text: annotation.text, placement: annotation.placement };
}

/** The beat a set of position arguments names (each defaults to the cursor's); or why it is nowhere in the song. */
function beatOf(song: Song, editor: Parameters<typeof addressAt>[1], args: ToolArguments): { readonly ok: true; readonly at: TrackBeat } | { readonly ok: false; readonly result: ToolResult } {
  const place = addressAt(song, editor, args);
  return place.ok ? { ok: true, at: { trackIndex: place.address.trackIndex, measureIndex: place.address.measureIndex, beatIndex: place.address.beatIndex } } : { ok: false, result: toolError(place.problem) };
}

const getAnnotations: McpTool<AppHost> = {
  name: 'get_annotations',
  title: 'Read the annotations',
  description:
    'Lists the score’s annotations — a musician’s notes on beats, drawn in a box over or under the staves and printed in PDFs — with their track, bar and beat (numbered as get_bars numbers them), text and placement.',
  inputSchema: objectSchema({ track: { ...TRACK_ARGUMENT, description: 'Only this track’s. Default: every track’s.' }, tab: TAB_ARGUMENT }),
  annotations: READ_ONLY,
  run: (args, host) => {
    const target = readTab(host.workspace(), optionalString(args, 'tab'));
    if (!target.ok) {
      return target.result;
    }
    const trackNumber = optionalInteger(args, 'track');
    if (trackNumber !== undefined && trackNumber > target.song.tracks.length) {
      return toolError(`Track ${trackNumber} does not exist: the song has ${target.song.tracks.length} track(s).`);
    }
    const listed = songAnnotations(target.song).filter((placed) => trackNumber === undefined || placed.trackIndex === trackNumber - 1);
    const annotations = listed.flatMap((placed) => annotationJson(target.song, placed) ?? []);
    return answer(annotations.length === 0 ? 'No annotations.' : `${annotations.length} annotation(s).`, { annotations });
  },
};

const setAnnotation: McpTool<AppHost> = {
  name: 'set_annotation',
  title: 'Write an annotation',
  description:
    'Writes, changes or (with an empty text) deletes the annotation of a beat: a musician’s note in a box over or under the staves, printed in PDFs. The cursor goes to the beat; one undo step. Guitar Pro 7/8 (.gp) files keep annotations, GP5/GP4/GP3 files do not.',
  inputSchema: objectSchema(
    {
      text: { type: 'string', maxLength: MAX_ANNOTATION_LENGTH, description: 'The note, lines separated by \\n (at most 12 lines); empty deletes the annotation.' },
      placement: PLACEMENT_ARGUMENT,
      track, bar, beat, tab,
    },
    ['text'],
  ),
  annotations: { ...EDIT, destructiveHint: true },
  run: (args, host) => {
    const target = editTab(host, args);
    if (!target.ok) {
      return target.result;
    }
    const place = beatOf(target.song, target.editor, args);
    if (!place.ok) {
      return place.result;
    }
    const { at } = place;
    const before = beatAnnotation(target.song, at);
    const placementArgument = optionalString(args, 'placement');
    const placement: AnnotationPlacement = isAnnotationPlacement(placementArgument) ? placementArgument : (before?.placement ?? 'above');
    const next = toAnnotation(optionalString(args, 'text') ?? '', placement);
    if (next === undefined && before === undefined) {
      return toolError(`Nothing changed: ${placeName(at)} has no annotation.`);
    }
    if (isSameAnnotation(before, next)) {
      return toolError('Nothing changed: the beat already has that annotation.');
    }
    const edited = editAt(host, args, { type: 'setBeatAnnotation', at, annotation: next });
    if (!edited.ok) {
      return edited.result;
    }
    const { editor, isChanged, song } = edited.outcome;
    if (!isChanged) {
      return unchanged(editor, 'Nothing changed.');
    }
    const json = annotationJson(song, at);
    return json === undefined ? answer(`Deleted the annotation of ${placeName(at)}.`) : answer(`Wrote the annotation of ${placeName(at)}.`, { annotation: json });
  },
};

const moveAnnotation: McpTool<AppHost> = {
  name: 'move_annotation',
  title: 'Move an annotation',
  description: 'Moves the annotation of one beat to another beat (any track or bar) that has none; the cursor goes there; one undo step.',
  inputSchema: objectSchema(
    {
      fromTrack: { ...TRACK_ARGUMENT, description: 'The annotation’s track. Default: the cursor’s track.' },
      fromBar: { ...BAR_ARGUMENT, description: 'The annotation’s bar.' },
      fromBeat: { type: 'integer', minimum: 1, maximum: 999, description: 'The annotation’s beat in its bar. Default: 1.' },
      track, bar: { ...BAR_ARGUMENT, description: 'The bar it goes to.' }, beat, tab,
    },
    ['fromBar', 'bar'],
  ),
  annotations: { ...EDIT, idempotentHint: false },
  run: (args, host) => {
    const target = editTab(host, args);
    if (!target.ok) {
      return target.result;
    }
    const from = beatOf(target.song, target.editor, { track: args.fromTrack, bar: args.fromBar, beat: args.fromBeat ?? 1 });
    const to = beatOf(target.song, target.editor, args);
    if (!from.ok || !to.ok) {
      return from.ok ? (to.ok ? toolError('No such beat.') : to.result) : from.result;
    }
    if (beatAnnotation(target.song, from.at) === undefined) {
      return toolError(`Nothing changed: ${placeName(from.at)} has no annotation.`);
    }
    if (beatAnnotation(target.song, to.at) !== undefined) {
      return toolError(`Nothing changed: ${placeName(to.at)} already has an annotation.`);
    }
    const edited = editAt(host, args, { type: 'moveBeatAnnotation', from: from.at, to: to.at });
    if (!edited.ok) {
      return edited.result;
    }
    const { editor, isChanged, song } = edited.outcome;
    const json = annotationJson(song, to.at);
    return !isChanged || json === undefined ? unchanged(editor, 'Nothing changed.') : answer(`Moved the annotation to ${placeName(to.at)}.`, { annotation: json });
  },
};

export const ANNOTATION_TOOLS: readonly McpTool<AppHost>[] = [getAnnotations, setAnnotation, moveAnnotation];
