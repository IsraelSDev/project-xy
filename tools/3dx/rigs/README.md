# Contrato de esqueleto 3DX

`3dx_male.json` e `3dx_female.json` congelam a **ordem dos ossos e o rest pose** do corpo 3DX
publicado (`apps/web/public/assets/3dx/character_{male,female}.glb`).

- 322 ossos no masculino, 464 no feminino.
- Cada osso tem `parent`, `path`, `pos` (translação local) e `rest` (rotação local, quaternion).
- É o contrato que `sameBoneLayout` (`apps/web/src/game/characters/avatar-parts.ts`) compara para
  trocar o esqueleto da peça pelo esqueleto do corpo. Se a ordem mudar, as roupas deixam de
  acompanhar o idle/walk.

O `extract_character.py` lê esses arquivos com `--skeleton-json` e usa o rest pose como referência
do retarget (`refWorld[map(i)] * bindpose[i] * v`). As malhas vêm do projeto exportado; nenhum
asset bundle é necessário.

## Como regenerar

Os arquivos foram derivados do JSON do corpo (que, por sua vez, é gerado do prefab do projeto):

```powershell
py -3.11 tools/3dx/extract_character.py `
  --source "C:\dev\exported\ExportedProject\Assets\Resources\man\man.prefab" `
  --skeleton-json tools/3dx/rigs/3dx_male.json `
  --mesh man_body man_head man_eyelashes man_penis --gender male `
  --out tools/3dx/build/project/body_male.json

py -3.11 -c "
import json
from pathlib import Path
j = json.loads(Path('tools/3dx/build/project/body_male.json').read_text(encoding='utf-8'))
slim = {'gender': 'male', 'bones': [{k: b[k] for k in ('parent', 'path', 'pos', 'rest')} for b in j['bones']]}
Path('tools/3dx/rigs/3dx_male.json').write_text(json.dumps(slim, separators=(',', ':')), encoding='utf-8')
"
```

Troque `man`/`male` por `woman`/`female` para o feminino. Só regenere o contrato se o corpo
publicado mudar de esqueleto; nesse caso, reexporte também as roupas (e os clipes, se a ordem
mudar).
