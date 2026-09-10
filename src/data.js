import powerEliteImage from './assets/PowerElite.png';
import autoPilotCoreImage from './assets/PowerElite-AutoPilot-Core.png';
import autoPilotProImage from './assets/PowerElite-AutoPilot-Pro.png';
import vipMembershipImage from '../Membresia-VIP.jpeg';

export const products = [
  { id: 'membership_sessions', kind: 'membership', title: 'XAUUSD Kill Zone Support', seller: 'PROJECT GALAXY', category: 'Memberships', price: 80, rating: null, reviews: null, tone: 'membership', mark: 'XAU', description: 'Plan de apoyo con pago manual. El acceso a reuniones, LIVE, chat y pantalla compartida está abierto para todas las cuentas activas.' },
  { id: 'scanner_power_elite', code: 'SCANNER_POWER_ELITE', kind: 'scanner', title: 'Scanner Power Elite', seller: 'PROJECT GALAXY', category: 'Trading tools', originalPrice: 1000, price: 650, promotionCycleHours: 24, rating: 5.0, reviews: 0, tone: 'violet', mark: 'SPE', image: powerEliteImage, description: 'Indicador privado para TradingView disponible mediante compra manual en USDT. Precio promocional recurrente; el ciclo se renueva cada 24 horas.' },
  { id: 'power_elite_autopilot_core', kind: 'automation-service', title: 'Power Elite AutoPilot Core', seller: 'PROJECT GALAXY', category: 'Servicios digitales', price: 500, rating: 5.0, reviews: 0, tone: 'blue', mark: 'PEC', image: autoPilotCoreImage, description: 'Servicio digital de configuración inicial para automatización de estrategias en MT4/MT5. Incluye orientación de puesta en marcha y parámetros de riesgo; no garantiza rentabilidad.' },
  { id: 'power_elite_autopilot_pro', kind: 'automation-service', title: 'Power Elite AutoPilot Pro', seller: 'PROJECT GALAXY', category: 'Servicios digitales', price: 700, rating: 5.0, reviews: 0, tone: 'violet', mark: 'PEP', image: autoPilotProImage, description: 'Servicio digital avanzado de configuración y acompañamiento para automatización en MT4/MT5. Los resultados dependen del mercado, la estrategia y la gestión de riesgo.' },
  { id: 'membership_vip', kind: 'membership-vip', title: 'Membresía VIP anual · 2 accesos', seller: 'PROJECT GALAXY', category: 'Memberships', price: 1500, rating: null, reviews: null, tone: 'membership', mark: 'VIP', image: vipMembershipImage, description: 'Plan VIP anual para dos personas con 12 meses de acceso para ambos. Pago manual en USDT y confirmación por el administrador.' },
];

export const feed = [
  { id: 1, author: 'Galaxy Trading Desk', handle: '@galaxyxau', initials: 'GX', time: '12 min', text: 'En XAUUSD, la liquidez antes de la apertura suele dar más contexto que perseguir el movimiento inicial. Espera la narrativa; no adivines la dirección.', tag: 'Liquidity insight', likes: 248, comments: 32 },
  { id: 2, author: 'Galaxy Trading Desk', handle: '@galaxyxau', initials: 'GX', time: '38 min', text: 'De lunes a viernes acompañamos la preparación: rango asiático, barrido de liquidez y reacción durante la Kill Zone de London. Todo análisis exige gestión de riesgo.', tag: 'Live Kill Zone study', likes: 419, comments: 67 },
];

export const notifications = [
  { id: 1, text: 'Galaxy Trading Desk te invitó a la sesión de London', time: 'hace 4 min', type: 'meeting' },
  { id: 2, text: 'Tu análisis de liquidez recibió 24 reacciones', time: 'hace 18 min', type: 'social' },
  { id: 3, text: 'Nuevo inicio de sesión en Windows', time: 'ayer', type: 'security' },
];
