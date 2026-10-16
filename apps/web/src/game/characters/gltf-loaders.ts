/**
 * Importa o loader de glTF e liga o decoder do meshoptimizer, usado pelo cabelo comprimido com
 * `EXT_meshopt_compression`. Importe este módulo (e não `@babylonjs/loaders/glTF`) antes de carregar
 * qualquer GLB.
 *
 * O Babylon busca o decoder por URL (`<script>`), mas a CSP do build é `script-src 'self'`: em vez de
 * hospedar o arquivo, usamos o módulo do npm (wasm embutido, sem download) e deixamos no global o
 * valor que o Babylon lê, anulando o carregamento por URL. Vale igual no navegador e no Node (testes).
 */
import '@babylonjs/loaders/glTF';
import { Tools } from '@babylonjs/core/Misc/tools.pure';
import { MeshoptDecoder } from 'meshoptimizer/decoder';

// Sem Web Workers (Node/testes) o decoder roda no thread principal.
if (typeof Worker === 'undefined') MeshoptDecoder.useWorkers = () => {};

(globalThis as unknown as { MeshoptDecoder: typeof MeshoptDecoder }).MeshoptDecoder =
  MeshoptDecoder;
Tools.LoadBabylonScriptAsync = async () => {};
