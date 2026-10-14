import { wrapAngle } from '@3dx/game-core';

/** Estado de um avatar recebido do servidor, carimbado com o horário local de chegada (ms). */
export interface Snapshot {
  time: number;
  x: number;
  z: number;
  heading: number;
}

export type Pose2 = Omit<Snapshot, 'time'>;

/** Snapshots mais antigos que isso não servem mais para interpolar. */
const MAX_AGE_MS = 1000;

/**
 * Acrescenta um snapshot. Se o anterior é antigo (o jogador estava parado e o servidor não mandou
 * nada), repete-o um intervalo antes do novo: assim a interpolação começa o movimento na hora
 * certa, em vez de espalhá-lo por todo o tempo em que o avatar ficou parado.
 */
export function pushSnapshot(buffer: Snapshot[], snapshot: Snapshot, intervalMs: number): void {
  const last = buffer.at(-1);
  if (last && snapshot.time - last.time > 2 * intervalMs) {
    buffer.push({ ...last, time: snapshot.time - intervalMs });
  }
  buffer.push(snapshot);

  while (buffer.length > 2 && (buffer[1]?.time ?? Infinity) < snapshot.time - MAX_AGE_MS) {
    buffer.shift();
  }
}

/**
 * Pose no instante `time`, interpolada entre os dois snapshots ao redor. Fora do intervalo,
 * segura a ponta mais próxima (sem extrapolar: melhor parar um instante que prever errado).
 */
export function samplePose(buffer: readonly Snapshot[], time: number): Pose2 | undefined {
  const first = buffer[0];
  const last = buffer.at(-1);
  if (!first || !last) return undefined;
  if (time <= first.time) return first;
  if (time >= last.time) return last;

  for (let index = 1; index < buffer.length; index++) {
    const to = buffer[index];
    const from = buffer[index - 1];
    if (!to || !from || time > to.time) continue;

    const t = (time - from.time) / (to.time - from.time);
    return {
      x: from.x + (to.x - from.x) * t,
      z: from.z + (to.z - from.z) * t,
      heading: from.heading + wrapAngle(to.heading - from.heading) * t,
    };
  }
  return last;
}
