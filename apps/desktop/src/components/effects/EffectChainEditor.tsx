import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  CHAIN_PRESETS,
  type Effect,
  MAX_TRACK_EFFECTS,
  TRACK_EFFECT_TYPES,
  applyChainPreset,
  deleteEffect,
  insertEffect,
  isSameChain,
  moveEffect,
  toggleEffect,
} from '@gp-editor/core';
import { useT } from '../../hooks/use-i18n';
import { chainPresetName, effectName } from '../../lib/effect-values';
import type { Palette } from '../../theme';
import { ChromeButton } from '../chrome/ChromeButton';
import { EffectEditor } from './EffectEditor';

export interface EffectChainEditorProps {
  readonly palette: Palette;
  readonly effects: readonly Effect[];
  readonly width: number;
  /** The master strip: its effects stay as they are, in order (no adding, moving, removing or chain presets). */
  readonly isFixed?: boolean;
  /** One undo step per call. */
  readonly onChange: (effects: readonly Effect[]) => void;
  /** While a slider is dragged: the chain to hear now; undefined when the drag ended unchanged. */
  readonly onPreview: (effects: readonly Effect[] | undefined) => void;
}

interface SlotRowProps {
  readonly palette: Palette;
  readonly effect: Effect;
  readonly index: number;
  readonly count: number;
  readonly isSelected: boolean;
  readonly isFixed: boolean;
  readonly onSelect: () => void;
  readonly onEdit: (change: (effects: readonly Effect[]) => readonly Effect[]) => void;
}

/** An effect of the chain: on/off, its name (selects it for editing), and up / down / remove. */
function SlotRow({ palette, effect, index, count, isSelected, isFixed, onSelect, onEdit }: SlotRowProps) {
  const t = useT();
  const name = effectName(effect.type);
  return (
    <View style={[styles.slot, isSelected ? { backgroundColor: palette.chromeRaised } : null]}>
      <ChromeButton
        palette={palette}
        label={effect.isEnabled ? '●' : '○'}
        tooltip={t(effect.isEnabled ? 'tools.effects.switchOff' : 'tools.effects.switchOn', { name })}
        isActive={effect.isEnabled}
        minWidth={22}
        onPress={() => onEdit((effects) => toggleEffect(effects, index))}
      />
      <Pressable style={styles.slotName} onPress={onSelect} tooltip={t('tools.effects.edit', { name })} accessibilityRole="button" accessibilityLabel={t('tools.effects.edit', { name })}>
        <Text numberOfLines={1} style={[styles.slotText, { color: effect.isEnabled ? palette.chromeText : palette.chromeMuted }]}>
          {`${index + 1}. ${name}`}
        </Text>
      </Pressable>
      {isFixed ? null : (
        <>
          <ChromeButton palette={palette} label="▲" tooltip={t('tools.effects.moveEarlier', { name })} fontSize={9} minWidth={20} isEnabled={index > 0} onPress={() => onEdit((effects) => moveEffect(effects, index, index - 1))} />
          <ChromeButton palette={palette} label="▼" tooltip={t('tools.effects.moveLater', { name })} fontSize={9} minWidth={20} isEnabled={index < count - 1} onPress={() => onEdit((effects) => moveEffect(effects, index, index + 1))} />
          <ChromeButton palette={palette} label="✕" tooltip={t('tools.effects.remove', { name })} fontSize={10} minWidth={20} onPress={() => onEdit((effects) => deleteEffect(effects, index))} />
        </>
      )}
    </View>
  );
}

/** Adding an effect: a button that opens the effect types. */
function AddEffect({ palette, effects, onAdd }: { readonly palette: Palette; readonly effects: readonly Effect[]; readonly onAdd: (effects: readonly Effect[]) => void }) {
  const [isAdding, setIsAdding] = useState(false);
  const t = useT();
  const isFull = effects.length >= MAX_TRACK_EFFECTS;
  if (!isAdding) {
    return <ChromeButton palette={palette} label={t('tools.effects.addEffect')} tooltip={isFull ? t('tools.effects.atMost', { count: MAX_TRACK_EFFECTS }) : t('tools.effects.addAtEnd')} isEnabled={!isFull} onPress={() => setIsAdding(true)} />;
  }
  return (
    <View style={styles.wrap}>
      {TRACK_EFFECT_TYPES.map((type) => (
        <ChromeButton
          key={type}
          palette={palette}
          label={effectName(type)}
          tooltip={t('tools.effects.add', { name: effectName(type) })}
          fontSize={11}
          onPress={() => {
            setIsAdding(false);
            onAdd(insertEffect(effects, type));
          }}
        />
      ))}
      <ChromeButton palette={palette} label={t('common.cancel')} tooltip={t('tools.effects.addNothing')} fontSize={11} onPress={() => setIsAdding(false)} />
    </View>
  );
}

/** An effect chain: its effects in order, each switchable, movable and removable, and the selected one's settings. */
export function EffectChainEditor({ palette, effects, width, isFixed = false, onChange, onPreview }: EffectChainEditorProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const t = useT();
  const shownIndex = Math.min(selectedIndex, Math.max(0, effects.length - 1));
  const selected = effects[shownIndex];
  const edit = (change: (chain: readonly Effect[]) => readonly Effect[]) => {
    const next = change(effects);
    if (!isSameChain(next, effects)) {
      onChange(next);
    }
  };
  const addEffect = (next: readonly Effect[]) => {
    setSelectedIndex(next.length - 1);
    onChange(next);
  };
  const replaceSelected = (effect: Effect) => effects.map((existing, index) => (index === shownIndex ? effect : existing));
  return (
    <View style={{ width }}>
      {isFixed ? null : (
        <View style={styles.wrap}>
          {CHAIN_PRESETS.map(({ name }) => (
            <ChromeButton key={name} palette={palette} label={chainPresetName(name)} tooltip={t('tools.effects.chainTooltip', { name: chainPresetName(name) })} fontSize={11} onPress={() => edit(() => applyChainPreset(name) ?? effects)} />
          ))}
        </View>
      )}
      {effects.length === 0 ? <Text style={[styles.empty, { color: palette.chromeMuted }]}>{t('tools.effects.none')}</Text> : null}
      {effects.map((effect, index) => (
        <SlotRow
          key={`${index}-${effect.type}`}
          {...{ palette, effect, index, isFixed }}
          count={effects.length}
          isSelected={index === shownIndex}
          onSelect={() => setSelectedIndex(index)}
          onEdit={edit}
        />
      ))}
      {isFixed ? null : <AddEffect palette={palette} effects={effects} onAdd={addEffect} />}
      {selected === undefined ? null : (
        <EffectEditor
          palette={palette}
          effect={selected}
          width={width}
          onChange={(effect) => edit(() => replaceSelected(effect))}
          onPreview={(effect) => onPreview(effect === undefined ? undefined : replaceSelected(effect))}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 },
  slot: { flexDirection: 'row', alignItems: 'center', borderRadius: 4, marginBottom: 1 },
  slotName: { flex: 1, height: 26, justifyContent: 'center', paddingHorizontal: 4 },
  slotText: { fontSize: 12, fontWeight: '600' },
  empty: { fontSize: 11, marginVertical: 4 },
});
