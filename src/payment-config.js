import trc20Qr from '../USDT-TRC-20.jpeg';
import erc20Qr from '../USDT-ERC-20.jpeg';

export const PAYMENT_CONTACT_EMAIL = 'elkin56ty@gmail.com';

export const PAYMENT_NETWORKS = Object.freeze({
  TRC20: Object.freeze({
    label: 'TRON · TRC20',
    note: 'Comisión usualmente menor',
    address: 'TMuo1PDArFyXDyrdXUhRHt8qtKy94CmLsM',
    qr: trc20Qr,
  }),
  ERC20: Object.freeze({
    label: 'Ethereum · ERC20',
    note: 'Revisa la comisión de gas',
    address: '0xbf9402215a700b339c8922d573697d3500abaf33',
    qr: erc20Qr,
  }),
});

export function manualPayment({ network, amount, item }) {
  const selected = PAYMENT_NETWORKS[network];
  if (!selected) throw new Error('Selecciona una red válida.');
  return Object.freeze({
    network,
    label: selected.label,
    payCurrency: 'USDT',
    payAddress: selected.address,
    payAmount: Number(amount || 0).toFixed(2),
    qr: selected.qr,
    item,
  });
}
