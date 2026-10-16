import { useEffect, useState } from 'react';
import { type BuyRequest, type ShopItem, type Wallet } from '@3dx/contracts';
import { api } from '../../app/api';

interface ShopDialogProps {
  onClose: () => void;
}

/** Loja de itens de avatar: lista itens ativos, exibe saldo e permite comprar com créditos. */
export function ShopDialog({ onClose }: ShopDialogProps) {
  const [shop, setShop] = useState<ShopItem[]>([]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api<Wallet>('/economy/wallet').then((w) => {
        if (!cancelled) setWallet(w);
      }),
      api<ShopItem[]>('/economy/shop').then((items) => {
        if (!cancelled) setShop(items);
      }),
    ]).catch(() => {
      if (!cancelled) setError('Não foi possível carregar a loja.');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const canBuy = (item: ShopItem) => (wallet ? wallet.balance >= item.price : false);

  const buy = async (item: ShopItem) => {
    setError(undefined);
    setBusy(item.id);
    try {
      await api<BuyRequest>('/economy/buy', { json: { shopItemId: item.id } });
      // Atualiza saldo e recarrega a loja.
      const w = await api<Wallet>('/economy/wallet');
      setWallet(w);
      const items = await api<ShopItem[]>('/economy/shop');
      setShop(items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível comprar o item.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="dialog-backdrop">
      <section
        className="hud-panel dialog shop-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shop-title"
      >
        <h2 id="shop-title">Loja</h2>
        <p className="shop-balance">
          Saldo: <strong>{wallet?.balance ?? 0}</strong> créditos
        </p>
        {error && <p role="alert">{error}</p>}
        {!wallet && !error && <p>Carregando…</p>}
        {wallet && shop.length === 0 && <p>Sem itens disponíveis no momento.</p>}
        {wallet && shop.length > 0 && (
          <ul className="shop-list">
            {shop.map((item) => (
              <li key={item.id} className="shop-item">
                <span className="shop-item-info">
                  <strong>{item.name}</strong> — {item.price} créditos
                </span>
                <button
                  type="button"
                  disabled={!canBuy(item) || busy === item.id}
                  onClick={() => void buy(item)}
                >
                  {busy === item.id
                    ? 'Comprando…'
                    : canBuy(item)
                      ? 'Comprar'
                      : 'Saldo insuficiente'}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="dialog-actions">
          <button type="button" onClick={onClose} disabled={busy !== null}>
            Fechar
          </button>
        </div>
      </section>
    </div>
  );
}
