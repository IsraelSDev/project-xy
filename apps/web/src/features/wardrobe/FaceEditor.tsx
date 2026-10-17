import { MORPHS, MORPH_REGIONS, type AvatarConfig } from '@3dx/contracts';
import { useState } from 'react';
import {
  activeExpression,
  clearFace,
  pairRows,
  randomFace,
  withExpression,
  withMorph,
  type Morphs,
} from './face-edit';
import { MorphSlider } from './MorphSlider';

interface FaceEditorProps {
  draft: AvatarConfig;
  onChange: (morphs: Morphs) => void;
}

/**
 * Edição do rosto: expressão (uma por vez, com intensidade), formato por região (olhos, nariz, boca...) e, recolhidos,
 * os movimentos finos (piscar, abrir a boca...) com os dois lados juntos. A câmera do vestiário já chega perto nesta aba.
 */
export function FaceEditor({ draft, onChange }: FaceEditorProps) {
  const [linked, setLinked] = useState(true);
  const forModel = (morph: (typeof MORPHS)[number]) =>
    (morph.models as readonly string[]).includes(draft.model);
  const value = (id: string) => draft.morphs[id as keyof Morphs] ?? 0;

  const expressions = MORPHS.filter((morph) => morph.group === 'expression' && forModel(morph));
  const current = activeExpression(draft.morphs);
  const faceUsed = Object.keys(draft.morphs).filter((id) =>
    MORPHS.some(
      (morph) =>
        morph.id === id &&
        (morph.group === 'face' || morph.group === 'facial' || morph.group === 'expression'),
    ),
  ).length;

  return (
    <>
      <div className="face-toolbar">
        <button
          type="button"
          onClick={() => onChange(randomFace(draft.morphs, draft.model))}
          title="Troca o formato do rosto por um sorteado"
        >
          Sortear rosto
        </button>
        <button
          type="button"
          className="ghost"
          disabled={faceUsed === 0}
          onClick={() => onChange(clearFace(draft.morphs))}
        >
          Zerar rosto{faceUsed > 0 ? ` (${faceUsed})` : ''}
        </button>
      </div>

      <fieldset className="choices">
        <legend>Expressão</legend>
        {[{ id: '', label: 'Neutra' }, ...expressions].map((item) => (
          <label key={item.id || 'neutral'} title={item.label}>
            <input
              type="radio"
              name="expression"
              value={item.id}
              checked={(current?.id ?? '') === item.id}
              onChange={() => onChange(withExpression(draft.morphs, item.id || undefined, 1))}
            />
            {item.label}
          </label>
        ))}
      </fieldset>
      {current && (
        <MorphSlider
          label="Intensidade da expressão"
          value={current.value}
          onChange={(next) => onChange(withExpression(draft.morphs, current.id, next))}
        />
      )}

      {MORPH_REGIONS.map((region) => {
        const items = MORPHS.filter(
          (morph) => morph.group === 'face' && morph.region === region.id && forModel(morph),
        );
        if (items.length === 0) return undefined;
        const active = items.filter((morph) => value(morph.id) > 0).length;
        return (
          <details className="morph-group" key={region.id} open={region.id === 'shape'}>
            <summary>
              {region.label}
              {active > 0 ? ` · ${active} em uso` : ''}
            </summary>
            {items.map((morph) => (
              <MorphSlider
                key={morph.id}
                label={morph.label}
                value={value(morph.id)}
                onChange={(next) => onChange(withMorph(draft.morphs, morph.id, next))}
              />
            ))}
          </details>
        );
      })}

      <details className="morph-group">
        <summary>Movimentos finos do rosto</summary>
        <label className="morph-link">
          <input
            type="checkbox"
            checked={linked}
            onChange={(event) => setLinked(event.target.checked)}
          />
          Mexer os dois lados juntos
        </label>
        {MORPH_REGIONS.map((region) => {
          const items = MORPHS.filter(
            (morph) => morph.group === 'facial' && morph.region === region.id && forModel(morph),
          );
          if (items.length === 0) return undefined;
          return (
            <section className="morph-region" key={region.id} aria-label={region.label}>
              <h4>{region.label}</h4>
              {pairRows(items).map((row) =>
                row.single ? (
                  <MorphSlider
                    key={row.single.id}
                    label={row.single.label}
                    value={value(row.single.id)}
                    onChange={(next) => onChange(withMorph(draft.morphs, row.single!.id, next))}
                  />
                ) : (
                  <div className="morph-pair" key={row.left!.id}>
                    <span>{row.label}</span>
                    {[
                      { morph: row.left!, other: row.right!, side: 'esq.' },
                      { morph: row.right!, other: row.left!, side: 'dir.' },
                    ].map(({ morph, other, side }) => (
                      <MorphSlider
                        key={morph.id}
                        compact
                        label={`${row.label} (${side})`}
                        value={value(morph.id)}
                        onChange={(next) => {
                          const changed = withMorph(draft.morphs, morph.id, next);
                          onChange(linked ? withMorph(changed, other.id, next) : changed);
                        }}
                      />
                    ))}
                  </div>
                ),
              )}
            </section>
          );
        })}
      </details>
    </>
  );
}
